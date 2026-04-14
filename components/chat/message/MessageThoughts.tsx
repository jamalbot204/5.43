import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SparklesIcon } from '../../common/Icons.tsx';
import { useInteractionStore } from '../../../store/useInteractionStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Accordion } from '../../ui/Accordion.tsx';

interface MessageThoughtsProps {
  messageId: string;
  thoughts: string;
}

const remarkPluginsList = [remarkGfm];

const MessageThoughts: React.FC<MessageThoughtsProps> = memo(({ messageId, thoughts }) => {
  const applyEnhancedDraft = useInteractionStore(state => state.applyEnhancedDraft);

  const memoizedComponents = useMemo(() => ({
      golden: ({node, children, ...props}: any) => <span className="text-amber-500 font-bold" {...props}>{children}</span>,
      a: ({node, href, children, ...props}: any) => {
          if (href?.startsWith('#apply-draft-')) {
              const index = parseInt(href.replace('#apply-draft-', ''), 10);
              return (
                  <Button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); applyEnhancedDraft(messageId, index); }}
                      variant="secondary"
                      size="sm"
                      className="ml-3 px-2 py-0.5 text-[10px] font-bold bg-tint-indigo-bg/10 text-tint-indigo-text border border-tint-indigo-border/20 rounded hover:bg-bg-hover transition-colors cursor-pointer"
                  >
                      {children}
                  </Button>
              );
          }
          return <a target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>
      }
  }), [applyEnhancedDraft, messageId]);

  if (!thoughts) return null;

  return (
    <div className="w-full mb-1.5">
        <Accordion 
            title={<><SparklesIcon className="w-4 h-4 mr-2 text-brand-primary" /> Thoughts <span className="text-xs text-text-tertiary ml-1">(experimental)</span></>}
        >
            <div className="markdown-content max-h-48 overflow-y-auto">
                <ReactMarkdown 
                    remarkPlugins={remarkPluginsList}
                    components={memoizedComponents}
                >
                    {thoughts}
                </ReactMarkdown>
            </div>
        </Accordion>
    </div>
  );
});

export default MessageThoughts;