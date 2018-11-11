#!/usr/bin/env bash

set -ex

rm -rf dist dist.zip
mkdir dist
yarn webpack --config webpack.config.js --mode production
zip -j -9 -r dist.zip dist
aws lambda update-function-code --function-name 'arn:aws:lambda:us-east-1:859317109141:function:sixdollargas-update' --zip-file fileb://dist.zip
