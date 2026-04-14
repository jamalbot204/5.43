
import { create } from 'zustand';
import { ChatSession } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useChatListStore } from './useChatListStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useToastStore } from './useToastStore.ts';
import { DEFAULT_SETTINGS, DEFAULT_MODEL_ID } from '../constants.ts';
import { generateChatFingerprint } from '../services/utils.ts';

interface ActiveChatState {
  currentChatId: string | null;
  currentChatSession: ChatSession | null;
  loadActiveChatId: () => Promise<void>;
  selectChat: (id: string | null) => Promise<void>;
  updateCurrentChatSession: (updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
}

export const useActiveChatStore = create<ActiveChatState>((set, get) => ({
  currentChatId: null,
  currentChatSession: null,

  loadActiveChatId: async () => {
    try {
      const activeChatId = await dbService.getAppMetadata<string | null>(METADATA_KEYS.ACTIVE_CHAT_ID);
      const { chatHistory, createNewChat, injectChatSummary } = useChatListStore.getState();
      
      if (chatHistory.length === 0) {
        await createNewChat();
        return;
      }

      let validActiveChatId: string | null = null;

      if (activeChatId) {
        const existsInList = chatHistory.find(s => s.id === activeChatId);
        if (existsInList) {
          validActiveChatId = activeChatId;
        } else {
          // Orphaned active chat (exists in DB but not in the first page of summaries)
          const session = await dbService.getChatSession(activeChatId);
          if (session) {
            injectChatSummary(session);
            validActiveChatId = activeChatId;
          }
        }
      }

      if (!validActiveChatId) {
        validActiveChatId = chatHistory[0].id;
      }

      await get().selectChat(validActiveChatId);
    } catch (error) {
        console.error("Failed to load active chat ID from IndexedDB:", error);
        set({ currentChatId: null, currentChatSession: null });
    }
  },

  selectChat: async (id: string | null) => {
    const chatList = useChatListStore.getState().chatHistory;

    if (!id) {
        set({ currentChatId: null, currentChatSession: null });
        await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, null);
        return;
    }

    // Attempt to fetch full session details (including messages) from DB
    let fullSession: ChatSession | undefined;
    try {
        fullSession = await dbService.getChatSession(id);
    } catch (e) {
        console.error("Failed to fetch chat session from DB:", e);
    }

    // Fallback: If DB fetch fails or returns nothing (race condition or not persisted yet),
    // check the memory list. Note: The list usually contains summaries (empty messages),
    // so this is a robust fallback for metadata, but messages might be missing.
    if (!fullSession) {
        fullSession = chatList.find(s => s.id === id);
    }

    if (fullSession) {
        if (!fullSession.settings) fullSession.settings = DEFAULT_SETTINGS;
        if (!fullSession.model) fullSession.model = DEFAULT_MODEL_ID;
    }

    set({ 
      currentChatId: id, 
      currentChatSession: fullSession || null 
    });
    await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, id);
  },

  updateCurrentChatSession: async (updater) => {
    const { currentChatSession } = get();
    if (!currentChatSession) return;

    const oldCacheInfo = currentChatSession.manualCacheInfo;
    let wasCacheValid = false;
    if (oldCacheInfo) {
        const oldFingerprint = generateChatFingerprint(currentChatSession, oldCacheInfo.cachedMessageCount);
        wasCacheValid = oldFingerprint === oldCacheInfo.fingerprint;
    }

    const updatedSessionCandidate = updater(currentChatSession);
    if (updatedSessionCandidate === null) return; // No update

    const finalUpdatedSession = { ...updatedSessionCandidate, lastUpdatedAt: new Date() };
    
    if (oldCacheInfo && wasCacheValid && finalUpdatedSession.manualCacheInfo && finalUpdatedSession.manualCacheInfo.id === oldCacheInfo.id) {
        const newFingerprint = generateChatFingerprint(finalUpdatedSession, finalUpdatedSession.manualCacheInfo.cachedMessageCount);
        if (newFingerprint !== finalUpdatedSession.manualCacheInfo.fingerprint) {
            useToastStore.getState().showToast("Cache invalidated due to session changes. Please create a new cache.", "error");
        }
    }

    // Update the list store (List store will strip messages internally to keep it light)
    useChatListStore.getState().updateChatSessionInList(finalUpdatedSession);
    
    // Update self (Active store keeps full object)
    set({ currentChatSession: finalUpdatedSession });
  },
}));

let hasInitialized = false;
// This listener runs when isLoadingData changes to false in list store.
useChatListStore.subscribe(
  (state, prevState) => {
    if (state.isLoadingData !== prevState.isLoadingData && !state.isLoadingData && !hasInitialized) {
      useActiveChatStore.getState().loadActiveChatId();
      hasInitialized = true;
    }
  }
);