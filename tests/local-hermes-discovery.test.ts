import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type RequestListener, type Server } from 'node:http';
import { discoverLocalHermesServices } from '../apps/desktop/src/lib/server/local-hermes-discovery';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const listen = async (handler: RequestListener) => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test service did not bind.');
  return `http://127.0.0.1:${address.port}`;
};

const json = (response: Parameters<RequestListener>[1], status: number, body: unknown) => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

describe('local Hermes service discovery', () => {
  it('accepts only the documented Agent and Dashboard contracts', async () => {
    const agentUrl = await listen((request, response) => {
      if (request.url === '/v1/capabilities') return json(response, 200, {
        object: 'hermes.api_server.capabilities', platform: 'hermes-agent', features: {}, endpoints: {}
      });
      json(response, 404, {});
    });
    const controlUrl = await listen((request, response) => {
      if (request.url === '/') { response.setHeader('content-type', 'text/html'); return response.end('<script>window.__HERMES_SESSION_TOKEN__="dashboard-session-token-1234";</script>'); }
      if (request.url === '/api/status') return json(response, 200, {
        version: '0.9.0', gateway_running: true, auth_required: false
      });
      json(response, 404, {});
    });

    const result = await discoverLocalHermesServices({ agentUrl, controlUrl });
    expect(result.agent).toEqual(expect.objectContaining({ url: agentUrl, available: true, compatible: true }));
    expect(result.control).toEqual(expect.objectContaining({ url: controlUrl, available: true, compatible: true, authRequired: true, externalAuthRequired: false, credentialAvailable: true, version: '0.9.0' }));
  });

  it('does not mistake unrelated JSON services for Hermes', async () => {
    const agentUrl = await listen((_request, response) => json(response, 200, { status: 'up', product: 'other' }));
    const controlUrl = await listen((_request, response) => json(response, 200, { status: 'up', product: 'other' }));
    const result = await discoverLocalHermesServices({ agentUrl, controlUrl });
    expect(result.agent).toEqual(expect.objectContaining({ available: false, compatible: false }));
    expect(result.control).toEqual(expect.objectContaining({ available: false, compatible: false }));
  });

  it('reports an authentication boundary without claiming compatibility', async () => {
    const agentUrl = await listen((_request, response) => json(response, 401, { detail: 'Unauthorized' }));
    const controlUrl = await listen((_request, response) => json(response, 403, { detail: 'Forbidden' }));
    const result = await discoverLocalHermesServices({ agentUrl, controlUrl });
    expect(result.agent).toEqual(expect.objectContaining({ available: true, compatible: false, authRequired: true }));
    expect(result.control).toEqual(expect.objectContaining({ available: true, compatible: false, authRequired: true }));
  });
});
