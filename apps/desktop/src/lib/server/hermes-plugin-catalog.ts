type UnknownRecord = Record<string, unknown>;

export type HermesPluginCatalogItem = {
  name: string;
  version: string;
  description: string;
  source: string;
  runtime_status: 'disabled' | 'enabled' | 'inactive';
  has_dashboard_manifest: boolean;
  can_remove: boolean;
  can_update_git: boolean;
  auth_required: boolean;
  auth_command: string;
  user_hidden: boolean;
};

export type HermesPluginProviderOption = {
  name: string;
  label: string;
  description: string;
  available: boolean | null;
};

export type HermesPluginCatalog = {
  plugins: HermesPluginCatalogItem[];
  providers: {
    memory_provider: string;
    memory_options: HermesPluginProviderOption[];
    context_engine: string;
    context_options: HermesPluginProviderOption[];
  };
};

const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function providerOption(value: unknown): HermesPluginProviderOption | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name, label: name, description: '', available: null } : null;
  }

  const item = record(value);
  const name = string(item.name) || string(item.id) || string(item.slug);
  if (!name) return null;
  return {
    name,
    label: string(item.label) || string(item.display_name) || name,
    description: string(item.description),
    available: typeof item.available === 'boolean' ? item.available : typeof item.configured === 'boolean' ? item.configured : null
  };
}

function normalizeProviderOptions(value: unknown): HermesPluginProviderOption[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, HermesPluginProviderOption>();
  for (const candidate of value) {
    const option = providerOption(candidate);
    if (option && !unique.has(option.name)) unique.set(option.name, option);
  }
  return [...unique.values()];
}

function normalizeRuntimeStatus(value: unknown): HermesPluginCatalogItem['runtime_status'] {
  return value === 'enabled' || value === 'disabled' ? value : 'inactive';
}

function pluginPriority(item: HermesPluginCatalogItem) {
  return (item.runtime_status === 'enabled' ? 8 : item.runtime_status === 'disabled' ? 4 : 0)
    + (item.source === 'user' || item.source === 'git' ? 2 : 0)
    + (item.has_dashboard_manifest ? 1 : 0);
}

/**
 * Converts Hermes's plugin hub payload into the renderer-safe catalog used by
 * Companion. Hermes discovery may report the same manifest through multiple
 * roots; its management API is name-addressed, so Companion exposes one
 * deterministic row per actionable plugin name.
 */
export function normalizeHermesPluginHub(value: unknown): HermesPluginCatalog {
  const root = record(value);
  const unique = new Map<string, HermesPluginCatalogItem>();

  if (Array.isArray(root.plugins)) {
    for (const candidate of root.plugins) {
      const item = record(candidate);
      const name = string(item.name);
      if (!name) continue;
      const normalized: HermesPluginCatalogItem = {
        name,
        version: string(item.version),
        description: string(item.description),
        source: string(item.source),
        runtime_status: normalizeRuntimeStatus(item.runtime_status),
        has_dashboard_manifest: item.has_dashboard_manifest === true,
        can_remove: item.can_remove === true,
        can_update_git: item.can_update_git === true,
        auth_required: item.auth_required === true,
        auth_command: string(item.auth_command),
        user_hidden: item.user_hidden === true
      };
      const previous = unique.get(name);
      if (!previous || pluginPriority(normalized) > pluginPriority(previous)) unique.set(name, normalized);
    }
  }

  const providers = record(root.providers);
  return {
    plugins: [...unique.values()].sort((left, right) => left.name.localeCompare(right.name)),
    providers: {
      memory_provider: string(providers.memory_provider),
      memory_options: normalizeProviderOptions(providers.memory_options),
      context_engine: string(providers.context_engine),
      context_options: normalizeProviderOptions(providers.context_options)
    }
  };
}
