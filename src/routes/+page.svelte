<script lang="ts">
    import { Marked } from 'marked';
    import { markedHighlight } from 'marked-highlight';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/default.css'; // Default theme is bundled
    import { onMount, onDestroy, tick } from 'svelte';
    import ResizablePanes from '$lib/components/ResizablePanes.svelte';
    import ShareModal from '$lib/components/ShareModal.svelte';
    import pako from 'pako';

    // CodeMirror imports
    import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
    import { EditorState, StateEffect, Compartment } from '@codemirror/state';
    import { markdown as langMarkdown, markdownKeymap } from '@codemirror/lang-markdown';
    import { defaultKeymap, history, indentWithTab } from '@codemirror/commands';
    import { LanguageDescription, syntaxTree } from '@codemirror/language';
    import { languages } from '@codemirror/language-data';
    import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
    import { basicSetup } from 'codemirror';


    let markdownInput = `# Hello, Markdown!
  
  This is a **test**.
  
  \`\`\`javascript
  console.log("Hello World!");
  \`\`\`
  - One
  - Two`;
    
    const markedInstance = new Marked();
    markedInstance.use(markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code: string, lang: string) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      }
    }));
    markedInstance.use({ pedantic: false, gfm: true, breaks: false });

    let editorHostEl: HTMLDivElement;
    let cmView: EditorView;
    let previewEl: HTMLDivElement;
    let isEditorScrolling = false;
    let isPreviewScrolling = false;
    let scrollTimeout: number | undefined = undefined;
    let isVerticalSplit = false;
    let isRtl = false;
    let currentHljsTheme = 'default';
    const availableHljsThemes = [
      'default', 'github', 'atom-one-dark', 'stackoverflow-light',
      'vs2015', 'xcode', 'arta', 'monokai'
    ];
    let showShareModal = false;
    let isReadOnly = false;      
    let showEditorPaneInReadOnly = false; 
    let isLoading = true; 

    let readOnlyCompartment = new Compartment();
    let directionCompartment = new Compartment();

    const handleScroll = (event?: Event) => {
      if (isReadOnly && !showEditorPane) return;
    
      const editorScroller = cmView?.scrollDOM;
      const previewScroller = previewEl;
    
      if (!editorScroller || !previewScroller) return;
    
      const target = event?.target as HTMLElement;
    
      if ((target && target.contains(editorScroller) && !isPreviewScrolling) || (!event && !isPreviewScrolling)) { 
        isEditorScrolling = true;
        const editorScrollHeight = editorScroller.scrollHeight;
        const editorClientHeight = editorScroller.clientHeight;
        const editorScrollTop = editorScroller.scrollTop;
        
        if (editorScrollHeight - editorClientHeight > 0) {
            const scrollPercentage = editorScrollTop / (editorScrollHeight - editorClientHeight);
            if (previewScroller.scrollHeight - previewScroller.clientHeight > 0) {
                previewScroller.scrollTop = scrollPercentage * (previewScroller.scrollHeight - previewScroller.clientHeight);
            }
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => (isEditorScrolling = false), 150); 
      } else if ((target && target === previewScroller && !isEditorScrolling) || (!event && !isEditorScrolling)) { 
        isPreviewScrolling = true;
        const previewScrollHeight = previewScroller.scrollHeight;
        const previewClientHeight = previewScroller.clientHeight;
        const previewScrollTop = previewScroller.scrollTop;

        if (previewScrollHeight - previewClientHeight > 0) {
            const scrollPercentage = previewScrollTop / (previewScrollHeight - previewClientHeight);
             if (editorScroller.scrollHeight - editorScroller.clientHeight > 0) {
                editorScroller.scrollTop = scrollPercentage * (editorScroller.scrollHeight - editorScroller.clientHeight);
            }
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => (isPreviewScrolling = false), 150); 
      }
    };
  
    function toggleRtl() { 
      if (!isReadOnly) {
        isRtl = !isRtl;
        if (cmView) {
          cmView.dispatch({ effects: directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: isRtl ? 'rtl' : 'ltr' })) });
          editorHostEl?.classList.toggle('cm-rtl', isRtl);
          editorHostEl?.classList.toggle('cm-ltr', !isRtl);
        } 
      }
    }
  
    async function changeTheme(eventOrValue: Event | string) {
      let newTheme: string;
      let selectElement: HTMLSelectElement | null = null;
  
      if (typeof eventOrValue === 'string') {
        newTheme = eventOrValue;
      } else {
        selectElement = eventOrValue.target as HTMLSelectElement;
        newTheme = selectElement.value;
      }
      
      try {
        const existingLink = document.getElementById('hljs-theme-link');
        if (existingLink) existingLink.remove(); 
  
        if (newTheme !== 'default') { 
          const link = document.createElement('link');
          link.id = 'hljs-theme-link';
          link.rel = 'stylesheet';
          link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${newTheme}.min.css`;
          link.crossOrigin = 'anonymous';
          document.head.appendChild(link);
        }
        currentHljsTheme = newTheme;
      } catch (e) {
        console.error(`Failed to load theme ${newTheme}:`, e);
        if (selectElement) selectElement.value = currentHljsTheme; 
      }
    }
    
    function setupCodeMirror(initialContent: string, readOnlyState: boolean) {
      if (cmView) {
        cmView.scrollDOM.removeEventListener('scroll', handleScroll);
        cmView.destroy();
      }

      const extensions = [
        basicSetup,
        keymap.of([...defaultKeymap, ...markdownKeymap, ...completionKeymap, indentWithTab]),
        langMarkdown({
          codeLanguages: (info: string) => {
            const found = LanguageDescription.matchLanguageName(languages, info, true);
            return found;
          }
        }),
        autocompletion(),
        EditorView.lineWrapping,
        cmPlaceholder("Start typing your Markdown here..."),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            markdownInput = update.state.doc.toString();
          }
          if (update.geometryChanged) {
             if(!isEditorScrolling && !isPreviewScrolling){
                handleScroll(); 
             }
          }
        }),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnlyState)),
        directionCompartment.of(EditorView.contentAttributes.of({ dir: isRtl ? 'rtl' : 'ltr' }))
      ];
      
      const isDarkTheme = ['atom-one-dark', 'monokai', 'arta', 'vs2015'].includes(currentHljsTheme);
      extensions.push(EditorView.theme({
        "&": {
          height: "100%", 
          fontSize: "1rem",
        },
        ".cm-scroller": { 
            overflow: "auto",
            fontFamily: "monospace", 
        },
        ".cm-content": {
          padding: "10px",
        },
        "&.cm-focused": {
          outline: "none"
        },
      }, {dark: isDarkTheme}));

      cmView = new EditorView({
        state: EditorState.create({
          doc: initialContent,
          extensions: extensions
        }),
        parent: editorHostEl
      });
      
      cmView.scrollDOM.addEventListener('scroll', handleScroll);
      editorHostEl?.classList.toggle('cm-rtl', isRtl);
      editorHostEl?.classList.toggle('cm-ltr', !isRtl);

      setTimeout(() => handleScroll(), 50); 
    }
  
    onMount(() => {
      let hashChangeHandler: () => Promise<void>;

      const init = async () => {
        isLoading = true;
        await parseUrlHashForSharedContent();
        
        if (showEditorPane && editorHostEl) {
          setupCodeMirror(markdownInput, isReadOnly);
        }
        
        if (previewEl) { 
          previewEl.addEventListener('scroll', handleScroll);
        }
        
        await changeTheme(currentHljsTheme); 

        hashChangeHandler = async () => {
          isLoading = true;
          await parseUrlHashForSharedContent();
          if (showEditorPane && editorHostEl) {
            if (cmView) {
                const currentCmReadOnly = cmView.state.facet(EditorState.readOnly);
                const currentCmDirAttr = cmView.contentDOM.getAttribute('dir');
                const targetDir = isRtl ? 'rtl' : 'ltr';
                let effects: StateEffect<unknown>[] = [];
                if (currentCmReadOnly !== isReadOnly) {
                    effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
                }
                if (currentCmDirAttr !== targetDir) {
                    effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
                }
                if (cmView.state.doc.toString() !== markdownInput) {
                    cmView.dispatch({
                        changes: {from: 0, to: cmView.state.doc.length, insert: markdownInput}
                    });
                }
                if (effects.length > 0) {
                    cmView.dispatch({effects});
                }
            } else {
                 setupCodeMirror(markdownInput, isReadOnly);
            }
          } else if (!showEditorPane && cmView) {
            cmView.scrollDOM.removeEventListener('scroll', handleScroll);
            cmView.destroy();
          }
          await changeTheme(currentHljsTheme);
          isLoading = false;
          await tick();
          handleScroll();
        };

        window.addEventListener('hashchange', hashChangeHandler);

        isLoading = false;
        await tick();
        if (showEditorPane) handleScroll();
      };

      init();

      return () => {
        if (cmView) {
            cmView.scrollDOM.removeEventListener('scroll', handleScroll);
            cmView.destroy();
        }
        if (previewEl) previewEl.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
        const themeLink = document.getElementById('hljs-theme-link');
        if (themeLink) themeLink.remove();
        if (hashChangeHandler) window.removeEventListener('hashchange', hashChangeHandler);
      };
    });
  
    function parseUrlHashForSharedContent(): Promise<void> {
      return new Promise<void>(async (resolve) => {
        if (typeof window !== 'undefined') {
          const hash = window.location.hash;
          if (hash.startsWith('#share=')) {
            try {
              const encodedData = hash.substring('#share='.length);
              const compressedString = atob(encodedData); 
              const compressedDataArr = new Uint8Array(compressedString.length);
              for (let i = 0; i < compressedString.length; i++) {
                compressedDataArr[i] = compressedString.charCodeAt(i);
              }
    
              const jsonString = pako.inflate(compressedDataArr, { to: 'string' });
              const sharedData = JSON.parse(jsonString);
    
              let newMarkdownInput = markdownInput;
              let newIsRtl = isRtl;
              let newCurrentHljsTheme = currentHljsTheme;
              let newIsReadOnly = isReadOnly;

              if (sharedData.markdown) newMarkdownInput = sharedData.markdown;
              if (sharedData.options) {
                newIsRtl = sharedData.options.rtl === true;
                if (sharedData.options.theme && availableHljsThemes.includes(sharedData.options.theme)) {
                  newCurrentHljsTheme = sharedData.options.theme;
                }
                newIsReadOnly = sharedData.options.readOnly === true; 
              }
              
              markdownInput = newMarkdownInput;
              isRtl = newIsRtl;
              currentHljsTheme = newCurrentHljsTheme;
              isReadOnly = newIsReadOnly;
              
              if (cmView) {
                 const currentDoc = cmView.state.doc.toString();
                 if (currentDoc !== markdownInput) {
                    cmView.dispatch({
                        changes: { from: 0, to: cmView.state.doc.length, insert: markdownInput }
                    });
                 }
              } else if (showEditorPane && editorHostEl) { 
                 setupCodeMirror(markdownInput, isReadOnly);
              }

            } catch (e) {
              console.error("Error parsing shared link data:", e);
              alert("Could not load shared content. The link might be corrupted or invalid.");
            }
          }
        }
        resolve();
      });
    }
  
    $: htmlOutput = markedInstance.parse(markdownInput);
    $: showEditorPane = !isReadOnly || showEditorPaneInReadOnly;
    $: editorPaneInitialRatio = showEditorPane ? 0.5 : 0;

    $: if (cmView && typeof window !== 'undefined') {
        let effects: StateEffect<unknown>[] = [];
        const currentCmReadOnly = cmView.state.facet(EditorState.readOnly);
        const currentCmDirAttr = cmView.contentDOM.getAttribute('dir');
        const targetDir = isRtl ? 'rtl' : 'ltr';

        if (currentCmReadOnly !== isReadOnly) {
            effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
        }
        if (currentCmDirAttr !== targetDir) {
            effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
            editorHostEl?.classList.toggle('cm-rtl', isRtl);
            editorHostEl?.classList.toggle('cm-ltr', !isRtl);
        }

        if (effects.length > 0) {
            cmView.dispatch({ effects });
        }
    }
    
    // Ensure CodeMirror is created/destroyed when showEditorPane changes, especially if it wasn't due to isReadOnly change
    $: if (typeof window !== 'undefined' && editorHostEl ) {
        if (showEditorPane && !cmView) {
            setupCodeMirror(markdownInput, isReadOnly);
        } else if (!showEditorPane && cmView) {
            cmView.scrollDOM.removeEventListener('scroll', handleScroll);
            cmView.destroy();
        }
    }
    
    // Update CodeMirror text content if markdownInput changes from external sources (already handled in parseUrlHash)

</script>

<!-- svelte:head must be a top-level element -->
<svelte:head>
  <title>Markdown Editor {isReadOnly ? '(Read-Only)' : ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Roboto:wght@400;700&display=swap" rel="stylesheet">
</svelte:head>
  
{#if isLoading}
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-100">
    <div class="text-2xl font-semibold text-gray-700">Preparing editor...</div>
    <svg class="mt-4 h-12 w-12 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  </div>
{:else}
  <div class="flex h-screen flex-col" dir={isRtl ? 'rtl' : 'ltr'} style="font-family: {isRtl ? 'Noto Sans Arabic' : 'Roboto'}, sans-serif;">
    {#if !isReadOnly}
      <header class="flex items-center justify-between bg-gray-800 p-4 text-white shadow-md">
        <h1 class="text-2xl font-semibold">Markdown Editor</h1>
        <div class="flex items-center space-x-3">
          <button title="Toggle Text Direction" on:click={toggleRtl} class="rounded p-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500">
            {isRtl ? 'LTR' : 'RTL'}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ml-1 inline-block h-5 w-5 align-middle">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
          <button 
            title="Toggle Split Orientation" 
            aria-label="Toggle editor split orientation" 
            on:click={() => {isVerticalSplit = !isVerticalSplit; tick().then(() => handleScroll()); }}
            class="rounded p-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block h-5 w-5 align-middle">
              {#if isVerticalSplit}
                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h18M16.5 3l4.5 4.5m0 0L16.5 12M21 7.5H3" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6H21m-16.5-12h16.5a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V5.25A2.25 2.25 0 0 1 3.75 3Z" />
              {/if}
            </svg>
          </button>
          <button title="Share Markdown" on:click={() => showShareModal = true} class="rounded p-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500" disabled={isReadOnly}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5 align-middle">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm0 0v-.375c0-.621.504-1.125 1.125-1.125H12a9 9 0 0 1 9 9V21h-3V16.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0-.75.75V21H4.5V16.5a.75.75 0 0 1 .75-.75h2.25c.621 0 1.125.504 1.125 1.125V10.907ZM15.75 6.375a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
            </svg>
          </button>
          <select 
            class="appearance-none rounded bg-gray-700 py-2 pl-3 pr-8 text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            on:change={(e) => changeTheme(e)} 
            bind:value={currentHljsTheme}
            aria-label="Select Code Block Theme"
            disabled={isReadOnly}
          >
            {#each availableHljsThemes as themeName}
              <option value={themeName}>{themeName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
            {/each}
          </select>
        </div>
      </header>
    {/if}
  
    <main class="flex flex-1 overflow-hidden bg-gray-100" class:pt-0={!isReadOnly || isVerticalSplit} class:pt-safe={isReadOnly && !isVerticalSplit} dir={isRtl ? 'rtl' : 'ltr'} >
      <ResizablePanes 
        bind:vertical={isVerticalSplit} 
        initialRatio={editorPaneInitialRatio} 
        minLeftPixels={showEditorPane ? (isVerticalSplit ? 50 : 100) : 0} 
        minRightPixels={isVerticalSplit ? 50 : 100}
        disableResizer={isReadOnly}
      >
        <div slot="left" class="pane-a h-full w-full overflow-auto bg-white" style="{showEditorPane ? '' : 'display: none;'} font-family: {isRtl ? 'Noto Sans Arabic' : 'Roboto'}, sans-serif;">
          {#if !isReadOnly && !isVerticalSplit && showEditorPane}
             <div class="p-2 text-sm font-semibold text-gray-600 {isRtl ? 'text-right' : 'text-left'}" style="font-family: {isRtl ? 'Noto Sans Arabic' : 'Roboto'}, sans-serif;">Editor</div>
          {/if}
          <div bind:this={editorHostEl} class="codemirror-host" style="height: {( !isReadOnly && !isVerticalSplit && showEditorPane) ? 'calc(100% - 2.5rem)' : '100%'}"></div>
        </div>
        <div slot="right" class="pane-b h-full w-full overflow-auto bg-gray-50 p-1 {isVerticalSplit ? 'md:p-4' : 'md:p-6'}">
          {#if !isReadOnly && !isVerticalSplit}
             <div class="pb-2 text-sm font-semibold text-gray-600 {isRtl ? 'text-right' : 'text-left'}" style="font-family: {isRtl ? 'Noto Sans Arabic' : 'Roboto'}, sans-serif;">Preview</div>
          {/if}
          <div 
            bind:this={previewEl} 
            class="prose max-w-none {isRtl ? 'prose-rtl text-right' : 'text-left'} 
                   {isReadOnly && !isVerticalSplit ? 'max-w-3xl mx-auto' : ''} 
                   w-full h-full overflow-auto" 
            style="direction: {isRtl ? 'rtl' : 'ltr'}; font-family: {isRtl ? 'Noto Sans Arabic' : 'Roboto'}, sans-serif;"
          >
            {@html htmlOutput}
          </div>
        </div>
      </ResizablePanes>
    </main>
  
    {#if showShareModal}
      <ShareModal 
        markdownInput={markdownInput} 
        initialRtl={isRtl} 
        initialTheme={currentHljsTheme} 
        availableThemes={availableHljsThemes}
        on:close={() => showShareModal = false} 
      />
    {/if}
  </div>
{/if}

<style>
  :global(body) {
    overscroll-behavior: none; 
  }

  :global(.prose) {
    font-family: inherit;
  }
  :global(.prose[dir="rtl"]) {
    direction: rtl;
    text-align: right;
  }
  :global(.prose:not([dir="rtl"])) {
    direction: ltr;
    text-align: left;
  }

  :global(.prose pre) {
    direction: ltr !important; 
    text-align: left !important;
    padding: 0 !important; 
    background: transparent !important; 
    border-radius: 0.375rem; 
    margin-top: 1.6em; 
    margin-bottom: 1.6em; 
  }
  :global(.prose pre code.hljs) {
    display: block;
    padding: 1em; 
    border-radius: 0.375rem; 
  }

  /* CodeMirror host style */
  .codemirror-host {
    /* height is now set inline for dynamic adjustment */
    /* font-family is inherited from parent, CM theme sets monospace for scroller */
  }

  :global(.cm-editor) {
    height: 100% !important;
  }

  :global(.cm-scroller) {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace !important;
  }
  
  /* Ensure CM content direction is respected */
  :global(.codemirror-host.cm-rtl .cm-content) {
    direction: rtl;
    text-align: right;
  }
   :global(.codemirror-host.cm-ltr .cm-content) {
    direction: ltr;
    text-align: left;
  }

  :global(.prose-rtl h1, .prose-rtl h2, .prose-rtl h3, .prose-rtl h4, .prose-rtl p, .prose-rtl ul, .prose-rtl ol, .prose-rtl blockquote) {
    text-align: right;
  }
  :global(.prose-rtl ul, .prose-rtl ol) {
    padding-right: 1.25em; 
    padding-left: 0;
  }

  .pt-safe { 
    padding-top: 4rem; 
  }
  
</style>