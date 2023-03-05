import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { ScheduledHandler } from 'aws-lambda';
import { compile } from 'ejs';
import getStream from 'get-stream';
import { convert, ZonedDateTime } from '@js-joda/core';
import { sprintf } from 'sprintf-js';
import { DOMParser } from '@xmldom/xmldom';
import { useNamespaces } from 'xpath';
import { readFile } from 'node:fs/promises';

import { dynamo, s3 } from './aws';
import {
  Bucket,
  CacheControl,
  LITERS_PER_GALLON,
  PRICE_KEY,
  TableName,
  TZ,
} from './config';

const select = useNamespaces({
  ecb: 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref',
});

interface Locals {
  now: string;
  price: string;
  Expires: Date;
}

type Transformer = (locals: Locals) => Promise<string>;

const useEjs = (fn: string): Transformer => {
  const funct = readFile(fn, 'utf-8').then((template) => compile(template));
  return (locals: Locals) => funct.then((f) => f(locals));
};

const index = useEjs('./index.html.ejs');
const feed = useEjs('./feed.atom.ejs');

interface FileDescription {
  Key: string;
  transformer: Transformer;
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
    transformer: ({ price }) => Promise.resolve(price),
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
  const xml = new DOMParser().parseFromString(
    body,
    r.headers.get('Content-Type') ?? undefined
  );
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
    .send(
      new GetObjectCommand({
        Bucket,
        Key: PRICE_KEY,
      })
    )
    .then(
      ({ Body }) => getStream(Body as NodeJS.ReadableStream),
      (e) => {
        const { Code } = e;
        if (Code === 'NoSuchKey') {
          return '';
        }
        throw e;
      }
    );

type FileHandler<T = unknown> = (
  locals: Locals,
  fileDescription: FileDescription
) => Promise<T>;

const upload: FileHandler = async (locals, { transformer, Key, ContentType }) =>
  s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: Buffer.from(await transformer(locals), 'utf-8'),
      CacheControl,
      ContentType,
      Expires: locals.Expires,
    })
  );

const updateExpiry: FileHandler = ({ Expires }, { Key, ContentType }) =>
  s3.send(
    new CopyObjectCommand({
      Bucket,
      Key,
      CopySource: `${Bucket}/${Key}`,
      CacheControl,
      ContentType,
      Expires,
      MetadataDirective: 'REPLACE',
    })
  );

const storeInDb = ({ now, price }: Locals): Promise<unknown> =>
  dynamo.send(
    new PutItemCommand({
      TableName,
      Item: {
        date: { S: now },
        price: { N: price.substring(1) },
      },
    })
  );

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
