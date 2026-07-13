import { query } from '$app/server';
import { z } from 'zod';
import { invokeNative } from '$lib/server/native-client';

export const getDesktopNotificationStatus = query(z.object({}), async () => {
  try {
    const result = await invokeNative<{ supported: boolean }>('notification.status', {});
    return { supported: result.supported, error: null as string | null };
  } catch (cause) {
    return { supported: false, error: cause instanceof Error ? cause.message : 'Native notification status is unavailable.' };
  }
});
