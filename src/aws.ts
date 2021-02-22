import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

export const region = 'us-east-1';
export const s3 = new S3Client({ apiVersion: '2006-03-01', region });
export const dynamo = new DynamoDBClient({ apiVersion: '2012-08-10', region });
