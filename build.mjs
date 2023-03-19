import * as esbuild from 'esbuild';
import { writeFile } from 'fs/promises';

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
});

await writeFile('meta.json', JSON.stringify(build.metafile), {
  encoding: 'utf-8',
});
