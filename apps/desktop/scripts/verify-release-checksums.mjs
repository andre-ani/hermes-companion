import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../electron-dist/', import.meta.url);
const rootPath = fileURLToPath(root);
const releaseFile = /\.(?:dmg|zip|exe|AppImage|deb|rpm|blockmap)$/;
const artifacts = (await readdir(rootPath, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && releaseFile.test(entry.name))
  .map((entry) => join(rootPath, entry.name))
  .sort();

if (!artifacts.length) throw new Error('No desktop release artifacts were found.');

const manifestPath = join(rootPath, 'SHA256SUMS');
const manifest = await readFile(manifestPath, 'utf8').catch(() => {
  throw new Error('SHA256SUMS is missing. Run npm run release:checksums first.');
});
const supplied = new Map();
for (const [index, line] of manifest.trim().split(/\r?\n/).entries()) {
  const match = /^([a-f0-9]{64})  ([^/\\][^\\]*)$/.exec(line);
  if (!match) throw new Error(`Malformed SHA256SUMS entry on line ${index + 1}.`);
  if (supplied.has(match[2])) throw new Error(`Duplicate SHA256SUMS entry for ${match[2]}.`);
  supplied.set(match[2], match[1]);
}

const expectedNames = artifacts.map((file) => relative(rootPath, file).split(sep).join('/'));
if (supplied.size !== expectedNames.length || expectedNames.some((name) => !supplied.has(name))) {
  throw new Error('SHA256SUMS must contain exactly one entry for every release artifact.');
}

for (const artifact of artifacts) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  const name = relative(rootPath, artifact).split(sep).join('/');
  if (supplied.get(name) !== hash.digest('hex')) throw new Error(`Checksum mismatch for ${name}.`);
}

process.stdout.write(`Verified SHA256SUMS for ${artifacts.length} release artifacts.\n`);
