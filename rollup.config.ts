import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
// @ts-ignore
import sizes from 'rollup-plugin-sizes';
import type { RollupOptions, Plugin as RollupPlugin } from 'rollup';

const extensions = ['.js', '.jsx', '.ts', '.tsx'];

const plugins: RollupPlugin[] = [
  commonjs(),
  nodeResolve({
    extensions,
    preferBuiltins: true,
    browser: false,
    exportConditions: ['node', 'default', 'module', 'require'],
  }),
  typescript(),
  json(),
  sizes(),
];

const config: RollupOptions = {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name]-[hash].mjs',
  },
  plugins,
};

export default config;
