import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { dynamo } from './aws';
import { DateTimeFormatter, ZonedDateTime, ZoneId } from '@js-joda/core';
// @ts-ignore
import { Locale } from '@js-joda/locale_en-us';

import { TableName } from './config';

const httpDateFormatter = DateTimeFormatter.ofPattern(
  "eee, dd MMM yyyy HH:mm:ss 'GMT'"
).withLocale(Locale.US);

interface Item {
  date: string;
  price: number;
}

const getStats: APIGatewayProxyHandlerV2 = async () => {
  const data: Item[] = [];
  let key: DynamoDB.Key | undefined = undefined;

  do {
    const response: DynamoDB.ScanOutput = await dynamo
      .scan({
        TableName,
        ExclusiveStartKey: key,
      })
      .promise();

    if (response.Items && response.Items.length > 0) {
      data.push(
        ...response.Items.flatMap(({ price, date }) => {
          if (typeof date.S === 'string' && typeof price.N === 'string') {
            return [
              {
                date: date.S,
                price: parseFloat(price.N),
              },
            ];
          } else {
            return [];
          }
        })
      );
    }
    key = response.LastEvaluatedKey;
  } while (key !== undefined);

  const maxDate = data.reduce((acc, { date }) => (date > acc ? date : acc), '');
  const headers: { [h: string]: string } = {
    'content-type': 'application/json',
    'cache-control': 'public',
  };
  if (maxDate) {
    const parsed = ZonedDateTime.parse(maxDate).withZoneSameInstant(ZoneId.UTC);
    headers['last-modified'] = httpDateFormatter.format(parsed.plusSeconds(1));
    headers.expires = httpDateFormatter.format(parsed.plusDays(1));
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(data),
  };
};

export default getStats;
