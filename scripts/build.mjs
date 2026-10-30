// Builds the plugin the way Nuclear does: esbuild with Nuclear's own module resolution
// (player/src/services/plugins/pluginCompiler.ts), so anything that would fail to load in Nuclear
// fails here too. Nuclear resolves a relative import to a path without extension and tries
// .ts/.tsx/.js and then /index.*, but keeps the extension-less path as the importer of what it loads:
// imports inside a folder's index.ts are then resolved one folder too high. Hence no folder imports.
//   node scripts/build.mjs <entry> <outfile>
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

import * as esbuild from 'esbuild';

const [entryArg, outfile] = process.argv.slice(2);
if (!entryArg || !outfile) {
  console.error('usage: node scripts/build.mjs <entry> <outfile>');
  process.exit(2);
}
const entry = resolve(entryArg);
const loaderFor = (p) => (p.endsWith('.tsx') ? 'tsx' : p.endsWith('.ts') ? 'ts' : 'js');
const isFile = (p) => existsSync(p) && statSync(p).isFile();

const nuclearResolution = {
  name: 'nuclear-resolution',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return { path: entry, namespace: 'nuclear' };
      if (isAbsolute(args.path)) return { path: args.path, namespace: 'nuclear' };
      if (/^\.\.?[/\\]/.test(args.path)) {
        // The importer is the path as it was requested, not the file it ended up loading
        return { path: resolve(args.importer ? dirname(args.importer) : dirname(entry), args.path), namespace: 'nuclear' };
      }
      return { path: args.path, external: true };
    });
    build.onLoad({ filter: /.*/, namespace: 'nuclear' }, (args) => {
      const candidates = extname(args.path)
        ? [args.path]
        : ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'].map((suffix) => args.path + suffix);
      const file = candidates.find(isFile);
      if (!file) throw new Error(`Module not found (as Nuclear resolves it): ${args.path}`);
      return { contents: readFileSync(file, 'utf8'), loader: loaderFor(file) };
    });
  },
};

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['@nuclearplayer/plugin-sdk'],
  tsconfigRaw: { compilerOptions: {} },
  outfile,
  logLevel: 'warning',
  plugins: [nuclearResolution],
});
