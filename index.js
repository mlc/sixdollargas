import 'source-map-support/register';

import AWS from 'aws-sdk';
import * as fs from 'fs';
import { ZonedDateTime } from 'js-joda';
import rp from 'request-promise-native';
import { sprintf } from 'sprintf-js';
import { promisify } from 'util';
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';

const index = require('ejs-compiled-loader!./pages/index.html.ejs');
const feed = require('ejs-compiled-loader!./pages/feed.atom.ejs');

const Bucket = 'sixdollargas.org';
const PRICE_KEY = 'price';
const LITERS_PER_GALLON = 3.785411784;
const readFile = promisify(fs.readFile);
const cloudfront = new AWS.CloudFront({ apiVersion: '2018-06-18' });
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

const select = xpath.useNamespaces({
  ecb: 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref',
});

const getPrice = () =>
  rp
    .get('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
      transform: body => new DOMParser().parseFromString(body),
      transform2xxOnly: true,
    })
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

const upload = (template, locals, Key, ContentType) =>
  s3
    .putObject({
      Bucket,
      Key,
      Body: Buffer.from(template(locals), 'utf-8'),
      CacheControl: 'public,max-age=86400',
      ContentType,
    })
    .promise();

const putPrice = price =>
  s3
    .putObject({
      Bucket,
      Key: PRICE_KEY,
      Body: Buffer.from(price, 'utf-8'),
      ContentType: 'text/plain;charset=utf-8',
    })
    .promise();

export const main = async () => {
  const [price, oldPrice] = await Promise.all([getPrice(), getOldPrice()]);

  if (price === oldPrice) {
    return `keeping ${price}, no update needed`;
  }

  const locals = {
    now: ZonedDateTime.now()
      .withFixedOffsetZone()
      .toString(),
    price,
  };

  await Promise.all([
    upload(index, locals, 'index.html', 'application/xhtml+xml;charset=utf-8'),
    upload(feed, locals, 'feed.atom', 'application/atom+xml'),
    putPrice(price),
  ]);

  return cloudfront
    .createInvalidation({
      DistributionId: 'E1BA415AXD033P',
      InvalidationBatch: {
        CallerReference: locals.now,
        Paths: {
          Quantity: 3,
          Items: ['/', '/index.html', '/feed.atom'],
        },
      },
    })
    .promise();
};

export const handler = (event, context, callback) =>
  main().then(
    message => {
      console.log(message);
      callback(null, 1);
    },
    e => {
      console.error(e);
      callback(e);
    }
  );
