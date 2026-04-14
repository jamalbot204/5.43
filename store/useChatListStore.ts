
import { create } from 'zustand';
import { ChatSession, UserDefinedDefaults, Attachment, AICharacter } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useToastStore } from './useToastStore.ts';
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { useHistorySelectionStore } from './useHistorySelectionStore.ts';

interface ChatListState {
  chatHistory: ChatSession[];
  isLoadingData: boolean;
  hasMoreChats: boolean;
  isFetchingMore: boolean;
  isFullHistoryLoaded: boolean;
  loadChatHistory: () => Promise<void>;
  loadMoreChats: () => Promise<void>;
  loadAllChatsForModals: () => Promise<void>;
  injectChatSummary: (session: ChatSession) => void;
  addChatSession: (session: ChatSession) => Promise<void>;
  deleteChat: (sessionId: string) => Promise<void>;
  deleteMultipleChats: (sessionIds: string[]) => Promise<void>;
  updateChatSessionInList: (session: ChatSession) => void;
  createNewChat: () => Promise<void>;
  duplicateChat: (originalSessionId: string) => Promise<void>;
}

export const useChatListStore = create<ChatListState>((set, get) => ({
  chatHistory: [],
  isLoadingData: true,
  hasMoreChats: false,
  isFetchingMore: false,
  isFullHistoryLoaded: false,

  loadChatHistory: async () => {
    set({ isLoadingData: true });
    try {
      // Changed to use pagination to avoid loading full history at once
      const sessions = await dbService.getChatSummariesPage(20);
      set({ 
        chatHistory: sessions, 
        isLoadingData: false, 
        hasMoreChats: sessions.length === 20,
        isFullHistoryLoaded: false
      });
    } catch (error) {
      console.error("Failed to load chat history:", error);
      set({ chatHistory: [], isLoadingData: false, hasMoreChats: false });
    }
  },

  loadMoreChats: async () => {
    const { isFetchingMore, hasMoreChats, chatHistory } = get();
    if (isFetchingMore || !hasMoreChats) return;

    set({ isFetchingMore: true });
    try {
      const lastItem = chatHistory[chatHistory.length - 1];
      const timestampMs = new Date(lastItem.lastUpdatedAt).getTime();
      
      const newSessions = await dbService.getChatSummariesPage(20, timestampMs);
      
      // Filter out duplicates (e.g. if a chat was injected)
      const existingIds = new Set(chatHistory.map(c => c.id));
      const filteredNewSessions = newSessions.filter(s => !existingIds.has(s.id));
      
      set({
        chatHistory: [...chatHistory, ...filteredNewSessions],
        hasMoreChats: newSessions.length === 20,
        isFetchingMore: false
      });
    } catch (error) {
      console.error("Failed to load more chats:", error);
      set({ isFetchingMore: false });
    }
  },

  loadAllChatsForModals: async () => {
    if (get().isFullHistoryLoaded) return;
    try {
      const sessions = await dbService.getAllChatSummariesFull();
      set({ 
        chatHistory: sessions, 
        isFullHistoryLoaded: true, 
        hasMoreChats: false 
      });
    } catch (error) {
      console.error("Failed to load all chats for modals:", error);
    }
  },

  injectChatSummary: (session: ChatSession) => {
    const summary = { ...session, messages: [] };
    const { chatHistory } = get();
    if (!chatHistory.find(s => s.id === session.id)) {
      set({ chatHistory: [summary, ...chatHistory] });
    }
  },

  addChatSession: async (session: ChatSession) => {
    await dbService.addOrUpdateChatSession(session);
    // Optimisation: Store only summary in the list state
    const sessionSummary = { ...session, messages: [] };
    set(state => ({
      chatHistory: [sessionSummary, ...state.chatHistory].sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
    }));
  },
  
  updateChatSessionInList: (updatedSession: ChatSession) => {
    // Ensure we store summary in state
    const sessionSummary = { ...updatedSession, messages: [] };
    set(state => ({
      chatHistory: state.chatHistory
        .map(s => s.id === updatedSession.id ? sessionSummary : s)
        .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
    }));
  },

  deleteChat: async (sessionId: string) => {
    const { currentChatId, selectChat } = useActiveChatStore.getState();
    const { cleanupOnChatDelete } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;
    const preDeleteHistory = get().chatHistory;

    // Cleanup vectors and AUDIO first
    const fullSession = await dbService.getChatSession(sessionId);
    if (fullSession && fullSession.messages.length > 0) {
        const messageIds = fullSession.messages.map(m => m.id);
        
        // 1. Delete Vectors
        await dbService.deleteVectors(messageIds);

        // 2. Delete Cached Audio (MP3s)
        const audioDeletePromises: Promise<void>[] = [];
        fullSession.messages.forEach(msg => {
            if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
                for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                    audioDeletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
                }
            }
        });
        if (audioDeletePromises.length > 0) {
            await Promise.all(audioDeletePromises).catch(err => console.error("Failed to cleanup audio for deleted chat:", err));
        }
    }

    await dbService.deleteChatSession(sessionId);
    set(state => ({
      chatHistory: state.chatHistory.filter(s => s.id !== sessionId)
    }));
    await cleanupOnChatDelete(sessionId);

    if (currentChatId === sessionId) {
      const postDeleteHistory = preDeleteHistory.filter(s => s.id !== sessionId);
      const sortedRemaining = [...postDeleteHistory].sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      await selectChat(sortedRemaining.length > 0 ? sortedRemaining[0].id : null);
    }
    showToast("Chat deleted!", "success");
  },

  deleteMultipleChats: async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;
    const { currentChatId, selectChat } = useActiveChatStore.getState();
    const { cleanupOnMultipleChatsDelete } = useDataStore.getState();
    const { resetHistorySelection } = useHistorySelectionStore.getState();
    const showToast = useToastStore.getState().showToast;
    const preDeleteHistory = get().chatHistory;

    // Cleanup vectors and AUDIO for all chats
    for (const id of sessionIds) {
        const fullSession = await dbService.getChatSession(id);
        if (fullSession && fullSession.messages.length > 0) {
            const messageIds = fullSession.messages.map(m => m.id);
            
            // 1. Delete Vectors
            await dbService.deleteVectors(messageIds);

            // 2. Delete Cached Audio
            const audioDeletePromises: Promise<void>[] = [];
            fullSession.messages.forEach(msg => {
                if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
                    for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                        audioDeletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
                    }
                }
            });
            if (audioDeletePromises.length > 0) {
                await Promise.all(audioDeletePromises).catch(err => console.error("Failed to cleanup audio for deleted chat batch:", err));
            }
        }
    }

    await dbService.deleteChatSessions(sessionIds);
    set(state => ({
      chatHistory: state.chatHistory.filter(s => !sessionIds.includes(s.id))
    }));
    await cleanupOnMultipleChatsDelete(sessionIds);

    // If current chat was deleted, select a new one
    if (currentChatId && sessionIds.includes(currentChatId)) {
        const postDeleteHistory = preDeleteHistory.filter(s => !sessionIds.includes(s.id));
        const sortedRemaining = [...postDeleteHistory].sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
        await selectChat(sortedRemaining.length > 0 ? sortedRemaining[0].id : null);
    }

    resetHistorySelection();
    showToast(`${sessionIds.length} chats deleted.`, "success");
  },

  createNewChat: async () => {
    const { addChatSession } = get();
    const { selectChat } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;

    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let initialModel = DEFAULT_MODEL_ID;
    let initialSettings = { ...DEFAULT_SETTINGS, safetySettings: [...DEFAULT_SAFETY_SETTINGS], ttsSettings: { ...DEFAULT_TTS_SETTINGS } };

    try {
        const storedUserDefaults = await dbService.getAppMetadata<UserDefinedDefaults>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS);
        if (storedUserDefaults) {
            initialModel = storedUserDefaults.model || DEFAULT_MODEL_ID;
            initialSettings = { ...DEFAULT_SETTINGS, ...storedUserDefaults.settings, safetySettings: storedUserDefaults.settings?.safetySettings?.length ? [...storedUserDefaults.settings.safetySettings] : [...DEFAULT_SAFETY_SETTINGS], ttsSettings: storedUserDefaults.settings?.ttsSettings || { ...DEFAULT_TTS_SETTINGS } };
        }
    } catch (e) { console.error("Failed to parse user-defined global defaults from IndexedDB", e); }
    
    const newSession: ChatSession = { id: newSessionId, title: 'New Chat', messages: [], createdAt: new Date(), lastUpdatedAt: new Date(), model: initialModel, settings: initialSettings, isCharacterModeActive: false, aiCharacters: [], apiRequestLogs: [], githubRepoContext: null };

    await addChatSession(newSession);
    await selectChat(newSession.id);
    
    showToast("New chat created!", "success");
  },

  duplicateChat: async (originalSessionId: string) => {
    const { addChatSession } = get();
    const { selectChat } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;

    // Fetch FULL session from DB because list only has summaries
    const originalSession = await dbService.getChatSession(originalSessionId);
    
    if (!originalSession) {
      console.error("Original session not found for duplication");
      showToast("Failed to duplicate: Original chat not found.", "error");
      return;
    }
    
    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newTitle = `${originalSession.title} (Copy)`;

    // 1. Create ID Map to track Old ID -> New ID
    const idMap = new Map<string, string>();

    // 2. Clone messages with new IDs and populate map
    const newMessages = originalSession.messages.map(msg => {
        const newMsgId = `msg-${Date.now()}-${msg.role}-${Math.random().toString(36).substring(2, 7)}`;
        idMap.set(msg.id, newMsgId);

        return { 
            ...msg, 
            id: newMsgId, 
            attachments: msg.attachments?.map(att => ({ 
                ...att, 
                id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`, 
                uploadState: (att.fileUri && att.uploadState === 'completed_cloud_upload') ? 'completed_cloud_upload' : (att.base64Data ? 'completed' : 'idle'), 
                statusMessage: (att.fileUri && att.uploadState === 'completed_cloud_upload') ? 'Cloud file (copied)' : (att.base64Data ? 'Local data (copied)' : undefined), 
                progress: undefined, 
                error: undefined, 
                isLoading: false 
            })) as Attachment[] | undefined, 
            cachedAudioBuffers: null, 
            cachedAudioSegmentCount: undefined, 
            ttsWordsPerSegmentCache: undefined, 
            exportedMessageAudioBase64: undefined, 
            timestamp: new Date(msg.timestamp) 
        };
    });

    // 3. Update Settings to point to new Anchor ID (if applicable)
    const newSettings = { ...(originalSession.settings || DEFAULT_SETTINGS) };
    if (newSettings.activeMemoryAnchorId && idMap.has(newSettings.activeMemoryAnchorId)) {
        newSettings.activeMemoryAnchorId = idMap.get(newSettings.activeMemoryAnchorId);
    }

    // 3b. MIGRATION: Ensure lastArchivedTimestamp is present if ID exists but timestamp missing
    if (!newSettings.lastArchivedTimestamp && newSettings.lastArchivedMessageId) {
        const lastArchivedMsg = originalSession.messages.find(m => m.id === newSettings.lastArchivedMessageId);
        if (lastArchivedMsg) {
            newSettings.lastArchivedTimestamp = new Date(lastArchivedMsg.timestamp).getTime();
        }
    }

    // 4. Update Memory History to point to new Related Message IDs
    let newMemoryHistory = originalSession.memoryHistory ? [...originalSession.memoryHistory] : undefined;
    if (newMemoryHistory) {
        newMemoryHistory = newMemoryHistory.map(snap => ({
            ...snap,
            relatedMessageId: snap.relatedMessageId && idMap.has(snap.relatedMessageId) 
                ? idMap.get(snap.relatedMessageId) 
                : snap.relatedMessageId
        }));
    }

    const newAiCharacters: AICharacter[] | undefined = originalSession.aiCharacters?.map(char => ({ ...char, id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` }));
    
    const duplicatedSession: ChatSession = { 
        ...originalSession, 
        id: newSessionId, 
        title: newTitle, 
        messages: newMessages, 
        settings: newSettings,
        memoryHistory: newMemoryHistory,
        aiCharacters: newAiCharacters, 
        createdAt: new Date(), 
        lastUpdatedAt: new Date(), 
        apiRequestLogs: [], 
        githubRepoContext: originalSession.githubRepoContext ? { ...originalSession.githubRepoContext } : null 
    };

    await addChatSession(duplicatedSession);
    await selectChat(newSessionId);
    showToast("Chat duplicated successfully!", "success");
  },
}));

// Initialize the store by loading the chat history from the database.
useChatListStore.getState().loadChatHistory();
