import { describe, expect, it } from 'vitest';
import { normalizeHermesPluginHub } from '../apps/desktop/src/lib/server/hermes-plugin-catalog.js';

describe('Hermes plugin catalog boundary', () => {
  it('deduplicates name-addressed plugins and keeps the most actionable state', () => {
    const catalog = normalizeHermesPluginHub({
      plugins: [
        { name: 'fal', source: 'builtin', runtime_status: 'inactive', path: '/private/builtin', dashboard_manifest: { entrypoint: '/private.js' } },
        { name: 'fal', source: 'git', runtime_status: 'enabled', version: '2.0.0', can_remove: true, path: '/private/user' }
      ]
    });

    expect(catalog.plugins).toEqual([expect.objectContaining({ name: 'fal', source: 'git', runtime_status: 'enabled', version: '2.0.0', can_remove: true })]);
    expect(catalog.plugins[0]).not.toHaveProperty('path');
    expect(catalog.plugins[0]).not.toHaveProperty('dashboard_manifest');
  });

  it('normalizes string and object provider options into stable unique choices', () => {
    const catalog = normalizeHermesPluginHub({
      providers: {
        memory_provider: 'builtin',
        memory_options: ['builtin', { name: 'builtin', label: 'Duplicate' }, { name: 'honcho', display_name: 'Honcho', available: false }],
        context_engine: 'native',
        context_options: [{ name: 'native', description: 'Hermes context' }]
      }
    });

    expect(catalog.providers.memory_options).toEqual([
      { name: 'builtin', label: 'builtin', description: '', available: null },
      { name: 'honcho', label: 'Honcho', description: '', available: false }
    ]);
    expect(catalog.providers.context_options[0]).toMatchObject({ name: 'native', description: 'Hermes context' });
  });
});
