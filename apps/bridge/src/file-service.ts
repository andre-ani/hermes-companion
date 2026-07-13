import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { FileEntry, FilePreview, FileSearchResult } from '@hermes-companion/contracts';

const exec = promisify(execFile);

const hiddenDirectories = new Set(['.git', 'node_modules']);
const previewTypes = new Map<string, FilePreview['mime']>([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.pdf', 'application/pdf']]);
const validSignature = (mime: FilePreview['mime'], data: Buffer) => mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : mime === 'image/jpeg' ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff : mime === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')) : mime === 'image/webp' ? data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP' : data.subarray(0, 5).toString('ascii') === '%PDF-';

async function containedPath(root: string, input: string) {
  if (isAbsolute(input) || input.split(/[\\/]/).includes('..')) throw new Error('File path must be relative to its worktree.');
  const realRoot = await realpath(root);
  const candidate = await realpath(resolve(realRoot, input || '.'));
  const rel = relative(realRoot, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('File path escaped its worktree.');
  return { realRoot, candidate };
}

async function containedTargetPath(root: string, input: string) {
  if (!input || isAbsolute(input) || input.split(/[\\/]/).includes('..')) throw new Error('File path must be relative to its worktree.');
  const realRoot = await realpath(root); const parent = await realpath(dirname(resolve(realRoot, input))); const rel = relative(realRoot, parent);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('File path escaped its worktree.');
  const candidate = resolve(parent, input.split(/[\\/]/).at(-1)!); const targetRel = relative(realRoot, candidate);
  if (!targetRel || targetRel.startsWith('..') || isAbsolute(targetRel)) throw new Error('File path escaped its worktree.');
  return { realRoot, candidate };
}

export async function listFiles(root: string, input = ''): Promise<FileEntry[]> {
  const { realRoot, candidate } = await containedPath(root, input);
  const entries = await readdir(candidate, { withFileTypes: true });
  const visible = entries.filter((entry) => !hiddenDirectories.has(entry.name) && (entry.isFile() || entry.isDirectory())).slice(0, 2_000);
  return Promise.all(visible.map(async (entry) => {
    const absolute = join(candidate, entry.name);
    const info = entry.isFile() ? await stat(absolute) : null;
    return { name: entry.name, path: relative(realRoot, absolute), kind: entry.isDirectory() ? 'directory' as const : 'file' as const, size: info?.size ?? null };
  })).then((items) => items.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
}

export async function readTextFile(root: string, input: string) {
  const { candidate } = await containedPath(root, input);
  const info = await stat(candidate);
  if (!info.isFile()) throw new Error('Selected path is not a file.');
  if (info.size > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB editor limit.');
  return { path: input, content: await readFile(candidate, 'utf8'), size: info.size };
}

export async function writeTextFile(root: string, input: string, content: string) {
  const { candidate } = await containedPath(root, input); const info = await stat(candidate);
  if (!info.isFile()) throw new Error('Selected path is not a file.');
  if (info.size > 2 * 1024 * 1024 || Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB editor limit.');
  await writeFile(candidate, content, 'utf8');
  return { path: input, size: Buffer.byteLength(content, 'utf8') };
}

export async function searchTextFiles(root: string, query: string, limit = 200): Promise<FileSearchResult[]> {
  const { realRoot } = await containedPath(root, '');
  try {
    const { stdout } = await exec('rg', ['--json', '--line-number', '--max-count', '20', '--glob', '!.git/**', '--glob', '!node_modules/**', '--', query, '.'], { cwd: realRoot, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    const results: FileSearchResult[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line || results.length >= limit) continue;
      try {
        const event = JSON.parse(line) as { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
        if (event.type === 'match' && event.data?.path?.text && event.data.line_number) results.push({ path: event.data.path.text.replace(/^\.\//, ''), line: event.data.line_number, text: (event.data.lines?.text ?? '').trimEnd() });
      } catch {}
    }
    return results;
  } catch (error) {
    const failure = error as Error & { code?: number };
    if (failure.code === 1) return [];
    throw error;
  }
}

export async function createFileEntry(root: string, input: string, kind: 'file' | 'directory') {
  const { realRoot, candidate } = await containedTargetPath(root, input);
  if (kind === 'directory') await mkdir(candidate); else { const handle = await open(candidate, 'wx'); await handle.close(); }
  return { path: relative(realRoot, candidate), kind };
}

export async function moveFileEntry(root: string, from: string, to: string) {
  const source = await containedPath(root, from); const target = await containedTargetPath(root, to);
  await stat(target.candidate).then(() => { throw new Error('Destination already exists.'); }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  await rename(source.candidate, target.candidate); return { from, to: relative(source.realRoot, target.candidate) };
}

export async function deleteFileEntry(root: string, input: string, recursive: boolean) {
  const { realRoot, candidate } = await containedPath(root, input); if (candidate === realRoot) throw new Error('Cannot delete the worktree root.');
  const info = await stat(candidate); await rm(candidate, { recursive: info.isDirectory() ? recursive : false, force: false }); return { path: input, kind: info.isDirectory() ? 'directory' as const : 'file' as const };
}

export async function previewFile(root: string, input: string): Promise<FilePreview> {
  const { candidate } = await containedPath(root, input); const info = await stat(candidate); const mime = previewTypes.get(extname(input).toLowerCase());
  if (!info.isFile() || !mime) throw new Error('This file type does not support binary preview.');
  if (info.size > 8 * 1024 * 1024) throw new Error('Binary preview exceeds the 8 MB limit.');
  const data = await readFile(candidate); if (!validSignature(mime, data)) throw new Error('File content does not match its preview type.');
  return { path: input, mime, dataUrl: `data:${mime};base64,${data.toString('base64')}`, size: info.size };
}
