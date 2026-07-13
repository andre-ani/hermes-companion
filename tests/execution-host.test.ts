import { describe, expect, it } from 'vitest';
import type { GatewayConnection } from '@hermes-companion/contracts';
import { requireExecutionHost, setExecutionHostConnection } from '../apps/desktop/src/lib/server/execution-host';

const connection = (id: string, kind: 'local' | 'remote' = 'local'): GatewayConnection => ({
  id,
  name: id,
  description: '',
  kind,
  url: `https://${id}.example.test`,
  controlUrl: null,
  serveUrl: null,
  serveWsUrl: null,
  bridgeUrl: kind === 'remote' ? `https://bridge-${id}.example.test` : null,
  hermesProfileId: 'default'
});

describe('execution host ownership', () => {
  it('rejects an operation after the active host changes', () => {
    setExecutionHostConnection(connection('first'));
    expect(requireExecutionHost('first').connection.id).toBe('first');
    setExecutionHostConnection(connection('second'));
    expect(() => requireExecutionHost('first')).toThrow('active execution host changed');
  });

  it('captures the bridge belonging to the validated host', () => {
    setExecutionHostConnection(connection('first', 'remote'), 'token');
    const host = requireExecutionHost('first');
    setExecutionHostConnection(connection('second', 'remote'), 'token');
    expect(host.bridge?.url).toBe('https://bridge-first.example.test');
    expect(() => requireExecutionHost('first')).toThrow('active execution host changed');
  });
});
