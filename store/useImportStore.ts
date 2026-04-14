
import { create } from 'zustand';
import { useToastStore } from './useToastStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useChatListStore } from './useChatListStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useExportStore } from './useExportStore.ts';
import { useGlobalUiStore } from './useGlobalUiStore.ts';
import { usePromptButtonStore } from './usePromptButtonStore.ts';
import { useExternalModelsStore } from './useExternalModelsStore.ts';
import { ChatMessage, ChatSession, ChatMessageRole } from '../types.ts';
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { importWorkerService } from '../services/importWorkerService.ts';

// Helper to hydrate a simple message array into a full session structure
// (Used only for simple/legacy imports returned by worker fallback)
function hydrateSimpleImport(rawData: any): any[] {
    let messagesArray: any[] = [];

    // Case 1: Root is array [ {role, content}, ... ]
    if (Array.isArray(rawData)) {
        messagesArray = rawData;
    } 
    // Case 2: Root has messages array { messages: [...] }
    else if (rawData && typeof rawData === 'object' && Array.isArray(rawData.messages)) {
        messagesArray = rawData.messages;
    } else {
        return [];
    }

    // Validate if it looks like messages
    if (messagesArray.length === 0 || !messagesArray[0].role || !messagesArray[0].content) {
        return [];
    }

    const now = new Date();
    const sessionId = `chat-imp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Normalize messages
    const normalizedMessages: ChatMessage[] = messagesArray.map((msg, index) => {
        let role = ChatMessageRole.USER;
        const rawRole = String(msg.role || '').toLowerCase();
        
        if (['ai', 'assistant', 'model', 'bot'].includes(rawRole)) {
            role = ChatMessageRole.MODEL;
        }

        return {
            id: `msg-${Date.now()}-${index}`,
            role: role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: new Date(now.getTime() + index * 1000), // Stagger timestamps slightly
            attachments: [],
            isStreaming: false
        };
    });

    const firstUserMsg = normalizedMessages.find(m => m.role === ChatMessageRole.USER);
    const title = firstUserMsg ? (firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')) : "Imported Conversation";

    // Construct full session object matching the schema expected by the main importer
    const newSession: ChatSession = {
        id: sessionId,
        title: title,
        messages: normalizedMessages,
        createdAt: now,
        lastUpdatedAt: now,
        model: DEFAULT_MODEL_ID,
        settings: { 
            ...DEFAULT_SETTINGS, 
            safetySettings: [...DEFAULT_SAFETY_SETTINGS], 
            ttsSettings: { ...DEFAULT_TTS_SETTINGS }
        },
        isCharacterModeActive: false,
        aiCharacters: [],
        apiRequestLogs: [],
        githubRepoContext: null
    };

    return [newSession];
}

interface ImportStoreState {
  handleImportAll: () => Promise<void>;
}

export const useImportStore = create<ImportStoreState>(() => ({
  handleImportAll: async () => {
    const showToast = useToastStore.getState().showToast;
    const { startProgress, updateProgress, finishProgress } = useProgressStore.getState();
    const taskId = `import-${Date.now()}`;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      startProgress(taskId, 'Turbo Import', 'Starting worker...');
      
      try {
        // --- DELEGATE TO WORKER ---
        const result = await importWorkerService.runImport(file, (percent, msg) => {
            updateProgress(taskId, percent, msg);
        }, { defaultSettings: DEFAULT_SETTINGS, defaultModel: DEFAULT_MODEL_ID });

        // --- HANDLE FALLBACK OR COMPLETION ---
        if (result && typeof result === 'object' && result.simpleFallback) {
            // Worker detected simple JSON format, handed data back to main thread
            const simpleSessions = hydrateSimpleImport(result.data);
            if (simpleSessions.length > 0) {
                // Save manually since worker skipped simple format
                for (const session of simpleSessions) {
                    await dbService.addOrUpdateChatSession(session);
                }
                finishProgress(taskId, `Smart Import: ${simpleSessions.length} conversation imported.`, true);
            } else {
                throw new Error("Invalid format. Could not parse simple message array.");
            }
        } else {
            // Worker completed standard import successfully
            const count = typeof result === 'number' ? result : result.count;
            finishProgress(taskId, `Import Complete! ${count} chats restored.`, true);
            
            if (result && result.uiConfigToRestore) {
                const { theme, language } = result.uiConfigToRestore;
                if (theme && language) {
                    useGlobalUiStore.getState().setImportedUiConfig(theme, language);
                }
            }
        }

        // --- HOT RELOAD STORES ---
        // Since Worker wrote directly to IndexedDB, we must refresh all in-memory stores.
        const uiConfig = await dbService.getAppMetadata<any>('uiConfiguration'); // Check if UI config exists (legacy key name)
        
        // 1. Refresh UI Config (Theme/Lang) if present
        // Note: importWorkerService maps `uiConfiguration` from JSON to individual metadata keys if needed, 
        // but let's check global store refresh.
        // Actually, globalUiStore persists to localStorage usually, but our export puts it in JSON.
        // Ideally we should sync DB metadata back to Global Store if changed.
        // For now, we refresh the main data lists.
        
        await useChatListStore.getState().loadChatHistory();
        await useApiKeyStore.getState().loadKeysAndSettings();
        await useDataStore.getState().init(); 
        await useExportStore.getState().init(); 
        await usePromptButtonStore.getState().loadPromptButtons();
        await useExternalModelsStore.getState().init();
        
        // Refresh active chat if it exists in the new data
        const currentId = useActiveChatStore.getState().currentChatId;
        if (currentId) {
            const exists = await dbService.getChatSession(currentId);
            if (exists) {
                await useActiveChatStore.getState().selectChat(currentId);
            } else {
                // If current chat was overwritten or lost, reload default
                await useActiveChatStore.getState().loadActiveChatId();
            }
        } else {
            await useActiveChatStore.getState().loadActiveChatId();
        }
        
      } catch (err: any) { 
          finishProgress(taskId, `Import Failed: ${err.message}`, false); 
          console.error("Import Error:", err);
      }
    };
    input.click();
  },
}));
