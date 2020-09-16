const path = require('path');
const webpack = require('webpack');

module.exports = {
  context: __dirname,
  entry: './index.js',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'index.js',
    library: 'index',
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.ejs$/,
        use: {
          loader: 'ejs-webpack-loader',
        },
      },
    ],
  },
  target: 'node',
  externals: ['aws-sdk'],
  devtool: 'source-map',
  optimization: { minimize: false },
};
