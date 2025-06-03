<script lang="ts">
    // import { Marked } from 'marked';
    // import { markedHighlight } from 'marked-highlight';
    import { unified } from 'unified';
    import remarkParse from 'remark-parse';
    import remarkGfm from 'remark-gfm';
    import remarkMath from 'remark-math';
    import remarkMermaid from 'remark-mermaidjs';
    import remarkGithubBetaBlockquoteAdmonitions from 'remark-github-beta-blockquote-admonitions';
    import remarkRehype from 'remark-rehype';
    import rehypeRaw from 'rehype-raw';
    import rehypeMathjax from 'rehype-mathjax';
    import rehypeHighlight from 'rehype-highlight';
    import rehypeStringify from 'rehype-stringify';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/default.css'; // Default theme is bundled
    import { onMount, onDestroy, tick } from 'svelte';
    import ResizablePanes from '$lib/components/ResizablePanes.svelte';
    import ShareModal from '$lib/components/ShareModal.svelte';
    import pako from 'pako';

    // CodeMirror imports
    import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
    import { EditorState, StateEffect, Compartment, Prec } from '@codemirror/state';
    import { markdown as langMarkdown, markdownKeymap } from '@codemirror/lang-markdown';
    import { defaultKeymap, history, indentWithTab, standardKeymap } from '@codemirror/commands';
    import { LanguageDescription } from '@codemirror/language';
    import { languages } from '@codemirror/language-data';
    import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
    import { basicSetup } from 'codemirror';

    // Import Fontsource fonts
    import '@fontsource/inter/latin-400.css'; // Regular
    import '@fontsource/inter/latin-700.css'; // Bold
    import '@fontsource/noto-sans-arabic/arabic-400.css'; // Regular
    import '@fontsource/noto-sans-arabic/arabic-700.css'; // Bold
    import '@fontsource/ibm-plex-mono/latin-400.css'; // Regular

    const INITIAL_MARKDOWN = '# Hello, Markdown!\n' +
      'This is a **test**.\n\n' +
      'Inline math: $ax^2 + bx + c = 0$\n\n' +
      'Block math:\n' +
      '$$\n' +
      'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n' +
      '$$\n\n' +
      '\`\`\`javascript\n' +
      'console.log("Hello World!");\n' +
      '\`\`\`\n\n' +
      'A simple diagram:\n' +
      '\`\`\`mermaid\n' +
      'graph TD;\n' +
      '    A-->B;\n' +
      '    A-->C;\n' +
      '    B-->D;\n' +
      '    C-->D;\n' +
      '\`\`\`\n\n' +
      '- One\n' +
      '- Two\n\n' +
      '> [!NOTE]\n' +
      '> This is a note callout.\n\n' +
      '> [!TIP]\n' +
      '> This is a tip with a custom title!\n\n' +
      '> [!WARNING]\n' +
      '> Be careful with this warning.';
    
    let markdownInput = INITIAL_MARKDOWN;
    
    // const markedInstance = new Marked();
    // markedInstance.use(markedHighlight({
    //   langPrefix: 'hljs language-',
    //   highlight(code: string, lang: string) {
    //     const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    //     return hljs.highlight(code, { language }).value;
    //   }
    // }));
    // markedInstance.use({ pedantic: false, gfm: true, breaks: false });

    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkMermaid)
      .use(remarkGithubBetaBlockquoteAdmonitions, {
        classNameMaps: {
          block: (title: string) => {
            const type = title.split(' ')[0].toLowerCase();
            // Ensure that 'important' maps to 'admonition-important' as per existing CSS
            const cssType = type === 'important' ? 'important' : type;
            return ['admonition', `admonition-${cssType}`];
          },
          title: 'admonition-title' // Default class for the title paragraph
        }
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw) // Make sure to handle raw HTML correctly
      .use(rehypeMathjax)
      .use(rehypeHighlight, { 
        highlight: (code: string, language: string) => {
            const lang = hljs.getLanguage(language) ? language : 'plaintext';
            try {
                return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
            } catch (e) {
                console.error("Highlight.js error:", e, "Lang:", lang, "Code:", code);
                return hljs.highlightAuto(code).value; // Fallback to auto-highlight
            }
        },
        plainText: ['txt', 'text'], // Ensure plaintext is not highlighted if language is not found
        ignoreMissing: true, // Don't throw error if language not found
        aliases: {'js': ['javascript'], 'ts': ['typescript']} // common aliases
      })
      .use(rehypeStringify);

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
    let showRestoreDialog = false; // New state for restore dialog
    let foundSavedSession = false; // New state to indicate if a session was found
    let allowSessionSaving = false; // Gate for allowing session saves - DEFAULT FALSE
    let primeForSavingOnNextEditAfterShareLoad = false; // True if shared content just loaded, waiting for first edit

    let readOnlyCompartment = new Compartment();
    let directionCompartment = new Compartment();

    let saveTimeout: number | undefined;
    function saveSession() {
        if (typeof window !== 'undefined') {
            clearTimeout(saveTimeout);
            saveTimeout = window.setTimeout(() => { 
                if (!isLoading && allowSessionSaving) { 
                    try {
                        localStorage.setItem('mdEditorLastMarkdown', markdownInput);
                        localStorage.setItem('mdEditorLastRtl', JSON.stringify(isRtl));
                        localStorage.setItem('mdEditorLastTheme', currentHljsTheme);
                        localStorage.setItem('mdEditorLastVerticalSplit', JSON.stringify(isVerticalSplit));
                    } catch (e) {
                        console.error("Error saving session to localStorage:", e);
                    }
                }
            }, 500); 
        }
    }

    async function loadSession() {
        if (typeof window !== 'undefined') {
            let tempMarkdownInput = markdownInput;
            let tempIsRtl = isRtl;
            let tempCurrentHljsTheme = currentHljsTheme;
            let tempIsVerticalSplit = isVerticalSplit;

            try {
                const savedMarkdown = localStorage.getItem('mdEditorLastMarkdown');
                if (savedMarkdown !== null) tempMarkdownInput = savedMarkdown;

                const savedRtlString = localStorage.getItem('mdEditorLastRtl');
                if (savedRtlString !== null) {
                    try { tempIsRtl = JSON.parse(savedRtlString); } catch (e) { /* console.error */ }
                }

                const savedTheme = localStorage.getItem('mdEditorLastTheme');
                if (savedTheme !== null && availableHljsThemes.includes(savedTheme)) {
                    tempCurrentHljsTheme = savedTheme;
                }

                const savedVerticalSplitString = localStorage.getItem('mdEditorLastVerticalSplit');
                if (savedVerticalSplitString !== null) {
                    try { tempIsVerticalSplit = JSON.parse(savedVerticalSplitString); } catch (e) { /* console.error */ }
                }
                
                markdownInput = tempMarkdownInput;
                isRtl = tempIsRtl;
                currentHljsTheme = tempCurrentHljsTheme;
                isVerticalSplit = tempIsVerticalSplit;
                isReadOnly = false;

            } catch (e) {
                console.error("Critical error reading from localStorage during loadSession, resetting to defaults:", e);
                markdownInput = INITIAL_MARKDOWN;
                isRtl = false;
                currentHljsTheme = 'default';
                isVerticalSplit = false;
                isReadOnly = false;
            }
        }
    }

    function clearSessionAndReset() {
        if (typeof window !== 'undefined') {
            try {
                localStorage.removeItem('mdEditorLastMarkdown');
                localStorage.removeItem('mdEditorLastRtl');
                localStorage.removeItem('mdEditorLastTheme');
                localStorage.removeItem('mdEditorLastVerticalSplit');
            } catch (e) {
                console.error("Error clearing session from localStorage:", e);
            }
        }
        markdownInput = INITIAL_MARKDOWN;
        isRtl = false;
        currentHljsTheme = 'default';
        isVerticalSplit = false;
        if (cmView) {
            setupCodeMirror(markdownInput, isReadOnly); // Re-setup CM with initial values
        } else if (showEditorPane && editorHostEl) { // If CM wasn't there but should be
            setupCodeMirror(markdownInput, isReadOnly);
        }
        changeTheme(currentHljsTheme); // Reset theme for preview
    }

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
        cmView = undefined;
      }

      const customKeymap = [
        { 
            key: "Mod-b", run: (view: EditorView) => {
                const { from, to } = view.state.selection.main;
                const selection = view.state.sliceDoc(from, to);
                view.dispatch({changes: {from, to, insert: `**${selection}**`}});
                if (from === to) { // If no selection, move cursor inside
                    view.dispatch({selection: {anchor: from + 2}});
                }
                return true;
            }
        },
        { 
            key: "Mod-i", run: (view: EditorView) => {
                const { from, to } = view.state.selection.main;
                const selection = view.state.sliceDoc(from, to);
                view.dispatch({changes: {from, to, insert: `*${selection}*`}});
                if (from === to) {
                    view.dispatch({selection: {anchor: from + 1}});
                }
                return true;
            }
        }
      ];

      const extensions = [
        basicSetup, // Includes history, default keymap, line numbers, etc.
        keymap.of([...customKeymap, ...standardKeymap, ...markdownKeymap, ...completionKeymap, ...closeBracketsKeymap, indentWithTab]),
        langMarkdown({
          codeLanguages: (info: string) => {
            const found = LanguageDescription.matchLanguageName(languages, info, true);
            return found;
          }
        }),
        autocompletion(), // Includes closeBrackets() by default if closeBrackets extension is added
        closeBrackets(), // For auto-pairing of brackets, quotes, etc.
        EditorView.lineWrapping,
        cmPlaceholder("Start typing your Markdown here..."),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            markdownInput = update.state.doc.toString();
            if (primeForSavingOnNextEditAfterShareLoad) {
                allowSessionSaving = true;
                primeForSavingOnNextEditAfterShareLoad = false;
            }
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
      let hashChangeHandlerInstance: () => Promise<void>;

      const init = async () => {
        isLoading = true;
        await tick();

        if (typeof window !== 'undefined') {
            const currentHash = window.location.hash;
            if (currentHash.startsWith('#share=')) {
                await parseUrlHashForSharedContent(currentHash);
            } else {
                const savedMarkdownExists = localStorage.getItem('mdEditorLastMarkdown');
                if (savedMarkdownExists !== null) {
                    foundSavedSession = true;
                    showRestoreDialog = true;
                    isLoading = false;
                    return;
                } else {
                    markdownInput = INITIAL_MARKDOWN;
                    isRtl = false;
                    currentHljsTheme = 'default';
                    isVerticalSplit = false;
                    isReadOnly = false;
                    allowSessionSaving = true;
                    primeForSavingOnNextEditAfterShareLoad = false;
                }
            }
        } else {
            markdownInput = INITIAL_MARKDOWN;
            isRtl = false;
            currentHljsTheme = 'default';
            isVerticalSplit = false;
            isReadOnly = false;
            allowSessionSaving = true;
            primeForSavingOnNextEditAfterShareLoad = false;
        }

        if (showEditorPane && editorHostEl) {
            setupCodeMirror(markdownInput, isReadOnly);
        }
        await changeTheme(currentHljsTheme);
        
        isLoading = false;
        await tick();
        if (showEditorPane) {
            setTimeout(() => handleScroll(), 50);
        }
      };

      hashChangeHandlerInstance = async () => {
          isLoading = true;
          await tick();

          const newHash = window.location.hash;
          if (newHash.startsWith('#share=')) {
              await parseUrlHashForSharedContent(newHash);
              if (showEditorPane && editorHostEl && !cmView) {
                  setupCodeMirror(markdownInput, isReadOnly);
              } else if (!showEditorPane && cmView) { 
                  cmView.scrollDOM.removeEventListener('scroll', handleScroll);
                  cmView.destroy();
                  cmView = undefined;
              }
          } else {
              const savedMarkdownExists = localStorage.getItem('mdEditorLastMarkdown');
              if (savedMarkdownExists !== null) {
                  await loadSession();
              } else {
                  markdownInput = INITIAL_MARKDOWN;
                  isRtl = false;
                  currentHljsTheme = 'default';
                  isVerticalSplit = false;
                  isReadOnly = false;
              }
              allowSessionSaving = true;
              primeForSavingOnNextEditAfterShareLoad = false;

              if (cmView) {
                  if (cmView.state.doc.toString() !== markdownInput) {
                       cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: markdownInput }});
                  }
                  const targetDir = isRtl ? 'rtl' : 'ltr';
                  let effects: StateEffect<unknown>[] = [];
                  if (cmView.state.facet(EditorState.readOnly) !== isReadOnly) {
                      effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
                  }
                  if (cmView.contentDOM.getAttribute('dir') !== targetDir) {
                      effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
                      editorHostEl?.classList.toggle('cm-rtl', isRtl);
                      editorHostEl?.classList.toggle('cm-ltr', !isRtl);
                  }
                  if (effects.length > 0) cmView.dispatch({effects});

              } else if (showEditorPane && editorHostEl) {
                  setupCodeMirror(markdownInput, isReadOnly);
              }
          }
          
          await changeTheme(currentHljsTheme);
          
          isLoading = false;
          await tick();
          if (showEditorPane) {
            setTimeout(() => handleScroll(), 50);
          }
      };

      init();

      if (previewEl) {
          previewEl.addEventListener('scroll', handleScroll);
      }
      window.addEventListener('hashchange', hashChangeHandlerInstance);

      return () => {
        if (cmView) {
            cmView.scrollDOM.removeEventListener('scroll', handleScroll);
            cmView.destroy();
        }
        if (previewEl) previewEl.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
        clearTimeout(saveTimeout);
        const themeLink = document.getElementById('hljs-theme-link');
        if (themeLink) themeLink.remove();
        if (hashChangeHandlerInstance) window.removeEventListener('hashchange', hashChangeHandlerInstance);
      };
    });
  
    async function parseUrlHashForSharedContent(currentHash: string): Promise<void> {
        try {
            const encodedData = currentHash.substring('#share='.length);
            const compressedString = atob(encodedData); 
            const compressedDataArr = new Uint8Array(compressedString.length);
            for (let i = 0; i < compressedString.length; i++) {
                compressedDataArr[i] = compressedString.charCodeAt(i);
            }
            const jsonString = pako.inflate(compressedDataArr, { to: 'string' });
            const sharedData = JSON.parse(jsonString);

            let newMarkdownInput = INITIAL_MARKDOWN;
            let newIsRtl = false;
            let newCurrentHljsTheme = 'default';
            let newIsReadOnly = false;

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
                const currentCmDoc = cmView.state.doc.toString();
                if (currentCmDoc !== markdownInput) {
                    cmView.dispatch({
                        changes: { from: 0, to: cmView.state.doc.length, insert: markdownInput }
                    });
                }
                const targetDir = isRtl ? 'rtl' : 'ltr';
                let effects: StateEffect<unknown>[] = [];
                if (cmView.state.facet(EditorState.readOnly) !== isReadOnly) {
                    effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
                }
                if (cmView.contentDOM.getAttribute('dir') !== targetDir) {
                    effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
                    editorHostEl?.classList.toggle('cm-rtl', isRtl);
                    editorHostEl?.classList.toggle('cm-ltr', !isRtl);
                }
                if (effects.length > 0) cmView.dispatch({effects});
            }

            allowSessionSaving = false;
            primeForSavingOnNextEditAfterShareLoad = true;

        } catch (e) {
            console.error("Error parsing shared link data:", e);
            alert("Could not load shared content. The link might be corrupted or invalid. Loading default content.");
            markdownInput = INITIAL_MARKDOWN;
            isRtl = false;
            currentHljsTheme = 'default';
            isVerticalSplit = false; 
            isReadOnly = false;
            
            allowSessionSaving = true;
            primeForSavingOnNextEditAfterShareLoad = false;

            if (cmView) {
                 if (cmView.state.doc.toString() !== markdownInput) {
                    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: markdownInput }});
                 }
                 const targetDir = isRtl ? 'rtl' : 'ltr';
                 let effects: StateEffect<unknown>[] = [];
                 if (cmView.state.facet(EditorState.readOnly) !== isReadOnly) {
                    effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
                 }
                 if (cmView.contentDOM.getAttribute('dir') !== targetDir) {
                    effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
                    editorHostEl?.classList.toggle('cm-rtl', isRtl);
                    editorHostEl?.classList.toggle('cm-ltr', !isRtl);
                 }
                 if (effects.length > 0) cmView.dispatch({effects});
            }
        }
    }
  
    let htmlOutput = '';

    $: (async () => {
      if (typeof markdownInput === 'string') {
        try {
          const file = await processor.process(markdownInput);
          htmlOutput = String(file);
        } catch (error) {
          console.error("Error processing markdown:", error);
          htmlOutput = "<p>Error processing Markdown. Check console for details.</p>";
        }
      }
    })();

    $: showEditorPane = !isReadOnly || showEditorPaneInReadOnly;
    $: editorPaneInitialRatio = showEditorPane ? 0.5 : 0;

    $: if (typeof window !== 'undefined' && editorHostEl ) {
        if (showEditorPane && !cmView) {
            setupCodeMirror(markdownInput, isReadOnly);
        } else if (!showEditorPane && cmView) { 
            cmView.scrollDOM.removeEventListener('scroll', handleScroll);
            cmView.destroy();
            cmView = undefined;
        }
    }
    
    $: if (typeof window !== 'undefined') {
        if (!isLoading && allowSessionSaving) {
          saveSession(); 
        }
    }
    
    $: if (typeof markdownInput === 'string' && typeof window !== 'undefined' && !isLoading && allowSessionSaving) {
        saveSession(); 
    }

    async function actionRestoreSession() {
      showRestoreDialog = false;
      isLoading = true;
      await tick(); 

      await loadSession(); 
      isReadOnly = false;

      if (showEditorPane && editorHostEl) {
        if (cmView) {
          if (cmView.state.doc.toString() !== markdownInput) {
            cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: markdownInput } });
          }
          const targetDir = isRtl ? 'rtl' : 'ltr';
          let effects: StateEffect<unknown>[] = [];
          if (cmView.state.facet(EditorState.readOnly) !== isReadOnly) { 
            effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)));
          }
          if (cmView.contentDOM.getAttribute('dir') !== targetDir) {
            effects.push(directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: targetDir })));
            editorHostEl?.classList.toggle('cm-rtl', isRtl);
            editorHostEl?.classList.toggle('cm-ltr', !isRtl);
          }
          if (effects.length > 0) cmView.dispatch({effects});
        } else {
          setupCodeMirror(markdownInput, isReadOnly);
        }
      } else if (!showEditorPane && cmView) { 
        cmView.scrollDOM.removeEventListener('scroll', handleScroll);
        cmView.destroy();
        cmView = undefined;
      }
      await changeTheme(currentHljsTheme);
      isLoading = false;
      allowSessionSaving = true; 
      primeForSavingOnNextEditAfterShareLoad = false;
      await tick();
      if (showEditorPane) {
        setTimeout(() => handleScroll(), 50);
      }
    }

    async function actionStartNewSession() {
      showRestoreDialog = false;
      isLoading = true;
      await tick();

      markdownInput = INITIAL_MARKDOWN;
      isRtl = false;
      currentHljsTheme = 'default';
      isVerticalSplit = false;
      isReadOnly = false; 

      if (showEditorPane && editorHostEl) {
        setupCodeMirror(markdownInput, isReadOnly); 
      } else if (!showEditorPane && cmView) { 
         cmView.scrollDOM.removeEventListener('scroll', handleScroll);
         cmView.destroy();
         cmView = undefined;
      }
      await changeTheme(currentHljsTheme);
      isLoading = false;
      allowSessionSaving = true; 
      primeForSavingOnNextEditAfterShareLoad = false;
      await tick();
      if (showEditorPane) {
         setTimeout(() => handleScroll(), 50);
      }
    }
</script>

<!-- svelte:head must be a top-level element -->
<svelte:head>
  <title>Markdown Editor {isReadOnly ? '(Read-Only)' : ''}</title>
  <!-- Remove existing Google Font links -->
  <!-- <link rel="preconnect" href="https://fonts.googleapis.com"> -->
  <!-- <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"> -->
  <!-- <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Roboto:wght@400;700&display=swap" rel="stylesheet"> -->
</svelte:head>
  
{#if isLoading}
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-100">
    <div class="text-2xl font-semibold text-gray-700">Preparing editor...</div>
    <svg class="mt-4 h-12 w-12 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  </div>
{:else if showRestoreDialog}
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 bg-opacity-75 p-4" dir="ltr"> <!-- Ensure dialog is always LTR for consistency -->
    <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
      <h2 class="mb-4 text-center text-2xl font-semibold text-gray-800">Session Found</h2>
      <p class="mb-6 text-center text-gray-600">
        A previous editing session was found. Would you like to restore it or start a new one?
      </p>
      <div class="flex justify-around space-x-4">
        <button 
          on:click={actionRestoreSession} 
          class="flex-1 rounded-md bg-blue-600 px-6 py-3 text-lg font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150"
        >
          Restore Session
        </button>
        <button 
          on:click={actionStartNewSession} 
          class="flex-1 rounded-md bg-gray-200 px-6 py-3 text-lg font-medium text-gray-700 shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors duration-150"
        >
          Start New
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="flex h-screen flex-col" dir={isRtl ? 'rtl' : 'ltr'} style="font-family: {isRtl ? 'Noto Sans Arabic' : 'Inter'}, sans-serif;">
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
          <button title="Reset Editor & Session" on:click={clearSessionAndReset} class="rounded p-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500" disabled={isReadOnly}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5 align-middle">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
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
  
    <main class="flex flex-1 overflow-hidden bg-gray-100" class:pt-0={!isReadOnly || isVerticalSplit} dir={isRtl ? 'rtl' : 'ltr'} >
      <ResizablePanes 
        bind:vertical={isVerticalSplit} 
        initialRatio={editorPaneInitialRatio} 
        minLeftPixels={showEditorPane ? (isVerticalSplit ? 50 : 100) : 0} 
        minRightPixels={isVerticalSplit ? 50 : 100}
        disableResizer={isReadOnly}
      >
        <div slot="left" class="pane-a h-full w-full overflow-auto bg-white" style="{showEditorPane ? '' : 'display: none;'} /* Font will be inherited from parent .flex.h-screen */">
          {#if !isReadOnly && !isVerticalSplit && showEditorPane}
             <div class="p-2 text-sm font-semibold text-gray-600 {isRtl ? 'text-right' : 'text-left'}" style="/* Font will be inherited */">Editor</div>
          {/if}
          <div bind:this={editorHostEl} class="codemirror-host" style="height: {( !isReadOnly && !isVerticalSplit && showEditorPane) ? 'calc(100% - 2.5rem)' : '100%'}"></div>
        </div>
        <div slot="right" class="pane-b h-full w-full overflow-auto bg-gray-50 p-1 {isVerticalSplit ? 'md:p-4' : 'md:p-6'}">
          {#if !isReadOnly && !isVerticalSplit}
             <div class="pb-2 text-sm font-semibold text-gray-600 {isRtl ? 'text-right' : 'text-left'}" style="/* Font will be inherited */">Preview</div>
          {/if}
          <div 
            bind:this={previewEl} 
            class="prose {isRtl ? 'prose-rtl text-right' : 'text-left'} 
                   {isReadOnly && !isVerticalSplit ? 'max-w-[65rem] mx-auto' : 'max-w-none'} 
                   w-full h-full overflow-auto" 
            style="direction: {isRtl ? 'rtl' : 'ltr'}; /* Font will be inherited from parent .flex.h-screen */"
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
    /* font-family is now set on the main layout div for better specificity with RTL toggle */
  }

  :global(.prose) {
    font-family: inherit; /* Will inherit from body or parent with dir attribute */
  }
  :global(.prose[dir="rtl"]) {
    direction: rtl;
    text-align: right;
  }
  :global(.prose:not([dir="rtl"])) {
    direction: ltr;
    text-align: left;
  }

  /* Enhanced Prose Typography */
  :global(.prose) {
    font-size: 1.125rem; /* Approx 18px, good for readability */
    line-height: 1.6; /* Slightly reduced from 1.7 for tighter feel */
  }

  :global(.prose p) {
    margin-top: 0.75em; /* Reduced from 1.25em */
    margin-bottom: 0.75em; /* Reduced from 1.25em */
  }

  :global(.prose h1) {
    font-size: 2.25em; /* Slightly reduced from 2.5em */
    font-weight: 700;
    margin-top: 1em; /* Reduced from 1.5em */
    margin-bottom: 0.5em; /* Reduced from 0.75em */
    line-height: 1.2;
  }
  :global(.prose h2) {
    font-size: 1.75em; /* Slightly reduced from 2em */
    font-weight: 700;
    margin-top: 1.25em; /* Reduced from 1.75em */
    margin-bottom: 0.5em; /* Reduced from 0.75em */
    line-height: 1.3;
  }
  :global(.prose h3) {
    font-size: 1.375em; /* Slightly reduced from 1.5em */
    font-weight: 700;
    margin-top: 1.25em; /* Reduced from 1.75em */
    margin-bottom: 0.4em; /* Reduced from 0.6em */
    line-height: 1.4;
  }
  :global(.prose h4) {
    font-size: 1.125em; /* Slightly reduced from 1.25em, now same as base */
    font-weight: 700;
    margin-top: 1.25em; /* Reduced from 1.75em */
    margin-bottom: 0.3em; /* Reduced from 0.5em */
    line-height: 1.4;
  }

  :global(.prose hr) {
    margin-top: 1.75em; /* Reduced from 2.5em */
    margin-bottom: 1.75em; /* Reduced from 2.5em */
    border-top-width: 1px;
  }
  
  /* Standard Blockquote Styling (distinct from admonitions) */
  :global(.prose blockquote:not(.admonition)) {
    margin-top: 1.25em; /* Reduced from 1.75em */
    margin-bottom: 1.25em; /* Reduced from 1.75em */
    padding-top: 0.3em; /* Reduced from 0.5em */
    padding-bottom: 0.3em; /* Reduced from 0.5em */
    font-style: italic;
    color: #4b5563; /* gray-600 */
  }
  :global([dir="ltr"] .prose blockquote:not(.admonition)) {
    border-left-width: 0.25rem; /* 4px */
    border-left-color: #d1d5db; /* gray-300 */
    padding-left: 0.75em; /* Reduced from 1em */
    padding-right: 0;
  }
  :global([dir="rtl"] .prose blockquote:not(.admonition)) {
    border-right-width: 0.25rem; /* 4px */
    border-right-color: #d1d5db; /* gray-300 */
    padding-right: 0.75em; /* Reduced from 1em */
    padding-left: 0;
  }
  :global(.prose blockquote:not(.admonition) p:first-of-type::before) {
    content: none; /* Tailwind prose adds quotes, remove them for a cleaner style */
  }
  :global(.prose blockquote:not(.admonition) p:last-of-type::after) {
    content: none; /* Tailwind prose adds quotes, remove them */
  }

  :global(.prose ul, .prose ol) {
    margin-top: 0.75em; /* Reduced from 1.25em */
    margin-bottom: 0.75em; /* Reduced from 1.25em */
  }
  :global(.prose li) {
    margin-top: 0.2em; /* Reduced from 0.4em */
    margin-bottom: 0.2em; /* Reduced from 0.4em */
  }
  :global(.prose ul ul, .prose ul ol, .prose ol ul, .prose ol ol) {
    margin-top: 0.5em; /* Reduced from 0.75em */
    margin-bottom: 0.5em; /* Reduced from 0.75em */
  }

  :global(.prose a) {
    color: #2563eb; /* blue-600 */
    text-decoration: underline;
    text-decoration-color: #93c5fd; /* blue-300 */
    text-underline-offset: 2px;
    transition: color 0.2s ease-in-out, text-decoration-color 0.2s ease-in-out;
  }
  :global(.prose a:hover) {
    color: #1d4ed8; /* blue-700 */
    text-decoration-color: #3b82f6; /* blue-500 */
  }
  :global(.prose strong) {
    font-weight: 700;
  }
  :global(.prose code:not(pre code)) {
    font-size: 0.875em;
    padding: 0.2em 0.4em;
    margin: 0 0.1em;
    background-color: #e5e7eb; /* gray-200 */
    border-radius: 0.25rem;
    color: #374151; /* gray-700 */
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  }
  :global([dir="rtl"] .prose code:not(pre code)) {
     /* Ensure monospace font still applies */
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
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
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace !important;
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
  
  /* Admonition Styles */
  :global(.admonition) {
    padding: 0.75rem 1rem; /* Reduced from 1rem 1.25rem */
    margin-top: 1em; /* Reduced from 1.5em */
    margin-bottom: 1em; /* Reduced from 1.5em */
    border-radius: 0.375rem; /* rounded-md */
    background-color: #f9fafb; /* gray-50 */
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  :global([dir="ltr"] .prose .admonition) {
    border-left-width: 5px;
    border-left-style: solid;
    border-right-width: 0;
    border-right-style: none; /* Ensure no right border style in LTR */
  }

  :global([dir="rtl"] .prose .admonition) {
    border-right-width: 5px;
    border-right-style: solid;
    border-left-width: 0;
    border-left-style: none; /* Ensure no left border style in RTL */
  }

  :global(.admonition-title) {
    font-weight: 600; /* semibold */
    margin-bottom: 0.3em; /* Reduced from 0.5rem */
    font-size: 1.0em; /* Reduced from 1.125em, now same as base text in admonition */
  }
  :global(.admonition-content) {
    font-size: 0.95em; /* Slightly smaller than base to fit padding */
  }
  :global(.admonition-content > :first-child) {
    margin-top: 0;
  }
  :global(.admonition-content > :last-child) {
    margin-bottom: 0;
  }

  :global([dir="ltr"] .prose .admonition-note) {
    border-left-color: #3b82f6; /* blue-500 */
  }
  :global([dir="rtl"] .prose .admonition-note) {
    border-right-color: #3b82f6; /* blue-500 */
  }
  :global(.admonition-note) { /* Common background and title color */
    background-color: #eff6ff; /* blue-50 */
  }
  :global(.admonition-note .admonition-title) {
    color: #1d4ed8; /* blue-700 */
  }

  :global([dir="ltr"] .prose .admonition-tip) {
    border-left-color: #10b981; /* green-500 */
  }
  :global([dir="rtl"] .prose .admonition-tip) {
    border-right-color: #10b981; /* green-500 */
  }
  :global(.admonition-tip) { /* Common background and title color */
    background-color: #f0fdf4; /* green-50 */
  }
  :global(.admonition-tip .admonition-title) {
    color: #047857; /* green-700 */
  }

  :global([dir="ltr"] .prose .admonition-important) {
    border-left-color: #8b5cf6; /* violet-500 */
  }
  :global([dir="rtl"] .prose .admonition-important) {
    border-right-color: #8b5cf6; /* violet-500 */
  }
  :global(.admonition-important) { /* Common background and title color */
    background-color: #f5f3ff; /* violet-50 */
  }
  :global(.admonition-important .admonition-title) {
    color: #6d28d9; /* violet-700 */
  }

  :global([dir="ltr"] .prose .admonition-warning) {
    border-left-color: #f97316; /* orange-500 */
  }
  :global([dir="rtl"] .prose .admonition-warning) {
    border-right-color: #f97316; /* orange-500 */
  }
  :global(.admonition-warning) { /* Common background and title color */
    background-color: #fff7ed; /* orange-50 */
  }
  :global(.admonition-warning .admonition-title) {
    color: #c2410c; /* orange-700 */
  }

  :global([dir="ltr"] .prose .admonition-caution) {
    border-left-color: #ef4444; /* red-500 */
  }
  :global([dir="rtl"] .prose .admonition-caution) {
    border-right-color: #ef4444; /* red-500 */
  }
  :global(.admonition-caution) { /* Common background and title color */
    background-color: #fef2f2; /* red-50 */
  }
  :global(.admonition-caution .admonition-title) {
    color: #b91c1c; /* red-700 */
  }

  :global(mjx-container[jax="SVG"] > svg) {
    display: inline;
  }
</style>