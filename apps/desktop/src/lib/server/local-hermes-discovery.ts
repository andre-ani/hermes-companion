import {
  LocalHermesDiscovery,
  LocalHermesService,
  HermesApiCapabilitiesDescriptor,
  z,
  type LocalHermesDiscovery as LocalHermesDiscoveryResult,
  type LocalHermesService as LocalHermesServiceResult
} from '@hermes-companion/contracts';
import { resolveServedLocalDashboardToken } from './local-dashboard-token.js';

const DEFAULT_TIMEOUT_MS = 1_500;
export const DEFAULT_LOCAL_HERMES_AGENT_URL = 'http://127.0.0.1:8642';
export const DEFAULT_LOCAL_HERMES_CONTROL_URL = 'http://127.0.0.1:9119';

const HealthPayload = z.object({
  status: z.enum(['ok', 'healthy'])
}).passthrough();

const DashboardStatus = z.object({
  version: z.string().optional(),
  gateway_running: z.boolean().optional(),
  auth_required: z.boolean().optional()
}).passthrough().refine(
  (value) => value.version !== undefined || value.gateway_running !== undefined || value.auth_required !== undefined,
  'Response does not match the Hermes Dashboard status contract.'
);

type ProbeOptions = {
  agentUrl?: string;
  controlUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const unavailable = (url: string, detail: string): LocalHermesServiceResult => LocalHermesService.parse({
  url, available: false, compatible: false, authRequired: null, externalAuthRequired: null, credentialAvailable: false, version: null, detail
});

const fetchJson = async (fetcher: typeof fetch, url: string, timeoutMs: number) => {
  const response = await fetcher(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  return { response, body };
};

const probeAgent = async (baseUrl: string, fetcher: typeof fetch, timeoutMs: number): Promise<LocalHermesServiceResult> => {
  const url = baseUrl.replace(/\/$/, '');
  try {
    const descriptor = await fetchJson(fetcher, `${url}/v1/capabilities`, timeoutMs);
    if (descriptor.response.status === 401 || descriptor.response.status === 403) {
      return LocalHermesService.parse({ url, available: true, compatible: false, authRequired: true, externalAuthRequired: null, credentialAvailable: false, version: null, detail: 'Hermes Agent API is reachable and requires a bearer token.' });
    }
    const parsed = HermesApiCapabilitiesDescriptor.safeParse(descriptor.body);
    if (descriptor.response.ok && parsed.success && (parsed.data.platform === undefined || parsed.data.platform === 'hermes-agent')) {
      return LocalHermesService.parse({ url, available: true, compatible: true, authRequired: false, externalAuthRequired: null, credentialAvailable: false, version: null, detail: 'Verified Hermes Agent capability descriptor.' });
    }

    const health = await fetchJson(fetcher, `${url}/health`, timeoutMs);
    if (health.response.status === 401 || health.response.status === 403) {
      return LocalHermesService.parse({ url, available: true, compatible: false, authRequired: true, externalAuthRequired: null, credentialAvailable: false, version: null, detail: 'Hermes-compatible API is reachable and requires a bearer token.' });
    }
    if (health.response.ok && HealthPayload.safeParse(health.body).success) {
      return LocalHermesService.parse({ url, available: true, compatible: true, authRequired: false, externalAuthRequired: null, credentialAvailable: false, version: null, detail: 'Verified legacy Hermes Agent health contract.' });
    }
    return unavailable(url, 'No supported Hermes Agent capability or health response was found.');
  } catch {
    return unavailable(url, 'Hermes Agent API is not reachable on the documented local endpoint.');
  }
};

const probeControl = async (baseUrl: string, fetcher: typeof fetch, timeoutMs: number): Promise<LocalHermesServiceResult> => {
  const url = baseUrl.replace(/\/$/, '');
  try {
    const status = await fetchJson(fetcher, `${url}/api/status`, timeoutMs);
    if (status.response.status === 401 || status.response.status === 403) {
      return LocalHermesService.parse({ url, available: true, compatible: false, authRequired: true, externalAuthRequired: null, credentialAvailable: false, version: null, detail: 'A control service is reachable but its public Hermes status contract could not be verified.' });
    }
    const parsed = DashboardStatus.safeParse(status.body);
    if (!status.response.ok || !parsed.success) return unavailable(url, 'No supported Hermes Dashboard status response was found.');
    const servedToken = await resolveServedLocalDashboardToken(url, fetcher, timeoutMs);
    const externalAuthRequired = parsed.data.auth_required ?? false;
    return LocalHermesService.parse({
      url,
      available: true,
      compatible: true,
      authRequired: true,
      externalAuthRequired,
      credentialAvailable: Boolean(servedToken),
      version: parsed.data.version ?? null,
      detail: servedToken
        ? 'Verified local Hermes Dashboard; its served session token is available to the secure connection boundary.'
        : externalAuthRequired
          ? 'Verified Hermes Dashboard with an external login gate; authenticate and provide an authorized control token.'
          : 'Verified local Hermes Dashboard; management APIs require its session token.'
    });
  } catch {
    return unavailable(url, 'Hermes Dashboard is not reachable on the documented local endpoint.');
  }
};

export const discoverLocalHermesServices = async (options: ProbeOptions = {}): Promise<LocalHermesDiscoveryResult> => {
  const agentUrl = options.agentUrl ?? DEFAULT_LOCAL_HERMES_AGENT_URL;
  const controlUrl = options.controlUrl ?? DEFAULT_LOCAL_HERMES_CONTROL_URL;
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [agent, control] = await Promise.all([
    probeAgent(agentUrl, fetcher, timeoutMs),
    probeControl(controlUrl, fetcher, timeoutMs)
  ]);
  return LocalHermesDiscovery.parse({ agent, control, detectedAt: new Date().toISOString() });
};
