# On The Publish - Advanced Markdown Editor

"On The Publish" is a feature-rich, web-based Markdown editor built with SvelteKit, Vite, and Tailwind CSS. It provides a seamless editing experience with a live preview, resizable panes, and a host of advanced features designed for authors, developers, and anyone who works with Markdown.

The editor leverages CodeMirror 6 for an enhanced text editing experience, including syntax highlighting within Markdown, auto-pairing of brackets, and custom keybindings. Markdown processing is powered by the `unified` ecosystem, supporting GitHub Flavored Markdown (GFM), admonitions, MathJax for LaTeX rendering, and Mermaid.js for diagrams.

## Features

- **Live Preview**: Real-time rendering of Markdown as you type.
- **Resizable Panes**: Adjust the editor and preview pane sizes with a draggable divider.
- **Synchronized Scrolling**: Editor and preview panes scroll in sync.
- **CodeMirror 6 Editor**:
  - Markdown syntax highlighting.
  - Syntax highlighting for fenced code blocks (JavaScript, Python, etc.).
  - Auto-pairing of brackets, quotes, etc. (`*`, `_`, `()`, `[]`, `{}`).
  - Custom keybindings: `Ctrl+B` for bold, `Ctrl+I` for italics.
  - Line wrapping and placeholder text.
- **Rich Markdown Support (via `unified` and plugins)**:

  - **GitHub Flavored Markdown (GFM)**: Tables, strikethrough, task lists, etc.
  - **Admonitions/Callouts**: GitHub-style admonitions for notes, tips, warnings, etc.

    ```markdown
    > [!NOTE]
    > This is a note.

    > [!TIP]
    > This is a helpful tip!

    > [!WARNING]
    > Handle with care.
    ```

  - **MathJax for LaTeX**: Render mathematical formulas.
    - Inline: `$E = mc^2$`
    - Block:
      ```markdown
      $$
      \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
      $$
      ```
  - **Mermaid.js Diagrams**: Create diagrams from text.
    ````markdown
    ```mermaid
    graph TD;
        A-->B;
        A-->C;
        B-->D;
        C-->D;
    ```
    ````
    ```

    ```

- **Syntax Highlighting**: For both Markdown in the editor and code blocks in the preview (using Highlight.js themes).
- **Theme Selector**: Choose from various Highlight.js themes for code block styling in the preview.
- **RTL/LTR Support**: Toggle text direction for both editor and preview.
- **Split Orientation**: Switch between vertical and horizontal pane layouts.
- **Share Functionality**:
  - Generate a shareable link containing the compressed Markdown content and selected options (RTL, theme, read-only).
  - Open shared links to view or edit content.
- **Read-Only Mode**: View shared content without editing capabilities, presented in an article-like format.
- **Session Persistence**: Automatically saves your Markdown, text direction, theme, and split orientation to local storage. Prompts to restore on revisit.
- **Reset Option**: Clear the current session and start fresh.
- **Typographic Enhancements**: Uses self-hosted fonts (`Inter`, `Noto Sans Arabic`, `IBM Plex Mono`) and refined Tailwind CSS `prose` styles for readability.
- **Print Styles**: Optimized output for printing shared/read-only content.
- **Prerendered Routes**: Optimized for static deployment (e.g., GitHub Pages).

## Developing

Built with SvelteKit and Bun.

1.  **Install dependencies**:
    ```bash
    bun install
    ```
2.  **Start the development server**:
    ```bash
    bun run dev
    ```
    Or to open in a browser:
```bash
    bun run dev -- --open
```

## Building

To create a production version of the app:

```bash
bun run build
```

You can preview the production build with `bun run preview`.

The application is configured with `@sveltejs/adapter-static` and `paths.base` for deployment to subpaths like GitHub Pages. Ensure your deployment process correctly serves the contents of the `build` directory. For GitHub Pages, include a `.nojekyll` file in your `static` directory.

## Examples

See the `examples/` directory for Markdown files (`example_en.md` and `example_ar.md`) showcasing all supported features.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
