import 'source-map-support/register';

import AWS from 'aws-sdk';
import * as fs from 'fs';
import { convert, ZonedDateTime, ZoneId } from 'js-joda';
import 'js-joda-timezone';
import fetch from 'node-fetch';
import { sprintf } from 'sprintf-js';
import { promisify } from 'util';
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';

const index = require('./pages/index.html.ejs');
const feed = require('./pages/feed.atom.ejs');

const Bucket = 'sixdollargas.org';
const CacheControl = 'public';
const TableName = 'gas-price-history';
const PRICE_KEY = 'price';
const LITERS_PER_GALLON = 3.785411784;
const TZ = ZoneId.of('America/New_York');
const readFile = promisify(fs.readFile);
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
const dynamo = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
const dbClient = new AWS.DynamoDB.DocumentClient({ service: dynamo });

const select = xpath.useNamespaces({
  ecb: 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref',
});

const files = [
  {
    Key: 'index.html',
    transformer: index,
    ContentType: 'application/xhtml+xml;charset=utf-8',
  },
  { Key: 'feed.atom', transformer: feed, ContentType: 'application/atom+xml' },
  {
    Key: 'price',
    transformer: ({ price }) => price,
    ContentType: 'text/plain;charset=utf-8',
  },
];

const getPrice = () =>
  fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')
    .then(r => r.text())
    .then(body => new DOMParser().parseFromString(body))
    .then(xml => select('//ecb:Cube[@currency="USD"]/@rate', xml, true).value)
    .then(Number)
    .then(eurPerDollar => 6 / (LITERS_PER_GALLON * eurPerDollar))
    .then(price => sprintf('€%0.2f', price));

const getOldPrice = () =>
  s3
    .getObject({
      Bucket,
      Key: PRICE_KEY,
    })
    .promise()
    .then(
      ({ Body }) => Body.toString(),
      e => {
        const { code } = e;
        if (code === 'NoSuchKey') {
          return '';
        }
        throw e;
      }
    );

const upload = (locals, { transformer, Key, ContentType }) =>
  s3
    .putObject({
      Bucket,
      Key,
      Body: Buffer.from(transformer(locals), 'utf-8'),
      CacheControl,
      ContentType,
      Expires: locals.Expires,
    })
    .promise();

const updateExpiry = ({ Expires }, { Key, ContentType }) =>
  s3
    .copyObject({
      Bucket,
      Key,
      CopySource: `${Bucket}/${Key}`,
      CacheControl,
      ContentType,
      Expires,
      MetadataDirective: 'REPLACE',
    })
    .promise();

const storeInDb = ({ now, price }) =>
  dbClient
    .put({
      TableName,
      Item: {
        date: now,
        price: Number(price.substr(1)),
      },
    })
    .promise();

export const main = async () => {
  const now = ZonedDateTime.now(TZ);

  const [price, oldPrice] = await Promise.all([getPrice(), getOldPrice()]);

  const locals = {
    now: now.withFixedOffsetZone().toString(),
    price,
    Expires: convert(now.plusHours(24)).toDate(),
  };

  const [op, message] =
    price === oldPrice
      ? [updateExpiry, `keeping price at ${price}`]
      : [upload, `setting price to ${price}`];

  await Promise.all([
    ...files.map(file => op(locals, file)),
    storeInDb(locals),
  ]);
  return message;
};

export const handler = (event, context, callback) =>
  main().then(message => {
    console.log(message);
    return 1;
  });
