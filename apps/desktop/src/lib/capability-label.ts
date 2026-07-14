import type { CapabilityFamily } from '@hermes-companion/contracts';

const labels: Record<CapabilityFamily, string> = {
  chat: 'Chat', sessions: 'Sessions', profiles: 'Profiles', projects: 'Projects', files: 'Files', terminal: 'Terminal',
  memory: 'Memory', skills: 'Skills', mcp: 'MCP', models: 'Models', artifacts: 'Artifacts', credentials: 'Credentials',
  toolsets: 'Toolsets', permissions: 'Permissions', approvals: 'Approvals', jobs: 'Scheduled jobs', webhooks: 'Webhooks',
  audit: 'Audit log', analytics: 'Analytics', backup: 'Backups', updates: 'Updates', health: 'System health', messaging: 'Messaging',
  agents: 'Agents', crews: 'Crews', conductor: 'Conductor', tasks: 'Tasks', checkpoints: 'Checkpoints', reports: 'Reports',
  notifications: 'Notifications', git: 'Git', browser: 'Browser', previews: 'Previews', plugins: 'Plugins', kanban: 'Kanban',
  achievements: 'Achievements', learning: 'Learning'
};

export const capabilityLabel = (family: CapabilityFamily) => labels[family];
