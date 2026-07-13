import { describe, expect, it } from 'vitest';
import { searchSettings, settingsSections } from '../apps/desktop/src/lib/settings/settings-registry';
import { ProfileUiPreferences } from '@hermes-companion/contracts';

describe('settings registry', () => {
  it('contains only the settings areas required by the daily-driver release', () => {
    expect(settingsSections.map((section) => section.label)).toEqual([
      'Model', 'Chat', 'Appearance', 'Workspace', 'Safety', 'Memory & Context',
      'Notifications', 'Providers', 'Gateway', 'Tools & Keys', 'Archived Chats', 'About'
    ]);
  });

  it('indexes nested settings and their aliases', () => {
    expect(searchSettings('color').map((result) => `${result.section.label} › ${result.item.label}`)).toEqual([
      'Appearance › Palette', 'Appearance › Theme'
    ]);
    expect(searchSettings('openrouter')[0]).toMatchObject({ section: { id: 'providers' }, item: { id: 'openrouter' } });
    expect(searchSettings('guardrails')[0]).toMatchObject({ section: { id: 'providers' }, item: { id: 'openrouter-policy' } });
    expect(searchSettings('thinking')[0]).toMatchObject({ section: { id: 'chat' }, item: { id: 'reasoning-blocks' } });
    expect(searchSettings('install plugin')).toEqual([]);
  });

  it('defaults profile thinking status to Hermes personality while accepting plain and hidden modes', () => {
    expect(ProfileUiPreferences.parse({}).thinkingStatus).toBe('personality');
    expect(ProfileUiPreferences.parse({ thinkingStatus: 'plain' }).thinkingStatus).toBe('plain');
    expect(ProfileUiPreferences.parse({ thinkingStatus: 'hidden' }).thinkingStatus).toBe('hidden');
  });
});
