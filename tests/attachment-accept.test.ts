import { describe, expect, it } from 'vitest';
import { matchesAttachmentAccept } from '../apps/desktop/src/lib/components/ai-elements/prompt-input/context/attachment-accept';

describe('composer attachment accept matching', () => {
  const accept = 'image/*,.txt,.md,.pdf,application/json';

  it('accepts MIME wildcards, exact MIME values, and case-insensitive extensions', () => {
    expect(matchesAttachmentAccept({ name: 'shot.png', type: 'image/png' }, accept)).toBe(true);
    expect(matchesAttachmentAccept({ name: 'payload', type: 'application/json' }, accept)).toBe(true);
    expect(matchesAttachmentAccept({ name: 'NOTES.TXT', type: 'text/plain' }, accept)).toBe(true);
    expect(matchesAttachmentAccept({ name: 'guide.md', type: '' }, accept)).toBe(true);
  });

  it('rejects files that match neither advertised MIME nor extension', () => {
    expect(matchesAttachmentAccept({ name: 'archive.zip', type: 'application/zip' }, accept)).toBe(false);
  });
});
