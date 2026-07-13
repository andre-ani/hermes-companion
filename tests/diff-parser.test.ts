import { describe, expect, it } from 'vitest';
import { classifyUnifiedDiffLine, parseUnifiedDiff } from '../apps/desktop/src/lib/diff-parser';

describe('unified diff parser', () => {
  it('keeps each changed file independently navigable', () => {
    const files = parseUnifiedDiff('diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/b.ts b/b.ts\nnew file mode 100644\n--- /dev/null\n+++ b/b.ts\n@@ -0,0 +1 @@\n+added\n');
    expect(files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    expect(files[1].content).toContain('+added');
  });

  it('uses the original path for a deleted file', () => {
    const files = parseUnifiedDiff('diff --git a/old.ts b/old.ts\ndeleted file mode 100644\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n');
    expect(files).toEqual([expect.objectContaining({ path: 'old.ts' })]);
  });

  it('classifies reviewed lines without treating file headers as additions or deletions', () => {
    expect(classifyUnifiedDiffLine('+++ b/new.ts')).toBe('meta');
    expect(classifyUnifiedDiffLine('+const value = 1;')).toBe('addition');
    expect(classifyUnifiedDiffLine('--- a/old.ts')).toBe('meta');
    expect(classifyUnifiedDiffLine('-const value = 0;')).toBe('deletion');
    expect(classifyUnifiedDiffLine('@@ -1 +1 @@')).toBe('hunk');
  });
});
