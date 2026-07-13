<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, CircleAlert, RefreshCw } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Alert from '$lib/components/ui/alert';
  import * as Empty from '$lib/components/ui/empty';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { getHermesInsights } from '$lib/client/remote/operations.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { HermesInsightsOverview } from '@hermes-companion/contracts';

  const periods = [7, 30, 90] as const;
  let days = $state<(typeof periods)[number]>(30);
  let data = $state<HermesInsightsOverview | null>(null);
  let loading = $state(true);
  let error = $state('');
  const totals = $derived(data?.totals ?? null);
  const maxDailyTokens = $derived(Math.max(1, ...(data?.daily ?? []).map((entry) => entry.input_tokens + entry.output_tokens)));

  const compact = (value: number | null | undefined) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
  const currency = (value: number | null | undefined) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value && value < 1 ? 3 : 2 }).format(value ?? 0);
  async function load(nextDays = days) {
    days = nextDays; loading = true; error = '';
    try { data = await resolveRemoteResult(getHermesInsights({ days: nextDays })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes insights could not be loaded.'; }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
</script>

<section class="insights" aria-labelledby="insights-heading">
  <header class="insights-header">
    <div><h2 id="insights-heading">Insights</h2><p>Usage recorded by the active Hermes profile.</p></div>
    <div class="period-controls" aria-label="Insights period">{#each periods as period}<Button size="xs" variant={days === period ? 'secondary' : 'ghost'} aria-pressed={days === period} disabled={loading} onclick={() => void load(period)}>{period}d</Button>{/each}<Button size="icon-xs" variant="ghost" aria-label="Refresh insights" title="Refresh insights" disabled={loading} onclick={() => void load()}><RefreshCw /></Button></div>
  </header>

  {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Insights unavailable</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if loading && !data}
    <div class="insights-loading"><Skeleton class="h-16 w-full" /><Skeleton class="h-32 w-full" /><Skeleton class="h-28 w-full" /></div>
  {:else if !totals || (totals.total_sessions === 0 && data?.daily.length === 0)}
    <Empty.Root><Empty.Header><Empty.Media variant="icon"><Activity /></Empty.Media><Empty.Title>No recorded activity</Empty.Title><Empty.Description>Hermes has no usage records for the last {days} days.</Empty.Description></Empty.Header></Empty.Root>
  {:else}
    <div class="insights-content" aria-busy={loading}>
      <dl class="insight-stats">
        <div><dt>Sessions</dt><dd>{compact(totals.total_sessions)}</dd></div>
        <div><dt>API calls</dt><dd>{compact(totals.total_api_calls)}</dd></div>
        <div><dt>Input tokens</dt><dd>{compact(totals.total_input)}</dd></div>
        <div><dt>Output tokens</dt><dd>{compact(totals.total_output)}</dd></div>
        <div><dt>Cache read</dt><dd>{compact(totals.total_cache_read)}</dd></div>
        <div><dt>Estimated cost</dt><dd>{currency(totals.total_estimated_cost)}</dd></div>
      </dl>

      <figure class="daily-usage" aria-labelledby="daily-usage-heading">
        <figcaption><span id="daily-usage-heading">Daily tokens</span><span class="legend"><i data-kind="input"></i>Input <i data-kind="output"></i>Output</span></figcaption>
        <div class="token-bars" aria-hidden="true">{#each data?.daily ?? [] as entry (entry.day)}<div class="token-day" title={`${entry.day} · ${compact(entry.input_tokens)} input · ${compact(entry.output_tokens)} output`}><i data-kind="input" style={`block-size:${Math.max(entry.input_tokens > 0 ? 1 : 0, entry.input_tokens / maxDailyTokens * 100)}%`}></i><i data-kind="output" style={`block-size:${Math.max(entry.output_tokens > 0 ? 1 : 0, entry.output_tokens / maxDailyTokens * 100)}%`}></i></div>{/each}</div>
        <div class="chart-range"><span>{data?.daily[0]?.day}</span><span>{data?.daily.at(-1)?.day}</span></div>
        <table class="visually-hidden"><caption>Daily Hermes token usage</caption><thead><tr><th scope="col">Day</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th></tr></thead><tbody>{#each data?.daily ?? [] as entry (entry.day)}<tr><th scope="row">{entry.day}</th><td>{entry.input_tokens}</td><td>{entry.output_tokens}</td></tr>{/each}</tbody></table>
      </figure>

      <div class="insight-lists">
        <section><h3>Top models</h3>{#if data?.by_model.length}<ul>{#each data.by_model.slice(0, 6) as model (model.model)}<li><span><strong>{model.model}</strong><small>{model.sessions} {model.sessions === 1 ? 'session' : 'sessions'} · {compact(model.api_calls)} calls</small></span><em>{compact(model.input_tokens + model.output_tokens)} tokens</em></li>{/each}</ul>{:else}<p>No model usage.</p>{/if}</section>
        <section><h3>Top skills</h3>{#if data?.skills.top_skills.length}<ul>{#each data.skills.top_skills.slice(0, 6) as skill (skill.skill)}<li><span><strong>{skill.skill}</strong><small>{compact(skill.view_count)} views · {compact(skill.manage_count)} changes</small></span><em>{compact(skill.total_count)} actions</em></li>{/each}</ul>{:else}<p>No skill activity.</p>{/if}</section>
        <section><h3>Top tools</h3>{#if data?.tools.length}<ul>{#each data.tools.slice(0, 6) as tool (tool.tool)}<li><span><strong>{tool.tool}</strong><small>{tool.percentage.toFixed(1)}% of recorded calls</small></span><em>{compact(tool.count)} calls</em></li>{/each}</ul>{:else}<p>No tool activity.</p>{/if}</section>
      </div>
    </div>
  {/if}
</section>

<style>
  .insights { min-inline-size: 0; block-size: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: .75rem; overflow: auto; padding: clamp(.8rem, 2cqi, 1.3rem); container: insights / inline-size; scrollbar-gutter: stable; overscroll-behavior: contain; }
  .insights-header { display: flex; align-items: safe center; justify-content: space-between; gap: .75rem; }
  .insights-header h2 { margin: 0; font-size: .88rem; }
  .insights-header p { margin: .16rem 0 0; color: var(--muted-foreground); font-size: .65rem; }
  .period-controls { display: flex; align-items: center; gap: .12rem; }
  .insights-loading, .insights-content { min-inline-size: 0; display: grid; align-content: start; gap: 1rem; }
  .insights-content[aria-busy='true'] { opacity: .68; transition: opacity var(--motion-fast) var(--ease-standard); }
  .insight-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: .85rem; margin: 0; padding: .35rem .1rem; }
  .insight-stats div { min-inline-size: 0; }
  .insight-stats dt, .daily-usage figcaption > span:first-child, .insight-lists h3 { color: var(--muted-foreground); font-family: var(--font-heading); font-size: .58rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
  .insight-stats dd { margin: .18rem 0 0; overflow: hidden; font-family: var(--font-mono); font-size: 1rem; font-weight: 570; letter-spacing: -.035em; text-overflow: ellipsis; white-space: nowrap; }
  .daily-usage { min-inline-size: 0; margin: 0; border-radius: calc(var(--radius) * 1.1); background: var(--surface-raised); padding: .7rem; }
  .daily-usage figcaption { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
  .legend { display: inline-flex; align-items: center; gap: .3rem; color: var(--muted-foreground); font-size: .58rem; }
  .legend i { inline-size: .42rem; block-size: .42rem; border-radius: 1px; }
  [data-kind='input'] { background: color-mix(in oklab, var(--primary), transparent 35%); }
  [data-kind='output'] { background: color-mix(in oklab, var(--status-positive), transparent 30%); }
  .token-bars { block-size: 7rem; display: flex; align-items: end; gap: 1px; margin-block-start: .65rem; }
  .token-day { min-inline-size: 1px; block-size: 100%; flex: 1 1 0; display: flex; flex-direction: column; justify-content: end; }
  .token-day i { inline-size: 100%; min-block-size: 0; display: block; }
  .chart-range { display: flex; justify-content: space-between; margin-block-start: .25rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .54rem; }
  .insight-lists { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
  .insight-lists section { min-inline-size: 0; }
  .insight-lists h3 { margin: 0 0 .25rem; }
  .insight-lists ul { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
  .insight-lists li { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: .65rem; border-radius: var(--radius); padding: .42rem .35rem; }
  .insight-lists li:hover { background: var(--sidebar-accent); }
  .insight-lists li span { min-inline-size: 0; display: grid; gap: .08rem; }
  .insight-lists strong, .insight-lists small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .insight-lists strong { font-family: var(--font-mono); font-size: .66rem; font-weight: 540; }
  .insight-lists small, .insight-lists p, .insight-lists em { color: var(--muted-foreground); font-size: .58rem; }
  .insight-lists p { margin: .4rem .1rem; }
  .insight-lists em { flex: none; font-style: normal; }
  .visually-hidden { position: absolute !important; inline-size: 1px !important; block-size: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; border: 0 !important; white-space: nowrap !important; }
  @container insights (max-width: 44rem) { .insight-lists { grid-template-columns: 1fr; gap: .8rem; } }
  @media (prefers-reduced-motion: reduce) { .insights-content[aria-busy='true'] { transition: none; } }
</style>
