import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const configuredRoots = () => (process.env.BRIDGE_ALLOWED_ROOTS ?? '/opt/data,/workspace,/app')
  .split(',').map((root) => root.trim()).filter(Boolean).map((root) => resolve(root));

const containedBy = (candidate: string, root: string) => {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export async function assertAllowedExistingPath(input: string): Promise<string> {
  if (!isAbsolute(input)) throw new Error('Host paths must be absolute.');
  const candidate = await realpath(input);
  const allowed = await Promise.all(configuredRoots().map((root) => realpath(root).catch(() => resolve(root))));
  if (!allowed.some((root) => containedBy(candidate, root))) throw new Error('Path is outside the configured bridge roots.');
  return candidate;
}

export function assertAllowedTargetPath(input: string): string {
  if (!isAbsolute(input)) throw new Error('Host paths must be absolute.');
  const candidate = resolve(input);
  if (!configuredRoots().some((root) => containedBy(candidate, root))) throw new Error('Target path is outside the configured bridge roots.');
  return candidate;
}

export function assertBranch(branch: string): string {
  if (!/^(?![-/.])(?!.*\.\.)(?!.*[~^:?*\[\\\s])[^\x00-\x1f\x7f]+(?<![/.])$/.test(branch)) throw new Error('Invalid Git branch name.');
  return branch;
}
