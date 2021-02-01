import 'source-map-support/register';

import * as AWS from 'aws-sdk';
import { TemplateFunction } from 'ejs';
import { convert, ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone/dist/js-joda-timezone-10-year-range';
import fetch from 'node-fetch';
import { sprintf } from 'sprintf-js';
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';

const index: TemplateFunction = require('./pages/index.html.ejs');
const feed: TemplateFunction = require('./pages/feed.atom.ejs');

const Bucket = 'sixdollargas.org';
const CacheControl = 'public';
const TableName = 'gas-price-history';
const PRICE_KEY = 'price';
const LITERS_PER_GALLON = 3.785411784;
const TZ = ZoneId.of('America/New_York');
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
const dynamo = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
const dbClient = new AWS.DynamoDB.DocumentClient({ service: dynamo });

const select = xpath.useNamespaces({
  ecb: 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref',
});

interface Locals {
  now: string;
  price: string;
  Expires: Date;
}

interface FileDescription {
  Key: string;
  transformer: (locals: Locals) => string;
  ContentType: string;
}

const files: readonly FileDescription[] = [
  {
    Key: 'index.html',
    transformer: index,
    ContentType: 'application/xhtml+xml;charset=utf-8',
  },
  {
    Key: 'feed.atom',
    transformer: feed,
    ContentType: 'application/atom+xml',
  },
  {
    Key: 'price',
    transformer: ({ price }) => price,
    ContentType: 'text/plain;charset=utf-8',
  },
];

const getPrice = async (): Promise<string> => {
  const r = await fetch(
    'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
  );
  const body = await r.text();
  const xml = new DOMParser().parseFromString(body);
  const rate = select('//ecb:Cube[@currency="USD"]/@rate', xml, true) as Attr;
  const eurPerDollar = parseFloat(rate.value);
  const price = 6 / (LITERS_PER_GALLON * eurPerDollar);
  return sprintf('€%0.2f', price);
};

const getOldPrice = (): Promise<string> =>
  s3
    .getObject({
      Bucket,
      Key: PRICE_KEY,
    })
    .promise()
    .then(
      ({ Body }) => (Body as Buffer).toString(),
      (e) => {
        const { code } = e;
        if (code === 'NoSuchKey') {
          return '';
        }
        throw e;
      }
    );

type FileHandler<T = unknown> = (
  locals: Locals,
  fileDescription: FileDescription
) => Promise<T>;

const upload: FileHandler = (locals, { transformer, Key, ContentType }) =>
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

const updateExpiry: FileHandler = ({ Expires }, { Key, ContentType }) =>
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

const storeInDb = ({ now, price }: Locals): Promise<any> =>
  dbClient
    .put({
      TableName,
      Item: {
        date: now,
        price: Number(price.substr(1)),
      },
    })
    .promise();

export const main = async (): Promise<string> => {
  const now = ZonedDateTime.now(TZ);

  const [price, oldPrice] = await Promise.all([getPrice(), getOldPrice()]);

  const locals: Locals = {
    now: now.withFixedOffsetZone().toString(),
    price,
    Expires: convert(now.plusHours(24)).toDate(),
  };

  const [op, message] =
    price === oldPrice
      ? [updateExpiry, `keeping price at ${price}`]
      : [upload, `setting price to ${price}`];

  await Promise.all([
    ...files.map((file) => op(locals, file)),
    storeInDb(locals),
  ]);
  return message;
};

export const handler: AWSLambda.ScheduledHandler = () =>
  main().then(console.log);
