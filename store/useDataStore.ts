
import { create } from 'zustand';
import { ChatMessage, AICharacter, GeminiSettings, CustomMemoryStrategy } from '../types.ts';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useToastStore } from './useToastStore.ts';
import { useActiveChatStore } from './useActiveChatStore';
import { useChatListStore } from './useChatListStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import * as memoryService from '../services/memoryService.ts';
import { useExportStore } from './useExportStore.ts';

interface DataStoreState {
  messageGenerationTimes: Record<string, number>;
  customMemoryStrategies: CustomMemoryStrategy[];
  
  // Actions
  init: () => Promise<void>;
  cleanupOnChatDelete: (chatId: string) => Promise<void>;
  cleanupOnMultipleChatsDelete: (chatIds: string[]) => Promise<void>;
  setMessageGenerationTimes: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  addCustomStrategy: (strategy: CustomMemoryStrategy) => Promise<void>;
  updateCustomStrategy: (strategy: CustomMemoryStrategy) => Promise<void>; 
  deleteCustomStrategy: (id: string) => Promise<void>;
  
  // These remaining handlers are data-manipulation specific, so they stay here or could move to a useProcessingStore later
  handleEmbedSelectedChats: (chatIds: string[]) => Promise<void>;
  handleResetEmbedFlags: (chatIds: string[]) => Promise<void>;
  
  // DB Direct Updates
  updateTitle: (chatId: string, newTitle: string) => Promise<void>;
  updateMessages: (chatId: string, newMessages: ChatMessage[]) => Promise<void>;
  updateSettings: (chatId: string, newSettings: GeminiSettings) => Promise<void>;
  updateModel: (chatId: string, newModel: string) => Promise<void>;
  updateCharacters: (chatId: string, newCharacters: AICharacter[]) => Promise<void>;
  updateGithubContext: (chatId: string, newContext: any) => Promise<void>;
  updateChatPartnerRole: (chatId: string, role: string) => Promise<void>;
  cleanSystemReminders: (chatId: string) => Promise<void>;
}

export const useDataStore = create<DataStoreState>((set, get) => ({
  messageGenerationTimes: {},
  customMemoryStrategies: [],

  init: async () => {
    try {
        const storedGenTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES);
        if (storedGenTimes) set({ messageGenerationTimes: storedGenTimes });

        const storedStrategies = await dbService.getAppMetadata<CustomMemoryStrategy[]>(METADATA_KEYS.CUSTOM_MEMORY_STRATEGIES);
        if (storedStrategies) set({ customMemoryStrategies: storedStrategies });

    } catch (error) { console.error("Failed to load persisted app data:", error); }
  },
  
  setMessageGenerationTimes: async (updater) => {
    const newTimes = typeof updater === 'function' ? updater(get().messageGenerationTimes) : updater;
    set({ messageGenerationTimes: newTimes });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newTimes);
  },

  addCustomStrategy: async (strategy) => {
    const newStrategies = [...get().customMemoryStrategies, strategy];
    set({ customMemoryStrategies: newStrategies });
    await dbService.setAppMetadata(METADATA_KEYS.CUSTOM_MEMORY_STRATEGIES, newStrategies);
  },

  updateCustomStrategy: async (strategy) => {
    const newStrategies = get().customMemoryStrategies.map(s => s.id === strategy.id ? strategy : s);
    set({ customMemoryStrategies: newStrategies });
    await dbService.setAppMetadata(METADATA_KEYS.CUSTOM_MEMORY_STRATEGIES, newStrategies);
  },

  deleteCustomStrategy: async (id) => {
    const newStrategies = get().customMemoryStrategies.filter(s => s.id !== id);
    set({ customMemoryStrategies: newStrategies });
    await dbService.setAppMetadata(METADATA_KEYS.CUSTOM_MEMORY_STRATEGIES, newStrategies);
  },

  cleanupOnChatDelete: async (chatId) => {
    // No specific cleanup needed for display config anymore
  },

  cleanupOnMultipleChatsDelete: async (chatIds) => {
    const { messageGenerationTimes } = get();
    const newGenTimes = { ...messageGenerationTimes };
    set({ messageGenerationTimes: newGenTimes });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newGenTimes);
  },

  handleEmbedSelectedChats: async (chatIds) => {
    const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();
    const { activeApiKey } = useApiKeyStore.getState();
    const showToast = useToastStore.getState().showToast;
    if (!activeApiKey?.value) { showToast("API Key required.", "error"); return; }
    const taskId = `embed-${Date.now()}`;
    let isCancelled = false;
    startProgress(taskId, 'Embedding Chats', 'Preparing...', () => { isCancelled = true; });

    try {
        const allItemsToEmbed: any[] = [];
        const sessionsMap = new Map<string, any>();

        for (const id of chatIds) {
            if (isCancelled) break;
            const session = await dbService.getChatSession(id);
            if (!session) continue;
            sessionsMap.set(session.id, session);

            const eligibleMessages = session.messages.filter(m => (m.role === 'user' || m.role === 'model') && m.content?.length >= 10 && !m.isEmbedded);

            for (const msg of eligibleMessages) {
                let precedingText = undefined;
                if (msg.role === 'model') {
                    const msgIdx = session.messages.findIndex(m => m.id === msg.id);
                    for (let j = msgIdx - 1; j >= 0; j--) {
                        if (session.messages[j].role === 'user') {
                            precedingText = session.messages[j].content;
                            break;
                        }
                    }
                }
                let instr = session.settings.systemInstruction;
                if (session.isCharacterModeActive && msg.characterName) {
                    const char = session.aiCharacters?.find(c => c.name === msg.characterName);
                    if (char) instr = char.systemInstruction;
                }
                allItemsToEmbed.push({
                    message: msg,
                    context: { 
                        sessionId: session.id, 
                        sessionTitle: session.title, 
                        systemInstructionSnapshot: instr, 
                        precedingUserText: precedingText,
                        partnerRole: session.partnerRole
                    }
                });
            }
        }
        if (allItemsToEmbed.length === 0) { finishProgress(taskId, "All already embedded.", true); return; }

        const BATCH_SIZE = 100;
        let processedCount = 0;
        for (let i = 0; i < allItemsToEmbed.length; i += BATCH_SIZE) {
            if (isCancelled) break;
            const batch = allItemsToEmbed.slice(i, i + BATCH_SIZE);
            const successIds = await memoryService.indexMessagesBatch(activeApiKey.value, batch);
            const successSet = new Set(successIds);
            for (const item of batch) if (successSet.has(item.message.id)) item.message.isEmbedded = true;
            processedCount += batch.length;
            updateProgress(taskId, Math.round((processedCount / allItemsToEmbed.length) * 100));
        }
        if (isCancelled) { removeProgress(taskId); showToast("Cancelled.", "success"); }
        else {
            await Promise.all(Array.from(sessionsMap.values()).map(s => dbService.addOrUpdateChatSession(s)));
            finishProgress(taskId, `Embedded ${processedCount} messages.`, true);
        }
    } catch (error: any) { finishProgress(taskId, `Failed: ${error.message}`, false); }
  },

  handleResetEmbedFlags: async (chatIds) => {
    const showToast = useToastStore.getState().showToast;
    const { updateCurrentChatSession } = useActiveChatStore.getState();

    try {
        for (const id of chatIds) {
            const session = await dbService.getChatSession(id);
            if (!session) continue;

            const updatedSession = { ...session, messages: session.messages.map(m => ({ ...m, isEmbedded: false })) };
            
            if (useActiveChatStore.getState().currentChatId === id) {
                await updateCurrentChatSession(s => s ? ({ ...s, messages: updatedSession.messages }) : null);
            }
            await dbService.addOrUpdateChatSession(updatedSession);
        }
        showToast("Embedding flags reset. You can now re-embed these chats.", "success");
    } catch (e: any) {
        showToast(`Failed to reset flags: ${e.message}`, "error");
    }
  },

  updateTitle: async (chatId, newTitle) => { dbService.updateChatTitleInDB(chatId, newTitle).catch(console.error); },
  updateMessages: async (chatId, newMessages) => { dbService.updateMessagesInDB(chatId, newMessages).catch(console.error); },
  updateSettings: async (chatId, newSettings) => { dbService.updateSettingsInDB(chatId, newSettings).catch(console.error); },
  updateModel: async (chatId, newModel) => { dbService.updateModelInDB(chatId, newModel).catch(console.error); },
  updateCharacters: async (chatId, newCharacters) => { dbService.updateCharactersInDB(chatId, newCharacters).catch(console.error); },
  updateGithubContext: async (chatId, newContext) => { dbService.updateGithubContextInDB(chatId, newContext).catch(console.error); },
  updateChatPartnerRole: async (chatId: string, role: string) => {
    const session = await dbService.getChatSession(chatId);
    if (session) {
        const updatedSession = { ...session, partnerRole: role };
        await dbService.addOrUpdateChatSession(updatedSession);
        useChatListStore.getState().updateChatSessionInList(updatedSession);
        await dbService.updateSessionVectorMetadata(chatId, { partnerRole: role });
        useToastStore.getState().showToast("Partner role updated & memories indexed.", "success");
    }
  },
  cleanSystemReminders: async (chatId) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession || currentChatSession.id !== chatId) return;
    const newMessages = currentChatSession.messages.filter(msg => !msg.isSystemReminder);
    if (currentChatSession.messages.length - newMessages.length > 0) {
        const updatedSession = { ...currentChatSession, messages: newMessages };
        await updateCurrentChatSession(s => s ? ({ ...s, messages: newMessages }) : null);
        await dbService.addOrUpdateChatSession(updatedSession);
        useToastStore.getState().showToast("Cleaned!", "success");
    }
  }
}));

useDataStore.getState().init();