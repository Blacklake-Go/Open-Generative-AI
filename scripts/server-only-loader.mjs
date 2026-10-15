// Node-only test/maintenance loader. Next.js still enforces `server-only`
// during application bundling; this loader makes server modules and `@/` aliases callable
// from isolated Node test and migration processes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  }

  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }

  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2);
    const candidateBase = path.join(repoRoot, relative);
    for (const candidate of [
      candidateBase,
      `${candidateBase}.js`,
      `${candidateBase}.jsx`,
      `${candidateBase}.mjs`,
      `${candidateBase}/index.js`,
      `${candidateBase}/index.jsx`,
    ]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}

