import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '../../..');
const output = resolve(import.meta.dirname, '../build/build-provenance.json');
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
const provenance = {
  schema: 'hermes-companion.build-provenance/v1',
  commit: git('rev-parse', 'HEAD'),
  dirty: Boolean(git('status', '--porcelain', '--untracked-files=no')),
  builtAt: new Date().toISOString()
};

await mkdir(resolve(import.meta.dirname, '../build'), { recursive: true });
await writeFile(output, `${JSON.stringify(provenance, null, 2)}\n`);
