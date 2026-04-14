import React, { memo } from 'react';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('typescript', typescript);

interface CodeBlockHighlighterProps {
  language: string;
  codeString: string;
}

const MAX_HIGHLIGHT_LENGTH = 20000;

const CodeBlockHighlighter: React.FC<CodeBlockHighlighterProps> = memo(({ language, codeString }) => {
  if (codeString.length > MAX_HIGHLIGHT_LENGTH) {
    return (
      <div className="text-sm font-mono text-text-tertiary p-4 overflow-x-auto bg-transparent">
        <div className="mb-2 text-[10px] text-tint-amber-text/80 uppercase tracking-widest font-bold flex items-center border-b border-tint-amber-border/10 pb-1">
          <span>⚠️ Highlighting Disabled (Large Content)</span>
        </div>
        <pre className="m-0 whitespace-pre-wrap break-words">{codeString}</pre>
      </div>
    );
  }

  return (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={language}
      PreTag="div"
      wrapLongLines={true}
      customStyle={{
        margin: 0,
        padding: '1rem',
        fontSize: '0.9em',
        backgroundColor: 'transparent',
        color: 'var(--text-secondary)'
      }}
      codeTagProps={{ style: { color: 'var(--text-primary)' } }}
    >
      {codeString}
    </SyntaxHighlighter>
  );
});

export default CodeBlockHighlighter;