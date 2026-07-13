<script lang="ts">
  import { tick } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as CommandMenu from '$lib/components/ui/command';
  import * as ModelSelector from '$lib/components/ai-elements/model-selector';
  import * as PromptInput from '$lib/components/ai-elements/prompt-input';
  import type { PromptInputAttachmentData, PromptInputMessage } from '$lib/components/ai-elements/prompt-input';
  import ContextUsagePopover from '$lib/components/companion/context-usage-popover.svelte';
  import ModelProviderMark from '$lib/components/companion/model-provider-mark.svelte';
  import type { ContextUsage, ModelSource } from '@hermes-companion/contracts';
  import { ArrowUp, AtSign, AudioLines, Check, ChevronDown, Code2, Command, Eye, FileText, FolderGit2, GitBranch, History, Laptop, Mic, ShieldAlert, ShieldCheck, Sparkles, Square, Star, Terminal, Type, Wrench } from '@lucide/svelte';

  export type ComposerPlacement = 'conversation' | 'new-session' | 'project' | 'overlay';
  export type ComposerPresentation = 'auto' | 'peek' | 'compact' | 'standard' | 'full';
  export type ComposerModel = { id: string; label: string; source: ModelSource; provider?: string; runtimeProvider?: string; detail?: string; description?: string; contextLength?: number; routeKind?: 'model' | 'router' | 'preset'; canonicalModelId?: string; pricing?: { prompt: number | null; completion: number | null }; inputModalities?: string[]; outputModalities?: string[]; supportedParameters?: string[]; policyStatus?: 'allowed' | 'restricted' | 'unknown'; policyReason?: string };
  export type ComposerProjectContext = { id?: string; name: string; branchId?: string | null; branch?: string | null; environment?: string | null };
  export type ComposerContextOption = { id: string; label: string; description?: string };
  export type ComposerPermission = { id: string; label: string; detail?: string };
  export type ComposerCompletion = {
    id: string; trigger: '/' | '@'; label: string; value: string; description: string; group: string;
    keywords?: string[]; insertText?: string; behavior?: 'insert' | 'execute'; priority?: number; projectOnly?: boolean;
  };
  export type ComposerPromptAction = { id: string; label: string; prompt?: string; description?: string };
  export type ComposerSubmitDetail = { prompt: string; attachments: PromptInputAttachmentData[]; files: PromptInputMessage['files'] };

  type Props = {
    id?: string; placement?: ComposerPlacement; presentation?: ComposerPresentation; prompt?: string;
    attachments?: PromptInputAttachmentData[]; placeholder?: string; disabled?: boolean; busy?: boolean;
    model?: ComposerModel | null; models?: ComposerModel[]; contextUsage?: ContextUsage | null; contextReason?: string | null;
    permission?: ComposerPermission | null; permissionOptions?: ComposerContextOption[]; project?: ComposerProjectContext | null; completions?: ComposerCompletion[];
    branchOptions?: ComposerContextOption[]; environmentOptions?: ComposerContextOption[];
    quickActions?: ComposerPromptAction[]; suggestions?: ComposerPromptAction[]; voiceAvailable?: boolean; voiceActive?: boolean;
    onSubmit?: (detail: ComposerSubmitDetail) => void | Promise<void>; onStop?: () => void;
    onModelChange?: (model: ComposerModel) => void; onAttachmentsChange?: (attachments: PromptInputAttachmentData[]) => void;
    onVoiceToggle?: () => void; onPermissionClick?: () => void; onPermissionChange?: (id: string) => void;
    onBranchChange?: (id: string) => void; onEnvironmentChange?: (id: string) => void;
    onCompletionSelect?: (completion: ComposerCompletion) => void; onPromptAction?: (action: ComposerPromptAction) => void;
  };

  let {
    id = 'hermes-composer', placement = 'conversation', presentation = 'auto', prompt = $bindable(''),
    attachments = $bindable<PromptInputAttachmentData[]>([]), placeholder, disabled = false, busy = false,
    model = null, models = [], contextUsage = null, contextReason = null, permission = null, permissionOptions = [], project = null,
    branchOptions = [], environmentOptions = [],
    completions = [], quickActions = [], suggestions = [], voiceAvailable = false, voiceActive = false,
    onSubmit, onStop, onModelChange, onAttachmentsChange, onVoiceToggle, onPermissionClick, onPermissionChange, onBranchChange, onEnvironmentChange, onCompletionSelect, onPromptAction
  }: Props = $props();

  let textareaRef = $state<HTMLTextAreaElement | null>(null);
  let modelPickerOpen = $state(false);
  let modelQuery = $state('');
  let modelFilter = $state('all');
  let favoriteModelKeys = $state<string[]>([]);
  let recentModelKeys = $state<string[]>([]);
  let attachmentError = $state('');
  let lastAttachmentSignature = $state('');
  let completionOpen = $state(false);
  let completionTrigger = $state<'/' | '@' | null>(null);
  let completionQuery = $state('');
  let completionStart = $state(0);
  let activeCompletionIndex = $state(0);

  const resolvedPresentation = $derived(presentation === 'auto' ? (placement === 'new-session' ? 'full' : placement === 'project' ? 'standard' : 'compact') : presentation);
  const promptPlaceholder = $derived(placeholder ?? (placement === 'project' ? 'Plan, build, or ask about this project…' : 'Message Hermes…'));
  const submittedStatus = $derived(busy ? 'streaming' : 'ready');
  const hasPrompt = $derived(Boolean(prompt.trim()));
  const completionListId = $derived(`${id}-completions`);
  const modelKey = (candidate: ComposerModel) => `${candidate.source}:${candidate.runtimeProvider ?? ''}:${candidate.id}`;
  const filteredModels = $derived(models.filter((candidate) => {
    const matchesQuery = `${candidate.label} ${candidate.id} ${candidate.provider ?? ''} ${candidate.detail ?? ''}`.toLowerCase().includes(modelQuery.toLowerCase());
    if (!matchesQuery) return false;
    if (modelFilter === 'favorites') return favoriteModelKeys.includes(modelKey(candidate));
    if (modelFilter === 'recent') return (recentModelKeys.length ? recentModelKeys : models.slice(0, 3).map(modelKey)).includes(modelKey(candidate));
    if (modelFilter === 'openrouter') return candidate.runtimeProvider === 'openrouter';
    if (modelFilter.startsWith('provider:')) return (candidate.runtimeProvider ?? candidate.provider) === modelFilter.slice(9);
    return true;
  }));
  const visibleModels = $derived(filteredModels.slice(0, 100));
  const recentModels = $derived((recentModelKeys.length ? recentModelKeys : models.slice(0, 3).map(modelKey)).map((key) => models.find((candidate) => modelKey(candidate) === key)).filter((candidate): candidate is ComposerModel => Boolean(candidate)).slice(0, 3));
  const modelGroups = $derived([...new Set(visibleModels.map((candidate) => candidate.runtimeProvider === 'openrouter' && candidate.routeKind !== 'model' ? 'openrouter-routes' : `${candidate.source}:${candidate.runtimeProvider ?? candidate.provider ?? 'hermes'}`))]);
  const modelProviders = $derived([...new Set(models.map((candidate) => candidate.runtimeProvider ?? candidate.provider).filter((value): value is string => Boolean(value) && value !== 'openrouter'))].slice(0, 10));
  const visibleCompletions = $derived.by(() => {
    if (!completionTrigger) return [];
    const query = completionQuery.toLocaleLowerCase();
    return completions
      .filter((item) => item.trigger === completionTrigger && (!item.projectOnly || placement === 'project'))
      .map((item) => {
        const label = item.label.toLocaleLowerCase();
        const value = item.value.toLocaleLowerCase();
        const searchable = `${label} ${value} ${item.description} ${(item.keywords ?? []).join(' ')}`.toLocaleLowerCase();
        const score = query === '' ? 0 : value.startsWith(query) ? 0 : label.startsWith(query) ? 1 : searchable.includes(query) ? 2 : 99;
        return { item, score };
      })
      .filter((entry) => entry.score < 99)
      .toSorted((left, right) => left.score - right.score || (right.item.priority ?? 0) - (left.item.priority ?? 0) || left.item.label.localeCompare(right.item.label))
      .slice(0, 12).map((entry) => entry.item);
  });
  const completionGroups = $derived([...new Set(visibleCompletions.map((item) => item.group))]);

  $effect(() => {
    const signature = attachments.map((attachment) => attachment.id).join(':');
    if (signature !== lastAttachmentSignature) { lastAttachmentSignature = signature; onAttachmentsChange?.(attachments); }
  });
  $effect(() => { if (activeCompletionIndex >= visibleCompletions.length) activeCompletionIndex = Math.max(0, visibleCompletions.length - 1); });
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    favoriteModelKeys = JSON.parse(localStorage.getItem('hermes.favorite-models') ?? '[]');
    recentModelKeys = JSON.parse(localStorage.getItem('hermes.recent-models') ?? '[]');
  });

  async function submit(message: PromptInputMessage) {
    const trimmed = message.text.trim();
    if (disabled || busy || (!trimmed && !message.attachments.length)) return;
    closeCompletions();
    await onSubmit?.({ prompt: trimmed, attachments: message.attachments, files: message.files });
  }
  function chooseModel(nextModel: ComposerModel) {
    if (nextModel.policyStatus === 'restricted') return;
    const key = modelKey(nextModel);
    recentModelKeys = [key, ...recentModelKeys.filter((item) => item !== key)].slice(0, 3);
    if (typeof localStorage !== 'undefined') localStorage.setItem('hermes.recent-models', JSON.stringify(recentModelKeys));
    onModelChange?.(nextModel); modelPickerOpen = false; modelQuery = '';
  }
  function toggleFavorite(candidate: ComposerModel) {
    const key = modelKey(candidate);
    favoriteModelKeys = favoriteModelKeys.includes(key) ? favoriteModelKeys.filter((item) => item !== key) : [...favoriteModelKeys, key];
    if (typeof localStorage !== 'undefined') localStorage.setItem('hermes.favorite-models', JSON.stringify(favoriteModelKeys));
  }
  function groupLabel(group: string) {
    if (group === 'openrouter-routes') return 'OpenRouter routers & presets';
    const [, provider] = group.split(':');
    const name = provider === 'hermes' ? 'Hermes' : provider.replace(/(^|-)(\w)/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    return name;
  }
  function priceLevel(candidate: ComposerModel) {
    const total = ((candidate.pricing?.prompt ?? 0) + (candidate.pricing?.completion ?? 0)) * 1_000_000;
    if (!total) return '';
    return total < 1 ? '$' : total < 8 ? '$$' : total < 30 ? '$$$' : '$$$$';
  }
  function closeCompletions() { completionOpen = false; completionTrigger = null; completionQuery = ''; activeCompletionIndex = 0; }

  function syncCompletions(target = textareaRef) {
    if (!target) return closeCompletions();
    const caret = target.selectionStart ?? prompt.length;
    const match = target.value.slice(0, caret).match(/(?:^|\s)([/@])([^\s/@]*)$/);
    if (!match) return closeCompletions();
    completionTrigger = match[1] as '/' | '@'; completionQuery = match[2] ?? '';
    completionStart = caret - completionQuery.length - 1; completionOpen = true; activeCompletionIndex = 0;
  }
  function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }) { textareaRef = event.currentTarget; syncCompletions(event.currentTarget); }
  function handleCaretChange(event: Event & { currentTarget: HTMLTextAreaElement }) { textareaRef = event.currentTarget; if (completionOpen) syncCompletions(event.currentTarget); }
  function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    textareaRef = event.currentTarget;
    if (!completionOpen || visibleCompletions.length === 0) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); activeCompletionIndex = (activeCompletionIndex + 1) % visibleCompletions.length; }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeCompletionIndex = (activeCompletionIndex - 1 + visibleCompletions.length) % visibleCompletions.length; }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); void chooseCompletion(visibleCompletions[activeCompletionIndex]); }
    else if (event.key === 'Escape') { event.preventDefault(); closeCompletions(); }
  }
  async function chooseCompletion(completion: ComposerCompletion) {
    const caret = textareaRef?.selectionStart ?? prompt.length;
    const insertion = completion.behavior === 'execute' ? '' : `${completion.insertText ?? `${completion.trigger}${completion.value}`} `;
    prompt = `${prompt.slice(0, completionStart)}${insertion}${prompt.slice(caret)}`;
    closeCompletions(); onCompletionSelect?.(completion); await tick();
    const nextCaret = completionStart + insertion.length; textareaRef?.focus(); textareaRef?.setSelectionRange(nextCaret, nextCaret);
  }
  function choosePromptAction(action: ComposerPromptAction) {
    if (action.prompt) prompt = action.prompt;
    onPromptAction?.(action); void tick().then(() => textareaRef?.focus());
  }
</script>

<section class="composer-system" data-placement={placement} data-presentation={resolvedPresentation} data-has-text={hasPrompt}>
  {#if project}<div class="project-context" aria-label="Project context">
    <span class="project-context-identity"><FolderGit2 aria-hidden="true" /><span>{project.name}</span></span>
    {#if project.branch && branchOptions.length > 1}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} class="project-context-trigger" size="xs" type="button" variant="ghost"><GitBranch data-icon="inline-start" /><span>{project.branch}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger>
      <DropdownMenu.Content class="project-context-menu" side="top" align="start" sideOffset={6} collisionPadding={8}><DropdownMenu.Group><DropdownMenu.Label>Branch</DropdownMenu.Label>{#each branchOptions as option (option.id)}<DropdownMenu.Item onclick={() => onBranchChange?.(option.id)}><GitBranch /><span class="context-option-copy"><strong>{option.label}</strong>{#if option.description}<small>{option.description}</small>{/if}</span>{#if option.id === project.branchId}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content>
    </DropdownMenu.Root>{:else if project.branch}<span class="project-context-identity project-context-branch"><GitBranch aria-hidden="true" /><span>{project.branch}</span></span>{/if}
    {#if project.environment && environmentOptions.length > 1}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} class="project-context-trigger" size="xs" type="button" variant="ghost"><Laptop data-icon="inline-start" /><span>{project.environment}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger>
      <DropdownMenu.Content class="project-context-menu" side="top" align="start" sideOffset={6} collisionPadding={8}><DropdownMenu.Group><DropdownMenu.Label>Run on</DropdownMenu.Label>{#each environmentOptions as option (option.id)}<DropdownMenu.Item onclick={() => onEnvironmentChange?.(option.id)}><Laptop /><span>{option.label}</span>{#if option.id === project.environment}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content>
    </DropdownMenu.Root>{/if}
  </div>{/if}

  <div class="composer-frame" aria-disabled={disabled} inert={disabled || undefined}>
    <PromptInput.Root bind:attachments accept="image/*,.txt,.md,.json,.ts,.tsx,.js,.jsx,.svelte,.py,.css,.html" class="composer-input" clearOnSubmit maxFileSize={25 * 1024 * 1024} maxFiles={8} onError={(next) => (attachmentError = next.message)} onFileAdd={() => (attachmentError = '')} onSubmit={submit}>
      {#if attachments.length}<PromptInput.Attachments class="composer-attachments">{#snippet children(attachment)}<PromptInput.Attachment data={attachment} />{/snippet}</PromptInput.Attachments>{/if}
      {#if attachmentError}<p class="composer-attachment-error" role="status">{attachmentError}</p>{/if}
      <PromptInput.Body class="composer-body"><PromptInput.Textarea
        bind:ref={textareaRef} bind:value={prompt} class="composer-textarea" placeholder={promptPlaceholder}
        aria-autocomplete="list" aria-controls={completionOpen ? completionListId : undefined} aria-expanded={completionOpen}
        aria-activedescendant={completionOpen && visibleCompletions[activeCompletionIndex] ? `${id}-completion-${visibleCompletions[activeCompletionIndex].id}` : undefined}
        role="combobox" oninput={handleInput} onkeydown={handleKeydown} onclick={handleCaretChange} onkeyup={handleCaretChange}
      /></PromptInput.Body>
      <PromptInput.Toolbar class="composer-toolbar">
        <PromptInput.Tools><PromptInput.ActionMenu><PromptInput.ActionMenuTrigger class="composer-menu-trigger" /><PromptInput.ActionMenuContent class="composer-action-menu">
          <PromptInput.ActionAddAttachments label="Add files" />
          <PromptInput.ActionMenuItem onSelect={() => { prompt += '@'; void tick().then(() => { textareaRef?.focus(); syncCompletions(); }); }}><AtSign data-icon="inline-start" />Add context</PromptInput.ActionMenuItem>
          {#if placement === 'project'}<PromptInput.ActionMenuItem onSelect={() => { prompt += '/plan '; void tick().then(() => textareaRef?.focus()); }}><Code2 data-icon="inline-start" />Attach plan</PromptInput.ActionMenuItem>{/if}
        </PromptInput.ActionMenuContent></PromptInput.ActionMenu></PromptInput.Tools>
        <div class="composer-controls">
          {#if model}<Popover.Root bind:open={modelPickerOpen}><Popover.Trigger>{#snippet child({ props })}<Button {...props} aria-haspopup="listbox" class="model-trigger" disabled={models.length === 0} size="xs" type="button" variant="ghost"><ModelProviderMark modelId={model.id} provider={model.provider} label={`${model.label} provider`} /><span>{model.label}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</Popover.Trigger>
            <Popover.Content class="model-picker-popover" side="top" align="end" sideOffset={6} collisionPadding={8}>
              <CommandMenu.Root class="model-picker-command"><aside class="model-provider-rail" aria-label="Filter models">
                <button type="button" data-active={modelFilter === 'all'} onclick={() => (modelFilter = 'all')} aria-label="All models" title="All models"><Sparkles /></button>
                <button type="button" data-active={modelFilter === 'recent'} onclick={() => (modelFilter = 'recent')} aria-label="Recent models" title="Recent"><History /></button>
                <button type="button" data-active={modelFilter === 'favorites'} onclick={() => (modelFilter = 'favorites')} aria-label="Favorite models" title="Favorites"><Star /></button>
                <button type="button" data-active={modelFilter === 'openrouter'} onclick={() => (modelFilter = 'openrouter')} aria-label="OpenRouter models" title="OpenRouter"><ModelProviderMark modelId="openrouter/auto" provider="openrouter" label="OpenRouter" /></button>
                {#each modelProviders as provider (provider)}<button type="button" data-active={modelFilter === `provider:${provider}`} onclick={() => (modelFilter = `provider:${provider}`)} aria-label={`${provider} models`} title={provider}><ModelProviderMark modelId={`${provider}/model`} {provider} label={provider} /></button>{/each}
              </aside><section class="model-picker-main"><ModelSelector.Input class="model-picker-input" bind:value={modelQuery} placeholder="Search models…" /><ModelSelector.List class="model-picker-list"><ModelSelector.Empty>{modelFilter === 'recent' ? 'Choose a model to build recents.' : 'No matching models.'}</ModelSelector.Empty>
                {#if modelFilter === 'all' && !modelQuery && recentModels.length}<ModelSelector.Group heading="Recent">{#each recentModels as candidate (`recent:${candidate.source}:${candidate.id}`)}
                  <ModelSelector.Item disabled={candidate.policyStatus === 'restricted'} data-policy-status={candidate.policyStatus} onSelect={() => chooseModel(candidate)} value={`recent ${candidate.source}:${candidate.id} ${candidate.label}`}>
                    <ModelProviderMark modelId={candidate.id} provider={candidate.provider} label={`${candidate.label} provider`} />
                    <span class="model-option-copy"><strong>{candidate.label} {#if priceLevel(candidate)}<em>{priceLevel(candidate)}</em>{/if}</strong><small>{candidate.detail ?? candidate.id}</small></span>
                    <span class="model-capabilities" aria-label="Model capabilities"><Tooltip.Provider delayDuration={250}>{#each [{ kind: 'text', label: 'Text input', active: candidate.inputModalities?.includes('text'), icon: Type }, { kind: 'vision', label: 'Image input', active: candidate.inputModalities?.includes('image'), icon: Eye }, { kind: 'audio', label: 'Audio input', active: candidate.inputModalities?.includes('audio'), icon: AudioLines }, { kind: 'tools', label: 'Tool use', active: candidate.supportedParameters?.some((value) => value === 'tools' || value === 'tool_choice'), icon: Wrench }] as capability (capability.kind)}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<span {...props} data-kind={capability.kind} data-active={capability.active}><capability.icon /></span>{/snippet}</Tooltip.Trigger><Tooltip.Content>{capability.label}{capability.active ? '' : ' unavailable'}</Tooltip.Content></Tooltip.Root>{/each}</Tooltip.Provider></span>
                    <button class="model-favorite" type="button" aria-label={favoriteModelKeys.includes(modelKey(candidate)) ? `Remove ${candidate.label} from favorites` : `Favorite ${candidate.label}`} aria-pressed={favoriteModelKeys.includes(modelKey(candidate))} onclick={(event) => { event.stopPropagation(); toggleFavorite(candidate); }}><Star /></button>
                    <span class="model-selected">{#if candidate.policyStatus === 'restricted'}<span class="policy-restricted" aria-label={candidate.policyReason ?? 'Restricted by OpenRouter policy'} title={candidate.policyReason ?? 'Restricted by OpenRouter policy'}><ShieldAlert /></span>{:else if model?.id === candidate.id && model.source === candidate.source && model.runtimeProvider === candidate.runtimeProvider}<Check aria-hidden="true" />{/if}</span>
                  </ModelSelector.Item>{/each}</ModelSelector.Group>{/if}
                {#each modelGroups as group (group)}<ModelSelector.Group heading={groupLabel(group)}>
                  {#each visibleModels.filter((candidate) => (candidate.runtimeProvider === 'openrouter' && candidate.routeKind !== 'model' ? 'openrouter-routes' : `${candidate.source}:${candidate.runtimeProvider ?? candidate.provider ?? 'hermes'}`) === group) as candidate (`${candidate.source}:${candidate.runtimeProvider ?? ''}:${candidate.id}`)}
                    <ModelSelector.Item disabled={candidate.policyStatus === 'restricted'} data-policy-status={candidate.policyStatus} onSelect={() => chooseModel(candidate)} value={`${candidate.source}:${candidate.id} ${candidate.label} ${candidate.provider ?? ''}`}>
                      <ModelProviderMark modelId={candidate.id} provider={candidate.provider} label={`${candidate.label} provider`} />
                      <span class="model-option-copy"><strong>{candidate.label} {#if priceLevel(candidate)}<em>{priceLevel(candidate)}</em>{/if}</strong><small>{candidate.detail ?? candidate.id}</small></span>
                      <span class="model-capabilities" aria-label="Model capabilities"><Tooltip.Provider delayDuration={250}>{#each [{ kind: 'text', label: 'Text input', active: candidate.inputModalities?.includes('text'), icon: Type }, { kind: 'vision', label: 'Image input', active: candidate.inputModalities?.includes('image'), icon: Eye }, { kind: 'audio', label: 'Audio input', active: candidate.inputModalities?.includes('audio'), icon: AudioLines }, { kind: 'tools', label: 'Tool use', active: candidate.supportedParameters?.some((value) => value === 'tools' || value === 'tool_choice'), icon: Wrench }] as capability (capability.kind)}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<span {...props} data-kind={capability.kind} data-active={capability.active}><capability.icon /></span>{/snippet}</Tooltip.Trigger><Tooltip.Content>{capability.label}{capability.active ? '' : ' unavailable'}</Tooltip.Content></Tooltip.Root>{/each}</Tooltip.Provider></span>
                      <button class="model-favorite" type="button" aria-label={favoriteModelKeys.includes(modelKey(candidate)) ? `Remove ${candidate.label} from favorites` : `Favorite ${candidate.label}`} aria-pressed={favoriteModelKeys.includes(modelKey(candidate))} onclick={(event) => { event.stopPropagation(); toggleFavorite(candidate); }}><Star /></button>
                      <span class="model-selected">{#if candidate.policyStatus === 'restricted'}<span class="policy-restricted" aria-label={candidate.policyReason ?? 'Restricted by OpenRouter policy'} title={candidate.policyReason ?? 'Restricted by OpenRouter policy'}><ShieldAlert /></span>{:else if model?.id === candidate.id && model.source === candidate.source && model.runtimeProvider === candidate.runtimeProvider}<Check aria-hidden="true" />{/if}</span>
                    </ModelSelector.Item>
                  {/each}
                </ModelSelector.Group>{/each}
              </ModelSelector.List></section></CommandMenu.Root>
            </Popover.Content>
          </Popover.Root>{/if}
          {#if permission}{#if permissionOptions.length}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} class="permission-trigger" size="xs" type="button" variant="ghost" title={permission.detail ?? permission.label}><ShieldCheck data-icon="inline-start" /><span>{permission.label}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content class="permission-menu" side="top" align="end" sideOffset={6} collisionPadding={8}><DropdownMenu.Label>Approval mode</DropdownMenu.Label><DropdownMenu.Group>{#each permissionOptions as option (option.id)}<DropdownMenu.Item onclick={() => onPermissionChange?.(option.id)}><span class="context-option-copy"><strong>{option.label}</strong>{#if option.description}<small>{option.description}</small>{/if}</span>{#if option.id === permission.id}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>{:else}<Button class="permission-trigger" size="xs" type="button" variant="ghost" title={permission.detail ?? permission.label} onclick={onPermissionClick}><ShieldCheck data-icon="inline-start" /><span>{permission.label}</span></Button>{/if}{/if}
          {#if contextUsage}<ContextUsagePopover id={`${id}-context`} usage={contextUsage} reason={contextReason} compact />{/if}
          {#if resolvedPresentation === 'full' && voiceAvailable}<Button class="voice-secondary" aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'} aria-pressed={voiceActive} onclick={onVoiceToggle} size="icon-xs" type="button" variant="ghost">{#if voiceActive}<AudioLines />{:else}<Mic />{/if}</Button>{/if}
          {#if resolvedPresentation !== 'full' && voiceAvailable && !hasPrompt && !busy}<Button class="voice-primary" aria-label="Start voice input" onclick={onVoiceToggle} size="icon-sm" type="button"><Mic /></Button>
          {:else}<PromptInput.Submit class="composer-submit" disabled={!hasPrompt && attachments.length === 0 && !busy} onStop={onStop} status={submittedStatus}>{#if busy}<Square />{:else}<ArrowUp />{/if}</PromptInput.Submit>{/if}
        </div>
      </PromptInput.Toolbar>
    </PromptInput.Root>

    <div id={completionListId} class="completion-surface" data-open={completionOpen && visibleCompletions.length > 0} role="listbox" aria-label={completionTrigger === '/' ? 'Slash commands' : 'Context suggestions'}>
      <header><span class="completion-trigger">{completionTrigger}</span><span>{completionTrigger === '/' ? 'Commands' : 'Add context'}</span><kbd>esc</kbd></header>
      <div class="completion-list">{#each completionGroups as group (group)}<section aria-label={group}><h3>{group}</h3>
        {#each visibleCompletions as completion, index (completion.id)}{#if completion.group === group}<button
          id={`${id}-completion-${completion.id}`} type="button" role="option" aria-selected={index === activeCompletionIndex}
          onmouseenter={() => (activeCompletionIndex = index)} onmousedown={(event) => event.preventDefault()} onclick={() => chooseCompletion(completion)}
        ><span class="completion-icon" aria-hidden="true">{#if completion.trigger === '@'}<AtSign />{:else if completion.value.includes('terminal')}<Terminal />{:else if completion.value.includes('review')}<Wrench />{:else if completion.value.includes('file')}<FileText />{:else if completion.value.includes('new')}<Sparkles />{:else}<Command />{/if}</span>
          <span class="completion-copy"><strong>{completion.trigger}{completion.label}</strong><small>{completion.description}</small></span>
          {#if completion.behavior === 'execute'}<span class="completion-kind">Run</span>{:else}<Check class="completion-check" />{/if}
        </button>{/if}{/each}
      </section>{/each}</div>
    </div>
  </div>

  {#if quickActions.length}<div class="quick-actions" aria-label="Quick actions">{#each quickActions as action (action.id)}<Button type="button" size="sm" variant="outline" onclick={() => choosePromptAction(action)}>{action.label}</Button>{/each}</div>{/if}
  {#if suggestions.length}<div class="starting-points" aria-label="Suggested starting points">{#each suggestions as action (action.id)}<button type="button" onclick={() => choosePromptAction(action)}><strong>{action.label}</strong>{#if action.description}<span>{action.description}</span>{/if}</button>{/each}</div>{/if}

</section>

<style>
  .composer-system { --composer-edge: clamp(.5rem, 1.2cqi, .72rem); container: composer / inline-size; inline-size: 100%; display: grid; gap: .65rem; }
  .composer-frame { min-inline-size: 0; position: relative; }
  .composer-system :global(.composer-input) { position: relative; border-color: var(--input); border-radius: var(--composer-surface-radius); background: color-mix(in oklab, var(--surface-raised) 88%, transparent); box-shadow: 0 .8rem 2.4rem oklch(0 0 0 / 22%); transition: inline-size var(--motion-layout) var(--ease-standard), block-size var(--motion-layout) var(--ease-standard), min-block-size var(--motion-layout) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard), opacity var(--motion-enter) var(--ease-standard); }
  .composer-system :global(.composer-input:focus-within) { border-color: color-mix(in oklab, var(--ring), transparent 46%); background: color-mix(in oklab, var(--surface-raised), white 1.5%); }
  .composer-system :global(.composer-textarea) { min-block-size: 4.75rem; max-block-size: 12rem; padding: var(--composer-edge); font-family: var(--font-body); font-size: var(--type-body); line-height: 1.55; }
  .composer-system :global(.composer-toolbar) { min-block-size: var(--control-height-md); padding-inline: var(--composer-edge); padding-block-end: var(--composer-edge); }
  .composer-system :global(.composer-attachments) { padding-inline: var(--composer-edge); padding-block-start: var(--composer-edge); }
  .composer-attachment-error { margin: 0; padding: .35rem var(--composer-edge) 0; color: var(--status-negative); font-family: var(--font-body); font-size: var(--type-caption); }
  .composer-controls { min-inline-size: 0; display: flex; align-items: center; justify-content: flex-end; gap: .12rem; }
  .composer-system :global(.composer-menu-trigger), .composer-system :global(.composer-submit), .composer-system :global(.voice-primary), .composer-system :global(.voice-secondary), .composer-system :global(.context-trigger) { border-radius: 50%; }
  .composer-system :global(.composer-menu-trigger) { aspect-ratio: 1; padding-inline: 0; }
  .composer-system :global(.model-trigger), .composer-system :global(.permission-trigger) { min-inline-size: 0; max-inline-size: min(14rem, 28cqi); border-radius: 999px; color: var(--muted-foreground); }
  .composer-system :global(.model-trigger span), .composer-system :global(.permission-trigger span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-option-copy { min-inline-size: 0; flex: 1; display: grid; gap: .04rem; text-align: start; }
  .model-option-copy strong, .model-option-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-option-copy strong { font-family: var(--font-ui); font-size: var(--type-menu); font-weight: 560; }
  .model-option-copy small { color: var(--muted-foreground); font-family: var(--font-mono); font-size: var(--type-caption); font-weight: 400; }
  .model-capabilities { flex: none; display: inline-flex; align-items: center; gap: .18rem; }
  .model-capabilities > span { display: grid; place-items: center; inline-size: 1rem; block-size: 1rem; color: color-mix(in oklab, var(--muted-foreground), transparent 68%); }
  .model-capabilities > span[data-active='true'] { color: var(--primary); }
  .model-capabilities > span[data-kind='vision'][data-active='true'] { color: var(--status-positive); }
  .model-capabilities > span[data-kind='audio'][data-active='true'] { color: var(--status-working); }
  .model-capabilities > span[data-kind='tools'][data-active='true'] { color: var(--status-warning); }
  .model-capabilities :global(svg) { inline-size: .68rem; block-size: .68rem; }
  :global(.model-picker-popover) { inline-size: min(31rem, calc(100dvi - 1rem)); overflow: hidden; padding: 0; }
  :global(.model-picker-popover [data-slot='command']) { background: transparent; }
  :global(.model-picker-command) { display: grid; grid-template-columns: 2.45rem minmax(0, 1fr); }
  .model-provider-rail { min-block-size: 0; display: flex; flex-direction: column; align-items: center; gap: .18rem; overflow-y: auto; padding: .35rem .25rem; background: color-mix(in oklab, var(--surface-raised), transparent 34%); }
  .model-provider-rail button { inline-size: 1.9rem; block-size: 1.9rem; display: grid; place-items: center; flex: none; border: 0; border-radius: calc(var(--radius) * .72); background: transparent; color: var(--muted-foreground); }
  .model-provider-rail button:is(:hover, :focus-visible), .model-provider-rail button[data-active='true'] { outline: 0; background: var(--sidebar-accent); color: var(--foreground); }
  .model-provider-rail button :global(svg) { inline-size: .86rem; block-size: .86rem; }
  .model-picker-main { min-inline-size: 0; min-block-size: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
  :global(.model-picker-input) { block-size: 2.4rem; padding-block: .55rem; font-size: var(--type-menu); }
  :global(.model-picker-list) { max-block-size: min(22rem, 46dvh); }
  :global(.model-picker-popover [data-slot='command-item']) { min-inline-size: 0; min-block-size: 2.65rem; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto 1.15rem; gap: .5rem; padding: .28rem .5rem; }
  .model-option-copy strong { display: flex; align-items: baseline; gap: .3rem; }
  .model-option-copy em { color: var(--status-positive); font-family: var(--font-mono); font-size: .58rem; font-style: normal; font-weight: 520; }
  .model-favorite { inline-size: 1.1rem; block-size: 1.1rem; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: color-mix(in oklab, var(--muted-foreground), transparent 58%); opacity: 0; }
  :global([data-slot='command-item']:is(:hover, [data-selected='true'], :focus-within)) .model-favorite, .model-favorite[aria-pressed='true'] { opacity: 1; }
  .model-favorite[aria-pressed='true'] { color: var(--status-warning); }
  .model-favorite :global(svg), .model-selected :global(svg) { inline-size: .72rem; block-size: .72rem; }
  .model-selected { inline-size: 1.15rem; display: grid; place-items: center; color: var(--foreground); }
  :global([data-policy-status='restricted']) { color: color-mix(in oklab, var(--muted-foreground), transparent 18%); }
  :global([data-policy-status='restricted']) .model-option-copy { opacity: .62; }
  .policy-restricted { display: inline-grid; place-items: center; color: var(--status-warning); }
  .project-context { min-inline-size: 0; display: flex; align-items: center; gap: .05rem; padding-inline: .35rem; color: var(--muted-foreground); }
  .project-context-identity { min-inline-size: 0; max-inline-size: min(18rem, 36cqi); display: inline-flex; align-items: center; gap: .35rem; padding-inline: .35rem; color: var(--foreground); font-family: var(--font-ui); font-size: var(--type-status); font-weight: 500; }
  .project-context-identity > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-context-identity :global(svg) { flex: none; inline-size: .85rem; block-size: .85rem; color: var(--muted-foreground); }
  .project-context-branch { color: var(--muted-foreground); }
  .project-context :global(.project-context-trigger) { min-inline-size: 0; max-inline-size: min(18rem, 36cqi); justify-content: flex-start; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-status); font-weight: 500; }
  .project-context :global(.project-context-trigger span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.project-context-menu) { inline-size: min(22rem, calc(100dvi - 1rem)); }
  :global(.permission-menu) { inline-size: min(18rem, calc(100dvi - 1rem)); }
  :global(.composer-action-menu) { inline-size: min(12rem, calc(100dvi - 1rem)); }
  :global(.composer-action-menu [data-slot='dropdown-menu-item']) { overflow: hidden; font-size: var(--type-menu); white-space: nowrap; }
  :global(.project-context-menu [data-slot='dropdown-menu-item']) { align-items: start; }
  .context-option-copy { min-inline-size: 0; display: grid; gap: .04rem; }
  .context-option-copy strong, .context-option-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .context-option-copy strong { font-size: var(--type-menu); font-weight: 540; }
  .context-option-copy small { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .6rem; }

  .composer-system[data-presentation='compact'] :global(.composer-input) { min-block-size: 3.25rem; }
  .composer-system[data-presentation='compact'] :global(.composer-body) { min-block-size: 3.15rem; }
  .composer-system[data-presentation='compact'] :global(.composer-textarea) { min-block-size: 3.15rem; max-block-size: 6.5rem; padding: .88rem min(15rem, 44cqi) .7rem 3.2rem; }
  .composer-system[data-presentation='compact'] :global(.composer-toolbar) { position: absolute; inset: 0; pointer-events: none; padding: .35rem .62rem; }
  .composer-system[data-presentation='compact'] :global(.composer-toolbar > *) { pointer-events: auto; }
  .composer-system[data-presentation='standard'] :global(.composer-textarea) { min-block-size: 4.65rem; }
  .composer-system[data-presentation='full'] :global(.composer-textarea) { min-block-size: 6.4rem; padding-inline: calc(var(--composer-edge) + .4rem); }

  .composer-system[data-presentation='peek'] { inline-size: min(100%, 42rem); margin-inline: auto; }
  .composer-system[data-presentation='peek'] :global(.composer-input) { inline-size: 5rem; block-size: .42rem; min-block-size: .42rem; margin-inline: auto; overflow: hidden; border-color: color-mix(in oklab, var(--foreground), transparent 70%); background: color-mix(in oklab, var(--surface-overlay), transparent 35%); opacity: .72; backdrop-filter: blur(18px); }
  .composer-system[data-presentation='peek'] :global(.composer-input > *) { opacity: 0; pointer-events: none; }
  .composer-system[data-presentation='peek']:is(:hover, :focus-within) :global(.composer-input) { inline-size: 100%; block-size: 3.25rem; min-block-size: 3.25rem; opacity: 1; }
  .composer-system[data-presentation='peek']:is(:hover, :focus-within) :global(.composer-input > *) { opacity: 1; pointer-events: auto; transition: opacity var(--motion-enter) var(--ease-standard); }
  .composer-system[data-presentation='peek'] :global(.composer-body) { min-block-size: 3.15rem; }
  .composer-system[data-presentation='peek'] :global(.composer-textarea) { min-block-size: 3.15rem; padding: .83rem min(15rem, 44cqi) .75rem 3.2rem; }
  .composer-system[data-presentation='peek'] :global(.composer-toolbar) { position: absolute; inset: 0; pointer-events: none; padding: .35rem .62rem; }

  .completion-surface { position: absolute; inset-inline: 0; inset-block-end: calc(100% + .45rem); max-block-size: min(25rem, 52dvh); overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.05); background: color-mix(in oklab, var(--surface-overlay) 96%, transparent); box-shadow: 0 1.2rem 3.5rem oklch(0 0 0 / 34%); opacity: 0; translate: 0 .4rem; visibility: hidden; pointer-events: none; backdrop-filter: blur(20px); transition: opacity var(--motion-fast) var(--ease-standard), translate var(--motion-enter) var(--ease-standard), visibility 0s linear var(--motion-enter); }
  .completion-surface[data-open='true'] { opacity: 1; translate: 0; visibility: visible; pointer-events: auto; transition-delay: 0s; }
  .completion-surface > header { min-block-size: 2.15rem; display: flex; align-items: center; gap: .45rem; border-block-end: 1px solid var(--border); padding: .35rem .55rem; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-status); }
  .completion-surface > header kbd { margin-inline-start: auto; font-family: var(--font-mono); font-size: .6rem; }
  .completion-trigger { display: grid; place-items: center; inline-size: 1.35rem; block-size: 1.35rem; border-radius: .38rem; background: var(--accent); color: var(--foreground); font-family: var(--font-mono); }
  .completion-list { max-block-size: min(22rem, 45dvh); overflow: auto; padding: .28rem; scrollbar-gutter: stable; }
  .completion-list section + section { margin-block-start: .18rem; }
  .completion-list h3 { margin: 0; padding: .38rem .48rem .24rem; color: var(--muted-foreground); font-family: var(--font-ui); font-size: .62rem; font-weight: 600; }
  .completion-list button { inline-size: 100%; min-inline-size: 0; display: grid; grid-template-columns: 1.75rem minmax(0, 1fr) auto; align-items: center; gap: .5rem; border: 0; border-radius: calc(var(--radius) * .68); background: transparent; padding: .42rem .48rem; color: var(--foreground); text-align: start; }
  .completion-list button[aria-selected='true'] { background: var(--accent); }
  .completion-icon { display: grid; place-items: center; color: var(--muted-foreground); }
  .completion-icon :global(svg) { inline-size: .9rem; }
  .completion-copy { min-inline-size: 0; display: grid; gap: .05rem; }
  .completion-copy strong, .completion-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .completion-copy strong { font-family: var(--font-ui); font-size: .74rem; font-weight: 570; }
  .completion-copy small { color: var(--muted-foreground); font-family: var(--font-body); font-size: .67rem; }
  .completion-kind { color: var(--muted-foreground); font-family: var(--font-ui); font-size: .6rem; }
  :global(.completion-check) { inline-size: .75rem; color: var(--muted-foreground); opacity: 0; }
  .quick-actions { display: flex; flex-wrap: wrap; gap: .4rem; padding-inline: .05rem; }
  .quick-actions :global(button) { border-color: var(--border); border-radius: 999px; background: transparent; color: var(--muted-foreground); }
  .starting-points { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem; }
  .starting-points button { min-inline-size: 0; display: grid; gap: .15rem; border: 0; border-radius: calc(var(--radius) * .75); background: transparent; padding: .55rem .65rem; color: var(--muted-foreground); text-align: start; }
  .starting-points button:hover, .starting-points button:focus-visible { background: var(--accent); color: var(--foreground); }
  .starting-points strong { overflow: hidden; color: var(--foreground); font-family: var(--font-ui); font-size: .72rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
  .starting-points span { overflow: hidden; font-family: var(--font-body); font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
  @container composer (max-width: 34rem) { .composer-system :global(.permission-trigger span) { display: none; } .composer-system :global(.model-trigger) { max-inline-size: 8.5rem; } .project-context { gap: .55rem; } }
  @container composer (max-width: 25rem) { .composer-system :global(.model-trigger svg:first-child), .composer-system :global(.model-trigger svg:last-child) { display: none; } .starting-points { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { .completion-surface { translate: 0; } }
</style>
