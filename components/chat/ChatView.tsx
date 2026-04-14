
import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import ChatHeader from './ChatHeader.tsx';
import ChatMessageList, { ChatMessageListHandles } from './ChatMessageList.tsx';
import ChatInputArea from './ChatInputArea.tsx';

interface ChatViewProps {
    onEnterReadMode: (messageId: string) => void;
}

export interface ChatViewHandles {
    scrollToMessage: (messageId: string) => void;
}

const ChatView = memo(forwardRef<ChatViewHandles, ChatViewProps>(({ onEnterReadMode }, ref) => {
    const [isReorderingActive, setIsReorderingActive] = useState(false);
    const toggleReordering = useCallback(() => setIsReorderingActive(prev => !prev), []);
    const listRef = useRef<ChatMessageListHandles>(null);

    useImperativeHandle(ref, () => ({
        scrollToMessage: (messageId: string) => {
            listRef.current?.scrollToMessage(messageId);
        }
    }));

    return (
        <div className="flex flex-col h-full bg-transparent">
            <ChatHeader 
                isReorderingActive={isReorderingActive} 
                toggleReordering={toggleReordering} 
                onJumpToMessage={(id) => listRef.current?.scrollToMessage(id)}
            />
            <ChatMessageList ref={listRef} onEnterReadMode={onEnterReadMode} />
            <ChatInputArea isReorderingActive={isReorderingActive} />
        </div>
    );
}));

export default ChatView;
