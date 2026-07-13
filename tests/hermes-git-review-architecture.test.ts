import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

describe('native Hermes Git review architecture', () => {
  it('keeps the visible Changes surface on authenticated Hermes Git capabilities', async () => {
    const [remote, review, dock, page] = await Promise.all([
      source('lib/client/remote/projects.remote.ts'),
      source('lib/components/companion/code-review.svelte'),
      source('lib/components/companion/workspace-dock.svelte'),
      source('routes/+page.svelte')
    ]);

    expect(remote).toContain("gitQuery('status'");
    expect(remote).toContain("gitQuery('review/list'");
    expect(remote).toContain("gitQuery('review/diff'");
    expect(remote).toContain("'/api/git/review/commit'");
    expect(remote).toContain("'/api/git/review/push'");
    expect(remote).toContain("'/api/git/review/create-pr'");
    expect(remote).toContain('`/api/git/worktrees?path=');
    expect(remote).toContain('The selected checkout is not an active worktree in this Hermes project.');
    expect(review).toContain('getHermesGitReview({ ...requestWorkspace, scope: requestScope })');
    expect(review).toContain('requestGeneration !== reviewRequestGeneration || requestKey !== reviewKey');
    expect(remote).toContain("HermesReviewScope.default('uncommitted')");
    expect(review).toContain("<Select.Item value=\"branch\" label=\"Branch changes\">Branch changes</Select.Item>");
    expect(review).toContain('await reviewQuery.refresh()');
    expect(review).not.toContain('getWorktreeReview');
    expect(dock).toContain('<CodeReview workspace={gitWorkspace} />');
    expect(page).toContain('gitWorkspace={activeGitWorkspace}');
  });

  it('keeps dock tabs in the top-owned header and expands file diffs in one vertical review stack', async () => {
    const [dock, review, capabilities] = await Promise.all([
      source('lib/components/companion/workspace-dock.svelte'),
      source('lib/components/companion/code-review.svelte'),
      source('lib/components/companion/capabilities-center.svelte')
    ]);
    expect(dock.indexOf('<header class="dock-header">')).toBeLessThan(dock.indexOf('<Tabs.Content value="changes"'));
    expect(dock).toContain("overflow: auto hidden");
    expect(review).toContain('class="review-stack"');
    expect(review).toContain("selectedFile?.path === file.path");
    expect(review).not.toContain('file-column');
    expect(dock).toContain('.dock-header { grid-row: 1;');
    expect(dock).toContain(':global(.dock-panel) { grid-row: 3;');
    expect(capabilities).not.toContain("\n  :global([data-slot='tabs-content'])");
  });
});
