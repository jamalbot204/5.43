
import React, { memo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGeminiApiStore } from '../../../store/useGeminiApiStore.ts';
import { useMessageStore } from '../../../store/useMessageStore.ts';
import { Button } from '../../ui/Button.tsx';

interface InteractiveChoicesProps {
    choices: string[];
}

const InteractiveChoiceButton: React.FC<{ choice: string; isLoading: boolean }> = memo(({ choice, isLoading }) => {
    const { handleSendMessage } = useGeminiApiStore();
    const setPendingInputText = useMessageStore(state => state.setPendingInputText);
    
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    const startPress = useCallback(() => {
        if (isLoading) return;
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            setPendingInputText(choice);
        }, 500); // 500ms for long press
    }, [choice, isLoading, setPendingInputText]);

    const cancelPress = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        cancelPress();
        if (!isLongPress.current && !isLoading) {
            handleSendMessage(choice);
        }
    }, [choice, isLoading, handleSendMessage, cancelPress]);

    return (
        <Button
            onMouseDown={startPress}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onClick={handleClick}
            disabled={isLoading}
            variant="outline"
            className="shadow-panel transition transform hover:scale-105 active:scale-95 markdown-content select-none"
        >
            <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({node, ...props}) => <span {...props} />,
                    a: ({node, ...props}) => <span className="underline decoration-dotted" {...props} />,
                    golden: ({node, children, ...props}: any) => <span className="text-amber-500 font-bold" {...props}>{children}</span>
                } as any}
            >
                {choice}
            </ReactMarkdown>
        </Button>
    );
});

const InteractiveChoices: React.FC<InteractiveChoicesProps> = memo(({ choices }) => {
    const { isLoading } = useGeminiApiStore();

    if (!choices || choices.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-3 animate-fade-in">
            {choices.map((choice, idx) => (
                <InteractiveChoiceButton key={idx} choice={choice} isLoading={isLoading} />
            ))}
        </div>
    );
});

export default InteractiveChoices;
