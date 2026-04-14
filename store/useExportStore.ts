
import { create } from 'zustand';
import { ExportConfiguration, ChatSession, ChatMessage, Attachment, ChatMessageRole } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { DEFAULT_EXPORT_CONFIGURATION } from '../constants.ts';
import { useToastStore } from './useToastStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import { useEditorUI } from './ui/useEditorUI.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useGlobalUiStore } from './useGlobalUiStore.ts';
import { sanitizeFilename, triggerDownload } from '../services/utils.ts';
import * as audioUtils from '../services/audioUtils.ts';
import { audioWorkerService } from '../services/audioWorkerService.ts';
import { pythonWorkerService } from '../services/python/pythonWorker.ts';
import { bundleOfflineEnvironment } from '../services/python/offlineBundler.ts';
import { keepAliveService } from '../services/keepAliveService.ts';
import { exportWorkerService, ExportFile } from '../services/exportWorkerService.ts';

function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
}

interface ExportStoreState {
  isExporting: boolean;
  exportProgress: number;
  currentExportConfig: ExportConfiguration;
  
  // Actions
  init: () => Promise<void>;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  exportChatToTxt: () => void;
  handleBatchExportChatsToTxt: (chatIds: string[]) => Promise<void>;
  handleExportTrainingData: (chatIdsToExport: string[]) => Promise<void>;
}

export const useExportStore = create<ExportStoreState>((set, get) => ({
  isExporting: false,
  exportProgress: 0,
  currentExportConfig: DEFAULT_EXPORT_CONFIGURATION,

  init: async () => {
    try {
        const storedExportConfig = await dbService.getAppMetadata<ExportConfiguration>(METADATA_KEYS.EXPORT_CONFIGURATION);
        set({ currentExportConfig: storedExportConfig || DEFAULT_EXPORT_CONFIGURATION });
    } catch (error) {
        console.error("Failed to load export config:", error);
    }
  },

  setCurrentExportConfig: async (newConfig) => {
    set({ currentExportConfig: newConfig });
    await dbService.setAppMetadata(METADATA_KEYS.EXPORT_CONFIGURATION, newConfig);
  },

  handleExportChats: async (chatIdsToExport, exportConfig) => {
    if (get().isExporting) {
        useToastStore.getState().showToast("An export is already in progress.", "error");
        return;
    }
    const showToast = useToastStore.getState().showToast;
    const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();
    const { openFilenameInputModal } = useEditorUI.getState();

    const sessionsToExport: ChatSession[] = [];
    for (const id of chatIdsToExport) {
        const session = await dbService.getChatSession(id);
        if (session) sessionsToExport.push(session);
    }
    if (sessionsToExport.length === 0) { showToast("Selected chats could not be found.", "error"); return; }

    let defaultFilename = sessionsToExport.length === 1 ? sanitizeFilename(sessionsToExport[0].title, 100) : "";
    if (!defaultFilename) {
        const now = new Date();
        const datePart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
        defaultFilename = `gemini-chat-export-${datePart}_${timePart}`;
    }

    openFilenameInputModal({
        title: "Export to ZIP",
        defaultFilename,
        promptMessage: "Enter a filename for the ZIP archive.",
        onSubmit: async (baseFilename) => {
            const finalFilename = (baseFilename.trim() || defaultFilename) + '.zip';
            
            // Activate KeepAlive Worker to prevent throttling during heavy ops
            keepAliveService.start();

            set({ isExporting: true, exportProgress: 0 });
            const taskId = `export-${Date.now()}`;
            let isCancelled = false;
            startProgress(taskId, 'Exporting Chats', 'Preparing files...', () => { isCancelled = true; });

            try {
              // Instead of creating JSZip here, we gather all files into an array
              const exportFiles: ExportFile[] = [];
              
              // OFFLINE PYTHON BUNDLING
              if (exportConfig.includeOfflinePythonEnv) {
                  updateProgress(taskId, 5, "Analyzing Python environment...");
                  try {
                      // 1. Get manifest
                      const state = await pythonWorkerService.getEnvironmentState();
                      const packages = state.packages;
                      
                      // 2. Fetch Bundle
                      const files = await bundleOfflineEnvironment(packages, (prog, msg) => {
                          updateProgress(taskId, 5 + (prog * 0.2), `Python Env: ${msg}`);
                      });
                      
                      files.forEach(f => {
                          exportFiles.push({ path: `python_env/${f.name}`, content: f.blob });
                      });
                  } catch (e) {
                      console.warn("Offline Python bundling failed, continuing export without it.", e);
                      showToast("Offline Python environment export skipped due to error.", "error");
                  }
              }

              const processedSessionsForJson: Partial<ChatSession>[] = [];
              const vectorIdsToFetch: string[] = [];

              for (let i = 0; i < sessionsToExport.length; i++) {
                  if (isCancelled) break;
                  const session = sessionsToExport[i];
                  const prepProgress = 30 + ((i + 1) / sessionsToExport.length) * 40; // Adjust progress range
                  updateProgress(taskId, prepProgress, `Processing chat ${i + 1} of ${sessionsToExport.length}...`);
                  set({ exportProgress: Math.round(prepProgress) });

                  const processedSession: Partial<ChatSession> = { ...session };
                  if (!exportConfig.includeApiLogs) delete processedSession.apiRequestLogs;
                  processedSession.messages = await Promise.all(session.messages.map(async (message) => {
                      const processedMessage: Partial<ChatMessage> = { ...message };
                      if (message.isEmbedded) vectorIdsToFetch.push(message.id);
                      if (exportConfig.includeCachedMessageAudio && message.cachedAudioSegmentCount) {
                          processedMessage.audioFilePaths = [];
                          for (let j = 0; j < message.cachedAudioSegmentCount; j++) {
                              const audioBuffer = await dbService.getAudioBuffer(`${message.id}_part_${j}`);
                              if (audioBuffer) {
                                  const filename = `${message.id}_part_${j}.mp3`;
                                  // Re-encode if raw PCM, or use directly if MP3
                                  const finalBuffer = audioUtils.isMp3Buffer(audioBuffer) ? audioBuffer : await audioWorkerService.encodeMp3(audioBuffer, 24000);
                                  
                                  exportFiles.push({ path: `audio/${filename}`, content: finalBuffer });
                                  processedMessage.audioFilePaths.push(`audio/${filename}`);
                              }
                          }
                      }
                      delete processedMessage.cachedAudioSegmentCount;
                      delete processedMessage.cachedAudioBuffers;
                      if (!exportConfig.includeMessageContent) delete processedMessage.content;
                      if (!exportConfig.includeMessageTimestamps) delete processedMessage.timestamp;
                      if (!exportConfig.includeMessageRoleAndCharacterNames) { delete processedMessage.role; delete processedMessage.characterName; }
                      if (!exportConfig.includeGroundingMetadata) delete processedMessage.groundingMetadata;
                      if (!exportConfig.includeThoughts) delete processedMessage.thoughts;
                      if (message.attachments) {
                          if (!exportConfig.includeMessageAttachmentsMetadata) delete processedMessage.attachments;
                          else {
                              processedMessage.attachments = message.attachments.map(att => {
                                  const attachmentToExport: Partial<Attachment> = { ...att };
                                  if (exportConfig.includeFullAttachmentFileData && att.base64Data) {
                                      const blob = base64ToBlob(att.base64Data, att.mimeType);
                                      const filename = `${att.id}-${att.name}`;
                                      
                                      exportFiles.push({ path: `attachments/${filename}`, content: blob });
                                      attachmentToExport.filePath = `attachments/${filename}`;
                                  }
                                  delete attachmentToExport.base64Data;
                                  delete attachmentToExport.dataUrl;
                                  return attachmentToExport as Attachment;
                              });
                          }
                      }
                      return processedMessage as ChatMessage;
                  }));
                  if (!exportConfig.includeChatSpecificSettings) { delete processedSession.settings; delete processedSession.model; }
                  if (!exportConfig.includeAiCharacterDefinitions) delete processedSession.aiCharacters;
                  processedSessionsForJson.push(processedSession);
              }

              if (isCancelled) throw new Error("Cancelled");
              const embeddedVectors = await dbService.getVectors(vectorIdsToFetch);
              const exportData: any = { version: '2.0-zip', exportedAt: new Date().toISOString(), data: {} };
              
              // Get data from other stores
              const dataStore = useDataStore.getState();
              
              if (processedSessionsForJson.length > 0) exportData.data.chats = processedSessionsForJson;
              if (embeddedVectors.length > 0) exportData.data.embeddedVectors = embeddedVectors;
              if (exportConfig.includeLastActiveChatId) exportData.data.lastActiveChatId = useActiveChatStore.getState().currentChatId;
              if (exportConfig.includeMessageGenerationTimes) exportData.data.messageGenerationTimes = dataStore.messageGenerationTimes;
              
              if (exportConfig.includeUiConfiguration) {
                  // Capture Theme and Language
                  const { theme, language } = useGlobalUiStore.getState();
                  // Capture Prompt Buttons from DB
                  const promptButtons = await dbService.getAppMetadata(METADATA_KEYS.PROMPT_BUTTONS);
                  exportData.data.uiConfiguration = { theme, language, promptButtons };
              }

              if (exportConfig.includeUserDefinedGlobalDefaults) exportData.data.userDefinedGlobalDefaults = await dbService.getAppMetadata<any>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS);
              if (exportConfig.includeApiKeys) exportData.data.apiKeys = await dbService.getAppMetadata<any>(METADATA_KEYS.API_KEYS);
              if (exportConfig.includeExternalModels) {
                  exportData.data.externalModels = await dbService.getAppMetadata<any>(METADATA_KEYS.EXTERNAL_MODELS);
                  exportData.data.activeExternalModelId = await dbService.getAppMetadata<any>(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID);
                  exportData.data.externalModeActive = await dbService.getAppMetadata<any>(METADATA_KEYS.EXTERNAL_MODE_ACTIVE);
              }
              // Include custom strategies in export
              exportData.data.customMemoryStrategies = dataStore.customMemoryStrategies; 
              
              exportData.data.exportConfigurationUsed = exportConfig;
              
              // Add the JSON metadata file
              exportFiles.push({ path: "export.json", content: JSON.stringify(exportData, null, 2) });

              // --- OFFLOAD ZIPPING TO WORKER ---
              updateProgress(taskId, 75, "Compressing archive (Worker)...");
              
              const zipBlob = await exportWorkerService.createZip(exportFiles, (percent) => {
                  if (isCancelled) throw new Error('Cancelled');
                  const overallProgress = 75 + (percent * 0.25);
                  updateProgress(taskId, overallProgress, `Zipping files... (${percent.toFixed(0)}%)`);
                  set({ exportProgress: Math.round(overallProgress) });
              });

              triggerDownload(zipBlob, finalFilename);
              finishProgress(taskId, "Export complete!", true);
            } catch (e: any) {
                if (isCancelled) removeProgress(taskId);
                else finishProgress(taskId, `Export failed: ${e.message}`, false);
            } finally { 
                keepAliveService.stop();
                set({ isExporting: false, exportProgress: 0 }); 
            }
        }
    });
  },

  exportChatToTxt: () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;
    const { openFilenameInputModal } = useEditorUI.getState();
    if (!currentChatSession) { showToast("No active chat.", "error"); return; }
    const defaultFilename = sanitizeFilename(currentChatSession.title, 50);
    openFilenameInputModal({
        title: "Export Chat to TXT",
        defaultFilename,
        promptMessage: "Enter a filename for the text export.",
        onSubmit: (baseFilename) => {
            const finalFilename = (baseFilename.trim() || defaultFilename) + '.txt';
            const content = currentChatSession.messages
                .filter(msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)
                .map(msg => {
                    let roleLabel = msg.role === ChatMessageRole.MODEL ? (currentChatSession.isCharacterModeActive && msg.characterName ? msg.characterName : '{model}') : '{user}';
                    const thoughtPart = msg.thoughts ? `[THOUGHTS]: ${msg.thoughts}\n` : '';
                    return `${roleLabel} : \n${thoughtPart}${msg.content}`;
                }).join('\n\n');
            triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), finalFilename);
            showToast("Exported!", "success");
        }
    });
  },

  handleBatchExportChatsToTxt: async (chatIds) => {
    const showToast = useToastStore.getState().showToast;
    const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();
    const { openFilenameInputModal } = useEditorUI.getState();

    const sessionsToExport: ChatSession[] = [];
    for (const id of chatIds) {
        const session = await dbService.getChatSession(id);
        if (session) sessionsToExport.push(session);
    }
    
    if (sessionsToExport.length === 0) { 
        showToast("No chats found to export.", "error"); 
        return; 
    }

    const now = new Date();
    const datePart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
    const defaultFilename = `batch_export_${datePart}_${timePart}`;

    openFilenameInputModal({
        title: "Export Batch TXT",
        defaultFilename,
        promptMessage: "Enter filename for the TXT export.",
        onSubmit: async (baseFilename) => {
            const finalFilename = (baseFilename.trim() || defaultFilename) + '.txt';
            const taskId = `txt-export-${Date.now()}`;
            let isCancelled = false;
            
            startProgress(taskId, 'Exporting TXT', 'Processing chats...', () => { isCancelled = true; });

            try {
                let fullContent = "<chats>\n";
                
                for (let i = 0; i < sessionsToExport.length; i++) {
                    if (isCancelled) break;
                    const session = sessionsToExport[i];
                    updateProgress(taskId, (i / sessionsToExport.length) * 100, `Processing chat ${i + 1}...`);
                    
                    fullContent += `  <chat id="${session.id}" title="${session.title.replace(/"/g, '&quot;')}" date="${session.createdAt}">\n`;
                    
                    session.messages
                        .filter(msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)
                        .forEach(msg => {
                            let roleLabel = msg.role === ChatMessageRole.MODEL ? 'Model' : 'User';
                            if (session.isCharacterModeActive && msg.characterName && msg.role === ChatMessageRole.MODEL) {
                                roleLabel = msg.characterName;
                            }
                            // Only exporting text content, no thoughts
                            fullContent += `    ${roleLabel}: ${msg.content}\n\n`;
                        });
                        
                    fullContent += "  </chat>\n\n";
                }
                
                fullContent += "</chats>";

                if (isCancelled) throw new Error("Cancelled");
                
                triggerDownload(new Blob([fullContent], { type: 'text/plain;charset=utf-8' }), finalFilename);
                finishProgress(taskId, "Export complete!", true);
            } catch (e: any) {
                if (isCancelled) removeProgress(taskId);
                else finishProgress(taskId, `Export failed: ${e.message}`, false);
            }
        }
    });
  },

  handleExportTrainingData: async (chatIdsToExport) => {
    const showToast = useToastStore.getState().showToast;
    const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();
    const { openFilenameInputModal } = useEditorUI.getState();

    const sessionsToExport: ChatSession[] = [];
    for (const id of chatIdsToExport) {
        const session = await dbService.getChatSession(id);
        if (session) sessionsToExport.push(session);
    }
    if (sessionsToExport.length === 0) { showToast("No chats found.", "error"); return; }

    const now = new Date();
    const datePart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
    const defaultFilename = `training_data_${datePart}_${timePart}`;

    openFilenameInputModal({
        title: "Export Training Data (JSONL)",
        defaultFilename,
        promptMessage: "Enter filename for the JSONL export.",
        onSubmit: async (baseFilename) => {
            const finalFilename = (baseFilename.trim() || defaultFilename) + '.jsonl';
            const taskId = `training-export-${Date.now()}`;
            let isCancelled = false;
            startProgress(taskId, 'Exporting Training Data', 'Processing chats...', () => { isCancelled = true; });
            try {
                let jsonlContent = "";
                let processedCount = 0;
                for (let i = 0; i < sessionsToExport.length; i++) {
                    if (isCancelled) break;
                    const session = sessionsToExport[i];
                    updateProgress(taskId, (i / sessionsToExport.length) * 100, `Processing chat ${i + 1}...`);
                    const messages = [{ role: "system", content: session.settings.systemInstruction || "You are a helpful AI assistant." }];
                    for (const msg of session.messages) {
                        if ((msg.role === 'user' || msg.role === 'model') && msg.content?.trim()) {
                            messages.push({ role: msg.role, content: msg.content });
                        }
                    }
                    if (messages.length >= 3) {
                        jsonlContent += JSON.stringify({ messages }) + "\n";
                        processedCount++;
                    }
                }
                if (isCancelled) throw new Error("Cancelled");
                if (processedCount === 0) throw new Error("No valid conversation turns found.");
                triggerDownload(new Blob([jsonlContent], { type: 'application/jsonl' }), finalFilename);
                finishProgress(taskId, `Exported ${processedCount} examples!`, true);
            } catch (e: any) {
                if (isCancelled) removeProgress(taskId);
                else finishProgress(taskId, `Export failed: ${e.message}`, false);
            }
        }
    });
  },
}));

// Initialize store to load persisted config
useExportStore.getState().init();
