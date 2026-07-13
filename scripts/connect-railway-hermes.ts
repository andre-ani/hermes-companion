import { GatewayConnection } from '../packages/contracts/src/index.js';
import { connectHermes } from '../apps/desktop/src/lib/server/gateway-connection.js';

const serveUrl = process.env.HERMES_SERVE_URL;
const serveUsername = process.env.HERMES_SERVE_USERNAME;
const servePassword = process.env.HERMES_SERVE_PASSWORD;
if (!serveUrl || !serveUsername || !servePassword) {
  throw new Error('HERMES_SERVE_URL, HERMES_SERVE_USERNAME, and HERMES_SERVE_PASSWORD are required.');
}

const connection = GatewayConnection.parse({
  id: 'railway-hermes',
  name: 'Hermes Agent',
  description: 'Railway-hosted Hermes Agent',
  kind: 'remote',
  url: serveUrl,
  controlUrl: serveUrl,
  serveUrl,
  serveWsUrl: null,
  bridgeUrl: null,
  hermesProfileId: null
});
const result = await connectHermes({ connection, serveUsername, servePassword });
console.log(JSON.stringify({ status: result.status.status, credentialsPersisted: result.credentialsPersisted, connectionId: connection.id }));
