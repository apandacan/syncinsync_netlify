import { build } from 'esbuild';
import { access, readdir } from 'node:fs/promises';

// Bundle only the public client library. Runtime secrets and file snapshots
// never enter the browser build; configuration comes from /runtime-config.
await access(new URL('../public/index.html', import.meta.url));
for (const name of await readdir(new URL('../public/', import.meta.url))) {
  if (/shared_state|^\.env|^server\.|^package\./.test(name)) throw new Error(`Private file in public: ${name}`);
}
await build({
  stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: process.cwd(), sourcefile: 'supabase-browser.js' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'linked', outfile: 'public/vendor/supabase.js',
});
console.log('Built public/vendor/supabase.js. Publish directory: public.');
