
import { create } from 'zustand';
import { archiveChunk, formatChaptersToMarkdown } from '../services/archiverService.ts';
import { ArchivedChapter } from '../types.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import { ChatMessageRole, ChatMessage } from '../types.ts';
import * as dbService from '../services/dbService.ts';

const CHUNK_SIZE = 30; // Reduced chunk size slightly for better stability
const AUTO_ARCHIVE_THRESHOLD = 40;

export interface ChunkPreview {
    index: number; // 0-based index for logic
    displayId: number; // 1-based chapter number
    msgCount: number;
    previewText: string;
    selected: boolean;
    status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error';
}

interface ArchiverState {
  reviewMode: boolean; // Toggle between Config/Review view
  chunks: ChunkPreview[]; // List of potential chunks
  
  isProcessing: boolean;
  isPaused: boolean; 
  nextChunkIndex: number; 
  progress: number;
  currentStatus: string;
  chapters: ArchivedChapter[]; // Temporary storage for current session
  userName: string;
  charName: string;
  selectedModel: string;
  
  // Actions
  setNames: (user: string, char: string) => void;
  setModel: (model: string) => void;
  prepareArchiving: (resume?: boolean) => Promise<void>; 
  executeArchiving: () => Promise<void>; 
  toggleChunkSelection: (index: number) => void; 
  setAllChunksSelection: (selected: boolean) => void; 
  
  pauseArchiving: () => void; 
  cancelArchiving: () => void;
  resetArchiver: () => void;
  retryChapterGeneration: (chunkIndex: number) => Promise<void>; // Added
  
  // Auto Archiver
  generateIncrementalChapter: (manualTrigger?: boolean) => Promise<void>;

  // Story Manager CRUD
  saveGeneratedChaptersToStory: () => Promise<void>;
  updateChapter: (index: number, chapter: ArchivedChapter) => Promise<void>;
  deleteChapter: (index: number) => Promise<void>;
  deleteAllChapters: () => Promise<void>;
  reorderChapters: (newChapters: ArchivedChapter[]) => Promise<void>;
}

let abortController: AbortController | null = null;

// Helper: Filter messages that haven't been archived yet based on Timestamp or ID fallback
const getUnarchivedMessages = (allMessages: ChatMessage[], settings: any): ChatMessage[] => {
    const validMessages = allMessages.filter(m => m.role === ChatMessageRole.USER || m.role === ChatMessageRole.MODEL);
    
    if (settings.lastArchivedTimestamp) {
        // Robust Time-Based Filtering
        return validMessages.filter(m => new Date(m.timestamp).getTime() > settings.lastArchivedTimestamp);
    } 
    
    if (settings.lastArchivedMessageId) {
        // Legacy ID Fallback
        const foundIndex = validMessages.findIndex(m => m.id === settings.lastArchivedMessageId);
        if (foundIndex !== -1) {
            return validMessages.slice(foundIndex + 1);
        }
        // If ID not found (deleted/lost), we default to archiving everything to be safe/thorough,
        // or user can manually skip in review mode.
        return validMessages;
    }

    return validMessages;
};

export const useArchiverStore = create<ArchiverState>((set, get) => ({
  reviewMode: false,
  chunks: [],
  
  isProcessing: false,
  isPaused: false,
  nextChunkIndex: 0,
  progress: 0,
  currentStatus: "Ready",
  chapters: [],
  userName: "User",
  charName: "AI",
  selectedModel: 'gemini-2.5-flash',

  setNames: (user, char) => set({ userName: user, charName: char }),
  setModel: (model) => set({ selectedModel: model }),

  toggleChunkSelection: (index) => {
      set(state => {
          const newChunks = [...state.chunks];
          if (newChunks[index]) {
              newChunks[index].selected = !newChunks[index].selected;
          }
          return { chunks: newChunks };
      });
  },

  setAllChunksSelection: (selected) => {
      set(state => ({
          chunks: state.chunks.map(c => ({ ...c, selected }))
      }));
  },

  prepareArchiving: async (resume = false) => {
    const { currentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;

    if (resume) {
        get().executeArchiving();
        return;
    }

    const messagesToArchive = getUnarchivedMessages(currentChatSession.messages, currentChatSession.settings);
    
    if (messagesToArchive.length === 0) {
        useToastStore.getState().showToast("No new messages to archive.", "success");
        return;
    }

    const totalChunks = Math.ceil(messagesToArchive.length / CHUNK_SIZE);
    
    // Calculate start number based on MAX existing chapter number
    const existingChapters = currentChatSession.settings.archivedChapters || [];
    const maxChapterNum = existingChapters.reduce((max, c) => Math.max(max, c.chapterNumber || 0), 0);
    const startChapterNum = maxChapterNum + 1;
    
    const previews: ChunkPreview[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
        const startIdx = i * CHUNK_SIZE;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, messagesToArchive.length);
        const chunkMsgs = messagesToArchive.slice(startIdx, endIdx);
        
        let previewText = "";
        if (chunkMsgs.length > 0) {
            previewText = chunkMsgs[0].content.substring(0, 60) + "...";
        }

        previews.push({
            index: i,
            displayId: startChapterNum + i, // Continues cleanly from max chapter
            msgCount: chunkMsgs.length,
            previewText,
            selected: true,
            status: 'pending'
        });
    }

    set({ 
        reviewMode: true, 
        chunks: previews,
        chapters: [], 
        isProcessing: false, 
        isPaused: false, 
        nextChunkIndex: 0, 
        currentStatus: "Review Selection" 
    });
  },

  executeArchiving: async () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { activeApiKey } = useApiKeyStore.getState();
    const { startProgress, updateProgress, finishProgress } = useProgressStore.getState();
    const { logApiRequest } = useGeminiApiStore.getState();
    const { userName, charName, selectedModel, chunks } = get();

    if (!currentChatSession || !activeApiKey?.value) return;

    set({ isProcessing: true, isPaused: false, reviewMode: false }); 

    abortController = new AbortController();
    const taskId = `archiver-${currentChatSession.id}`;

    const messagesToProcess = getUnarchivedMessages(currentChatSession.messages, currentChatSession.settings);
    const totalChunks = chunks.length;
    
    startProgress(taskId, "Archiving Chat", "Processing chapters...", () => {
        get().cancelArchiving();
    });

    try {
        const startChunkIndex = get().nextChunkIndex;

        for (let i = startChunkIndex; i < totalChunks; i++) {
            const chunkInfo = chunks[i];

            if (get().isPaused) {
                set({ isProcessing: false, nextChunkIndex: i, currentStatus: `Paused at Chapter ${chunkInfo.displayId}.` });
                updateProgress(taskId, (i / totalChunks) * 100, `Paused at Chapter ${chunkInfo.displayId}`);
                return;
            }

            if (abortController?.signal.aborted) break;

            if (!chunkInfo.selected) {
                set(state => {
                    const newChunks = [...state.chunks];
                    newChunks[i].status = 'skipped';
                    return { chunks: newChunks };
                });
                continue; 
            }

            const chapterNum = chunkInfo.displayId;
            const statusMsg = `Processing Chapter ${chapterNum} (Msg count: ${chunkInfo.msgCount})...`;
            
            set(state => {
                const newChunks = [...state.chunks];
                newChunks[i].status = 'processing';
                return { currentStatus: statusMsg, progress: (i / totalChunks) * 100, chunks: newChunks };
            });
            
            updateProgress(taskId, (i / totalChunks) * 100, statusMsg);

            // Calculate slice based on the prepared messagesToProcess array
            const chunkStart = i * CHUNK_SIZE;
            const chunkEnd = chunkStart + CHUNK_SIZE;
            const chunkMessages = messagesToProcess.slice(chunkStart, chunkEnd);

            const currentModel = get().selectedModel;

            const chapter = await archiveChunk(
                activeApiKey.value,
                chunkMessages,
                userName,
                charName,
                currentModel,
                logApiRequest
            );

            chapter.chapterNumber = chapterNum;

            set(state => {
                const newChunks = [...state.chunks];
                newChunks[i].status = chapter.isError ? 'error' : 'completed';
                return { 
                    chapters: [...state.chapters, chapter],
                    chunks: newChunks
                };
            });
        }
        
        if (!get().isPaused && !abortController?.signal.aborted) {
            set({ isProcessing: false, isPaused: false, nextChunkIndex: 0, progress: 100, currentStatus: "Archiving Complete!" });
            finishProgress(taskId, "Archiving Complete! Save to Story.", true);
        }
    } catch (e: any) {
        set({ isProcessing: false, currentStatus: `Error: ${e.message}` });
        finishProgress(taskId, `Archiving Failed: ${e.message}`, false);
    } finally {
        if (!get().isPaused) {
            abortController = null;
        }
    }
  },

  retryChapterGeneration: async (chunkIndex: number) => {
      const { currentChatSession } = useActiveChatStore.getState();
      const { activeApiKey } = useApiKeyStore.getState();
      const { logApiRequest } = useGeminiApiStore.getState();
      const { userName, charName, selectedModel, chunks, chapters } = get();

      if (!currentChatSession || !activeApiKey?.value) return;

      // 1. Set status to processing
      set(state => {
          const newChunks = [...state.chunks];
          if (newChunks[chunkIndex]) {
              newChunks[chunkIndex].status = 'processing';
          }
          return { chunks: newChunks };
      });

      // 2. Re-slice messages
      const messagesToProcess = getUnarchivedMessages(currentChatSession.messages, currentChatSession.settings);

      const chunkStart = chunkIndex * CHUNK_SIZE;
      const chunkEnd = chunkStart + CHUNK_SIZE;
      const chunkMessages = messagesToProcess.slice(chunkStart, chunkEnd);

      if (chunkMessages.length === 0) {
          useToastStore.getState().showToast("Could not find messages for retry.", "error");
          set(state => {
              const newChunks = [...state.chunks];
              newChunks[chunkIndex].status = 'error';
              return { chunks: newChunks };
          });
          return;
      }

      // 3. Call API
      try {
          const chapter = await archiveChunk(
              activeApiKey.value,
              chunkMessages,
              userName,
              charName,
              selectedModel,
              logApiRequest
          );

          // Preserve chapter number from chunk info
          const chunkInfo = chunks[chunkIndex];
          chapter.chapterNumber = chunkInfo.displayId;

          // 4. Update State
          set(state => {
              const newChunks = [...state.chunks];
              newChunks[chunkIndex].status = chapter.isError ? 'error' : 'completed';
              
              const newChapters = [...state.chapters];
              // Find the correct index in chapters array that corresponds to this chunk
              const chapterIndex = newChapters.findIndex(c => c.chapterNumber === chunkInfo.displayId);
              
              if (chapterIndex !== -1) {
                  newChapters[chapterIndex] = chapter;
              } else {
                  newChapters.push(chapter);
                  newChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
              }

              return { 
                  chapters: newChapters,
                  chunks: newChunks
              };
          });
          
          if (!chapter.isError) {
              useToastStore.getState().showToast(`Chapter ${chunkInfo.displayId} retried successfully.`, "success");
          } else {
              useToastStore.getState().showToast(`Retry failed for Chapter ${chunkInfo.displayId}.`, "error");
          }

      } catch (e: any) {
          console.error("Retry logic failed:", e);
          set(state => {
              const newChunks = [...state.chunks];
              newChunks[chunkIndex].status = 'error';
              return { chunks: newChunks };
          });
          useToastStore.getState().showToast(`Retry exception: ${e.message}`, "error");
      }
  },

  pauseArchiving: () => {
      set({ isPaused: true, currentStatus: "Pausing after current chapter..." });
  },

  generateIncrementalChapter: async (manualTrigger = false) => {
      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings, updateMessages } = useDataStore.getState();
      const { activeApiKey } = useApiKeyStore.getState();
      const { showToast } = useToastStore.getState();
      const { logApiRequest } = useGeminiApiStore.getState();
      
      if (!currentChatSession || !activeApiKey?.value) return;
      if (get().isProcessing && !manualTrigger) return; 

      const settings = currentChatSession.settings;
      const pendingMessages = getUnarchivedMessages(currentChatSession.messages, settings);
      
      if (pendingMessages.length === 0) return;
      if (!manualTrigger && pendingMessages.length < AUTO_ARCHIVE_THRESHOLD) return;

      set({ isProcessing: true });
      showToast("Auto-Archiving next chapter in background...", "success");

      try {
          let uName = settings.archiverConfig?.userName || settings.contextUserName || "User";
          let cName = settings.archiverConfig?.characterName || "AI";
          
          if (!settings.archiverConfig && cName === "AI" && currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0) {
              cName = currentChatSession.aiCharacters[0].name;
          }

          const modelToUse = get().selectedModel; 

          // INCREMENTAL FIX: Respect CHUNK_SIZE even in auto mode to prevent giant batches
          const chunkEnd = Math.min(pendingMessages.length, CHUNK_SIZE);
          const messagesToProcess = pendingMessages.slice(0, chunkEnd);

          const chapter = await archiveChunk(
              activeApiKey.value,
              messagesToProcess,
              uName,
              cName,
              modelToUse,
              logApiRequest
          );

          if (chapter.isError) throw new Error(chapter.narrative);

          // Get current chapters list or init
          const currentChapters = [...(settings.archivedChapters || [])];
          
          // ROBUST Auto-incremental logic
          const maxChapterNum = currentChapters.reduce((max, c) => Math.max(max, c.chapterNumber || 0), 0);
          const newChapterCount = maxChapterNum + 1;
          
          chapter.chapterNumber = newChapterCount;

          const updatedChapters = [...currentChapters, chapter];

          // POINTER UPDATE: Use Timestamp + ID
          const lastProcessedMsg = messagesToProcess[messagesToProcess.length - 1];
          const newLastId = lastProcessedMsg.id;
          const newLastTimestamp = new Date(lastProcessedMsg.timestamp).getTime();

          const newSettings = {
              ...settings,
              archivedChapters: updatedChapters,
              lastArchivedMessageId: newLastId,
              lastArchivedTimestamp: newLastTimestamp, // Store timestamp for robustness
              archiveChapterCount: newChapterCount
          };

          await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
          await updateSettings(currentChatSession.id, newSettings);
          
          const systemMsg: ChatMessage = {
              id: `sys-arch-${Date.now()}`,
              role: ChatMessageRole.SYSTEM,
              content: `[Auto-Archiver] Chapter ${newChapterCount} "${chapter.title}" has been archived and added to the story manager.`,
              timestamp: new Date(),
              isSystemReminder: true
          };
          
          const finalMessages = [...currentChatSession.messages, systemMsg];
          await updateCurrentChatSession(s => s ? ({ ...s, messages: finalMessages }) : null);
          await updateMessages(currentChatSession.id, finalMessages);

          showToast(`Chapter ${newChapterCount} archived successfully.`, "success");

      } catch (e: any) {
          console.error("Auto Archive Failed:", e);
          showToast(`Auto-Archiver failed: ${e.message}`, "error");
      } finally {
          set({ isProcessing: false });
      }
  },

  saveGeneratedChaptersToStory: async () => {
      const { chapters, chunks } = get();
      if (chapters.length === 0) return;

      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings } = useDataStore.getState();
      
      if (!currentChatSession) return;

      // Filter out errors
      const validNewChapters = chapters.filter(c => !c.isError);
      if (validNewChapters.length === 0) {
          useToastStore.getState().showToast("No valid chapters to save.", "error");
          return;
      }

      // --- CALCULATE INTELLIGENT INCREMENTAL POINTER ---
      // We must determine the last message that corresponds to the chunks we are saving.
      const messagesToProcess = getUnarchivedMessages(currentChatSession.messages, currentChatSession.settings);

      // Find which chunks (indices) correspond to the chapters we are saving.
      const chapterNumbersSaved = new Set(validNewChapters.map(c => c.chapterNumber));
      
      let maxChunkIndexProcessed = -1;
      chunks.forEach((chunk, idx) => {
          if (chapterNumbersSaved.has(chunk.displayId)) {
              maxChunkIndexProcessed = Math.max(maxChunkIndexProcessed, idx);
          }
      });

      let newLastArchivedId = currentChatSession.settings.lastArchivedMessageId;
      let newLastArchivedTimestamp = currentChatSession.settings.lastArchivedTimestamp;

      if (maxChunkIndexProcessed !== -1) {
          // Calculate the message count up to the end of the last processed chunk
          let count = 0;
          for (let i = 0; i <= maxChunkIndexProcessed; i++) {
              count += chunks[i].msgCount;
          }
          
          // messagesToProcess is 0-indexed. The message at index (count - 1) is the last one processed.
          if (count > 0 && count <= messagesToProcess.length) {
              const lastMsg = messagesToProcess[count - 1];
              newLastArchivedId = lastMsg.id;
              newLastArchivedTimestamp = new Date(lastMsg.timestamp).getTime();
          } else if (count > messagesToProcess.length) {
              // Safety fallback: end of list
              const last = messagesToProcess[messagesToProcess.length - 1];
              if (last) {
                  newLastArchivedId = last.id;
                  newLastArchivedTimestamp = new Date(last.timestamp).getTime();
              }
          }
      }

      // --- MERGE CHAPTERS ---
      // Clone existing chapters to avoid direct mutation
      const currentChapters = [...(currentChatSession.settings.archivedChapters || [])];
      
      validNewChapters.forEach(newChap => {
          // Check if we have a chapter with this number (overwrite vs append)
          const existingIndex = currentChapters.findIndex(c => c.chapterNumber === newChap.chapterNumber);
          
          if (existingIndex !== -1) {
              currentChapters[existingIndex] = newChap;
          } else {
              currentChapters.push(newChap);
          }
      });

      // Sort to ensure proper order
      currentChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
      const newChapterCount = currentChapters.length > 0 ? currentChapters[currentChapters.length - 1].chapterNumber : 0;

      const newSettings = {
          ...currentChatSession.settings,
          archivedChapters: currentChapters,
          lastArchivedMessageId: newLastArchivedId, 
          lastArchivedTimestamp: newLastArchivedTimestamp, // Store timestamp
          archiveChapterCount: newChapterCount
      };

      await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
      await updateSettings(currentChatSession.id, newSettings);
      
      // Reset local state
      get().resetArchiver();
      useToastStore.getState().showToast(`${validNewChapters.length} chapters saved. Archive pointer updated.`, "success");
  },

  updateChapter: async (index: number, chapter: ArchivedChapter) => {
      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings } = useDataStore.getState();
      if (!currentChatSession) return;

      const currentChapters = [...(currentChatSession.settings.archivedChapters || [])];
      if (index >= 0 && index < currentChapters.length) {
          currentChapters[index] = chapter;
          const newSettings = { ...currentChatSession.settings, archivedChapters: currentChapters };
          await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
          await updateSettings(currentChatSession.id, newSettings);
      }
  },

  deleteChapter: async (index: number) => {
      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings } = useDataStore.getState();
      if (!currentChatSession) return;

      const currentChapters = [...(currentChatSession.settings.archivedChapters || [])];
      if (index >= 0 && index < currentChapters.length) {
          currentChapters.splice(index, 1);
          // Optional: Re-index numbers? Let's assume manual order matters more.
          const newSettings = { ...currentChatSession.settings, archivedChapters: currentChapters };
          await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
          await updateSettings(currentChatSession.id, newSettings);
      }
  },

  deleteAllChapters: async () => {
      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings } = useDataStore.getState();
      if (!currentChatSession) return;

      const newSettings = { ...currentChatSession.settings, archivedChapters: [] };
      await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
      await updateSettings(currentChatSession.id, newSettings);
  },

  reorderChapters: async (newChapters: ArchivedChapter[]) => {
      const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
      const { updateSettings } = useDataStore.getState();
      if (!currentChatSession) return;

      const newSettings = { ...currentChatSession.settings, archivedChapters: newChapters };
      await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
      await updateSettings(currentChatSession.id, newSettings);
  },

  cancelArchiving: () => {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    const { removeProgress } = useProgressStore.getState();
    set({ isProcessing: false, isPaused: false, nextChunkIndex: 0, currentStatus: "Cancelled by user.", reviewMode: false });
  },

  resetArchiver: () => {
      set({ 
          isProcessing: false, 
          isPaused: false,
          nextChunkIndex: 0,
          progress: 0, 
          currentStatus: "Ready", 
          chapters: [],
          reviewMode: false,
          chunks: []
      });
  }
}));
