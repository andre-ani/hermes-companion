import { command, query } from '$app/server';
import { HermesPetGallery, HermesPetInfo, HermesPetScaleInput, HermesPetSelectInput, z } from '@hermes-companion/contracts';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { requestHermesServe } from '$lib/server/hermes-gateway';
import { getCompanionRepository } from '$lib/server/companion-repository';

const empty = z.object({});
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const connection = () => getActiveHermesClient().executionContext().connection;
const profile = () => connection().hermesProfileId ?? 'default';
const petRequest = <T>(method: string, params: Record<string, unknown> = {}) => requestHermesServe<T>(connection(), method, { ...params, profile: profile() });

function normalizeInfo(value: unknown) {
  const item = record(value);
  return HermesPetInfo.parse({ enabled: item.enabled === true, slug: string(item.slug) || null, displayName: string(item.displayName ?? item.display_name) || null,
    scale: typeof item.scale === 'number' ? item.scale : 0.33, mime: string(item.mime) || null, spritesheetBase64: string(item.spritesheetBase64 ?? item.spritesheet_base64) || null,
    frameWidth: typeof item.frameW === 'number' ? item.frameW : null, frameHeight: typeof item.frameH === 'number' ? item.frameH : null,
    framesPerState: typeof item.framesPerState === 'number' ? item.framesPerState : 6, framesByState: record(item.framesByState), framesByRow: record(item.framesByRow),
    loopMs: typeof item.loopMs === 'number' ? item.loopMs : 1100, stateRows: Array.isArray(item.stateRows) ? item.stateRows : [] });
}

export const getHermesPetInfo = query(empty, async () => {
  try { return normalizeInfo(await petRequest<unknown>('pet.info')); }
  catch (cause) { return HermesPetInfo.parse({ available: false, error: cause instanceof Error ? cause.message : 'Hermes Pet is unavailable.' }); }
});

export const getHermesPetGallery = query(empty, async () => {
  try {
    const [galleryValue, infoValue] = await Promise.all([petRequest<unknown>('pet.gallery', {}), petRequest<unknown>('pet.info')]);
    const gallery = record(galleryValue);
    return HermesPetGallery.parse({ available: true, enabled: gallery.enabled === true, active: string(gallery.active), info: normalizeInfo(infoValue),
      pets: (Array.isArray(gallery.pets) ? gallery.pets : []).map((value) => { const item = record(value); return { slug: string(item.slug), displayName: string(item.displayName ?? item.display_name) || string(item.slug), installed: item.installed === true, curated: item.curated === true, generated: item.generated === true }; }).filter((item) => item.slug) });
  } catch (cause) { return HermesPetGallery.parse({ available: false, info: { available: false, error: cause instanceof Error ? cause.message : 'Hermes Pets are unavailable.' }, error: cause instanceof Error ? cause.message : 'Hermes Pets are unavailable.' }); }
});

async function audited(method: string, subject: string, params: Record<string, unknown>) {
  const result = await petRequest(method, params);
  await getCompanionRepository().recordAudit(`hermes.pet.${method.split('.')[1]}`, subject, params);
  return result;
}

export const selectHermesPet = command(HermesPetSelectInput, ({ slug }) => audited('pet.select', slug, { slug }));
export const disableHermesPet = command(empty, () => audited('pet.disable', profile(), {}));
export const setHermesPetScale = command(HermesPetScaleInput, ({ scale }) => audited('pet.scale', profile(), { scale }));
