import pty from 'node-pty';
import type { WebSocket } from 'ws';
import type { BridgeStore } from './bridge-store.js';
import { assertAllowedExistingPath } from './path-policy.js';

type Terminal = { id: string; worktreeId: string; process: pty.IPty; clients: Set<WebSocket>; output: string[]; closed: boolean };

export class TerminalManager {
  private terminals = new Map<string, Terminal>();
  constructor(private readonly store: BridgeStore) {}
  async open(input: { worktreeId: string; cols: number; rows: number; shell?: string }) {
    const worktree = await this.store.getWorktree(input.worktreeId); if (!worktree) throw new Error('Worktree not found.');
    const cwd = await assertAllowedExistingPath(worktree.path); const shell = input.shell ?? (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL ?? '/bin/bash');
    const id = crypto.randomUUID(); const child = pty.spawn(shell, [], { cwd, cols: input.cols, rows: input.rows, name: 'xterm-256color', env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
    const terminal: Terminal = { id, worktreeId: input.worktreeId, process: child, clients: new Set(), output: [], closed: false }; this.terminals.set(id, terminal);
    child.onData((data) => { terminal.output.push(data); if (terminal.output.length > 2_000) terminal.output.splice(0, terminal.output.length - 2_000); const payload = JSON.stringify({ type: 'output', terminalId: id, data }); for (const client of terminal.clients) if (client.readyState === 1) client.send(payload); });
    child.onExit(({ exitCode, signal }) => { terminal.closed = true; const payload = JSON.stringify({ type: 'exit', terminalId: id, exitCode, signal }); for (const client of terminal.clients) if (client.readyState === 1) client.send(payload); });
    return { terminalId: id, worktreeId: input.worktreeId };
  }
  attach(id: string, socket: WebSocket) { const terminal = this.terminals.get(id); if (!terminal) throw new Error('Terminal not found.'); terminal.clients.add(socket); socket.once('close', () => terminal.clients.delete(socket)); }
  write(id: string, data: string) { const terminal = this.terminals.get(id); if (!terminal) throw new Error('Terminal not found.'); terminal.process.write(data); }
  resize(id: string, cols: number, rows: number) { const terminal = this.terminals.get(id); if (!terminal) throw new Error('Terminal not found.'); terminal.process.resize(cols, rows); }
  read(id: string) { const terminal = this.terminals.get(id); if (!terminal) return { output: [], closed: true }; return { output: terminal.output.splice(0), closed: terminal.closed }; }
  close(id: string) { this.terminals.get(id)?.process.kill(); this.terminals.delete(id); }
  closeWorktree(worktreeId: string) { for (const [id, terminal] of this.terminals) if (terminal.worktreeId === worktreeId) this.close(id); }
}
