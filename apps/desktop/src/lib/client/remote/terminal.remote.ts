import { command, query } from '$app/server';
import { z } from 'zod';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { invokeExecutionHost } from '$lib/server/execution-host';

const terminalId = z.object({ id: z.string().uuid() });

export const openWorktreeTerminal = command(z.object({ worktreeId: z.string().min(1), cols: z.number().int().min(20).max(500).default(100), rows: z.number().int().min(5).max(200).default(30) }), async ({ worktreeId, cols, rows }) => {
  const worktree = (await getCompanionRepository().listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const terminal = await invokeExecutionHost<{ id?: string; terminalId?: string }>({ localCapability: 'pty.open', localInput: { cwd: worktree.path, cols, rows }, remoteCapability: 'pty', remotePayload: { action: 'pty.open', worktreeId, cols, rows } });
  return { id: terminal.id ?? terminal.terminalId! };
});

// Local PTY traffic uses polling through the Electron native boundary. Remote PTYs upgrade to the bridge WebSocket in the desktop transport layer.
export const writeTerminal = command(terminalId.extend({ data: z.string().max(64_000) }), async (input) => invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.write', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.write', terminalId: input.id, data: input.data } }));
export const resizeTerminal = command(terminalId.extend({ cols: z.number().int().min(20).max(500), rows: z.number().int().min(5).max(200) }), async (input) => invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.resize', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.resize', terminalId: input.id, cols: input.cols, rows: input.rows } }));
export const readTerminal = query(terminalId, async (input) => invokeExecutionHost<{ output: string[]; closed: boolean }>({ localCapability: 'pty.read', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.read', terminalId: input.id } }));
export const closeTerminal = command(terminalId, async (input) => invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.close', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.close', terminalId: input.id } }));
