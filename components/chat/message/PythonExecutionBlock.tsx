import React, { memo, useState, Suspense } from 'react';
import { ToolInvocation } from '../../../types.ts';
import { CheckCircleIcon, XCircleIcon, ArrowDownTrayIcon, ExportBoxIcon } from '../../common/Icons.tsx';
import { Button } from '../../ui/Button.tsx';
import { Accordion } from '../../ui/Accordion.tsx';
import { Badge } from '../../ui/Badge.tsx';

// Lazy load CodeBlockHighlighter from common
const CodeBlockHighlighter = React.lazy(() => import('../../common/CodeBlockHighlighter.tsx'));

interface PythonExecutionBlockProps {
  invocation: ToolInvocation;
}

const PythonExecutionBlock: React.FC<PythonExecutionBlockProps> = memo(({ invocation }) => {
  const [isOutputDocked, setIsOutputDocked] = useState(false); 
  
  const { args, result, isError } = invocation;
  const code = args.code || '';

  const borderColor = isError ? 'border-tint-red-border/20' : 'border-tint-emerald-border/20';
  const bgColor = isError ? 'bg-tint-red-bg/10' : 'bg-tint-emerald-bg/10';
  const textColor = isError ? 'text-tint-red-text' : 'text-tint-emerald-text';
  const headerHover = isError ? 'hover:bg-tint-red-bg/80' : 'hover:bg-tint-emerald-bg/80';

  const toggleDocking = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOutputDocked(!isOutputDocked);
  };

  const OutputContent = () => (
      <pre className={`whitespace-pre-wrap break-all font-mono text-xs ${isError ? 'text-tint-red-text' : 'text-tint-emerald-text'} ${isOutputDocked ? 'p-3' : 'py-2 px-1'}`}>
          {result || <span className="text-text-tertiary italic">No output</span>}
      </pre>
  );

  return (
    <div className="w-full my-2 flex flex-col">
      <Accordion 
        defaultOpen={true}
        className={`${borderColor} ${bgColor} font-mono text-xs`}
        title={
          <div className="flex items-center space-x-2">
            <Badge variant={isError ? 'error' : 'success'}>PY</Badge>
            <span className={`font-semibold ${textColor}`}>
              {isError ? "Execution Error" : "Python Executed"}
            </span>
            <div className="flex items-center space-x-2 ml-2">
                <Button 
                    onClick={toggleDocking}
                    variant="ghost"
                    size="sm"
                    className={`p-1 rounded hover:bg-bg-hover ${textColor} opacity-70 hover:opacity-100 transition`}
                    title={isOutputDocked ? "Undock Output (Show in Chat)" : "Dock Output (Move to Box)"}
                    icon={isOutputDocked ? <ExportBoxIcon className="w-3.5 h-3.5" /> : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
                />

                <div className="w-px h-3 bg-border-base mx-1"></div>

                {isError ? <XCircleIcon className="w-4 h-4 text-tint-red-text" /> : <CheckCircleIcon className="w-4 h-4 text-tint-emerald-text" />}
            </div>
          </div>
        }
      >
        <div className="border-t border-border-base bg-bg-panel -mx-4 -my-3">
            <div className={`${isOutputDocked ? 'border-b border-border-base' : ''}`}>
                <div className="px-3 py-1 bg-transparent border-b border-border-base text-[10px] text-text-tertiary uppercase tracking-wider font-bold flex justify-between items-center">
                    <span>Input</span>
                </div>
                <div className="overflow-x-auto max-h-60 custom-scrollbar">
                    <Suspense fallback={<pre className="p-3 text-text-primary">{code}</pre>}>
                        <CodeBlockHighlighter language="python" codeString={code} />
                    </Suspense>
                </div>
            </div>

            {isOutputDocked && (
                <div className="animate-fade-in">
                    <div className="px-3 py-1 bg-transparent text-[10px] text-text-tertiary uppercase tracking-wider font-bold border-b border-border-base">Output</div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        <OutputContent />
                    </div>
                </div>
            )}
        </div>
      </Accordion>

      {!isOutputDocked && (
          <div className={`mt-1 ml-1 pl-3 border-l-2 ${borderColor} animate-fade-in`}>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-bold mb-1 opacity-70">Result</div>
              <OutputContent />
          </div>
      )}
    </div>
  );
});

export default PythonExecutionBlock;