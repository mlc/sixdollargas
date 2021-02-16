import * as AWS from 'aws-sdk';

export const region = 'us-east-1';
export const s3 = new AWS.S3({ apiVersion: '2006-03-01', region });
export const dynamo = new AWS.DynamoDB({ apiVersion: '2012-08-10', region });
