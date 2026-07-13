export type SettingsIcon = 'model' | 'chat' | 'appearance' | 'workspace' | 'safety' | 'memory' | 'notifications' | 'providers' | 'gateway' | 'keys' | 'archive' | 'about';

export type SettingsItem = {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
};

export type SettingsSection = {
  id: string;
  label: string;
  icon: SettingsIcon;
  description: string;
  items: SettingsItem[];
  group?: 'primary' | 'runtime' | 'system';
};

export const settingsSections: SettingsSection[] = [
  { id: 'model', label: 'Model', icon: 'model', description: 'Default and auxiliary models', group: 'primary', items: [
    { id: 'default-model', label: 'Default model', description: 'Choose the model for new Hermes sessions.', keywords: ['provider', 'reasoning'] },
    { id: 'auxiliary-models', label: 'Auxiliary models', description: 'Assign models for vision, search, compression, approvals, and title generation.', keywords: ['vision', 'curator', 'compression'] }
  ] },
  { id: 'chat', label: 'Chat', icon: 'chat', description: 'Conversation behavior', group: 'primary', items: [
    { id: 'personality', label: 'Personality', description: 'Default Hermes assistant style for new sessions.' },
    { id: 'reasoning-blocks', label: 'Reasoning and thinking status', description: 'Show model reasoning and choose plain, Hermes personality, or hidden transient status.', keywords: ['thinking', 'ruminating', 'personality'] },
    { id: 'attachments', label: 'Image attachments', description: 'Control how images are sent to the active model.' }
  ] },
  { id: 'appearance', label: 'Appearance', icon: 'appearance', description: 'Theme, density, and typography', group: 'primary', items: [
    { id: 'theme', label: 'Theme', description: 'Choose light, dark, or system appearance.', keywords: ['mode', 'color'] },
    { id: 'palette', label: 'Palette', description: 'Choose the meta theme applied within the selected mode.', keywords: ['hue', 'colors', 'dracula'] },
    { id: 'tool-density', label: 'Tool call density', description: 'Adjust how much detail is shown for tool calls.' },
    { id: 'code-wrap', label: 'Code block word wrap', description: 'Wrap long lines in conversation code blocks.' },
    { id: 'contextual-controls', label: 'Contextual controls', description: 'Choose whether approval and context appear in the composer, status line, or both.', keywords: ['approval', 'status bar', 'context', 'statusline'] }
  ] },
  { id: 'workspace', label: 'Workspace', icon: 'workspace', description: 'Projects, worktrees, and local execution', group: 'primary', items: [
    { id: 'default-project', label: 'Default project behavior', description: 'Choose how project sessions create and reuse worktrees.' },
    { id: 'custom-actions', label: 'Profile actions', description: 'Configure project-scoped commands shown in the center header.', keywords: ['test', 'run', 'preview'] }
  ] },
  { id: 'safety', label: 'Safety', icon: 'safety', description: 'Approvals and execution boundaries', group: 'primary', items: [
    { id: 'approval-mode', label: 'Approval mode', description: 'Control when Hermes asks before sensitive operations.', keywords: ['yolo', 'permissions'] },
    { id: 'execution-policy', label: 'Execution policy', description: 'Review shell, filesystem, and network boundaries.' }
  ] },
  { id: 'memory-context', label: 'Memory & Context', icon: 'memory', description: 'Memory, context, and compression', group: 'primary', items: [
    { id: 'memory', label: 'Memory', description: 'Configure durable memory and retrieval.' },
    { id: 'context', label: 'Context management', description: 'Configure context budgets and compaction.', keywords: ['tokens', 'compression'] }
  ] },
  { id: 'notifications', label: 'Notifications', icon: 'notifications', description: 'System and in-app notifications', group: 'runtime', items: [
    { id: 'system-notifications', label: 'System notifications', description: 'Notify when an agent finishes or needs attention.' },
    { id: 'warning-notifications', label: 'Warning notifications', description: 'Show warning-level in-app toasts.' },
    { id: 'completion-sound', label: 'Completion sound', description: 'Play a sound when Hermes finishes responding.' }
  ] },
  { id: 'providers', label: 'Providers', icon: 'providers', description: 'Hermes providers and provider-owned policy', group: 'runtime', items: [
    { id: 'hermes-providers', label: 'Hermes model providers', description: 'Manage provider accounts through the Hermes runtime.' },
    { id: 'openrouter', label: 'OpenRouter policy', description: 'Inspect effective model eligibility and guardrails.', keywords: ['api key', 'inference key', 'privacy', 'guardrails', 'provider restrictions'] },
    { id: 'openrouter-policy', label: 'Named guardrails', description: 'Inspect optional OpenRouter workspace guardrail definitions.', keywords: ['policy', 'privacy', 'allowed models', 'ignored providers', 'management key', 'zdr', 'budget'] }
  ] },
  { id: 'gateway', label: 'Gateway', icon: 'gateway', description: 'Hermes runtime connection', group: 'runtime', items: [
    { id: 'gateway-connection', label: 'Gateway connection', description: 'Configure local or remote Hermes gateway endpoints.' },
    { id: 'gateway-health', label: 'Gateway health', description: 'Inspect compatibility and restart the gateway.' },
    { id: 'diagnostics', label: 'Diagnostics', description: 'Inspect runtime health, logs, and supported recovery actions.', keywords: ['logging', 'traces', 'doctor'] }
  ] },
  { id: 'tools-keys', label: 'Tools & Keys', icon: 'keys', description: 'Toolsets, MCP, and credentials', group: 'runtime', items: [
    { id: 'tools', label: 'Tools', description: 'Configure Hermes toolsets and permissions.' },
    { id: 'mcp', label: 'MCP servers', description: 'Manage Model Context Protocol connections.' },
    { id: 'credentials', label: 'Credentials', description: 'Manage secrets available to Hermes.' }
  ] },
  { id: 'archived-chats', label: 'Archived Chats', icon: 'archive', description: 'Archived conversation history', group: 'system', items: [
    { id: 'archive', label: 'Archived sessions', description: 'Review, restore, or delete archived sessions.', keywords: ['history'] }
  ] },
  { id: 'about', label: 'About', icon: 'about', description: 'Version and support information', group: 'system', items: [
    { id: 'account-identity', label: 'Account identity', description: 'Set the name and email shown in the persistent sidebar footer.', keywords: ['profile', 'avatar'] },
    { id: 'version', label: 'Hermes Companion', description: 'Installed development build information.' },
    { id: 'documentation', label: 'Documentation', description: 'Open product and Hermes Agent documentation.' }
  ] }
];

export type SettingsSearchResult = { section: SettingsSection; item: SettingsItem; score: number };

export function searchSettings(query: string): SettingsSearchResult[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return settingsSections.flatMap((section) => section.items.map((item) => {
    const sectionText = `${section.label} ${section.description}`.toLocaleLowerCase();
    const itemText = `${item.label} ${item.description} ${(item.keywords ?? []).join(' ')}`.toLocaleLowerCase();
    const score = words.reduce((total, word) => total + (item.label.toLocaleLowerCase().startsWith(word) ? 6 : itemText.includes(word) ? 3 : sectionText.includes(word) ? 1 : -20), 0);
    return { section, item, score };
  })).filter((result) => result.score >= 0).toSorted((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
}
