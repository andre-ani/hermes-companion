import { query } from '$app/server';
import { z } from '@hermes-companion/contracts';
import { discoverLocalServers } from '$lib/server/local-server-discovery';

export const listLocalServers = query(z.object({}), async () => discoverLocalServers());
