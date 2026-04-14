
import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useConfirmationUI } from './ui/useConfirmationUI.ts'; 
import { useEditorUI } from './ui/useEditorUI.ts'; 
import { useSettingsUI } from './ui/useSettingsUI.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useSelectionStore } from './useSelectionStore.ts';
import { useAudioStore } from './useAudioStore.ts';
import { uploadFileViaApi, deleteFileViaApi } from '../services/llm/media.ts';
import { Attachment, ChatMessage, ChatSession, ChatMessageRole } from '../types.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import * as dbService from '../services/dbService.ts';
import * as pdfService from '../services/pdfService.ts';
import { sanitizeFilename } from '../services/utils.ts';
import { translations } from '../translations.ts';
import { useGlobalUiStore } from './useGlobalUiStore.ts';
import { useMessageStore } from './useMessageStore.ts';
import { useChatListStore } from './useChatListStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import { mapMessagesToGeminiHistoryInternal } from '../services/llm/history.ts';

function base64StringToFile(base64String: string, filename: string, mimeType: string): File {
  try {
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
  } catch (error) {
    console.error("Error in base64StringToFile:", error);
    throw new Error("Failed to convert base64 string to File object.");
  }
}

// --- STATE ROLLBACK HELPER ---
// Ensures memory consistency when messages are deleted.
// 1. Removes snapshots linked to deleted messages.
// 2. Reverts active memory content to the latest valid snapshot.
// 3. Resets the activeMemoryAnchorId to the latest valid snapshot's related message.
const performMemoryRollback = (session: ChatSession, deletedMessageIds: string[]): ChatSession => {
    const deletedSet = new Set(deletedMessageIds);

    // If history is empty, just ensure anchor isn't dangling
    if (!session.memoryHistory || session.memoryHistory.length === 0) {
        if (session.settings.activeMemoryAnchorId && deletedSet.has(session.settings.activeMemoryAnchorId)) {
             return {
                ...session,
                settings: {
                    ...session.settings,
                    activeMemoryAnchorId: undefined,
                    memoryBoxContent: "{}" // Reset content if anchor is gone and no history
                }
            };
        }
        return session;
    }
    
    // Filter out snapshots linked to deleted messages
    const filteredHistory = session.memoryHistory.filter(snap => {
        // If snapshot has a related message ID and that ID is being deleted, remove snapshot.
        if (snap.relatedMessageId && deletedSet.has(snap.relatedMessageId)) {
            return false;
        }
        return true;
    });

    // If history didn't change, return session as is (regarding memory structure)
    // BUT we must check if the *current anchor* was deleted, even if history list seems consistent (edge case)
    const currentAnchorDeleted = session.settings.activeMemoryAnchorId && deletedSet.has(session.settings.activeMemoryAnchorId);

    if (filteredHistory.length === session.memoryHistory.length && !currentAnchorDeleted) return session;

    console.log(`[Memory Rollback] Restoring state. Snapshots remaining: ${filteredHistory.length}`);

    // Determine new active content & anchor
    // The history is sorted new -> old. The new "current" is the first one in the filtered list.
    const latestSnapshot = filteredHistory.length > 0 ? filteredHistory[0] : null;
    const newContent = latestSnapshot ? latestSnapshot.content : "{}";
    const newAnchorId = latestSnapshot ? latestSnapshot.relatedMessageId : undefined;

    return {
        ...session,
        memoryHistory: filteredHistory,
        settings: {
            ...session.settings,
            memoryBoxContent: newContent,
            activeMemoryAnchorId: newAnchorId
        }
    };
};

interface InteractionActions {
  copyMessage: (content: string) => Promise<boolean>;
  deleteSingleMessage: (messageId: string) => Promise<void>;
  deleteMessageAndSubsequent: (messageId: string) => Promise<void>;
  deleteMultipleMessages: (messageIds: string[]) => Promise<void>;
  clearApiLogs: () => Promise<void>;
  reUploadAttachment: (messageId: string, attachmentId: string) => Promise<void>;
  resetAudioCache: (messageId: string) => Promise<void>;
  toggleFavoriteMessage: (messageId: string) => Promise<void>;
  handleExportMessagePdf: (messageId: string, customElementId?: string) => void;
  handleExportBatchPdf: (messageIds: string[]) => void;
  handleMoveMessagesToChat: (targetChatId: string, messageIds: string[]) => Promise<void>;
  handleCompressChat: () => Promise<void>;
  applyEnhancedDraft: (messageId: string, draftIndex: number) => Promise<void>;
  deleteAttachment: (messageId: string, attachmentId: string) => Promise<void>;
}

export const useInteractionStore = create<InteractionActions>(() => ({
  copyMessage: async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      useToastStore.getState().showToast("Copied!", "success");
      return true;
    } catch (err) {
      console.error("Failed to copy message: ", err);
      useToastStore.getState().showToast("Failed to copy message.", "error");
      return false;
    }
  },

  deleteSingleMessage: async (messageId) => {
    const { handleStopAndCancelAllForCurrentAudio } = useAudioStore.getState();
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    const messageToDelete = currentChatSession?.messages.find(m => m.id === messageId);

    if (messageToDelete?.cachedAudioSegmentCount) {
        handleStopAndCancelAllForCurrentAudio();
        const deletePromises: Promise<void>[] = [];
        for (let i = 0; i < messageToDelete.cachedAudioSegmentCount; i++) {
            deletePromises.push(dbService.deleteAudioBuffer(`${messageToDelete.id}_part_${i}`));
        }
        await Promise.all(deletePromises).catch(console.error);
    }

    await dbService.deleteVector(messageId);

    await updateCurrentChatSession((session) => {
      if (!session) return null;
      const newMessages = session.messages.filter(m => m.id !== messageId);
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        delete newTimesState[messageId];
        return newTimesState;
      }).catch(console.error);

      // Apply Memory Rollback
      const sessionWithRollback = performMemoryRollback({ ...session, messages: newMessages }, [messageId]);

      return sessionWithRollback;
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    useToastStore.getState().showToast("Message deleted.", "success");
  },

  deleteMessageAndSubsequent: async (messageId) => {
    const { handleStopAndCancelAllForCurrentAudio } = useAudioStore.getState();
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    
    const messageIndex = currentChatSession?.messages.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentChatSession) return;
    
    const messagesToDelete = currentChatSession.messages.slice(messageIndex);

    if (messagesToDelete.some(m => m.cachedAudioSegmentCount)) {
        handleStopAndCancelAllForCurrentAudio();
    }
    
    const deletePromises: Promise<void>[] = [];
    messagesToDelete.forEach(msg => {
        if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
            for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
    });
    await Promise.all(deletePromises).catch(console.error);

    const idsToDelete = messagesToDelete.map(m => m.id);
    await dbService.deleteVectors(idsToDelete);

    await updateCurrentChatSession((session) => {
      if (!session) return null;
      const newMessages = session.messages.slice(0, messageIndex);
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messagesToDelete.forEach(msg => delete newTimesState[msg.id]);
        return newTimesState;
      }).catch(console.error);

      // Apply Memory Rollback
      const sessionWithRollback = performMemoryRollback({ ...session, messages: newMessages }, idsToDelete);

      return sessionWithRollback;
    });
    
    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    useMessageStore.getState().triggerScrollToBottom();
  },

  deleteMultipleMessages: async (messageIds) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    const { toggleSelectionMode } = useSelectionStore.getState();

    if (messageIds.length === 0 || !currentChatSession) return;

    const idSet = new Set(messageIds);
    const messagesToDelete = currentChatSession.messages.filter(m => idSet.has(m.id));

    const deletePromises: Promise<void>[] = [];
    messagesToDelete.forEach(msg => {
        if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
            for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
    });
    await Promise.all(deletePromises).catch(console.error);
    
    await dbService.deleteVectors(messageIds);

    await updateCurrentChatSession(session => {
      if (!session) return null;
      const newMessages = session.messages.filter(m => !idSet.has(m.id));
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messageIds.forEach(id => delete newTimesState[id]);
        return newTimesState;
      }).catch(console.error);
      
      // Apply Memory Rollback
      const sessionWithRollback = performMemoryRollback({ ...session, messages: newMessages }, messageIds);

      return sessionWithRollback;
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    useToastStore.getState().showToast(`${messageIds.length} message(s) deleted.`, "success");
    toggleSelectionMode();

    useMessageStore.getState().triggerScrollToBottom();
  },

  clearApiLogs: async () => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;
    await updateCurrentChatSession(session => session ? ({ ...session, apiRequestLogs: [] }) : null);
    useToastStore.getState().showToast("API logs cleared for this session.", "success");
  },

  resetAudioCache: async (messageId) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    if (!currentChatSession) return;

    const message = currentChatSession.messages.find(m => m.id === messageId);
    if (!message || !message.cachedAudioSegmentCount || message.cachedAudioSegmentCount === 0) {
        useToastStore.getState().showToast("No audio cache to reset.", "success");
        return;
    }

    const segmentCount = message.cachedAudioSegmentCount;

    const deletePromises: Promise<void>[] = [];
    for (let i = 0; i < segmentCount; i++) {
        deletePromises.push(dbService.deleteAudioBuffer(`${messageId}_part_${i}`));
    }
    await Promise.all(deletePromises);

    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;
      const updatedMessages = [...session.messages];
      const { cachedAudioBuffers, cachedAudioSegmentCount, ttsWordsPerSegmentCache, ...restOfMessage } = updatedMessages[messageIndex];
      updatedMessages[messageIndex] = restOfMessage as any;
      return { ...session, messages: updatedMessages };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if(updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }
    useToastStore.getState().showToast("Audio cache reset for message.", "success");
  },

  reUploadAttachment: async (messageId, attachmentId) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    const { activeApiKey } = useApiKeyStore.getState();
    const logApiRequest = useGeminiApiStore.getState().logApiRequest;
    const showToast = useToastStore.getState().showToast;
    const { updateMessages } = useDataStore.getState();
    
    if (!currentChatSession || !activeApiKey?.value) return;

    let originalAttachment: Attachment | undefined;
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;
      const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
      if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
      originalAttachment = session.messages[messageIndex].attachments![attachmentIndex];
      const updatedAttachments = [...session.messages[messageIndex].attachments!];
      updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: true, reUploadError: undefined, statusMessage: "Re-uploading..." };
      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
      return { ...session, messages: updatedMessages };
    });

    if (!originalAttachment || !originalAttachment.base64Data || !originalAttachment.mimeType) {
      showToast("Cannot re-upload: Missing original file data.", "error");
      await updateCurrentChatSession(session => {
         if (!session) return null;
          const messageIndex = session.messages.findIndex(m => m.id === messageId);
          if (messageIndex === -1) return session;
           const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
          if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
          const updatedAttachments = [...session.messages[messageIndex].attachments!];
            updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: false, reUploadError: "Missing original file data.", statusMessage: "Re-upload failed: data missing." };
            const updatedMessages = [...session.messages];
            updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
            return { ...session, messages: updatedMessages };
      });
      return;
    }

    try {
      const fileToReUpload = base64StringToFile(originalAttachment.base64Data, originalAttachment.name, originalAttachment.mimeType);
      const uploadResult = await uploadFileViaApi(activeApiKey.value, fileToReUpload, logApiRequest);
      if (uploadResult.error || !uploadResult.fileUri || !uploadResult.fileApiName) { throw new Error(uploadResult.error || "Failed to get new file URI from API."); }

      // DELETION LOGIC REMOVED HERE as per user request to keep old files on cloud.

      await updateCurrentChatSession(session => {
        if (!session) return null;
        const messageIndex = session.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return session;
        const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
        if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
        const updatedAttachments = [...session.messages[messageIndex].attachments!];
        updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], fileUri: uploadResult.fileUri, fileApiName: uploadResult.fileApiName, uploadState: 'completed_cloud_upload', statusMessage: 'Cloud URL refreshed.', isReUploading: false, reUploadError: undefined, error: undefined };
        const updatedMessages = [...session.messages];
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
        return { ...session, messages: updatedMessages };
      });
      
      const sessionAfterSuccess = useActiveChatStore.getState().currentChatSession;
      if (sessionAfterSuccess) {
          await updateMessages(sessionAfterSuccess.id, sessionAfterSuccess.messages);
      }

      showToast("File URL refreshed successfully!", "success");

    } catch (error: any) {
      console.error("Error re-uploading attachment:", error);
      showToast(`Re-upload failed: ${error.message || "Unknown error"}`, "error");
      await updateCurrentChatSession(session => {
        if (!session) return null;
        const messageIndex = session.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return session;
        const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
        if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
        const updatedAttachments = [...session.messages[messageIndex].attachments!];
        updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: false, reUploadError: error.message || "Unknown re-upload error.", statusMessage: "Re-upload failed." };
        const updatedMessages = [...session.messages];
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
        return { ...session, messages: updatedMessages };
      });
    }
  },

  deleteAttachment: async (messageId, attachmentId) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;

    if (!currentChatSession) return;

    let success = false;
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;

      const message = session.messages[messageIndex];
      if (!message.attachments) return session;

      const updatedAttachments = message.attachments.filter(a => a.id !== attachmentId);
      
      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = { ...message, attachments: updatedAttachments };
      success = true;
      return { ...session, messages: updatedMessages };
    });

    if (success) {
      const updatedSession = useActiveChatStore.getState().currentChatSession;
      if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
      }
      showToast("Attachment deleted.", "success");
    }
  },

  toggleFavoriteMessage: async (messageId: string) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;

    if (!currentChatSession) return;

    let isNowFavorited = false;

    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;

      const updatedMessages = [...session.messages];
      const currentMessage = updatedMessages[messageIndex];
      isNowFavorited = !(currentMessage.isFavorited ?? false);
      updatedMessages[messageIndex] = { ...currentMessage, isFavorited: isNowFavorited };
      
      return { ...session, messages: updatedMessages };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }
    
    showToast(isNowFavorited ? "Message added to favorites." : "Message removed from favorites.", "success");
  },

  handleExportMessagePdf: (messageId: string, _customElementId?: string) => {
    const lang = useGlobalUiStore.getState().language;
    const t = translations[lang];
    const { currentChatSession } = useActiveChatStore.getState();
    const message = currentChatSession?.messages.find(m => m.id === messageId);
    
    if (!message) return;

    const words = message.content.trim().split(/\s+/);
    const firstWords = words.slice(0, 5).join(' ');
    const defaultFilename = sanitizeFilename(firstWords, 30) || 'message_export';

    useEditorUI.getState().openFilenameInputModal({ 
        title: t.exportToPdf,
        defaultFilename,
        promptMessage: `${t.enterPdfFilename}:`,
        onSubmit: async (filename) => {
            useToastStore.getState().showToast(t.generatingPdf, "success", 3000);
            try {
                await pdfService.generateMessagePdf(message.content, filename);
                useToastStore.getState().showToast("PDF exported!", "success");
            } catch (error: any) {
                console.error("PDF Generation Error:", error);
                useToastStore.getState().showToast(`PDF Export Failed: ${error.message}`, "error");
            }
        }
    });
  },

  handleExportBatchPdf: (messageIds: string[]) => {
    const lang = useGlobalUiStore.getState().language;
    const t = translations[lang];
    const { currentChatSession } = useActiveChatStore.getState();
    
    if (!currentChatSession || messageIds.length === 0) return;

    const defaultFilename = `${sanitizeFilename(currentChatSession.title, 30)}_selection`;

    useEditorUI.getState().openFilenameInputModal({ 
        title: t.exportToPdf,
        defaultFilename,
        promptMessage: `${t.enterPdfFilename} (PDF):`,
        onSubmit: async (filename) => {
            useToastStore.getState().showToast(t.generatingPdf, "success", 3000);
            
            const messagesMap = new Map<string, ChatMessage>(currentChatSession.messages.map(m => [m.id, m]));
            const contentList: string[] = [];
            
            messageIds.forEach(id => {
                const msg = messagesMap.get(id);
                if (msg) {
                    contentList.push(msg.content);
                }
            });

            if (contentList.length === 0) {
                useToastStore.getState().showToast("No valid text content to export.", "error");
                return;
            }

            try {
                await pdfService.generateBatchPdf(contentList, filename);
                useToastStore.getState().showToast("Batch PDF exported!", "success");
                useSelectionStore.getState().toggleSelectionMode(); 
            } catch (error: any) {
                console.error("Batch PDF Generation Error:", error);
                useToastStore.getState().showToast(`PDF Export Failed: ${error.message}`, "error");
            }
        }
    });
  },

  handleMoveMessagesToChat: async (targetChatId: string, messageIds: string[]) => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { toggleSelectionMode } = useSelectionStore.getState();
    const showToast = useToastStore.getState().showToast;

    if (!currentChatSession || messageIds.length === 0) return;

    // 1. Get Source Messages
    const idSet = new Set(messageIds);
    const sourceMessages = currentChatSession.messages.filter(m => idSet.has(m.id));
    if (sourceMessages.length === 0) {
        showToast("No valid messages found to copy.", "error");
        return;
    }

    try {
        // 2. Fetch Target Session
        let targetSession = await dbService.getChatSession(targetChatId);
        if (!targetSession) throw new Error("Target chat not found.");

        // 3. Clone and Re-ID Messages (Standard "Forward" behavior: append to end)
        const now = Date.now();
        const copiedMessages: ChatMessage[] = sourceMessages.map((msg, index) => ({
            ...msg,
            id: `msg-${now}-${index}-${Math.random().toString(36).substring(2,7)}`, // New unique ID
            timestamp: new Date(now + index * 10), // Sequential timestamps at "now"
            // We strip runtime audio cache references because audio blobs are heavy and specific to IDs.
            // Text and Attachments (base64/URI) are preserved.
            cachedAudioBuffers: null, 
            cachedAudioSegmentCount: undefined,
            isStreaming: false, // Ensure valid state
            isSystemReminder: false, // Treat as normal content in new context usually
            hasMemoryUpdate: false, // Don't carry over active memory triggers directly
            isTimeMarker: false // Don't copy time markers
        }));

        // 4. Update Target Session
        targetSession.messages = [...targetSession.messages, ...copiedMessages];
        targetSession.lastUpdatedAt = new Date();

        await dbService.addOrUpdateChatSession(targetSession);
        
        // 5. Success
        showToast(`Copied ${sourceMessages.length} message(s) to "${targetSession.title}"`, "success");
        toggleSelectionMode();

    } catch (e: any) {
        console.error("Move messages failed:", e);
        showToast(`Failed to move messages: ${e.message}`, "error");
    }
  },

  handleCompressChat: async () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { addChatSession } = useChatListStore.getState();
    const { activeApiKey } = useApiKeyStore.getState();
    const { logApiRequest } = useGeminiApiStore.getState();
    const { startProgress, updateProgress, finishProgress } = useProgressStore.getState();

    if (!currentChatSession || !activeApiKey?.value) return;

    const taskId = `compress-${Date.now()}`;
    startProgress(taskId, "Compressing Chat", "Preparing...");

    try {
        // 1. Separate Messages
        const allMessages = currentChatSession.messages;
        
        // Define Thresholds for Head/Tail strategy
        const HEAD_SIZE = 100;
        const TAIL_SIZE = 100;
        
        // Ensure chat is long enough to justify this complex compression
        if (allMessages.length < (HEAD_SIZE + TAIL_SIZE + 50)) {
             finishProgress(taskId, "Chat is too short to compress effectively (need 250+ messages).", false);
             return;
        }

        const headMessages = allMessages.slice(0, HEAD_SIZE);
        const tailMessages = allMessages.slice(allMessages.length - TAIL_SIZE);
        const bodyMessages = allMessages.slice(HEAD_SIZE, allMessages.length - TAIL_SIZE);

        // 2. Format Body Messages for File (Middle Section)
        // We ensure we get the full history of the 'body' section without truncation from context window
        const dummySettings = { ...currentChatSession.settings, contextWindowMessages: 999999 };
        const historyData = mapMessagesToGeminiHistoryInternal(bodyMessages, dummySettings);
        
        // Transform structured history to plain text transcript
        const transcriptText = historyData.map(entry => {
            const roleLabel = entry.role === 'user' ? 'User' : 'Model'; 
            const partsText = entry.parts.map(p => {
                if (p.text) return p.text;
                if (p.inlineData) return `[Attachment: ${p.inlineData.mimeType}]`;
                if (p.fileData) return `[Attachment: ${p.fileData.mimeType}]`;
                return '';
            }).join('');
            return `[${roleLabel}]: ${partsText}`;
        }).join('\n\n');

        // 3. Create File
        const blob = new Blob([transcriptText], { type: 'text/plain' });
        const file = new File([blob], "context_history.txt", { type: "text/plain" });

        // Generate Data URL for local download/cache
        const dataUrlPromise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const fullDataUrl = await dataUrlPromise;
        const base64Content = fullDataUrl.split(',')[1];

        updateProgress(taskId, 30, "Uploading history context...");

        // 4. Upload File
        const uploadResult = await uploadFileViaApi(
            activeApiKey.value,
            file,
            logApiRequest,
            (_state, _name, _msg, progress) => {
                 if (progress) updateProgress(taskId, 30 + (progress * 0.5), "Uploading...");
            }
        );

        if (uploadResult.error || !uploadResult.fileUri) {
            throw new Error(uploadResult.error || "Upload failed");
        }

        updateProgress(taskId, 90, "Creating new session...");

        // 5. Construct New Session
        const newSessionId = `chat-compressed-${Date.now()}`;
        const newTitle = `${currentChatSession.title} (Compressed)`;

        // Head: Use shallow copy to keep original structure (Primacy Effect)
        const newHeadMessages = headMessages.map(m => ({...m}));

        // Bridge Message (Stealth Labeling)
        const bridgeMessage: ChatMessage = {
            id: `ctx-bridge-${Date.now()}`,
            role: ChatMessageRole.USER, // User role delivers the file payload
            content: "[SYSTEM_INTERNAL_LOG: SEQUENTIAL_MEMORY_BRIDGE]", // Stealth Label
            timestamp: new Date(),
            attachments: [{
                id: `att-${Date.now()}`,
                type: 'image', // Fallback type for compatibility but pointing to text file
                mimeType: 'text/plain',
                name: 'context_history.txt',
                size: file.size,
                fileUri: uploadResult.fileUri,
                fileApiName: uploadResult.fileApiName,
                uploadState: 'completed_cloud_upload',
                statusMessage: 'Context History',
                base64Data: base64Content,
                dataUrl: fullDataUrl
            }],
            isStreaming: false
        };

        // Tail: Clone with new IDs to treat as fresh context (Recency Effect)
        const newTailMessages: ChatMessage[] = tailMessages.map((m, idx) => ({
            ...m,
            id: `msg-tail-${Date.now()}-${idx}-${Math.random().toString(36).substring(2,7)}`,
            cachedAudioBuffers: null, // Reset audio cache for new IDs
            cachedAudioSegmentCount: undefined
        }));

        const newMessages = [...newHeadMessages, bridgeMessage, ...newTailMessages];

        const newSession: ChatSession = {
            ...currentChatSession,
            id: newSessionId,
            title: newTitle,
            messages: newMessages,
            createdAt: new Date(),
            lastUpdatedAt: new Date(),
            // Keep existing settings, characters, etc.
        };

        // 6. Save and Switch
        await addChatSession(newSession);
        // We need to use useActiveChatStore for selecting
        await useActiveChatStore.getState().selectChat(newSessionId);

        finishProgress(taskId, "Chat compressed successfully!", true);

    } catch (error: any) {
        finishProgress(taskId, `Compression failed: ${error.message}`, false);
    }
  },

  applyEnhancedDraft: async (messageId: string, draftIndex: number) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;

    if (!currentChatSession) return;

    let success = false;
    await updateCurrentChatSession(session => {
        if (!session) return null;
        const msgIndex = session.messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return session;

        const msg = session.messages[msgIndex];
        if (!msg.enhancedDrafts || !msg.enhancedDrafts[draftIndex]) {
            showToast("Draft not found.", "error");
            return session;
        }

        const updatedMessages = [...session.messages];
        updatedMessages[msgIndex] = { ...msg, content: msg.enhancedDrafts[draftIndex] };
        success = true;
        return { ...session, messages: updatedMessages };
    });

    if (success) {
        const updatedSession = useActiveChatStore.getState().currentChatSession;
        if (updatedSession) {
            await updateMessages(updatedSession.id, updatedSession.messages);
        }
        showToast("Draft applied successfully!", "success");
    }
  }
}));
