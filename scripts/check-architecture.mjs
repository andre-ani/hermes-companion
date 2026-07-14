import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const failures = [];
const fail = (message) => failures.push(message);
const lock = readJson('infra/hermes-runtime/upstream.lock.json');
const baseline = readJson('scripts/architecture-baseline.json');
const ports = readJson('packages/hermes-adapter/upstream-ports.json');

const dockerfile = readFileSync(join(root, 'infra/hermes-runtime/Dockerfile'), 'utf8');
if (!dockerfile.includes(`${lock.image}@${lock.imageDigest}`)) fail('Hermes runtime Docker digest does not match upstream.lock.json.');

if (!existsSync(join(root, lock.sharedPackage))) fail('Pinned Hermes shared package is missing; initialize submodules.');
else {
  const commit = execFileSync('git', ['-C', 'vendor/hermes-agent', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (commit !== lock.sourceCommit) fail(`Hermes submodule is ${commit}, expected ${lock.sourceCommit}.`);
}
if (ports.sourceCommit !== lock.sourceCommit) fail('Adapter provenance source commit does not match the runtime lock.');

const productManifests = ['package.json'];
for (const parent of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, parent))) {
    const manifest = join(parent, name, 'package.json');
    if (existsSync(join(root, manifest))) productManifests.push(manifest);
  }
}
const reactPackage = (name) => name === 'react' || name === 'react-dom' || name.startsWith('react-') || name.includes('/react');
for (const path of productManifests) {
  const manifest = readJson(path);
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) if (reactPackage(name)) fail(`${path} directly depends on prohibited React package ${name}.`);
  }
}

const rootPackage = readJson('package.json');
const upstreamWorkspaces = (rootPackage.workspaces ?? []).filter((entry) => entry.startsWith('vendor/hermes-agent/'));
if (upstreamWorkspaces.length !== 1 || upstreamWorkspaces[0] !== 'vendor/hermes-agent/apps/shared') {
  fail('Only vendor/hermes-agent/apps/shared may be a product workspace.');
}

const sourceFiles = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    if (['node_modules', 'build', 'dist', 'electron-dist', 'uat-artifacts', '.svelte-kit'].includes(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(?:[cm]?[jt]s|svelte)$/.test(name)) sourceFiles.push(path);
  }
};
for (const directory of ['apps', 'packages']) walk(join(root, directory));
for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8');
  const local = relative(root, path);
  if (/\bfrom\s+['"](?:react|react-dom|react\/|react-dom\/|@[^'"]+\/react)/.test(source) || /\brequire\(['"](?:react|react-dom)/.test(source)) {
    fail(`${local} imports prohibited React code.`);
  }
  if (path.endsWith('.tsx')) fail(`${local} is TSX product code; React ports are prohibited.`);
  for (const match of source.matchAll(/['"]([^'"]*vendor\/hermes-agent\/[^'"]+)['"]/g)) {
    if (!match[1].includes('vendor/hermes-agent/apps/shared/')) fail(`${local} reaches prohibited upstream product source ${match[1]}.`);
  }
}

const rawRpc = /['"](?:session\.(?:create|resume|interrupt|info|context_breakdown)|prompt\.submit|approval\.respond)['"]/g;
const actualRpc = {};
for (const path of sourceFiles) {
  const local = relative(root, path);
  if (local.startsWith('packages/hermes-adapter/')) continue;
  const count = [...readFileSync(path, 'utf8').matchAll(rawRpc)].length;
  if (count) actualRpc[local] = count;
}
for (const [path, count] of Object.entries(actualRpc)) {
  const allowed = baseline.rawRpcCallSites[path];
  if (allowed === undefined) fail(`New raw Hermes RPC call site: ${path}. Route it through the adapter or register a reviewed shim.`);
  else if (count > allowed) fail(`Raw Hermes RPC count increased in ${path}: ${count} > ${allowed}.`);
}

const repository = readFileSync(join(root, 'apps/desktop/src/lib/server/companion-repository.ts'), 'utf8');
for (const name of ['transportSessionId', 'pendingApproval', 'contextUsage', 'modelStatus', 'subagents', 'messages: z.array']) {
  if (repository.includes(name)) fail(`Companion repository persists prohibited Hermes-owned field marker: ${name}.`);
}

for (const entry of ports.entries ?? []) {
  if (!['direct', 'behavioral-port', 'compatibility-shim'].includes(entry.mode)) fail(`Unknown upstream port mode: ${entry.mode}.`);
  if (!entry.local || !existsSync(join(root, entry.local))) fail(`Registered local port path is missing: ${entry.local}.`);
  for (const upstream of String(entry.upstream ?? '').split(';').filter(Boolean)) {
    if (!existsSync(join(root, 'vendor/hermes-agent', upstream))) fail(`Registered upstream source path is missing: ${upstream}.`);
  }
  if (entry.mode === 'compatibility-shim' && !entry.deleteWhen) fail(`Compatibility shim ${entry.local} has no deletion trigger.`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`architecture: ${failure}\n`);
  process.exit(1);
}
process.stdout.write('Architecture ownership checks passed.\n');
