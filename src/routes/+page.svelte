<script lang="ts">
    import { Marked } from 'marked';
    import { markedHighlight } from 'marked-highlight';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/default.css'; // Default theme is bundled
    import { onMount, onDestroy } from 'svelte';
    import ResizablePanes from '$lib/components/ResizablePanes.svelte';
    import ShareModal from '$lib/components/ShareModal.svelte';
    import pako from 'pako';
  
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
  
    let editorEl: HTMLTextAreaElement;
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
  
  
    const handleScroll = (event: Event) => {
      if (isReadOnly && !showEditorPane) return; 
      const target = event.target as HTMLElement;
      if (target === editorEl && !isPreviewScrolling) {
        isEditorScrolling = true;
        const scrollPercentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
        if (previewEl.scrollHeight - previewEl.clientHeight > 0) {
          previewEl.scrollTop = scrollPercentage * (previewEl.scrollHeight - previewEl.clientHeight);
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => (isEditorScrolling = false), 100);
      } else if (target === previewEl && !isEditorScrolling) {
        isPreviewScrolling = true;
        const scrollPercentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
        if (editorEl && editorEl.scrollHeight - editorEl.clientHeight > 0) { 
          editorEl.scrollTop = scrollPercentage * (editorEl.scrollHeight - editorEl.clientHeight);
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => (isPreviewScrolling = false), 100);
      }
    };
  
    function toggleRtl() { if (!isReadOnly) isRtl = !isRtl; }
  
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
          document.head.appendChild(link);
        }
        currentHljsTheme = newTheme;
      } catch (e) {
        console.error(`Failed to load theme ${newTheme}:`, e);
        if (selectElement) selectElement.value = currentHljsTheme; 
      }
    }
    
    onMount(() => {
      parseUrlHashForSharedContent(); 
  
      if (showEditorPane && editorEl && previewEl) { 
        editorEl.addEventListener('scroll', handleScroll);
        previewEl.addEventListener('scroll', handleScroll);
      } else if (!showEditorPane && previewEl) {
        // Preview can still scroll itself
      }
      
      changeTheme(currentHljsTheme); 
  
      const handleHashChange = () => {
        parseUrlHashForSharedContent();
        // Potentially re-apply theme and scroll listeners if content reloads affecting these
        changeTheme(currentHljsTheme); 
        if (showEditorPane && editorEl && previewEl) {
            editorEl.removeEventListener('scroll', handleScroll); // Avoid duplicate listeners
            previewEl.removeEventListener('scroll', handleScroll);
            editorEl.addEventListener('scroll', handleScroll);
            previewEl.addEventListener('scroll', handleScroll);
        } else if (!showEditorPane && previewEl) {
            // Handle scroll for preview only if necessary
        }
      };

      window.addEventListener('hashchange', handleHashChange);
  
      return () => {
        if (editorEl) editorEl.removeEventListener('scroll', handleScroll);
        if (previewEl) previewEl.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
        const themeLink = document.getElementById('hljs-theme-link');
        if (themeLink) themeLink.remove();
        window.removeEventListener('hashchange', handleHashChange);
      };
    });
  
    function parseUrlHashForSharedContent() {
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
  
            if (sharedData.markdown) markdownInput = sharedData.markdown;
            if (sharedData.options) {
              isRtl = sharedData.options.rtl === true;
              if (sharedData.options.theme && availableHljsThemes.includes(sharedData.options.theme)) {
                currentHljsTheme = sharedData.options.theme;
              }
              if (sharedData.options.readOnly === true) {
                isReadOnly = true;
              }
            }
            // history.replaceState(null, '', window.location.pathname + window.location.search); // Keep the hash
          } catch (e) {
            console.error("Error parsing shared link data:", e);
            alert("Could not load shared content. The link might be corrupted or invalid.");
          }
        }
      }
    }
  
    $: htmlOutput = markedInstance.parse(markdownInput);
    $: showEditorPane = !isReadOnly || showEditorPaneInReadOnly;
    $: editorPaneInitialRatio = showEditorPane ? 0.5 : 0;
  
  </script>
  
  <svelte:head>
    <title>Markdown Editor {isReadOnly ? '(Read-Only)' : ''}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Roboto:wght@400;700&display=swap" rel="stylesheet">
    <!-- default.css is imported in script. Other themes are linked by changeTheme -->
  </svelte:head>
  
  <div class="flex h-screen flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
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
            on:click={() => isVerticalSplit = !isVerticalSplit} 
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
          <button title="Share Markdown" on:click={() => showShareModal = true} class="rounded p-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5 align-middle">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm0 0v-.375c0-.621.504-1.125 1.125-1.125H12a9 9 0 0 1 9 9V21h-3V16.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0-.75.75V21H4.5V16.5a.75.75 0 0 1 .75-.75h2.25c.621 0 1.125.504 1.125 1.125V10.907ZM15.75 6.375a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
            </svg>
          </button>
          <select 
            class="appearance-none rounded bg-gray-700 py-2 pl-3 pr-8 text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            on:change={(e) => changeTheme(e)} 
            bind:value={currentHljsTheme}
            aria-label="Select Code Block Theme"
          >
            {#each availableHljsThemes as themeName}
              <option value={themeName}>{themeName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
            {/each}
          </select>
        </div>
      </header>
    {/if}
  
    <main class="flex flex-1 overflow-hidden bg-gray-100" class:pt-0={!isReadOnly} class:pt-safe={isReadOnly && !isVerticalSplit} dir={isRtl ? 'rtl' : 'ltr'}>
      <ResizablePanes 
        bind:vertical={isVerticalSplit} 
        initialRatio={editorPaneInitialRatio} 
        minLeftPixels={showEditorPane ? 100 : 0} 
        minRightPixels={showEditorPane ? 100 : 0} 
        disableResizer={!showEditorPane} 
      >
        <div slot="left" class="flex h-full flex-col overflow-hidden bg-white shadow-sm" class:p-4={showEditorPane} class:!p-0={!showEditorPane} class:hidden={!showEditorPane} >
          {#if showEditorPane} 
            <h2 class="text-xl mb-2 font-semibold text-gray-700">Markdown Input</h2>
            <textarea
              bind:this={editorEl} 
              bind:value={markdownInput}
              class="w-full h-full flex-1 resize-none rounded-md border border-gray-300 p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Write your markdown here..."
              spellcheck="false"
              aria-label="Markdown Input"
              dir={isRtl ? 'rtl' : 'ltr'}
              readonly={isReadOnly && !showEditorPaneInReadOnly} 
            ></textarea>
          {/if}
        </div>
        <div slot="right" 
             class={`
               flex h-full flex-col overflow-hidden bg-white shadow-sm 
               ${!showEditorPane ? 'w-full' : ''}
               ${(!isReadOnly && showEditorPane) ? 'p-4' : ''}
               ${(!showEditorPane && !isReadOnly) ? 'p-0' : ''}
               ${isReadOnly ? 'p-2 sm:p-4' : ''}
             `}
        >
          {#if !isReadOnly}
            <h2 class="text-xl mb-2 font-semibold text-gray-700">{isReadOnly ? 'Shared Content' : 'Preview'}</h2>
          {/if}
          <div
            bind:this={previewEl}
            class={`
              prose prose-sm sm:prose lg:prose-lg xl:prose-xl w-full h-full flex-1 overflow-auto rounded-md border border-gray-300
              ${!isReadOnly ? 'p-2 max-w-none' : ''}
              ${isReadOnly ? 'p-4 sm:p-6 max-w-4xl mx-auto' : ''}
            `}
            aria-label="Markdown Content Preview"
            dir={isRtl ? 'rtl' : 'ltr'} 
          >
            {@html htmlOutput}
          </div>
        </div>
      </ResizablePanes>
    </main>
  </div>
  
  {#if showShareModal && !isReadOnly}
    <ShareModal 
      {markdownInput} 
      initialRtl={isRtl} 
      initialTheme={currentHljsTheme} 
      availableThemes={availableHljsThemes}
      on:close={() => showShareModal = false} 
    />
  {/if}
  
  <style>
    :global(body) {
      /* Prioritize Noto Sans Arabic for RTL, fallback to Roboto, then system sans-serif */
      font-family: 'Noto Sans Arabic', 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #333;
      background-color: #f7fafc; 
    }
    :global(body[dir="rtl"]) {
      /* Ensure Noto Sans Arabic is specifically used when dir=rtl is on body */
      font-family: 'Noto Sans Arabic', sans-serif;
    }
    :global(body[dir="ltr"]) {
      /* Ensure Roboto (or your preferred LTR font) is specifically used */
      font-family: 'Roboto', 'Noto Sans Arabic', sans-serif; /* Noto Sans Arabic as fallback if Roboto lacks glyphs */
    }
    :global(.prose ul) { list-style-type: disc; padding-left: 1.5em; margin-left: 0.5em;}
    :global(.prose ol) { list-style-type: decimal; padding-left: 1.5em; margin-left: 0.5em;}
    :global(.prose blockquote) { border-left: 3px solid #cbd5e0; padding-left: 1em; margin-left: 0; font-style: italic; color: #4a5568; }
    :global(.prose pre) { 
      background-color: #edf2f7; 
      padding: 1em; 
      overflow-x: auto; 
      border-radius: 0.375rem; 
      direction: ltr; 
      text-align: left; 
    }
    :global(.prose pre code) { 
      direction: ltr; 
      text-align: left; 
      /* Ensure code inside pre also respects LTR for selection/caret if parent pre doesn't fully enforce */
      white-space: pre; /* Explicitly set for consistency */
    }
    :global(.prose pre code.hljs) { background-color: transparent; padding: 0; }
    :global(.prose code:not(.hljs)) { 
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; 
      background-color: #e2e8f0; 
      padding: 0.2em 0.4em; 
      border-radius: 0.25rem; 
      font-size: 0.875em; 
      /* Code snippets not in pre (inline code) should also be LTR if they contain technical terms/code */
      direction: ltr; 
      unicode-bidi: embed; /* Helps ensure LTR for inline code in RTL parent */
    }
    :global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) { margin-top: 1.2em; margin-bottom: 0.6em; font-weight: 600; color: #2d3748; }
    
    .pt-safe {
      padding-top: 1rem; 
    }
  </style>