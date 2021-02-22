import { AttributeValue, paginateScan } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
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

const unmarshall = ({
  price,
  date,
}: {
  [key: string]: AttributeValue;
}): Item[] => {
  if (typeof date?.S === 'string' && typeof price?.N === 'string') {
    return [
      {
        date: date.S,
        price: parseFloat(price.N),
      },
    ];
  } else {
    return [];
  }
};

const getStats: APIGatewayProxyHandlerV2 = async () => {
  const data: Item[] = [];

  for await (const response of paginateScan(
    { client: dynamo },
    { TableName }
  )) {
    if (response.Items && response.Items.length > 0) {
      data.push(...response.Items.flatMap(unmarshall));
    }
  }

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
