import { command, query } from '$app/server';
import { z } from 'zod';
import { invokeExecutionHost } from '$lib/server/execution-host';
import { activeWorkspaceOwner, requireActiveWorktree } from '$lib/server/worktree-ownership';

const terminalId = z.object({ id: z.string().uuid() });
const terminalOwners = new Map<string, { connectionId: string; profileId: string; worktreeId: string }>();

function requireTerminalOwner(id: string) {
  const active = activeWorkspaceOwner();
  const owner = terminalOwners.get(id);
  if (!owner || owner.connectionId !== active.connectionId || owner.profileId !== active.profileId) throw new Error('Terminal does not belong to the active Hermes workspace.');
  return owner;
}

export const openWorktreeTerminal = command(z.object({ worktreeId: z.string().min(1), cols: z.number().int().min(20).max(500).default(100), rows: z.number().int().min(5).max(200).default(30) }), async ({ worktreeId, cols, rows }) => {
  const worktree = await requireActiveWorktree(worktreeId);
  const terminal = await invokeExecutionHost<{ id?: string; terminalId?: string }>({ localCapability: 'pty.open', localInput: { cwd: worktree.path, cols, rows }, remoteCapability: 'pty', remotePayload: { action: 'pty.open', worktreeId, cols, rows }, expectedConnectionId: worktree.connectionId });
  const id = terminal.id ?? terminal.terminalId!;
  terminalOwners.set(id, { connectionId: worktree.connectionId, profileId: worktree.profileId, worktreeId });
  return { id };
});

// Local PTY traffic uses polling through the Electron native boundary. Remote PTYs upgrade to the bridge WebSocket in the desktop transport layer.
export const writeTerminal = command(terminalId.extend({ data: z.string().max(64_000) }), async (input) => invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.write', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.write', terminalId: input.id, data: input.data }, expectedConnectionId: requireTerminalOwner(input.id).connectionId }));
export const resizeTerminal = command(terminalId.extend({ cols: z.number().int().min(20).max(500), rows: z.number().int().min(5).max(200) }), async (input) => invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.resize', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.resize', terminalId: input.id, cols: input.cols, rows: input.rows }, expectedConnectionId: requireTerminalOwner(input.id).connectionId }));
export const readTerminal = query(terminalId, async (input) => invokeExecutionHost<{ output: string[]; closed: boolean }>({ localCapability: 'pty.read', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.read', terminalId: input.id }, expectedConnectionId: requireTerminalOwner(input.id).connectionId }));
export const closeTerminal = command(terminalId, async (input) => {
  const owner = requireTerminalOwner(input.id);
  try { return await invokeExecutionHost<{ ok: boolean }>({ localCapability: 'pty.close', localInput: input, remoteCapability: 'pty', remotePayload: { action: 'pty.close', terminalId: input.id }, expectedConnectionId: owner.connectionId }); }
  finally { terminalOwners.delete(input.id); }
});
