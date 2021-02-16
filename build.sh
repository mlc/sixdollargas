#!/usr/bin/env bash

set -ex

rm -rf dist dist.zip
mkdir dist
yarn build
zip -j -9 -r dist.zip dist

fn="gas-lambda/dist-$(date +%s).zip"
export AWS_PAGER=""
aws s3 cp dist.zip "s3://cf-logs-mlc/$fn"
aws lambda update-function-code --function-name 'arn:aws:lambda:us-east-1:859317109141:function:sixdollargas-update' --s3-bucket cf-logs-mlc --s3-key "$fn"
aws lambda update-function-code --function-name 'arn:aws:lambda:us-east-1:859317109141:function:sixdollargas-stats' --s3-bucket cf-logs-mlc --s3-key "$fn"
aws s3 cp pages/stats.html s3://sixdollargas.org/ --cache-control 'public,max-age=3600' --content-type 'text/html;charset=utf-8'
