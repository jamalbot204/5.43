
import { create } from 'zustand';
import { useGeminiStatusStore } from './gemini/useGeminiStatusStore.ts';
import { useMessageSender } from './gemini/useMessageSender.ts';
import { useMessageRegenerator } from './gemini/useMessageRegenerator.ts';
import { useContentFixer } from './gemini/useContentFixer.ts';
import { 
    ChatMessage, GeminiSettings, Attachment,
    LogApiRequestCallback
} from '../types.ts';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/panels/EditMessagePanel.tsx';

// This is a Facade store.
// It aggregates functionality from the focused sub-stores to maintain
// backward compatibility with the existing UI components that import useGeminiApiStore.

interface GeminiApiState {
    isLoading: boolean;
    lastMessageHadAttachments: boolean;
}

interface GeminiApiActions {
    logApiRequest: LogApiRequestCallback;
    handleSendMessage: (
        promptContent: string,
        attachments?: Attachment[],
        historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string,
        isTemporaryContext?: boolean,
        settingsOverride?: Partial<GeminiSettings>,
        targetChatId?: string,
        modelOverrideId?: string
    ) => Promise<void>;
    handleContinueFlow: () => Promise<void>;
    handleCancelGeneration: () => Promise<void>;
    handleRegenerateAIMessage: (aiMessageIdToRegenerate: string, targetChatId?: string) => Promise<void>;
    handleRegenerateResponseForUserMessage: (userMessageId: string, targetChatId?: string) => Promise<void>;
    handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments?: Attachment[], keptAttachments?: Attachment[]) => Promise<void>;
    handleFixMermaidCode: (data: { messageId: string; badCode: string; fullContent: string }) => Promise<void>;
}

export const useGeminiApiStore = create<GeminiApiState & GeminiApiActions>((set, get) => {
    
    // Sync local state with the status store to allow components to subscribe
    useGeminiStatusStore.subscribe((state) => {
        set({ 
            isLoading: state.isLoading, 
            lastMessageHadAttachments: state.lastMessageHadAttachments 
        });
    });

    return {
        // State properties (synced above)
        isLoading: useGeminiStatusStore.getState().isLoading,
        lastMessageHadAttachments: useGeminiStatusStore.getState().lastMessageHadAttachments,

        // Methods delegated to sub-stores
        logApiRequest: (logDetails) => useGeminiStatusStore.getState().logApiRequest(logDetails),
        
        handleCancelGeneration: () => useGeminiStatusStore.getState().handleCancelGeneration(),
        
        handleSendMessage: (prompt, attachments, history, charId, isTemp, settings, targetChatId, modelOverrideId) => 
            useMessageSender.getState().handleSendMessage(prompt, attachments, history, charId, isTemp, settings, targetChatId, modelOverrideId),
            
        handleContinueFlow: () => useMessageSender.getState().handleContinueFlow(),
        
        handleRegenerateAIMessage: (id, targetChatId) => useMessageRegenerator.getState().handleRegenerateAIMessage(id, targetChatId),
        
        handleRegenerateResponseForUserMessage: (id, targetChatId) => useMessageRegenerator.getState().handleRegenerateResponseForUserMessage(id, targetChatId),
        
        handleEditPanelSubmit: (action, content, detail, att, kept) => 
            useContentFixer.getState().handleEditPanelSubmit(action, content, detail, att, kept),
            
        handleFixMermaidCode: (data) => useContentFixer.getState().handleFixMermaidCode(data),
    };
});