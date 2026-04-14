import React, { useMemo, memo } from 'react';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { ChatMessageRole } from '../../types.ts';

const SessionStats: React.FC = memo(() => {
    const { t } = useTranslation();
    // Only subscribe to messages array length and content changes
    const messages = useActiveChatStore(state => state.currentChatSession?.messages);

    const estimatedTokens = useMemo(() => {
        if (!messages || messages.length === 0) return 0;
        const totalWords = messages.reduce((sum, message) => {
            const words = message.content.trim().split(/\s+/).filter(Boolean).length;
            return sum + words;
        }, 0);
        return Math.round(totalWords * 1.5);
    }, [messages]);

    const messageCount = useMemo(() => {
        if (!messages) return 0;
        return messages.filter(m => m.role === ChatMessageRole.USER || m.role === ChatMessageRole.MODEL).length;
    }, [messages]);

    return (
        <div className="flex flex-col items-center">
            <p className="text-xs text-tint-sky-text font-mono">{t.estimatedTokens}: {estimatedTokens}</p>
            <p className="text-xs text-tint-indigo-text font-mono mt-0.5">Message Count: {messageCount}</p>
        </div>
    );
});

export default SessionStats;