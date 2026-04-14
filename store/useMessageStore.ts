
import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore';
import { useDataStore } from './useDataStore';
import { useToastStore } from './useToastStore';
import { useEditorUI } from './ui/useEditorUI.ts'; // NEW
import { ChatMessage, ChatMessageRole } from '../types.ts';

interface MessageStoreState {
  visibleMessages: ChatMessage[];
  totalMessagesInSession: number;
  canLoadMore: boolean;
  scrollBottomTrigger: number;
  pendingInputText: string | null;
}

interface MessageStoreActions {
  loadMoreMessages: () => void;
  loadAllMessages: () => void;
  insertUserAiPairAfter: (afterMessageId: string) => Promise<void>;
  triggerScrollToBottom: () => void;
  setPendingInputText: (text: string | null) => void;
  _updateState: () => void; // Internal action to sync state
}

export const useMessageStore = create<MessageStoreState & MessageStoreActions>((set, get) => ({
  visibleMessages: [],
  totalMessagesInSession: 0,
  canLoadMore: false,
  scrollBottomTrigger: 0,
  pendingInputText: null,

  setPendingInputText: (text) => set({ pendingInputText: text }),

  _updateState: () => {
    const { currentChatSession } = useActiveChatStore.getState();

    if (!currentChatSession) {
      set({ visibleMessages: [], totalMessagesInSession: 0, canLoadMore: false });
      return;
    }

    const totalMessages = currentChatSession.messages.length;

    // Smart Scroll Update: We now load ALL messages to prevent virtualization jitter/jumping.
    // The virtualization library handles the performance.
    set({
      visibleMessages: currentChatSession.messages,
      totalMessagesInSession: totalMessages,
      canLoadMore: false, // Pagination disabled in favor of infinite local scroll
    });
  },

  loadMoreMessages: () => {
    // No-op: We load all messages by default now.
  },
  
  loadAllMessages: () => {
    // No-op: We load all messages by default now.
  },

  insertUserAiPairAfter: async (afterMessageId) => {
    const { updateCurrentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;
    const { openInjectedMessageEditModal } = useEditorUI.getState(); // UPDATED
    
    let success = false;
    let newUserId = '';
    let sessionId = '';

    await updateCurrentChatSession(session => {
      if (!session) return null;
      
      const afterMessageIndex = session.messages.findIndex(m => m.id === afterMessageId);
      if (afterMessageIndex === -1) {
        console.error("[MessageStore] Message to insert after not found:", afterMessageId);
        showToast("Error: Original message not found for injection.", "error");
        return session;
      }
      
      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}-empty-user-${Math.random().toString(36).substring(2, 9)}`,
        role: ChatMessageRole.USER,
        content: "",
        timestamp: new Date(),
        attachments: [],
        isStreaming: false,
        cachedAudioBuffers: null,
      };
      newUserId = newUserMessage.id;
      sessionId = session.id;

      const newAiMessage: ChatMessage = {
        id: `msg-${Date.now()}-empty-ai-${Math.random().toString(36).substring(2, 9)}`,
        role: ChatMessageRole.MODEL,
        content: "",
        timestamp: new Date(),
        attachments: [],
        isStreaming: false,
        cachedAudioBuffers: null,
        characterName: session.isCharacterModeActive && session.aiCharacters?.length ? session.aiCharacters[0].name : undefined,
      };

      const newMessages = [
        ...session.messages.slice(0, afterMessageIndex + 1),
        newUserMessage,
        newAiMessage,
        ...session.messages.slice(afterMessageIndex + 1),
      ];
      
      success = true; 
      return { ...session, messages: newMessages, lastUpdatedAt: new Date() };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    if (success) {
      showToast("Empty message pair inserted.", "success");
      openInjectedMessageEditModal({ sessionId, messageId: newUserId });
    }
  },

  triggerScrollToBottom: () => {
      set(state => ({ scrollBottomTrigger: state.scrollBottomTrigger + 1 }));
  }
}));

useActiveChatStore.subscribe(useMessageStore.getState()._updateState);

useMessageStore.getState()._updateState();