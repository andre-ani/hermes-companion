import { execFile, execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
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
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const provenancePath = join(appPath, 'Contents', 'Resources', 'build-provenance.json');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8').catch(() => '{}'));
if (provenance.schema !== 'hermes-companion.build-provenance/v1' || provenance.commit !== commit || provenance.dirty !== false) {
  throw new Error(`The packaged app does not prove a clean build of ${commit}. Rebuild it with \`npm run dist --workspace=@hermes-companion/desktop\`.`);
}

const executableSuffix = '/Contents/MacOS/Hermes Companion';
const packagedExecutable = realpathSync(join(appPath, executableSuffix));
const runningExecutables = [...new Set(execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' })
  .split('\n')
  .flatMap((line) => {
    const end = line.indexOf(executableSuffix);
    if (end < 0) return [];
    const executable = line.slice(0, end + executableSuffix.length).trim();
    return existsSync(executable) ? [realpathSync(executable)] : [];
  }))];
const conflictingExecutables = runningExecutables.filter((path) => path !== packagedExecutable);
if (conflictingExecutables.length) {
  throw new Error(`A different Hermes Companion package is already running:\n${conflictingExecutables.join('\n')}\nQuit it before testing ${packagedExecutable}.`);
}

const statePath = resolve(process.env.COMPANION_DATA_FILE ?? join(homedir(), '.hermes-companion', 'state.json'));
const initialStateText = await readFile(statePath, 'utf8').catch(() => '');
if (!initialStateText) throw new Error(`Companion state was not found at ${statePath}. Connect and authorize a disposable Railway worktree first.`);
const initialState = JSON.parse(initialStateText);
const remoteConnectionIds = new Set((initialState.connections ?? []).filter((item) => item.kind === 'remote').map((item) => item.id));
const idleRailwayWorktrees = (initialState.worktrees ?? []).filter((item) => remoteConnectionIds.has(item.connectionId) && item.writerRunId === null);
if (!idleRailwayWorktrees.length) throw new Error('No idle Railway-authorized worktree is available for the acceptance run.');

const reader = createInterface({ input: stdin, output: stdout });
const confirm = async (question) => (await reader.question(`${question} [y/N] `)).trim().toLowerCase() === 'y';
let selectedWorktree = process.env.HERMES_COMPANION_ACCEPTANCE_WORKTREE_ID
  ? idleRailwayWorktrees.find((item) => item.worktreeId === process.env.HERMES_COMPANION_ACCEPTANCE_WORKTREE_ID)
  : undefined;
if (process.env.HERMES_COMPANION_ACCEPTANCE_WORKTREE_ID && !selectedWorktree) {
  reader.close();
  throw new Error('HERMES_COMPANION_ACCEPTANCE_WORKTREE_ID is not an idle Railway-authorized worktree.');
}
if (!selectedWorktree && idleRailwayWorktrees.length === 1) selectedWorktree = idleRailwayWorktrees[0];
if (!selectedWorktree) {
  stdout.write('\nIdle Railway-authorized worktrees:\n');
  idleRailwayWorktrees.forEach((item, index) => stdout.write(`${index + 1}. ${item.branch} (${item.worktreeId})\n`));
  const selectedIndex = Number.parseInt(await reader.question('Select the disposable worktree number: '), 10) - 1;
  selectedWorktree = idleRailwayWorktrees[selectedIndex];
  if (!selectedWorktree) {
    reader.close();
    throw new Error('A valid disposable worktree was not selected.');
  }
}
stdout.write(`\nSelected Railway-authorized worktree: ${selectedWorktree.branch} (${selectedWorktree.worktreeId})\n`);
if (!await confirm('Did you verify this exact worktree is disposable and has no active writer?')) {
  reader.close();
  throw new Error('Acceptance stopped before mutating an unconfirmed worktree.');
}

const sourceLock = JSON.parse(execFileSync('git', ['show', 'HEAD:infra/hermes-runtime/upstream.lock.json'], { encoding: 'utf8' }));
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

const checks = {
  packagedAppUsedPinnedRailwayProfile: await confirm('Did the packaged app connect through the existing pinned Railway profile?'),
  disposableAuthorizedWorktreeSelected: true,
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

const state = await readFile(statePath, 'utf8').catch(() => '');
const finalState = state ? JSON.parse(state) : {};
const startedAtMilliseconds = Date.parse(startedAt);
const newRuns = (finalState.runs ?? []).filter((item) => item.worktreeId === selectedWorktree.worktreeId
  && Date.parse(item.startedAt) >= startedAtMilliseconds);
const runIds = new Set(newRuns.map((item) => item.id));
const acquired = (finalState.audit ?? []).filter((item) => item.action === 'writer.acquired'
  && item.subject === selectedWorktree.worktreeId && runIds.has(item.detail?.runId));
const released = (finalState.audit ?? []).filter((item) => item.action === 'writer.released'
  && item.subject === selectedWorktree.worktreeId && runIds.has(item.detail?.runId));
const finalWorktree = (finalState.worktrees ?? []).find((item) => item.worktreeId === selectedWorktree.worktreeId);
const automaticChecks = {
  persistedStateLocated: Boolean(state),
  exactlyOneRunBindingCreated: newRuns.length === 1,
  durableSessionBindingPresent: newRuns.length === 1 && typeof newRuns[0].durableSessionId === 'string',
  writerAcquiredExactlyOnce: acquired.length === 1,
  writerReleasedExactlyOnce: released.length === 1 && newRuns[0]?.finishedAt !== null && finalWorktree?.writerRunId === null,
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
  worktreeId: selectedWorktree.worktreeId,
  worktreeBranch: selectedWorktree.branch,
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
