import { AttributeValue, paginateScan } from '@aws-sdk/client-dynamodb';
import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { dynamo } from './aws';
import { DateTimeFormatter, ZonedDateTime, ZoneId } from '@js-joda/core';
// @ts-ignore
import { Locale } from '@js-joda/locale_en-us';

import { TableName } from './config';
import { sha256 } from './hash';

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
}: Record<string, AttributeValue>): Item[] => {
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

const getStats: APIGatewayProxyHandlerV2 =
  async (): Promise<APIGatewayProxyStructuredResultV2> => {
    const pages: Item[][] = [];

    for await (const response of paginateScan(
      { client: dynamo },
      { TableName }
    )) {
      if (response.Items && response.Items.length > 0) {
        pages.push(response.Items.flatMap(unmarshall));
      }
    }

    const data = pages.flat();
    const maxDate = data.reduce(
      (acc, { date }) => (date > acc ? date : acc),
      ''
    );
    const body = JSON.stringify(data);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'cache-control': 'public',
      etag: `"${sha256(body)}"`,
    };
    if (maxDate) {
      const parsed = ZonedDateTime.parse(maxDate).withZoneSameInstant(
        ZoneId.UTC
      );
      headers['last-modified'] = httpDateFormatter.format(
        parsed.plusSeconds(1)
      );
      headers.expires = httpDateFormatter.format(parsed.plusDays(1));
    }
    return {
      statusCode: 200,
      headers,
      body,
    };
  };

export default getStats;
