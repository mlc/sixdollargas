const path = require('path');

module.exports = {
  context: __dirname,
  entry: './index.ts',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'index.js',
    library: 'index',
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.[tj]sx?$/,
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
  resolve: {
    extensions: ['.ts', '.js'],
  },
  target: 'node',
  externals: ['aws-sdk'],
  devtool: 'source-map',
  optimization: { minimize: false },
};
