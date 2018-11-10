#!/usr/bin/env bash

set -ex

rm -rf dist
mkdir dist
yarn babel -d dist *.js
cd dist
cp ../package.json ../yarn.lock .
yarn install --prod
mkdir pages
cp ../pages/*ejs pages/
zip -q -9 -r ../dist.zip *
cd ..
aws lambda update-function-code --function-name 'arn:aws:lambda:us-east-1:859317109141:function:sixdollargas-update' --zip-file fileb://dist.zip
