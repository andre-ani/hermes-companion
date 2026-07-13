import type { CapabilityAvailability, GatewayStatus } from '@hermes-companion/contracts';

const companionFamilies = new Set(['git', 'browser', 'previews', 'annotations', 'harnesses', 'terminal', 'files', 'notifications']);

const routeByFamily: Record<string, string> = {
  chat: '/', sessions: '/', projects: '/projects', files: '/files', terminal: '/terminal', memory: '/memory', skills: '/skills',
  mcp: '/settings/mcp', models: '/settings/providers', credentials: '/settings/providers', toolsets: '/settings/tools',
  permissions: '/settings/permissions', approvals: '/approvals', jobs: '/jobs', webhooks: '/settings/webhooks', audit: '/audit',
  analytics: '/analytics', backup: '/settings/backup', updates: '/settings/updates', health: '/operations', messaging: '/messaging',
  profiles: '/profiles', agents: '/agents', crews: '/crews', conductor: '/conductor', tasks: '/tasks', checkpoints: '/checkpoints',
  reports: '/reports', notifications: '/notifications', git: '/code/review', browser: '/browser', previews: '/browser',
  annotations: '/annotations', harnesses: '/settings/harnesses', plugins: '/settings/plugins',
  kanban: '/capabilities/kanban', achievements: '/capabilities/achievements', learning: '/capabilities/learning', artifacts: '/artifacts'
};

export const buildCapabilityRegistry = (status: GatewayStatus): CapabilityAvailability[] =>
  Object.keys(routeByFamily).map((family) => {
    const companion = companionFamilies.has(family);
    const companionAvailable = family === 'notifications' || status.connection.kind === 'local' || Boolean(status.connection.bridgeUrl);
    const verifiedHermesAvailability: Record<string, boolean> = {
      chat: status.core.chatCompletions || status.enhanced.enhancedChat,
      sessions: status.enhanced.sessions,
      projects: status.enhanced.sessions && Boolean(status.connection.serveUrl || status.connection.serveWsUrl),
      profiles: status.enhanced.profiles,
      memory: status.enhanced.memory,
      skills: status.enhanced.skills,
      mcp: status.enhanced.mcp,
      models: status.core.models,
      credentials: status.enhanced.credentials,
      toolsets: status.enhanced.toolsets,
      permissions: status.enhanced.permissions,
      approvals: status.enhanced.approvals || Boolean(status.connection.serveWsUrl),
      jobs: status.enhanced.jobs,
      audit: status.enhanced.logs,
      analytics: status.enhanced.analytics,
      updates: status.enhanced.updates,
      messaging: status.enhanced.messaging,
      webhooks: status.enhanced.webhooks,
      agents: status.enhanced.enhancedChat && Boolean(status.connection.serveUrl || status.connection.serveWsUrl),
      plugins: status.enhanced.plugins,
      kanban: status.enhanced.kanban,
      achievements: status.enhanced.achievements,
      checkpoints: status.enhanced.checkpoints,
      learning: status.enhanced.learning,
      reports: status.enhanced.analytics,
      health: status.core.health
    };
    const available = companion ? companionAvailable : status.compatibility.compatible && (verifiedHermesAvailability[family] ?? false);
    return {
      family: family as CapabilityAvailability['family'],
      owner: companion ? 'companion' : 'hermes',
      available,
      reason: available ? null : companion
        ? 'Remote companion capabilities require an authenticated companion bridge.'
        : !status.compatibility.compatible ? status.compatibility.reason : `Unsupported pending a documented Hermes API for ${family}.`,
      route: routeByFamily[family]
    };
  });
