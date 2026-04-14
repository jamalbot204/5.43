
import { preprocessMessageContent } from './utils.ts';

/**
 * Helper to apply golden quote styling to raw HTML.
 * Parses HTML, finds text nodes with quotes, and wraps them in <span class="quoted-text">.
 * Skips <pre> and <code> blocks to protect code.
 */
function applyQuoteStylesToHtml(htmlString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      // Only process if it actually contains quotes
      if (text.includes('"')) {
        // Split by quotes: "some text" -> ["", "\"some text\"", ""]
        const parts = text.split(/("[^"\n]+")/g);
        
        if (parts.length > 1) {
          const fragment = document.createDocumentFragment();
          parts.forEach(part => {
            // Check if this part is a quoted string
            if (part.startsWith('"') && part.endsWith('"') && part.length >= 2) {
              const span = document.createElement('span');
              span.className = 'quoted-text';
              span.textContent = part;
              fragment.appendChild(span);
            } else {
              fragment.appendChild(document.createTextNode(part));
            }
          });
          node.parentNode?.replaceChild(fragment, node);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // SKIP code blocks and preformatted text
      if (el.tagName === 'PRE' || el.tagName === 'CODE') {
        return;
      }
      // Recursively process children
      // Convert childNodes to array because replaceChild mutates the live list
      Array.from(node.childNodes).forEach(child => processNode(child));
    }
  }

  // Process all top-level nodes in the body
  Array.from(doc.body.childNodes).forEach(child => processNode(child));
  
  return doc.body.innerHTML;
}

/**
 * Generates a PDF from a markdown string.
 * 
 * @param contentMarkdown The raw markdown content of the message.
 * @param filename The suggested filename for the PDF.
 */
export async function generateMessagePdf(contentMarkdown: string, filename: string): Promise<void> {
  // Dynamic import for marked to reduce initial bundle size
  const { marked } = await import('marked');
  
  // Preprocess content to handle custom headers and tags
  const processedContent = preprocessMessageContent(contentMarkdown);

  // Convert Markdown to HTML using marked to ensure clean structure
  const rawHtml = await marked.parse(processedContent);
  const contentHtml = applyQuoteStylesToHtml(rawHtml);
  
  // 1. Open a new visible window for the print preview
  const printWindow = window.open('', '_blank', 'width=900,height=1100,menubar=no,toolbar=no,location=no,status=no,titlebar=no,scrollbars=yes');
  
  if (!printWindow) {
    throw new Error("Popup window was blocked. Please allow popups for this site to export PDFs.");
  }

  // 2. Trigger print with the parsed HTML
  await triggerPrintWindow(printWindow, contentHtml, filename);
}

/**
 * Generates a PDF from a list of raw markdown strings.
 * Used for batch export where elements might not be in the DOM due to virtualization.
 * 
 * @param messagesContent Array of raw markdown strings.
 * @param filename The suggested filename.
 */
export async function generateBatchPdf(messagesContent: string[], filename: string): Promise<void> {
    // Dynamic import
    const { marked } = await import('marked');

    const printWindow = window.open('', '_blank', 'width=900,height=1100,menubar=no,toolbar=no,location=no,status=no,titlebar=no,scrollbars=yes');
  
    if (!printWindow) {
        throw new Error("Popup window was blocked. Please allow popups for this site to export PDFs.");
    }

    // Convert Markdown to HTML
    const htmlSegments = await Promise.all(messagesContent.map(async (msg) => {
        const processed = preprocessMessageContent(msg);
        const rawHtml = await marked.parse(processed);
        return applyQuoteStylesToHtml(rawHtml);
    }));

    // Join with a styled separator
    const contentHtml = htmlSegments.join('<hr class="message-separator" />');

    await triggerPrintWindow(printWindow, contentHtml, filename);
}

async function triggerPrintWindow(printWindow: Window, contentHtml: string, filename: string) {
    // Prepare styles with Aurora Theme influences
    const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
    
    :root {
      --primary-color: #5a62f5;
      --secondary-color: #4A80F7;
      --text-color: #333333;
      --code-bg: #1E1E1E;
      --code-text: #E0E0E0;
      --quote-bg: #f4f5ff;
      --quote-border: #5a62f5;
      --danger-color: #d32f2f; /* Red for headings */
      --accent-bold-color: #2563eb; /* Blue for bold */
      --italic-color: #22c55e; /* Green for emphasis */
    }

    body {
      font-family: 'Cairo', 'Amiri', sans-serif, system-ui;
      color: var(--text-color) !important;
      background-color: #fff !important;
      margin: 0;
      padding: 20px;
      direction: auto;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Main Markdown Container */
    .markdown-content { 
      font-size: 14px; 
      line-height: 1.6; 
    }

    /* Section Headers (Matches App UI: Emerald Style) */
    .section-header {
        width: 100%;
        margin-top: 1.5rem;
        margin-bottom: 1.5rem;
        padding: 0.75rem 1rem;
        background-color: #047857 !important; /* emerald-700 */
        color: #ffffff !important;
        font-weight: 700;
        border-radius: 0.5rem;
        border-inline-start: 4px solid #34d399 !important; /* emerald-400 */
        display: flex;
        align-items: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        page-break-inside: avoid;
    }
    .section-header span {
        margin-inline-end: 0.5rem;
        opacity: 0.8;
    }

    /* Headings - Colorful & Distinct */
    .markdown-content h1 { 
        color: var(--primary-color) !important;
        font-size: 26px; 
        font-weight: 800; 
        margin-top: 24px; 
        margin-bottom: 16px; 
        border-bottom: 2px solid #eee; 
        padding-bottom: 8px; 
        display: block; 
    }
    .markdown-content h2 { 
        color: var(--primary-color) !important;
        font-size: 22px; 
        font-weight: 700; 
        margin-top: 20px; 
        margin-bottom: 12px; 
        display: block; 
    }
    .markdown-content h3 { 
        color: var(--danger-color) !important; /* Red for h3 */
        font-size: 18px; 
        font-weight: 700; 
        margin-top: 16px; 
        margin-bottom: 8px; 
        display: block; 
    }
    .markdown-content h4, .markdown-content h5, .markdown-content h6 { 
        color: #6b7280 !important;
        font-size: 16px; 
        font-weight: 600; 
        margin-top: 14px; 
        margin-bottom: 8px; 
        display: block; 
    }

    /* Bold and Italics */
    .markdown-content strong, .markdown-content b { 
        font-weight: 700 !important; 
        color: var(--accent-bold-color) !important; /* Blue for bold */
    }
    .markdown-content em, .markdown-content i { 
        font-style: italic; 
        color: var(--italic-color) !important; /* Green for emphasis */
    }

    /* Quoted Text (Gold) */
    .quoted-text {
        color: #b45309 !important; /* Dark Amber for better print contrast */
        font-weight: 600;
    }

    /* Lists */
    .markdown-content ul { 
      list-style-type: disc !important; 
      padding-inline-start: 20px !important; 
      margin-bottom: 12px; 
      display: block;
    }
    .markdown-content ol { 
      list-style-type: decimal !important; 
      padding-inline-start: 20px !important; 
      margin-bottom: 12px; 
      display: block;
    }
    .markdown-content li { 
      display: list-item !important; 
      margin-bottom: 6px; 
      padding-inline-start: 5px;
    }
    .markdown-content li::marker {
        color: var(--primary-color); /* Color the bullets/numbers */
        font-weight: bold;
    }
    .markdown-content ul ul, .markdown-content ol ul { list-style-type: circle !important; }
    .markdown-content ol ol, .markdown-content ul ol { list-style-type: lower-latin !important; }

    /* Blockquotes - Aurora Style */
    .markdown-content blockquote { 
      border-inline-start: 4px solid var(--quote-border); 
      margin: 20px 0; 
      color: #4b5563; 
      font-style: italic; 
      background-color: var(--quote-bg) !important;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }

    /* Code Blocks - Dark Mode for contrast */
    .markdown-content pre { 
      background-color: var(--code-bg) !important;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--code-text) !important;
      page-break-inside: avoid;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      margin: 16px 0;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .markdown-content code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      background-color: #f3f4f6 !important;
      padding: 2px 6px;
      border-radius: 4px;
      color: #d63384 !important; /* Pinkish for inline code */
      font-size: 0.9em;
      border: 1px solid #e5e7eb;
    }
    .markdown-content pre code {
        background-color: transparent !important;
        color: inherit !important;
        padding: 0;
        border: none;
        font-size: 13px;
    }
    
    /* Tables */
    .markdown-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    .markdown-content th, .markdown-content td {
      border: 1px solid #e5e7eb;
      padding: 10px 14px;
      text-align: start;
    }
    .markdown-content th {
      background-color: var(--primary-color) !important;
      color: #ffffff !important;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
    }
    .markdown-content tr:nth-child(even) {
        background-color: #f9fafb !important;
    }

    /* Links */
    a { 
        color: var(--primary-color) !important; 
        text-decoration: none; 
        border-bottom: 1px dotted currentColor;
    }
    
    /* Paragraphs */
    .markdown-content p { 
        margin-bottom: 16px; 
        text-align: justify;
    }

    /* Separator for batch messages */
    .message-separator {
        border: 0;
        height: 2px;
        background: linear-gradient(to right, transparent, var(--primary-color), transparent);
        margin: 40px 0;
        display: block;
        opacity: 0.5;
    }
    
    /* Mermaid Diagrams */
    .mermaid {
        display: flex;
        justify-content: center;
        margin: 24px 0;
        padding: 10px;
        background-color: #fff;
    }

    @page { margin: 15mm; }
  `;

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="auto">
    <head>
      <title>${filename}</title>
      <style>${styles}</style>
    </head>
    <body>
      <div class="markdown-content">
        ${contentHtml}
      </div>
      
      <!-- Inject Mermaid JS -->
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default' });

        window.onload = async function() {
          // 1. Find all code blocks identified as mermaid by marked
          const mermaidCodes = document.querySelectorAll('code.language-mermaid');
          
          for (const codeElement of mermaidCodes) {
             const preElement = codeElement.parentElement;
             if (preElement && preElement.tagName === 'PRE') {
                 const div = document.createElement('div');
                 div.className = 'mermaid';
                 div.textContent = codeElement.textContent;
                 preElement.replaceWith(div);
             }
          }

          // 2. Wait for fonts
          await document.fonts.ready;

          // 3. Render Mermaid diagrams
          try {
            await mermaid.run({
                nodes: document.querySelectorAll('.mermaid')
            });
          } catch (e) {
            console.error("Mermaid rendering failed in print window:", e);
          }

          // 4. Trigger Print
          setTimeout(function() {
            try {
                window.focus();
                window.print();
            } catch(e) {
                console.error("Print error:", e);
            }
          }, 1000); // Buffer time for rendering
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
