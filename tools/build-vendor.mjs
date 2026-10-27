// Rebuilds the browser bundles in vendor/. Run: npm run build:vendor
import { build } from 'esbuild';
const common = { bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'eof', logLevel: 'info' };
await build({ ...common, entryPoints: ['tools/vendor-editor.js'], outfile: 'vendor/editor.js' });
await build({ ...common, entryPoints: ['tools/vendor-three.js'], outfile: 'vendor/three.js' });
