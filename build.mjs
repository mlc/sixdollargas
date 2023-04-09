import * as esbuild from 'esbuild';
import { compile } from 'ejs';
import { readFile, writeFile } from 'fs/promises';

const ejsPlugin = {
  name: 'ejs',
  setup(build) {
    build.onLoad({ filter: /\.ejs$/ }, async ({ path }) => {
      const ejs = await readFile(path, 'utf-8');
      const template = compile(ejs, {
        filename: path,
        client: true,
        strict: true,
        async: true,
      }).toString();
      return {
        loader: 'js',
        contents: 'export default ' + template,
      };
    });
  },
};

const build = await esbuild.build({
  outdir: 'dist',
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  write: true,
  platform: 'node',
  external: ['@aws-sdk'],
  legalComments: 'linked',
  metafile: true,
  target: 'node18',
  plugins: [ejsPlugin],
  format: 'esm',
  outExtension: {
    '.js': '.mjs',
  },
});

await writeFile('meta.json', JSON.stringify(build.metafile), {
  encoding: 'utf-8',
});
