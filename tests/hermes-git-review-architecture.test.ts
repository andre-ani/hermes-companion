import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

describe('native Hermes Git review architecture', () => {
  it('routes visible review mutations through the selected worktree bridge boundary', async () => {
    const [remote, review, dock, page] = await Promise.all([
      source('lib/client/remote/projects.remote.ts'),
      source('lib/components/companion/code-review.svelte'),
      source('lib/components/companion/workspace-dock.svelte'),
      source('routes/+page.svelte')
    ]);

    for (const capability of ['git.stage', 'git.unstage', 'git.revert', 'git.commit', 'git.push', 'git.pr.create']) {
      expect(remote).toContain(`remotePayload: { action: '${capability}', worktreeId`);
    }
    expect(remote).toContain("localCapability: 'git.remote.status'");
    expect(remote).toContain("remotePayload: { action: 'git.remote.status', worktreeId");
    expect(remote).toContain("draft: z.boolean().default(true)");
    expect(remote).not.toMatch(/\/api\/git\/review\/(?:stage|unstage|revert|commit|push|create-pr)/);

    for (const unsafeImport of ['commitHermesGitReview', 'createHermesGitPullRequest', 'pushHermesGitReview', 'revertHermesGitReview', 'stageHermesGitReview', 'unstageHermesGitReview']) {
      expect(review).not.toContain(unsafeImport);
    }
    expect(review).toContain('worktreeId');
    expect(review).not.toContain('pushAfterCommit');
    expect(review).not.toContain('push-after-commit');
    expect(review).not.toMatch(/number:\s*[^\n]*\?\?\s*1/);
    expect(review).toContain('draft: true');
    expect(review).toContain('canPush');
    expect(review).toContain('revertTarget');
    expect(review).toMatch(/(?:revertTarget|target)(?:\?|)\.worktreeId/);
    expect(review).toMatch(/revertTarget\?\.path/);

    expect(dock).toContain('<CodeReview workspace={gitWorkspace} {worktree} />');
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
