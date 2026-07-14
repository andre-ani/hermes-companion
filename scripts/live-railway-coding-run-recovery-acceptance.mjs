import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('The packaged Railway coding-run workflow currently targets macOS.');

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
const nonce = `COMPANION-CODING-RECOVERY-${randomUUID()}`;
const filename = `.companion-acceptance-${nonce}.txt`;
const request = `Create ${filename} in this authorized worktree with exactly this content: ${nonce}. Then run git status --short, wait 45 seconds, and report the file and Git state.`;
const startedAt = new Date().toISOString();
const reportDirectory = resolve(process.env.HERMES_COMPANION_ACCEPTANCE_REPORT_DIR ?? 'acceptance-artifacts/live-railway-coding-run-recovery', startedAt.replaceAll(':', '-'));
await mkdir(reportDirectory, { recursive: true });

stdout.write(`\nPinned source: ${sourceLock.sourceCommit}\nPackaged app: ${appPath}\n\n`);
stdout.write('This workflow uses the existing saved Railway connection and a disposable authorized worktree. It never prints or records a Serve URL, ticket, password, or cookie.\n\n');
stdout.write(`Start this exact task from the Background run panel:\n\n${request}\n\n`);
stdout.write('After the run begins: reload the renderer, briefly take the Mac offline, restore connectivity, then quit and relaunch the packaged app while the run is still active.\n');
stdout.write('After recovery, resolve one emitted approval if available; otherwise cancel only after the file and Git state are visible.\n');

await new Promise((resolveOpen, reject) => execFile('open', [appPath], (error) => error ? reject(error) : resolveOpen()));

const reader = createInterface({ input: stdin, output: stdout });
const confirm = async (question) => (await reader.question(`${question} [y/N] `)).trim().toLowerCase() === 'y';
const checks = {
  packagedAppUsedPinnedRailwayProfile: await confirm('Did the packaged app connect through the existing pinned Railway profile?'),
  disposableAuthorizedWorktreeSelected: await confirm('Was the selected worktree disposable and visibly authorized for this profile?'),
  exactlyOneWriterAcquired: await confirm('Did the worktree show exactly one active writer for this run?'),
  exactlyOneDurableSessionAndPrompt: await confirm('Did Hermes create one durable session and show exactly one copy of the nonce task?'),
  rendererReloadedDuringRun: await confirm('Did you reload the renderer while the coding run was active?'),
  networkInterruptedAndRestored: await confirm('Did you take the Mac offline briefly and restore connectivity?'),
  appQuitRelaunchedDuringRun: await confirm('Did you quit and relaunch the app while the run was active?'),
  sameRunRehydrated: await confirm('Did the same run return without restarting or replaying its prompt?'),
  noDuplicateToolInvocation: await confirm('Was each visible tool invocation represented once after recovery?'),
  currentTransportControlSucceeded: await confirm('Did a recovered approval response succeed, or did recovered cancellation succeed after the file became visible?'),
  writerReleasedExactlyOnce: await confirm('Did the writer lease clear exactly once at the terminal state?'),
  resultingFileAndGitVisible: await confirm('Is the nonce file and its Git status visible from the authorized execution host?'),
  noCredentialTicketTransportOrHermesStateExposure: await confirm('Were no credentials, ticket URLs, transport IDs, transcripts, approval payloads, or running state present in Companion logs or persisted state?')
};
reader.close();

const statePath = resolve(process.env.COMPANION_DATA_FILE ?? join(homedir(), '.hermes-companion', 'state.json'));
const state = await readFile(statePath, 'utf8').catch(() => '');
const automaticChecks = {
  persistedStateLocated: Boolean(state),
  nonceNotPersistedByCompanion: !state.includes(nonce),
  ticketUrlNotPersistedByCompanion: !/wss?:\/\/[^\s"']+[?&](?:ticket|token)=/i.test(state),
  transportMarkerNotPersistedByCompanion: !/transportSessionId|transport_session_id|runtimeSessionId/.test(state)
};
const report = {
  schema: 'hermes-companion.live-railway-coding-run-recovery/v1',
  commit,
  pinnedSourceCommit: sourceLock.sourceCommit,
  imageDigest: sourceLock.imageDigest,
  desktopVersion: sourceLock.desktopVersion,
  startedAt,
  completedAt: new Date().toISOString(),
  nonce,
  checks,
  automaticChecks,
  ok: Object.values(checks).every(Boolean) && Object.values(automaticChecks).every(Boolean)
};
await writeFile(join(reportDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
stdout.write(`\nAcceptance ${report.ok ? 'passed' : 'failed'}. Sanitized report: ${join(reportDirectory, 'report.json')}\n`);
if (!report.ok) process.exitCode = 1;
