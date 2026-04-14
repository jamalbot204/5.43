
import React, { useState, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import useAutoResizeTextarea from '../../../hooks/useAutoResizeTextarea.ts';
import { Textarea } from '../../ui/Textarea.tsx';

export interface ChatTextAreaHandle {
    getText: () => string;
    clear: () => void;
    setText: (text: string) => void;
    focus: () => void;
}

interface ChatTextAreaProps {
    placeholder: string;
    disabled: boolean;
    onSend: () => void;
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onEmptyChange: (isEmpty: boolean) => void;
}

const ChatTextArea = memo(forwardRef<ChatTextAreaHandle, ChatTextAreaProps>(({ 
    placeholder, 
    disabled, 
    onSend, 
    onPaste,
    onEmptyChange 
}, ref) => {
    const [inputMessage, setInputMessage] = useState('');
    const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(inputMessage);

    useImperativeHandle(ref, () => ({
        getText: () => inputMessage,
        clear: () => {
            setInputMessage('');
            // Ensure we notify parent it's empty now
            onEmptyChange(true);
        },
        setText: (text: string) => {
            setInputMessage(text);
            onEmptyChange(text.trim() === '');
        },
        focus: () => {
            textareaRef.current?.focus();
        }
    }));

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const wasEmpty = inputMessage.trim() === '';
        const isEmpty = newValue.trim() === '';
        
        setInputMessage(newValue);
        
        // Only notify parent if the empty state changes to minimize re-renders
        if (wasEmpty !== isEmpty) {
            onEmptyChange(isEmpty);
        }
    }, [inputMessage, onEmptyChange]);

    const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }, [onSend]);

    return (
        <Textarea 
            ref={textareaRef} 
            rows={1} 
            className="flex-grow p-2.5 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none resize-none hide-scrollbar text-sm sm:text-base leading-relaxed max-h-[200px] border-none shadow-none focus-visible:ring-0" 
            placeholder={placeholder} 
            value={inputMessage} 
            onChange={handleChange} 
            onKeyPress={handleKeyPress} 
            onPaste={onPaste} 
            disabled={disabled} 
            aria-label="Chat input" 
        />
    );
}));

export default ChatTextArea;
