
import { create } from 'zustand';
import { geminiRefs } from './sharedRefs.ts';
import { useGenerationTimerStore } from '../useGenerationTimerStore.ts';
import { useActiveChatStore } from '../useActiveChatStore.ts';
import { useDataStore } from '../useDataStore.ts';
import { useChatListStore } from '../useChatListStore.ts';
import { useStreamingStore } from '../useStreamingStore.ts';
import { ApiRequestLog, LogApiRequestCallback, ChatMessageRole } from '../../types.ts';

interface GeminiStatusState {
    isLoading: boolean;
    lastMessageHadAttachments: boolean;
}

interface GeminiStatusActions {
    setIsLoading: (loading: boolean) => void;
    logApiRequest: LogApiRequestCallback;
    handleCancelGeneration: () => Promise<void>;
    setLastMessageHadAttachments: (hasAttachments: boolean) => void;
}

export const useGeminiStatusStore = create<GeminiStatusState & GeminiStatusActions>((set, get) => ({
    isLoading: false,
    lastMessageHadAttachments: false,

    setIsLoading: (loading: boolean) => {
        set({ isLoading: loading });
        if (loading) {
            geminiRefs.generationStartTime = Date.now();
            // Start the visual timer in the separate store
            useGenerationTimerStore.getState().startTimer();
        } else {
            geminiRefs.generationStartTime = null;
            // Stop the visual timer
            useGenerationTimerStore.getState().resetTimer();
        }
    },

    setLastMessageHadAttachments: (hasAttachments: boolean) => {
        set({ lastMessageHadAttachments: hasAttachments });
    },

    logApiRequest: (logDetails) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        if (currentChatSession && currentChatSession.settings.debugApiRequests) {
            const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
            updateCurrentChatSession(session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
        }
    },

    handleCancelGeneration: async () => {
        const { updateCurrentChatSession } = useActiveChatStore.getState();
        const { updateMessages } = useDataStore.getState();
        
        if (geminiRefs.abortController && !geminiRefs.abortController.signal.aborted) {
            geminiRefs.requestCancelledByUser = true;
            geminiRefs.abortController.abort();
        }

        get().setIsLoading(false);
        set({ lastMessageHadAttachments: false });
        geminiRefs.onFullResponseCalledForPendingMessage = false;
        
        const currentPendingMessageId = geminiRefs.pendingMessageId;
        const currentOriginalSnapshot = geminiRefs.originalMessageSnapshot;

        const { currentChatSession } = useActiveChatStore.getState();
        if (currentChatSession?.id && currentPendingMessageId) {
            await updateCurrentChatSession(session => {
                if (!session) return null;
                
                const pendingMsgIndex = session.messages.findIndex(msg => msg.id === currentPendingMessageId);
                if (pendingMsgIndex === -1) return session;

                const pendingMsg = session.messages[pendingMsgIndex];
                const hasPartialContent = pendingMsg.content && pendingMsg.content.trim().length > 0;

                if (hasPartialContent) {
                    // Keep partial content, finalize state
                    const updatedMessages = [...session.messages];
                    updatedMessages[pendingMsgIndex] = { ...pendingMsg, isStreaming: false };
                    return { ...session, messages: updatedMessages };
                } else {
                    // No content generated (or empty)
                    if (currentOriginalSnapshot && currentOriginalSnapshot.id === currentPendingMessageId) {
                        // Revert to snapshot (Regeneration case)
                        return { ...session, messages: session.messages.map(msg => msg.id === currentOriginalSnapshot.id ? currentOriginalSnapshot : msg) };
                    } else {
                        // Delete new empty message (New Generation case)
                        return { ...session, messages: session.messages.filter(msg => msg.id !== currentPendingMessageId) };
                    }
                }
            });

            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionAfterUpdate) {
                await updateMessages(sessionAfterUpdate.id, sessionAfterUpdate.messages);
            }
        }
        geminiRefs.pendingMessageId = null;
        geminiRefs.originalMessageSnapshot = null;
        
        // Clear streaming store immediately when user cancels
        useStreamingStore.getState().clearStreaming();
    },
}));
