import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('The packaged Railway chat-recovery workflow currently targets macOS.');

const candidates = [
  process.env.HERMES_COMPANION_ACCEPTANCE_APP,
  'apps/desktop/electron-dist/mac-arm64/Hermes Companion.app',
  'apps/desktop/electron-dist/mac/Hermes Companion.app',
  'apps/desktop/electron-dist/Hermes Companion.app'
].filter(Boolean).map((path) => resolve(path));
const appPath = candidates.find(existsSync);
if (!appPath) throw new Error('Build the packaged app first with `npm run dist --workspace=@hermes-companion/desktop`.');

const sourceLock = JSON.parse(execFileSync('git', ['show', 'HEAD:infra/hermes-runtime/upstream.lock.json'], { encoding: 'utf8' }));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const nonce = `COMPANION-RECOVERY-${randomUUID()}`;
const request = `Run this exact terminal command and return its output: sleep 20; printf '${nonce}'`;
const startedAt = new Date().toISOString();
const reportDirectory = resolve(process.env.HERMES_COMPANION_ACCEPTANCE_REPORT_DIR ?? 'acceptance-artifacts/live-railway-chat-recovery', startedAt.replaceAll(':', '-'));
await mkdir(reportDirectory, { recursive: true });

stdout.write(`\nPinned source: ${sourceLock.sourceCommit}\nPackaged app: ${appPath}\n\n`);
stdout.write('This workflow uses the existing saved Railway connection. It never prints or records a Serve URL, ticket, password, or cookie.\n\n');
stdout.write(`Submit this unique request in a new local draft:\n\n${request}\n\n`);
stdout.write('After the tool starts: reload the renderer, briefly take the Mac offline, restore connectivity, wait for completion, then quit and relaunch the packaged app.\n');

await new Promise((resolveOpen, reject) => execFile('open', ['-na', appPath], (error) => error ? reject(error) : resolveOpen()));

const reader = createInterface({ input: stdin, output: stdout });
const confirm = async (question) => (await reader.question(`${question} [y/N] `)).trim().toLowerCase() === 'y';
const checks = {
  packagedAppUsedExistingRailwayProfile: await confirm('Did the packaged app connect through the existing pinned Railway profile?'),
  rendererReloadedDuringTool: await confirm('Did you reload the renderer after the terminal tool started?'),
  networkInterruptedAndRestored: await confirm('Did you take the Mac offline briefly and restore connectivity?'),
  sameDurableSessionReturned: await confirm('Did the same conversation return after both disruptions?'),
  contextModelAndStatusRestored: await confirm('Did context, model, and running/completed status restore from Hermes?'),
  exactlyOneUserMessage: await confirm('Is there exactly one user message containing the nonce request?'),
  exactlyOneToolResult: await confirm('Is there exactly one terminal tool invocation/result for the nonce?'),
  exactlyOneFinalResponse: await confirm('Is there exactly one final Hermes response containing the nonce?'),
  quitRelaunchRehydrated: await confirm('After quitting and relaunching, did Hermes restore the same transcript and session?'),
  noCredentialOrTicketExposure: await confirm('Were no ticket URLs, credentials, cookies, or auth headers visible in UI, logs, or persisted state?')
};
reader.close();

const report = {
  schema: 'hermes-companion.live-railway-chat-recovery/v1',
  commit,
  pinnedSourceCommit: sourceLock.sourceCommit,
  imageDigest: sourceLock.imageDigest,
  desktopVersion: sourceLock.desktopVersion,
  startedAt,
  completedAt: new Date().toISOString(),
  nonce,
  checks,
  ok: Object.values(checks).every(Boolean)
};
await writeFile(join(reportDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
stdout.write(`\nAcceptance ${report.ok ? 'passed' : 'failed'}. Sanitized report: ${join(reportDirectory, 'report.json')}\n`);
if (!report.ok) process.exitCode = 1;
