import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../electron-dist/', import.meta.url);
const rootPath = fileURLToPath(root);

const releaseFile = /\.(?:dmg|zip|exe|AppImage|deb|rpm|blockmap)$/;
const artifacts = (await readdir(rootPath, { withFileTypes: true })).filter((entry) => entry.isFile() && releaseFile.test(entry.name)).map((entry) => join(rootPath, entry.name)).sort();
if (!artifacts.length) throw new Error('No desktop release artifacts were found.');
const lines = [];
for (const file of artifacts) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${relative(rootPath, file).split(sep).join('/')}`);
}
await writeFile(join(rootPath, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Wrote SHA256SUMS for ${artifacts.length} artifacts.\n`);
