export type UnifiedDiffLineKind = 'addition' | 'deletion' | 'hunk' | 'meta' | 'context';
export type UnifiedDiffLine = { text: string; kind: UnifiedDiffLineKind };
export type UnifiedDiffFile = { path: string; content: string; lines: UnifiedDiffLine[] };

export function classifyUnifiedDiffLine(text: string): UnifiedDiffLineKind {
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('+') && !text.startsWith('+++')) return 'addition';
  if (text.startsWith('-') && !text.startsWith('---')) return 'deletion';
  if (/^(diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |similarity index |rename (from|to) )/.test(text)) return 'meta';
  return 'context';
}

export function parseUnifiedDiff(diff: string): UnifiedDiffFile[] {
  return diff.split(/^diff --git /m).filter(Boolean).map((block) => {
    const content = `diff --git ${block}`.trimEnd();
    const [header = ''] = block.split(/\r?\n/, 1);
    const headerMatch = header.match(/^a\/(.+?) b\/(.+)$/);
    const addedPath = block.match(/^\+\+\+ b\/(.+)$/m)?.[1];
    const removedPath = block.match(/^--- a\/(.+)$/m)?.[1];
    const path = addedPath ?? removedPath ?? headerMatch?.[2] ?? headerMatch?.[1] ?? 'Changed file';
    return { path, content, lines: content.split(/\r?\n/).map((text) => ({ text, kind: classifyUnifiedDiffLine(text) })) };
  });
}
