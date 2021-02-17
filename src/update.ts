import { ScheduledHandler } from 'aws-lambda';
import { TemplateFunction } from 'ejs';
import { convert, ZonedDateTime } from '@js-joda/core';
import fetch from 'node-fetch';
import { sprintf } from 'sprintf-js';
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';

import { dynamo, s3 } from './aws';
import {
  Bucket,
  CacheControl,
  LITERS_PER_GALLON,
  PRICE_KEY,
  TableName,
  TZ,
} from './config';

const index: TemplateFunction = require('../pages/index.html.ejs');
const feed: TemplateFunction = require('../pages/feed.atom.ejs');

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
    Key: PRICE_KEY,
    transformer: ({ price }) => price,
    ContentType: 'text/plain;charset=utf-8',
  },
];

const getPrice = async (): Promise<string> => {
  const r = await fetch(
    'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
  );
  if (!r.ok) {
    throw new Error(`couldn't fetch: ${r.statusText}`);
  }
  const body = await r.text();
  const xml = new DOMParser().parseFromString(body);
  const rate = select('//ecb:Cube[@currency="USD"]/@rate', xml, true);
  if (rate === null || typeof rate !== 'object' || !('value' in rate)) {
    throw new Error('no rate found');
  }
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(rate.value)) {
    throw new Error('invalid price');
  }
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
  dynamo
    .putItem({
      TableName,
      Item: {
        date: { S: now },
        price: { N: price.substr(1) },
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

const handler: ScheduledHandler = () => main().then(console.log);
export default handler;
