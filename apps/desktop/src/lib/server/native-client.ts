import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const Descriptor = z.object({ url: z.string().url(), token: z.string().min(32), pid: z.number().int().positive() });

export class NativeCapabilityUnavailable extends Error {
  constructor(message = 'The Electron native service is unavailable. Start the companion in Electron to use this capability.') { super(message); this.name = 'NativeCapabilityUnavailable'; }
}

export const invokeNative = async <T>(capability: string, input: unknown): Promise<T> => {
  const file = join(process.env.COMPANION_DATA_DIR ?? join(homedir(), '.hermes-companion'), 'native-endpoint.json');
  let descriptor: z.infer<typeof Descriptor>;
  try { descriptor = Descriptor.parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch { throw new NativeCapabilityUnavailable(); }
  try {
    const response = await fetch(`${descriptor.url}/v1/capability`, {
      method: 'POST',
      headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ capability, input }),
      signal: AbortSignal.timeout(125_000)
    });
    const payload = await response.json() as { ok: boolean; data?: T; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Native capability failed.');
    return payload.data as T;
  } catch (error) {
    if (error instanceof NativeCapabilityUnavailable) throw error;
    throw new NativeCapabilityUnavailable(error instanceof Error ? error.message : undefined);
  }
};
