import * as esbuild from 'esbuild';
import { readFile, writeFile } from 'fs/promises';

const ejsPlugin = {
  name: 'ejs',
  setup(build) {
    build.onLoad({ filter: /\.ejs$/ }, async ({ path }) => {
      const ejsText = await readFile(path, 'utf-8');
      return {
        loader: 'json',
        contents: JSON.stringify(ejsText),
      };
    });
  },
};

const build = await esbuild.build({
  outdir: 'dist',
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  sourcemap: true,
  write: true,
  platform: 'node',
  external: ['@aws-sdk'],
  legalComments: 'linked',
  metafile: true,
  target: 'node24',
  plugins: [ejsPlugin],
  format: 'esm',
  outExtension: {
    '.js': '.mjs',
  },
});

await writeFile('meta.json', JSON.stringify(build.metafile), {
  encoding: 'utf-8',
});
