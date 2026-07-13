<script lang="ts">
  import { onMount } from 'svelte';
  import type { HermesPetInfo } from '@hermes-companion/contracts';
  import { getHermesPetInfo } from '$lib/client/remote/pets.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { CompanionPetActivity } from '$lib/pet-activity';

  let { activity = 'idle' }: { activity?: CompanionPetActivity } = $props();
  let info = $state<HermesPetInfo | null>(null);
  let canvas = $state<HTMLCanvasElement>();
  let x = $state(24); let y = $state(52); let dragging = $state(false);
  const defaultRows = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
  const aliases: Record<CompanionPetActivity, string[]> = { idle: ['idle'], wave: ['wave', 'waving'], run: ['run', 'running'], failed: ['failed'], review: ['review'], jump: ['jump', 'jumping'], waiting: ['waiting'] };

  async function refresh() { try { info = await resolveRemoteResult(getHermesPetInfo({})); } catch { info = null; } }
  function savePosition() { localStorage.setItem('hermes.companion.pet-position.v1', JSON.stringify({ x, y })); }
  function clamp() { x = Math.max(0, Math.min(window.innerWidth - (canvas?.clientWidth ?? 70), x)); y = Math.max(0, Math.min(window.innerHeight - (canvas?.clientHeight ?? 76) - 22, y)); }
  function pointerdown(event: PointerEvent) { if (!canvas) return; dragging = true; const originX = x, originY = y, startX = event.clientX, startY = event.clientY; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); const move = (next: PointerEvent) => { x = originX + next.clientX - startX; y = originY + next.clientY - startY; clamp(); }; const up = () => { dragging = false; savePosition(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); }
  function keydown(event: KeyboardEvent) { const step = event.shiftKey ? 20 : 5; if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); if (event.key === 'ArrowLeft') x -= step; if (event.key === 'ArrowRight') x += step; if (event.key === 'ArrowUp') y -= step; if (event.key === 'ArrowDown') y += step; clamp(); savePosition(); }

  onMount(() => { const saved = localStorage.getItem('hermes.companion.pet-position.v1'); if (saved) { try { const value = JSON.parse(saved); x = Number(value.x) || 24; y = Number(value.y) || 52; } catch { /* use defaults */ } } else { x = window.innerWidth - 110; y = window.innerHeight - 130; } clamp(); void refresh(); const poll = window.setInterval(refresh, 3_000); const resize = () => clamp(); window.addEventListener('resize', resize); return () => { clearInterval(poll); window.removeEventListener('resize', resize); }; });

  $effect(() => {
    const current = info; const target = canvas; const currentActivity = activity;
    if (!target || !current?.enabled || !current.spritesheetBase64) return;
    const context = target.getContext('2d'); if (!context) return;
    const image = new Image(); image.src = `data:${current.mime ?? 'image/webp'};base64,${current.spritesheetBase64}`;
    const frameWidth = current.frameWidth ?? 192, frameHeight = current.frameHeight ?? 208, scale = current.scale ?? .33;
    const rows = current.stateRows.length ? current.stateRows : defaultRows;
    const rowName = aliases[currentActivity].find((candidate) => rows.includes(candidate)) ?? rows[0] ?? 'idle';
    const row = Math.max(0, rows.indexOf(rowName)); const frames = current.framesByRow[rowName] ?? current.framesByState[currentActivity] ?? current.framesPerState ?? 6;
    const width = Math.round(frameWidth * scale), height = Math.round(frameHeight * scale); target.width = width * devicePixelRatio; target.height = height * devicePixelRatio; target.style.width = `${width}px`; target.style.height = `${height}px`; context.scale(devicePixelRatio, devicePixelRatio);
    let animation = 0; const started = performance.now(); const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => { if (image.complete) { const frame = Math.floor(((now - started) % current.loopMs) / current.loopMs * frames); context.clearRect(0, 0, width, height); context.drawImage(image, frame * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, width, height); } animation = requestAnimationFrame(draw); };
    const start = () => { if (reduced) { context.clearRect(0, 0, width, height); context.drawImage(image, 0, row * frameHeight, frameWidth, frameHeight, 0, 0, width, height); } else animation = requestAnimationFrame(draw); };
    image.onload = start; if (image.complete) start();
    return () => cancelAnimationFrame(animation);
  });
</script>

{#if info?.available && info.enabled && info.spritesheetBase64}
  <button type="button" class="floating-pet" class:dragging aria-label={`Move ${info.displayName ?? 'Hermes pet'}`} title="Drag to move · arrow keys adjust" style={`--pet-x:${x}px;--pet-y:${y}px`} onpointerdown={pointerdown} onkeydown={keydown}><canvas bind:this={canvas} aria-hidden="true"></canvas></button>
{/if}

<style>
  .floating-pet { position: fixed; inset: 0 auto auto 0; z-index: 18; translate: var(--pet-x) var(--pet-y); display: grid; place-items: center; border: 0; background: transparent; padding: 0; cursor: grab; filter: drop-shadow(0 .35rem .45rem color-mix(in oklab, black, transparent 70%)); touch-action: none; -webkit-app-region: no-drag; } .floating-pet.dragging { cursor: grabbing; } .floating-pet:focus-visible { outline: 2px solid var(--ring); outline-offset: .2rem; border-radius: var(--radius); } canvas { display: block; }
  @media (prefers-reduced-motion: reduce) { .floating-pet { filter: none; } }
</style>
