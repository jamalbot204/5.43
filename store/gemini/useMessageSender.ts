
import { create } from 'zustand';
import { geminiRefs } from './sharedRefs.ts';
import { useGeminiStatusStore } from './useGeminiStatusStore.ts';
import { useApiKeyStore } from '../useApiKeyStore.ts';
import { useActiveChatStore } from '../useActiveChatStore.ts';
import { useDataStore } from '../useDataStore.ts';
import { useChatListStore } from '../useChatListStore.ts';
import { useAudioStore } from '../useAudioStore.ts';
import { useProgressStore } from '../useProgressStore.ts';
import { 
    Attachment, ChatMessage, GeminiSettings, UserMessageInput, 
    FullResponseData, ChatMessageRole, ChatSession
} from '../../types.ts';
import { getFullChatResponse } from '../../services/llm/chat.ts';
import { generateMimicUserResponse, executeAgenticStep } from '../../services/llm/agents.ts';
import { mapMessagesToFlippedRoleGeminiHistory } from '../../services/llm/history.ts';
import { generateShadowResponse } from '../../services/shadowService.ts'; 
import { extractThoughtsByTag, classifyGeminiError, formatGeminiError } from '../../services/llm/utils.ts';
import { uploadFileViaApi } from '../../services/llm/media.ts';
import { base64ToFile, compressImageFile } from '../../services/utils.ts';
import * as dbService from '../../services/dbService.ts';
import * as memoryService from '../../services/memoryService.ts';
import { useMemoryStore } from '../useMemoryStore.ts';
import { keepAliveService } from '../../services/keepAliveService.ts';
import { useArchiverStore } from '../../store/useArchiverStore.ts'; // ADDED
import { useStreamingStore } from '../useStreamingStore.ts';
import { useExternalModelsStore } from '../useExternalModelsStore.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';

interface MessageSenderActions {
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
}

export const useMessageSender = create<MessageSenderActions>((set, get) => ({
    handleSendMessage: async (
        promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string, isTemporaryContext?: boolean,
        settingsOverrideFromEdit?: Partial<GeminiSettings>,
        targetChatId?: string,
        modelOverrideId?: string
      ) => {
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { currentChatSession } = useActiveChatStore.getState();
        const { setMessageGenerationTimes } = useDataStore.getState();
        const { setIsLoading, logApiRequest, setLastMessageHadAttachments } = useGeminiStatusStore.getState();
        const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();
        const isLoading = useGeminiStatusStore.getState().isLoading;

        let sessionToUpdate = currentChatSession;
        if (targetChatId && targetChatId !== currentChatSession?.id) {
            const dbSession = await dbService.getChatSession(targetChatId);
            if (dbSession) sessionToUpdate = dbSession;
        }

        if (!sessionToUpdate || isLoading) return;

        const updateSessionState = async (updater: (session: ChatSession) => ChatSession) => {
            if (sessionToUpdate!.id === useActiveChatStore.getState().currentChatId) {
                let updatedSession: ChatSession | null = null;
                await useActiveChatStore.getState().updateCurrentChatSession(s => {
                    if (!s) return null;
                    updatedSession = updater(s);
                    return updatedSession;
                });
                if (updatedSession) {
                    sessionToUpdate = updatedSession;
                    await dbService.addOrUpdateChatSession(sessionToUpdate);
                }
            } else {
                sessionToUpdate = updater(sessionToUpdate!);
                await dbService.addOrUpdateChatSession(sessionToUpdate);
                useChatListStore.getState().updateChatSessionInList(sessionToUpdate);
            }
        };

        if (!activeApiKey?.value) {
            await updateSessionState(session => {
                const errorMessage: ChatMessage = {
                    id: `err-${Date.now()}`,
                    role: ChatMessageRole.ERROR,
                    content: "No API key set. Please go to Settings > API Key to set your key.",
                    timestamp: new Date(),
                };
                return { ...session, messages: [...session.messages, errorMessage] };
            });
            return;
        }

        await rotateActiveKey();
        const apiKeyForThisCall = useApiKeyStore.getState().activeApiKey!.value;
    
        geminiRefs.requestCancelledByUser = false;
        geminiRefs.onFullResponseCalledForPendingMessage = false;
        if (!isTemporaryContext) {
            geminiRefs.originalMessageSnapshot = null;
        }
        setLastMessageHadAttachments(!!(attachments && attachments.length > 0 && !isTemporaryContext));
    
        let baseSettingsForAPICall = { ...sessionToUpdate.settings };
        let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = { ...settingsOverrideFromEdit };
        let characterNameForResponse: string | undefined = undefined;
        let userMessageIdForPotentialTitleUpdate: string | null = null;
    
        // --- SEED GENERATION LOGIC ---
        const reqSeed = settingsOverrideForAPICall.seed ?? baseSettingsForAPICall.seed;
        const finalSeed = reqSeed !== undefined ? reqSeed : Math.floor(Math.random() * 2147483647); 
        settingsOverrideForAPICall.seed = finalSeed;
        // -----------------------------

        if (sessionToUpdate.isCharacterModeActive && characterIdForAPICall) {
            const character = (sessionToUpdate.aiCharacters || []).find(c => c.id === characterIdForAPICall);
            if (character) {
                settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
                settingsOverrideForAPICall.userPersonaInstruction = undefined;
                settingsOverrideForAPICall._characterIdForAPICall = character.id;
                characterNameForResponse = character.name;
            } else { return; }
        }
    
        let finalUserMessageInputForAPI: UserMessageInput;
        if (sessionToUpdate.isCharacterModeActive && characterIdForAPICall && !promptContent.trim() && (!attachments || attachments.length === 0) && !historyContextOverride) {
            const characterTriggered = (sessionToUpdate.aiCharacters || []).find(c => c.id === characterIdForAPICall);
            finalUserMessageInputForAPI = (characterTriggered?.contextualInfo?.trim()) ? { text: characterTriggered.contextualInfo, attachments: [] } : { text: "", attachments: [] };
        } else {
            finalUserMessageInputForAPI = { text: promptContent, attachments: attachments || [] };
        }
    
        if (!characterIdForAPICall && !historyContextOverride && !finalUserMessageInputForAPI.text.trim() && (!finalUserMessageInputForAPI.attachments || finalUserMessageInputForAPI.attachments.length === 0) && !sessionToUpdate.githubRepoContext) return;
    
        // --- TEMPORARY MODEL OVERRIDE LOGIC ---
        const externalStore = useExternalModelsStore.getState();
        const originalExternalMode = externalStore.isExternalModeActive;
        const originalActiveModelId = externalStore.activeModelId;
        let didOverrideExternalState = false;

        if (modelOverrideId) {
            const isExternalModel = externalStore.providers.some(p => p.models?.some(m => m.id === modelOverrideId));
            if (isExternalModel) {
                useExternalModelsStore.setState({ isExternalModeActive: true, activeModelId: modelOverrideId });
                didOverrideExternalState = true;
            } else {
                const isBaseModel = MODEL_DEFINITIONS.some(m => m.id === modelOverrideId);
                if (isBaseModel && originalExternalMode) {
                    useExternalModelsStore.setState({ isExternalModeActive: false });
                    didOverrideExternalState = true;
                }
            }
        }
        // --------------------------------------

        // START KEEP ALIVE
        keepAliveService.start();

        let historyForGeminiSDK: ChatMessage[] = historyContextOverride ? [...historyContextOverride] : [...sessionToUpdate.messages];
        let messagesForUIUpdate: ChatMessage[] = [...historyForGeminiSDK];

        // --- TEMPORAL INJECTION LOGIC ---
        const isTimeBridgeEnabled = sessionToUpdate.settings.enableTimeBridge ?? true;
        if (!isTemporaryContext && isTimeBridgeEnabled) {
            const thresholdMinutes = sessionToUpdate.settings.timeBridgeThreshold ?? 15;
            const thresholdMs = thresholdMinutes * 60 * 1000;
            const now = new Date();
            
            const lastMessage = historyForGeminiSDK.slice().reverse().find(m => 
                (m.role === ChatMessageRole.USER || m.role === ChatMessageRole.MODEL) && 
                !m.isTimeMarker && 
                !m.isSystemReminder
            );
            const lastTimeMarker = historyForGeminiSDK.slice().reverse().find(m => m.isTimeMarker);
            
            if (lastMessage) {
                const timeSinceLastActivity = now.getTime() - new Date(lastMessage.timestamp).getTime();
                let timeSinceLastMarker = 0;
                if (lastTimeMarker) {
                    timeSinceLastMarker = now.getTime() - new Date(lastTimeMarker.timestamp).getTime();
                } else if (historyForGeminiSDK.length > 0) {
                    timeSinceLastMarker = now.getTime() - new Date(historyForGeminiSDK[0].timestamp).getTime();
                }

                if (timeSinceLastActivity > thresholdMs || timeSinceLastMarker > thresholdMs) {
                    const diffMinutes = Math.floor(Math.max(timeSinceLastActivity, timeSinceLastMarker) / 60000);
                    const diffHours = Math.floor(diffMinutes / 60);
                    
                    let timePassedString = diffHours > 0 ? `${diffHours} hour(s)` : `${diffMinutes} minutes`;
                    const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                    const injectionContent = `[System Note: Context Update]
Current Real-time: ${timeStr}
Date: ${dateStr}
Time passed since last interaction: ${timePassedString}.
(Proceed with the user's next message below)`;

                    const timeMarkerMessage: ChatMessage = {
                        id: `time-marker-${Date.now()}`,
                        role: ChatMessageRole.USER,
                        content: injectionContent,
                        timestamp: now,
                        isTimeMarker: true,
                        isSystemReminder: false
                    };
                    messagesForUIUpdate.push(timeMarkerMessage);
                }
            }
        }
        // ---------------------------------------------
    
        let currentTurnUserMessageForUI: ChatMessage | null = null;
        if (!isTemporaryContext) {
            currentTurnUserMessageForUI = { id: `msg-${Date.now()}-user-turn-${Math.random().toString(36).substring(2,7)}`, role: ChatMessageRole.USER, content: finalUserMessageInputForAPI.text, attachments: finalUserMessageInputForAPI.attachments?.map(att => ({...att})), timestamp: new Date() };
            userMessageIdForPotentialTitleUpdate = currentTurnUserMessageForUI.id;
        }
    
        setIsLoading(true);
        geminiRefs.abortController = new AbortController();
    
        const modelMessageId = geminiRefs.pendingMessageId || `msg-${Date.now()}-model-${Math.random().toString(36).substring(2,7)}`;
        geminiRefs.pendingMessageId = modelMessageId;
        const placeholderAiMessage: ChatMessage = { id: modelMessageId, role: ChatMessageRole.MODEL, content: '', timestamp: new Date(), isStreaming: true, characterName: characterNameForResponse };
    
        if (!isTemporaryContext && sessionToUpdate.settings.systemReminderFrequency && sessionToUpdate.settings.systemReminderFrequency > 0) {
            const freq = sessionToUpdate.settings.systemReminderFrequency;
            let userMsgCountSinceLastReminder = 0;
            for (let i = messagesForUIUpdate.length - 1; i >= 0; i--) {
                const msg = messagesForUIUpdate[i];
                if (msg.isSystemReminder) break;
                if (msg.role === ChatMessageRole.USER && !msg.isTimeMarker) userMsgCountSinceLastReminder++;
            }
            if ((userMsgCountSinceLastReminder + 1) >= freq) {
                const customReminder = settingsOverrideForAPICall.customReminderMessage || baseSettingsForAPICall.customReminderMessage;
                let reminderContent = "";
                if (customReminder && customReminder.trim() !== "") {
                    reminderContent = `<system_instructions_reminder>\n${customReminder}\n\n*** IMPORTANT INSTRUCTION TO MODEL ***\nThe text above represents the active system guidelines/reminders.\n1. Do NOT reply to this reminder.\n2. Do NOT acknowledge receipt.\n3. Strictly apply these guidelines to the NEXT message provided by the user immediately following this one.\n</system_instructions_reminder>`;
                } else {
                    const activeInstruction = settingsOverrideForAPICall.systemInstruction || baseSettingsForAPICall.systemInstruction || "You are a helpful AI assistant.";
                    reminderContent = `<system_instructions_reminder>\n${activeInstruction}\n\n*** IMPORTANT INSTRUCTION TO MODEL ***\nThe text above represents the active system guidelines.\n1. Do NOT reply to this reminder.\n2. Do NOT acknowledge receipt.\n3. Strictly apply these guidelines to the NEXT message provided by the user immediately following this one.\n</system_instructions_reminder>`;
                }
                const reminderMessage: ChatMessage = {
                    id: `sys-remind-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    role: ChatMessageRole.USER,
                    content: reminderContent,
                    timestamp: new Date(),
                    isSystemReminder: true
                };
                messagesForUIUpdate.push(reminderMessage);
            }
        }

        if (currentTurnUserMessageForUI) messagesForUIUpdate.push(currentTurnUserMessageForUI);
        
        const existingMessageIndex = messagesForUIUpdate.findIndex(m => m.id === modelMessageId);
        if (existingMessageIndex > -1) {
            messagesForUIUpdate[existingMessageIndex] = placeholderAiMessage;
        } else {
            messagesForUIUpdate.push(placeholderAiMessage);
        }
    
        let newTitleForSession = sessionToUpdate.title;
        const titleShouldChange = userMessageIdForPotentialTitleUpdate && sessionToUpdate.title === "New Chat" && historyForGeminiSDK.filter(m => m.role === ChatMessageRole.USER).length === 0;
        if (titleShouldChange) {
            newTitleForSession = (finalUserMessageInputForAPI.text || "Chat with attachments").substring(0, 35) + ((finalUserMessageInputForAPI.text.length > 35 || (!finalUserMessageInputForAPI.text && finalUserMessageInputForAPI.attachments && finalUserMessageInputForAPI.attachments.length > 0)) ? "..." : "");
        }
    
        await updateSessionState(s => ({ ...s, messages: messagesForUIUpdate, lastUpdatedAt: new Date(), title: newTitleForSession }));
    
        const activeChatIdForThisCall = sessionToUpdate.id;
        let historyForAPICall = messagesForUIUpdate.slice(0, messagesForUIUpdate.length - 1); 
        if (currentTurnUserMessageForUI) historyForAPICall = historyForAPICall.slice(0, historyForAPICall.length - 1);

        const indexingContext = {
            sessionId: activeChatIdForThisCall,
            sessionTitle: newTitleForSession || "Untitled Chat",
            systemInstructionSnapshot: settingsOverrideForAPICall.systemInstruction || baseSettingsForAPICall.systemInstruction
        };

        const isReasoningEnabled = baseSettingsForAPICall.enableReasoningWorkflow;
        const reasoningSteps = baseSettingsForAPICall.reasoningSteps || [];
        let accumulatedThoughts: string[] = [];
        let stepProgressId = `reasoning-${Date.now()}`;

        if (isReasoningEnabled && reasoningSteps.length > 0) {
            startProgress(stepProgressId, 'Agent Reasoning', 'Initializing workflow...');
            try {
                for (let i = 0; i < reasoningSteps.length; i++) {
                    if (geminiRefs.requestCancelledByUser) throw new Error("Cancelled by user");
                    const step = reasoningSteps[i];
                    updateProgress(stepProgressId, ((i / reasoningSteps.length) * 100), `Step ${i+1}: ${step.title || 'Processing'}...`);
                    const isExternal = useExternalModelsStore.getState().isExternalModeActive;
                    const agentModelId = baseSettingsForAPICall.agentModel || (isExternal ? 'gemini-3-flash-preview' : sessionToUpdate.model);
                    const stepResult = await executeAgenticStep(apiKeyForThisCall, agentModelId, historyForAPICall, step.instruction, finalUserMessageInputForAPI.text, accumulatedThoughts.join('\n\n'), baseSettingsForAPICall, logApiRequest);
                    accumulatedThoughts.push(`### Step ${i+1}: ${step.title}\n${stepResult}`);
                }
                finishProgress(stepProgressId, 'Reasoning complete. Generating response...', true);
            } catch (error: any) {
                finishProgress(stepProgressId, `Reasoning failed: ${error.message}`, false);
                accumulatedThoughts.push(`[SYSTEM ERROR DURING REASONING: ${error.message}]`);
            }
        }
        
        let thoughtContextString: string | undefined = undefined;
        if (accumulatedThoughts.length > 0) thoughtContextString = accumulatedThoughts.join('\n\n');
        let finalInputForModelGeneration = finalUserMessageInputForAPI; 

        // --- STREAMING CALLBACK ---
        const handleStreamUpdate = (fullRawText: string) => {
            if (geminiRefs.pendingMessageId !== modelMessageId) return;
            if (geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === modelMessageId) return;
            
            // TARGETED ZUSTAND UPDATE (MEMORY ONLY)
            useStreamingStore.getState().updateStreamingText(fullRawText);
        };

        const handleFinalResponseSuccess = async (responseData: FullResponseData) => {
            if (geminiRefs.pendingMessageId !== modelMessageId) return;
            if (geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === modelMessageId) return;
            geminiRefs.onFullResponseCalledForPendingMessage = true;
            if (geminiRefs.generationStartTime) await setMessageGenerationTimes(prev => ({...prev, [modelMessageId]: (Date.now() - (geminiRefs.generationStartTime || 0)) / 1000}));
            
            let fullSession = useActiveChatStore.getState().currentChatSession;
            if (!fullSession || fullSession.id !== activeChatIdForThisCall) fullSession = await dbService.getChatSession(activeChatIdForThisCall);
            if (!fullSession) return;

            let mergedThoughts = responseData.thoughts || "";
            let finalResponseText = responseData.text;

            if (fullSession.settings.enableCustomThoughtParsing && fullSession.settings.customThoughtTagName) {
                const { cleanText, extractedThoughts } = extractThoughtsByTag(finalResponseText, fullSession.settings.customThoughtTagName);
                finalResponseText = cleanText;
                if (extractedThoughts) {
                    if (mergedThoughts) {
                        mergedThoughts += "\n\n---\n\n" + extractedThoughts;
                    } else {
                        mergedThoughts = extractedThoughts;
                    }
                }
            }

            if (accumulatedThoughts.length > 0) {
                const agentThoughtsStr = accumulatedThoughts.join('\n\n');
                mergedThoughts = mergedThoughts ? `${agentThoughtsStr}\n\n---\n\n${mergedThoughts}` : agentThoughtsStr;
            }

            const isFavoritedViaMarker = finalResponseText.includes('[[FAV]]');

            const newAttachments: Attachment[] = [];
            if (responseData.generatedMedia && responseData.generatedMedia.length > 0) {
                responseData.generatedMedia.forEach((media, index) => {
                    const attachmentId = `gen-media-${Date.now()}-${index}`;
                    newAttachments.push({
                        id: attachmentId,
                        type: 'image',
                        mimeType: media.mimeType,
                        name: `generated_image_${index}.png`,
                        base64Data: media.data,
                        dataUrl: `data:${media.mimeType};base64,${media.data}`,
                        size: Math.round(media.data.length * 0.75),
                        uploadState: 'uploading_to_cloud',
                        statusMessage: 'Uploading to cloud...',
                        isLoading: true
                    });
                });
            }

            const combinedAttachments = [...newAttachments];
            if (responseData.toolAttachments) {
                combinedAttachments.push(...responseData.toolAttachments);
            }

            const newAiMessage: ChatMessage = { 
                ...placeholderAiMessage, 
                content: finalResponseText, 
                thoughts: mergedThoughts, 
                groundingMetadata: responseData.groundingMetadata, 
                isStreaming: false, 
                timestamp: new Date(), 
                characterName: characterNameForResponse,
                hasMemoryUpdate: responseData.hasMemoryUpdate,
                toolInvocations: responseData.toolInvocations, 
                isFavorited: isFavoritedViaMarker,
                seedUsed: responseData.seedUsed,
                enhancedDrafts: responseData.enhancedDrafts,
                modelName: responseData.modelName,
                attachments: combinedAttachments.length > 0 ? combinedAttachments : undefined
            };

            const updatedMessages = fullSession.messages.map(msg => msg.id === modelMessageId ? newAiMessage : msg);
            
            const currentStoreSession = useActiveChatStore.getState().currentChatSession;
            const safeMemoryContent = (currentStoreSession?.id === activeChatIdForThisCall) 
                ? currentStoreSession.settings.memoryBoxContent 
                : fullSession.settings.memoryBoxContent;

            const updatedSettings = { 
                ...fullSession.settings,
                memoryBoxContent: safeMemoryContent 
            };
            if (responseData.hasMemoryUpdate) {
                updatedSettings.activeMemoryAnchorId = newAiMessage.id;
            }

            const updatedSession = { ...fullSession, messages: updatedMessages, settings: updatedSettings, lastUpdatedAt: new Date() };

            if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, settings: updatedSettings, lastUpdatedAt: new Date() }) : null);
            } else {
                useChatListStore.getState().updateChatSessionInList(updatedSession);
            }
            
            // PERSISTENCE POINT
            await dbService.addOrUpdateChatSession(updatedSession);

            // BACKGROUND UPLOAD FOR GENERATED MEDIA
            if (newAttachments.length > 0 && apiKeyForThisCall) {
                // Fire and forget
                (async () => {
                    let allSuccess = true;
                    const finalAttachments = [...newAttachments];
                    
                    for (let i = 0; i < finalAttachments.length; i++) {
                        const att = finalAttachments[i];
                        if (!att.base64Data) continue;
                        
                        try {
                            const file = base64ToFile(att.base64Data, att.mimeType, att.name);
                            const compressedFile = await compressImageFile(file);
                            const uploadResult = await uploadFileViaApi(apiKeyForThisCall, compressedFile);
                            
                            if (uploadResult.error || !uploadResult.fileUri) {
                                finalAttachments[i] = { ...att, uploadState: 'error_cloud_upload', error: uploadResult.error || "Upload failed", isLoading: false, statusMessage: "Upload failed" };
                                allSuccess = false;
                            } else {
                                finalAttachments[i] = { 
                                    ...att, 
                                    fileUri: uploadResult.fileUri, 
                                    fileApiName: uploadResult.fileApiName, 
                                    uploadState: 'completed_cloud_upload', 
                                    statusMessage: 'Cloud ready', 
                                    isLoading: false, 
                                    error: undefined,
                                    base64Data: undefined, // Remove base64 to save space
                                    mimeType: compressedFile.type, // Update to match compressed file
                                    name: compressedFile.name // Update to match compressed file
                                };
                            }
                        } catch (err: any) {
                            finalAttachments[i] = { ...att, uploadState: 'error_cloud_upload', error: err.message, isLoading: false, statusMessage: "Upload failed" };
                            allSuccess = false;
                        }
                    }
                    
                    // Update the message in the store and DB
                    const { updateMessages } = useDataStore.getState();
                    const currentSession = await dbService.getChatSession(activeChatIdForThisCall);
                    if (currentSession) {
                        const newMsgs = currentSession.messages.map(m => {
                            if (m.id === modelMessageId) {
                                const otherAtts = (m.attachments || []).filter(a => !finalAttachments.find(fa => fa.id === a.id));
                                return { ...m, attachments: [...otherAtts, ...finalAttachments] };
                            }
                            return m;
                        });
                        await updateMessages(activeChatIdForThisCall, newMsgs);
                        
                        // Update active chat session in memory so subsequent requests use the fileUri
                        if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                            useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: newMsgs }) : null);
                        }
                    }
                })();
            }

            // BACKGROUND UPLOAD FOR TOOL ATTACHMENTS
            if (responseData.toolAttachments && responseData.toolAttachments.length > 0 && apiKeyForThisCall) {
                (async () => {
                    const attachmentsToUpload = [...responseData.toolAttachments!];
                    let anyUpdates = false;
                    
                    for (let i = 0; i < attachmentsToUpload.length; i++) {
                        const att = attachmentsToUpload[i];
                        if (!att.base64Data) continue;
                        
                        try {
                            const file = base64ToFile(att.base64Data, att.mimeType, att.name);
                            const uploadResult = await uploadFileViaApi(apiKeyForThisCall, file, logApiRequest);
                            
                            if (uploadResult.error || !uploadResult.fileUri) {
                                attachmentsToUpload[i] = { ...att, uploadState: 'error_cloud_upload', error: uploadResult.error || "Upload failed", isLoading: false, statusMessage: "Upload failed" };
                            } else {
                                attachmentsToUpload[i] = { 
                                    ...att, 
                                    fileUri: uploadResult.fileUri, 
                                    fileApiName: uploadResult.fileApiName, 
                                    uploadState: 'completed_cloud_upload', 
                                    statusMessage: 'Cloud ready', 
                                    isLoading: false, 
                                    error: undefined
                                };
                            }
                            anyUpdates = true;
                        } catch (e: any) {
                            attachmentsToUpload[i] = { ...att, uploadState: 'error_cloud_upload', error: e.message, isLoading: false, statusMessage: "Upload failed" };
                            anyUpdates = true;
                        }
                    }
                    
                    if (anyUpdates) {
                        // Update the message in the store and DB
                        const { updateMessages } = useDataStore.getState();
                        const currentSession = await dbService.getChatSession(activeChatIdForThisCall);
                        if (currentSession) {
                            const newMsgs = currentSession.messages.map(m => {
                                if (m.id === modelMessageId) {
                                    const otherAtts = (m.attachments || []).filter(a => !attachmentsToUpload.find(ta => ta.id === a.id));
                                    return { ...m, attachments: [...otherAtts, ...attachmentsToUpload] };
                                }
                                return m;
                            });
                            await updateMessages(activeChatIdForThisCall, newMsgs);
                            
                            // Update active chat session in memory so subsequent requests use the fileUri
                            if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: newMsgs }) : null);
                            }
                        }
                    }
                })();
            }

            await useAudioStore.getState().triggerAutoPlayForNewMessage(newAiMessage);

            // --- AUTO ANALYZE (LIBRARIAN) ---
            if (updatedSession.settings.isMemoryBoxEnabled) {
                // Fire and forget, background update
                useMemoryStore.getState().autoAnalyzeAndSave(updatedMessages).catch(err => {
                    // console.debug("Librarian background update failed silently:", err);
                });
            }
            // ---------------------------------

            // --- AUTO ARCHIVER CHECK ---
            if (updatedSession.settings.autoArchivingEnabled) {
                const { generateIncrementalChapter } = useArchiverStore.getState();
                generateIncrementalChapter(false).catch(err => console.error("Background auto-archive failed", err));
            }
            // ---------------------------

            if (!isTemporaryContext && apiKeyForThisCall) {
                const idsToUpdate: string[] = [];
                if (currentTurnUserMessageForUI) {
                    const success = await memoryService.indexMessage(apiKeyForThisCall, currentTurnUserMessageForUI, indexingContext);
                    if (success) idsToUpdate.push(currentTurnUserMessageForUI.id);
                }
                if (newAiMessage.content && newAiMessage.content.trim().length > 10) {
                    const pairContext = { ...indexingContext, precedingUserText: currentTurnUserMessageForUI?.content };
                    const success = await memoryService.indexMessage(apiKeyForThisCall, newAiMessage, pairContext);
                    if (success) idsToUpdate.push(newAiMessage.id);
                }

                if (idsToUpdate.length > 0) {
                    const activeStore = useActiveChatStore.getState();
                    if (activeStore.currentChatId === activeChatIdForThisCall && activeStore.currentChatSession) {
                        const messagesWithEmbeddingUpdate = activeStore.currentChatSession.messages.map(msg => idsToUpdate.includes(msg.id) ? { ...msg, isEmbedded: true } : msg);
                        await activeStore.updateCurrentChatSession(s => s ? ({ ...s, messages: messagesWithEmbeddingUpdate }) : null);
                        const finalSession = useActiveChatStore.getState().currentChatSession;
                        if (finalSession) await dbService.addOrUpdateChatSession(finalSession);
                    } else {
                        const dbSession = await dbService.getChatSession(activeChatIdForThisCall);
                        if (dbSession) {
                            const messagesWithEmbeddingUpdate = dbSession.messages.map(msg => idsToUpdate.includes(msg.id) ? { ...msg, isEmbedded: true } : msg);
                            await dbService.addOrUpdateChatSession({ ...dbSession, messages: messagesWithEmbeddingUpdate });
                        }
                    }
                }
            }
        };

        const handleFinalResponseError = async (errorMsg: string, isAbortError: boolean) => {
            removeProgress(stepProgressId); 
            if (geminiRefs.pendingMessageId !== modelMessageId) return;
            if (geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === modelMessageId) { setIsLoading(false); setLastMessageHadAttachments(false); return; }
            geminiRefs.onFullResponseCalledForPendingMessage = false;
            
            const errorObj = { message: errorMsg };
            const errorType = classifyGeminiError(errorObj);
            const localizedErrorMsg = formatGeminiError(errorObj);
            const finalErrorMessage = isAbortError ? `Response aborted.` : localizedErrorMsg;

            let fullSession = useActiveChatStore.getState().currentChatSession;
            if (!fullSession || fullSession.id !== activeChatIdForThisCall) fullSession = await dbService.getChatSession(activeChatIdForThisCall);
            if (!fullSession) return;
            
            const updatedMessages = fullSession.messages.map(msg => msg.id === modelMessageId ? { 
                ...msg, 
                isStreaming: false, 
                role: ChatMessageRole.ERROR, 
                content: finalErrorMessage, 
                characterName: characterNameForResponse,
                errorType: errorType 
            } : msg);
            
            const updatedSession = { ...fullSession, messages: updatedMessages, lastUpdatedAt: new Date() };
            if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, lastUpdatedAt: new Date() }) : null);
            } else {
                useChatListStore.getState().updateChatSessionInList(updatedSession);
            }
            await dbService.addOrUpdateChatSession(updatedSession);
            if (!geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === modelMessageId) { setIsLoading(false); setLastMessageHadAttachments(false); }
            useStreamingStore.getState().clearStreaming();
        };

        const handleFinalResponseComplete = async () => {
            keepAliveService.stop();

            if (didOverrideExternalState) {
                useExternalModelsStore.setState({ 
                    isExternalModeActive: originalExternalMode, 
                    activeModelId: originalActiveModelId 
                });
            }

            if (geminiRefs.pendingMessageId !== modelMessageId) return;

            const currentPendingMsgIdForComplete = geminiRefs.pendingMessageId;
            if (currentPendingMsgIdForComplete === modelMessageId) {
                setIsLoading(false); setLastMessageHadAttachments(false);
                if (!geminiRefs.onFullResponseCalledForPendingMessage) {
                    let fullSession = useActiveChatStore.getState().currentChatSession;
                    if (!fullSession || fullSession.id !== activeChatIdForThisCall) fullSession = await dbService.getChatSession(activeChatIdForThisCall);
                    if (fullSession) {
                        const messageInState = fullSession.messages.find(m => m.id === modelMessageId);
                        if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) {
                            const updatedMessages = fullSession.messages.map(msg => msg.id === modelMessageId ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date(), characterName: characterNameForResponse } : msg);
                            const updatedSession = { ...fullSession, messages: updatedMessages, lastUpdatedAt: new Date() };
                            if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, lastUpdatedAt: new Date() }) : null);
                            } else {
                                useChatListStore.getState().updateChatSessionInList(updatedSession);
                            }
                            await dbService.addOrUpdateChatSession(updatedSession);
                        } else {
                            useChatListStore.getState().updateChatSessionInList({ ...fullSession, lastUpdatedAt: new Date() });
                        }
                    }
                }
                geminiRefs.pendingMessageId = null; geminiRefs.originalMessageSnapshot = null;
            }
            if (geminiRefs.abortController && currentPendingMsgIdForComplete === modelMessageId) geminiRefs.abortController = null;
            if (currentPendingMsgIdForComplete === modelMessageId) geminiRefs.requestCancelledByUser = false;
            geminiRefs.onFullResponseCalledForPendingMessage = false;
            useStreamingStore.getState().clearStreaming();
        };

        if (baseSettingsForAPICall.enableShadowMode) {
            const defaultShadowPersona = "You are a direct responder. You take the conversation transcript and reply as the AI entity defined by the user.";
            const defaultShadowTask = "Reply to the last user message naturally based on the transcript.";
            try {
                if (baseSettingsForAPICall.debugApiRequests) {
                    logApiRequest({ requestType: 'models.generateContent', payload: { model: 'SHADOW_MODE', contents: "Bypassing main model, calling shadow service directly." }, characterName: characterNameForResponse });
                }
                const isExternal = useExternalModelsStore.getState().isExternalModeActive;
                const shadowModelId = baseSettingsForAPICall.agentModel || (isExternal ? 'gemini-3-flash-preview' : sessionToUpdate.model);
                const shadowResultObj = await generateShadowResponse(apiKeyForThisCall, shadowModelId, historyForAPICall, finalUserMessageInputForAPI.text || "[No Text]", baseSettingsForAPICall.shadowPersona || defaultShadowPersona, baseSettingsForAPICall.shadowTaskInstruction || defaultShadowTask, baseSettingsForAPICall, logApiRequest);
                const shadowResultText = shadowResultObj.text;
                const shadowThoughts = shadowResultObj.thoughts; 
                const shadowHasUpdate = shadowResultObj.hasMemoryUpdate;
                let mergedThoughts = shadowThoughts;
                if (accumulatedThoughts.length > 0) {
                    const agentThoughtsStr = accumulatedThoughts.join('\n\n');
                    mergedThoughts = mergedThoughts ? `${agentThoughtsStr}\n\n---\n\n${mergedThoughts}` : agentThoughtsStr;
                }
                const responseData: FullResponseData = { text: shadowResultText, thoughts: mergedThoughts, groundingMetadata: undefined, hasMemoryUpdate: shadowHasUpdate, seedUsed: finalSeed };
                await handleFinalResponseSuccess(responseData);
                await handleFinalResponseComplete();
            } catch (e: any) {
                console.error("Shadow Mode Failed:", e);
                await handleFinalResponseError(e.message, false);
                await handleFinalResponseComplete();
            }
        } else {
            try {
                useStreamingStore.getState().setStreamingMessage(modelMessageId, '');
                await getFullChatResponse({
                    apiKey: apiKeyForThisCall,
                    sessionId: activeChatIdForThisCall,
                    userMessageInput: finalInputForModelGeneration,
                    model: sessionToUpdate.model,
                    baseSettings: baseSettingsForAPICall,
                    currentChatMessages: historyForAPICall, 
                    thoughtInjectionContext: thoughtContextString, 
                    onFullResponse: handleFinalResponseSuccess,
                    onError: handleFinalResponseError,
                    onComplete: handleFinalResponseComplete,
                    onStreamUpdate: handleStreamUpdate, 
                    logApiRequestCallback: logApiRequest,
                    signal: geminiRefs.abortController.signal,
                    settingsOverride: settingsOverrideForAPICall,
                    allAiCharactersInSession: sessionToUpdate.aiCharacters,
                    generatingMessageId: modelMessageId,
                    sessionToUpdate: sessionToUpdate,
                    modelOverrideId: modelOverrideId,
                    onCacheUpdate: (newCacheInfo) => {
                        if (sessionToUpdate!.id === useActiveChatStore.getState().currentChatId) {
                            useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, cacheInfo: newCacheInfo }) : null);
                            const updatedSession = useActiveChatStore.getState().currentChatSession;
                            if (updatedSession) {
                                dbService.addOrUpdateChatSession(updatedSession);
                            }
                        } else {
                            sessionToUpdate!.cacheInfo = newCacheInfo;
                            dbService.addOrUpdateChatSession(sessionToUpdate!);
                        }
                    }
                } as any);
            } catch (e: any) {
                await handleFinalResponseError(e.message, false);
                await handleFinalResponseComplete();
            }
        }
      },

    handleContinueFlow: async () => {
        const { currentChatSession } = useActiveChatStore.getState();
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { setIsLoading, logApiRequest } = useGeminiStatusStore.getState();
        const isLoading = useGeminiStatusStore.getState().isLoading;
        if (!currentChatSession || isLoading || currentChatSession.isCharacterModeActive || currentChatSession.messages.length === 0) return;
        await rotateActiveKey();
        geminiRefs.requestCancelledByUser = false;
        const { settings, model, messages } = currentChatSession;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === ChatMessageRole.MODEL) {
            setIsLoading(true);
            geminiRefs.abortController = new AbortController();
            try {
                const historyForMimic = mapMessagesToFlippedRoleGeminiHistory(messages, settings);
                const isExternal = useExternalModelsStore.getState().isExternalModeActive;
                const mimicModelId = isExternal ? 'gemini-3-flash-preview' : model;
                const mimicContent = await generateMimicUserResponse(activeApiKey?.value || '', mimicModelId, historyForMimic, settings.userPersonaInstruction || '', settings, logApiRequest, geminiRefs.abortController.signal);
                if (geminiRefs.requestCancelledByUser) return;
                setIsLoading(false); 
                await get().handleSendMessage(mimicContent, [], messages);
            } catch (error: any) {
                console.error("Error during Continue Flow:", error);
                const errorMessage = `Flow generation failed: ${error.message}`;
                let sessionAfterError: ChatSession | null = null;
                await useActiveChatStore.getState().updateCurrentChatSession(session => {
                    if (!session) return null;
                    sessionAfterError = { ...session, messages: [...session.messages, {id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: errorMessage, timestamp: new Date()}]};
                    return sessionAfterError;
                });
                if (sessionAfterError) await dbService.addOrUpdateChatSession(sessionAfterError);
                setIsLoading(false);
            }
        } else {
            await get().handleSendMessage('', [], messages);
        }
    },
}));
