<script lang="ts">
  import { onMount } from 'svelte';
  import type { EditorView as CodeMirrorView } from '@codemirror/view';

  let { value = $bindable(''), path, canSave = true, onSave = () => {} }: { value?: string; path: string; canSave?: boolean; onSave?: () => void } = $props();
  let host: HTMLDivElement;
  let view: CodeMirrorView | null = null;
  let reconfigureLanguage: ((file: string) => void) | null = null;

  onMount(() => {
    let destroyed = false;
    void (async () => {
      const [{ basicSetup, EditorView }, { keymap }, { EditorState, Compartment }, { javascript }, { json }, { html }, { css }, { markdown }, { python }, { syntaxTree }, { lintGutter, linter }] = await Promise.all([
        import('codemirror'), import('@codemirror/view'), import('@codemirror/state'), import('@codemirror/lang-javascript'), import('@codemirror/lang-json'), import('@codemirror/lang-html'), import('@codemirror/lang-css'), import('@codemirror/lang-markdown'), import('@codemirror/lang-python'), import('@codemirror/language'), import('@codemirror/lint')
      ]);
      if (destroyed) return;
      const language = new Compartment();
      const languageFor = (file: string) => {
        const extension = file.split('.').at(-1)?.toLowerCase();
        if (['js', 'jsx', 'mjs', 'cjs'].includes(extension ?? '')) return javascript({ jsx: extension === 'jsx' });
        if (['ts', 'tsx', 'mts', 'cts'].includes(extension ?? '')) return javascript({ typescript: true, jsx: extension === 'tsx' });
        if (extension === 'json' || extension === 'jsonc') return json();
        if (['html', 'htm', 'svelte', 'vue'].includes(extension ?? '')) return html();
        if (['css', 'scss', 'less'].includes(extension ?? '')) return css();
        if (['md', 'mdx', 'markdown'].includes(extension ?? '')) return markdown();
        if (extension === 'py') return python();
        return [];
      };
      const syntaxDiagnostics = linter((editor) => {
        const diagnostics: Array<{ from: number; to: number; severity: 'error'; message: string }> = []; const cursor = syntaxTree(editor.state).cursor();
        do { if (cursor.type.isError) diagnostics.push({ from: cursor.from, to: cursor.to, severity: 'error', message: 'Syntax error' }); if (diagnostics.length >= 200) break; } while (cursor.next());
        return diagnostics;
      }, { delay: 350 });
      view = new EditorView({ parent: host, state: EditorState.create({ doc: value, extensions: [
        basicSetup, language.of(languageFor(path)), EditorView.lineWrapping, syntaxDiagnostics, lintGutter(),
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { if (canSave) onSave(); return true; } }]),
        EditorView.contentAttributes.of({ 'aria-label': `Edit ${path}`, 'aria-multiline': 'true', 'aria-keyshortcuts': 'Meta+S Control+S', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => { if (update.docChanged) value = update.state.doc.toString(); }),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--foreground)', fontSize: '.72rem' }, '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' }, '.cm-content': { caretColor: 'var(--primary)', padding: '1rem 0' },
          '.cm-gutters': { backgroundColor: 'var(--surface-floor)', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }, '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, var(--muted), transparent 45%)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary), transparent 72%) !important' }, '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' }
        })
      ] }) });
      reconfigureLanguage = (file) => view?.dispatch({ effects: language.reconfigure(languageFor(file)) });
    })();
    return () => { destroyed = true; reconfigureLanguage = null; view?.destroy(); view = null; };
  });

  $effect(() => {
    const current = view?.state.doc.toString();
    if (view && current !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });

  $effect(() => { reconfigureLanguage?.(path); });
</script>

<div class="code-editor" bind:this={host}></div>

<style>
  .code-editor { min-block-size: 0; block-size: 100%; overflow: hidden; background: var(--surface-floor); }
  .code-editor :global(.cm-editor), .code-editor :global(.cm-scroller) { min-block-size: 0; block-size: 100%; }
</style>
