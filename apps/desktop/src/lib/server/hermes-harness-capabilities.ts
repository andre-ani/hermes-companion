import type { GatewayStatus, HarnessCapabilities } from '@hermes-companion/contracts';

export const buildHermesHarnessCapabilities = (status: GatewayStatus, serveAvailable: boolean): HarnessCapabilities => {
  const agentAuthenticated = status.core.health || status.core.chatCompletions || status.enhanced.sessions;
  return {
    id: 'hermes',
    displayName: 'Hermes',
    installed: status.status !== 'disconnected',
    authenticated: agentAuthenticated,
    // The Agent API advertises structured runs, but its current contract has
    // no cwd/worktree field. Only Serve session.create can safely bind a coding
    // run to the selected worktree.
    supportsStructuredApprovals: serveAvailable,
    supportsStreaming: serveAvailable,
    supportsWorktrees: serveAvailable,
    supportsNativeFallback: false
  };
};
