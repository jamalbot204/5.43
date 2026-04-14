import { create } from 'zustand';
import { geminiRefs } from './sharedRefs.ts';
import { useGeminiStatusStore } from './useGeminiStatusStore.ts';
import { useMessageSender } from './useMessageSender.ts';
import { useApiKeyStore } from '../useApiKeyStore.ts';
import { useActiveChatStore } from '../useActiveChatStore.ts';
import { useDataStore } from '../useDataStore.ts';
import { useChatListStore } from '../useChatListStore.ts';
import { useToastStore } from '../useToastStore.ts';
import { useEditorUI } from '../ui/useEditorUI.ts';
import { useAudioStore } from '../useAudioStore.ts';
import { 
    ChatMessage, GeminiSettings, UserMessageInput, Attachment,
    FullResponseData, ChatMessageRole, ChatSession
} from '../../types.ts';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../../components/panels/EditMessagePanel.tsx';
import { getFullChatResponse } from '../../services/llm/chat.ts';
import { findPrecedingUserMessageIndex, getHistoryUpToMessage } from '../../services/utils.ts';
import { MERMAID_FIX_SYSTEM_INSTRUCTION, MERMAID_FIX_SAFETY_SETTINGS } from '../../constants.ts';
import * as dbService from '../../services/dbService.ts';
import { useStreamingStore } from '../useStreamingStore.ts';

interface ContentFixerActions {
    handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments?: Attachment[], keptAttachments?: Attachment[]) => Promise<void>;
    handleFixMermaidCode: (data: { messageId: string; badCode: string; fullContent: string }) => Promise<void>;
}

export const useContentFixer = create<ContentFixerActions>((set, get) => ({
    handleEditPanelSubmit: async (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments: Attachment[] = [], keptAttachments?: Attachment[]) => {
        const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
        const { setMessageGenerationTimes } = useDataStore.getState();
        const { setIsLoading, logApiRequest } = useGeminiStatusStore.getState();
        const { handleSendMessage } = useMessageSender.getState();
        const { handleStopAndCancelAllForCurrentAudio } = useAudioStore.getState();
        const { messageId } = editingMessageDetail;
        
        if(!currentChatSession) return;
        
        const messageIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;
        
        const originalMessage = currentChatSession.messages[messageIndex];
        
        // Determine the base attachments to keep:
        // If keptAttachments is provided (from UI state), use it.
        // Otherwise, fall back to the original message attachments.
        const sourceAttachments = keptAttachments !== undefined ? keptAttachments : (originalMessage.attachments || []);
        const combinedAttachments = [...sourceAttachments, ...newAttachments];

        // Audio Cleanup Logic
        // We perform cleanup for SAVE_AND_SUBMIT and CONTINUE_PREFIX to ensure old audio doesn't persist for new content.
        // We EXPLICITLY SKIP cleanup for SAVE_LOCALLY as per user request.
        if (action !== EditMessagePanelAction.SAVE_LOCALLY) {
            if (originalMessage.cachedAudioSegmentCount && originalMessage.cachedAudioSegmentCount > 0) {
                handleStopAndCancelAllForCurrentAudio();
                const deletePromises: Promise<void>[] = [];
                for (let i = 0; i < originalMessage.cachedAudioSegmentCount; i++) {
                    deletePromises.push(dbService.deleteAudioBuffer(`${originalMessage.id}_part_${i}`));
                }
                Promise.all(deletePromises).catch(err => console.error("Failed to cleanup audio during message edit:", err));
            }
        }

        if (action === EditMessagePanelAction.SAVE_AND_SUBMIT) {
            const updatedUserMessage = { 
                ...originalMessage, 
                content: newContent, 
                attachments: combinedAttachments, 
                cachedAudioBuffers: null,
                cachedAudioSegmentCount: undefined, // Clear metadata since audio files are deleted
                thoughts: undefined,
                enhancedDrafts: undefined
            };
            const historyBeforeEdit = currentChatSession.messages.slice(0, messageIndex);
            
            let sessionAfterUpdate: ChatSession | null = null;
            await updateCurrentChatSession(session => {
                if (!session) return null;
                sessionAfterUpdate = {...session, messages: [...historyBeforeEdit, updatedUserMessage]};
                return sessionAfterUpdate;
            });
            if (sessionAfterUpdate) await dbService.addOrUpdateChatSession(sessionAfterUpdate);

            if(sessionAfterUpdate) {
                await handleSendMessage(newContent, updatedUserMessage.attachments, historyBeforeEdit);
            }

        } else if (action === EditMessagePanelAction.CONTINUE_PREFIX) {
            const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
            
            const lastUserMessageIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageIndex);
            if (lastUserMessageIndex === -1) {
                useToastStore.getState().showToast("Cannot use this feature: No preceding user message found to respond to.", "error");
                return;
            }
            const lastUserMessage = currentChatSession.messages[lastUserMessageIndex];
            const mainPromptInput: UserMessageInput = { text: lastUserMessage.content, attachments: lastUserMessage.attachments || [] };
            const historyContext = getHistoryUpToMessage(currentChatSession.messages, lastUserMessageIndex);
            const prefix = newContent;
        
            const continueMicroPrompt = "You are currently continuing a sentence or thought you already started. Complete it seamlessly. Do NOT add standard greetings, apologies, or conversational filler. Just continue the text directly.";
            const settingsOverrideForPrefix: Partial<GeminiSettings> = { systemInstruction: `${continueMicroPrompt}\n\n---\n\n${currentChatSession.settings.systemInstruction || ''}` };

            if (!activeApiKey?.value) {
                useToastStore.getState().showToast("API Key is not configured.", "error");
                return;
            }
            await rotateActiveKey();
        
            geminiRefs.requestCancelledByUser = false;
            geminiRefs.onFullResponseCalledForPendingMessage = false;
            geminiRefs.originalMessageSnapshot = null;
        
            setIsLoading(true);
            geminiRefs.abortController = new AbortController();
            geminiRefs.pendingMessageId = messageId;
        
            const originalMessageToReplace = currentChatSession.messages[messageIndex];
            const placeholderAiMessage: ChatMessage = { 
                ...originalMessageToReplace, 
                content: prefix, // Start with the prefix visible
                attachments: [], 
                timestamp: new Date(), 
                isStreaming: true, 
                role: ChatMessageRole.MODEL, 
                cachedAudioBuffers: null, 
                cachedAudioSegmentCount: undefined, // Clear metadata
                groundingMetadata: undefined,
                thoughts: undefined,
                enhancedDrafts: undefined
            };
        
            let sessionAfterPlaceholder: ChatSession | null = null;
            await updateCurrentChatSession(session => {
                if (!session) return null;
                sessionAfterPlaceholder = { ...session, messages: session.messages.map(msg => msg.id === messageId ? placeholderAiMessage : msg) };
                return sessionAfterPlaceholder;
            });
            if (sessionAfterPlaceholder) await dbService.addOrUpdateChatSession(sessionAfterPlaceholder);
        
            const activeChatIdForThisCall = currentChatSession.id;
        
            useStreamingStore.getState().setStreamingMessage(messageId, prefix);
            await getFullChatResponse({
                apiKey: activeApiKey.value,
                sessionId: activeChatIdForThisCall,
                userMessageInput: mainPromptInput,
                model: currentChatSession.model,
                baseSettings: currentChatSession.settings,
                settingsOverride: settingsOverrideForPrefix,
                currentChatMessages: historyContext,
                modelPrefillText: prefix, // Use official API prefill
                onStreamUpdate: (visibleText) => {
                    if (geminiRefs.pendingMessageId !== messageId) return;
                    const fullContent = prefix + visibleText; // Concatenate prefix + stream
                    useStreamingStore.getState().updateStreamingText(fullContent);
                },
                onFullResponse: async (responseData) => { // onFullResponse
                    if (geminiRefs.pendingMessageId !== messageId) return;
                    if (geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === messageId) return;
                    geminiRefs.onFullResponseCalledForPendingMessage = true;
                    if (geminiRefs.generationStartTime) await setMessageGenerationTimes(prev => ({ ...prev, [messageId]: (Date.now() - (geminiRefs.generationStartTime || 0)) / 1000 }));
        
                    // Use full session logic
                    let fullSession = useActiveChatStore.getState().currentChatSession;
                    if (!fullSession || fullSession.id !== activeChatIdForThisCall) {
                        fullSession = await dbService.getChatSession(activeChatIdForThisCall);
                    }
                    if (!fullSession) return;
        
                    const finalContent = prefix + responseData.text; // Concatenate prefix + final text
                    const newAiMessage: ChatMessage = { ...placeholderAiMessage, content: finalContent, groundingMetadata: responseData.groundingMetadata, isStreaming: false };
                    const updatedMessages = fullSession.messages.map(msg => msg.id === messageId ? newAiMessage : msg);
                    const updatedSession = { ...fullSession, messages: updatedMessages, lastUpdatedAt: new Date() };
        
                    // Update Active Store if matches
                    if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                        useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, lastUpdatedAt: new Date() }) : null);
                    } else {
                        useChatListStore.getState().updateChatSessionInList(updatedSession);
                    }
                    await dbService.addOrUpdateChatSession(updatedSession);
                },
                onError: async (errorMsg, isAbortError) => { // onError
                    if (geminiRefs.pendingMessageId !== messageId) return;
                    if (geminiRefs.requestCancelledByUser && geminiRefs.pendingMessageId === messageId) { setIsLoading(false); return; }
                    const finalErrorMessage = isAbortError ? "Response aborted." : `Response failed: ${errorMsg}`;
                    
                    let fullSession = useActiveChatStore.getState().currentChatSession;
                    if (!fullSession || fullSession.id !== activeChatIdForThisCall) {
                        fullSession = await dbService.getChatSession(activeChatIdForThisCall);
                    }
                    if (!fullSession) return;
                    
                    useToastStore.getState().showToast(finalErrorMessage, "error");
                    
                    const currentStreamingText = useStreamingStore.getState().streamingText[messageId];
                    const finalContent = currentStreamingText || prefix;

                    const updatedMessages = fullSession.messages.map(msg => msg.id === messageId ? { ...msg, isStreaming: false, role: ChatMessageRole.MODEL, content: finalContent } : msg);
                    const updatedSession = { ...fullSession, messages: updatedMessages, lastUpdatedAt: new Date() };
                    
                    if (useActiveChatStore.getState().currentChatId === activeChatIdForThisCall) {
                        useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, lastUpdatedAt: new Date() }) : null);
                    } else {
                        useChatListStore.getState().updateChatSessionInList(updatedSession);
                    }
                    await dbService.addOrUpdateChatSession(updatedSession);
                    
                    setIsLoading(false);
                    useStreamingStore.getState().clearStreaming();
                },
                onComplete: async () => { // onComplete
                    if (geminiRefs.pendingMessageId !== messageId) return;
                    if (geminiRefs.pendingMessageId === messageId) {
                      setIsLoading(false);
                      geminiRefs.pendingMessageId = null;
                      if (!geminiRefs.onFullResponseCalledForPendingMessage) {
                          // Handle unexpected stream end if needed
                      }
                    }
                    if (geminiRefs.abortController) geminiRefs.abortController = null;
                    geminiRefs.requestCancelledByUser = false;
                    geminiRefs.onFullResponseCalledForPendingMessage = false;
                    useStreamingStore.getState().clearStreaming();
                },
                logApiRequestCallback: logApiRequest,
                signal: geminiRefs.abortController.signal,
                sessionToUpdate: currentChatSession,
                onCacheUpdate: async (newCacheInfo) => {
                    await useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, cacheInfo: newCacheInfo }) : null);
                    const updatedSession = useActiveChatStore.getState().currentChatSession;
                    if (updatedSession) {
                        await dbService.addOrUpdateChatSession(updatedSession);
                    }
                }
            });
        } else if (action === EditMessagePanelAction.SAVE_LOCALLY) {
            // For SAVE_LOCALLY, we preserve cachedAudioBuffers/cachedAudioSegmentCount
            // This ensures the audio remains linked even though content text has changed.
            // This matches user request to exclude save_locally from deletion.
            let sessionAfterUpdate: ChatSession | null = null;
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const newMessages = session.messages.map(msg => 
                    msg.id === messageId ? { ...msg, content: newContent, attachments: combinedAttachments, thoughts: undefined, enhancedDrafts: undefined } : msg
                );
                sessionAfterUpdate = { ...session, messages: newMessages };
                return sessionAfterUpdate;
            });
            if (sessionAfterUpdate) await dbService.addOrUpdateChatSession(sessionAfterUpdate);
        }
    },

    handleFixMermaidCode: async (data) => {
        const { messageId, badCode, fullContent } = data;
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { openMermaidModal } = useEditorUI.getState();
        const { showToast } = useToastStore.getState();

        if (!currentChatSession || !activeApiKey?.value) {
            showToast("Cannot fix: No active session or API key.", "error");
            return;
        }

        await rotateActiveKey();
        const apiKey = useApiKeyStore.getState().activeApiKey?.value;
        if (!apiKey) {
            showToast("Cannot fix: No active API key after rotation.", "error");
            return;
        }

        try {
            const { GoogleGenAI } = await import('@google/genai');
            const ai = new GoogleGenAI({ apiKey });

            const result = await ai.models.generateContent({
                model: currentChatSession.model,
                contents: [{ role: 'user', parts: [{ text: badCode }] }],
                config: {
                    systemInstruction: MERMAID_FIX_SYSTEM_INSTRUCTION,
                    temperature: 0.1,
                    topP: 0.95,
                    topK: 64,
                    safetySettings: MERMAID_FIX_SAFETY_SETTINGS,
                },
            });

            const responseText = result.text;
            if (!responseText) {
                throw new Error("AI returned an empty response.");
            }

            const codeBlockRegex = /```mermaid\n([\s\S]*?)\n```/;
            const match = responseText.match(codeBlockRegex);
            const fixedCode = match ? match[1].trim() : responseText.trim();

            if (!fixedCode) {
                 throw new Error("AI response could not be parsed into a code block.");
            }

            const newContent = fullContent.replace(badCode, fixedCode);

            let updatedSession: ChatSession | null = null;
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const newMessages = session.messages.map(msg =>
                    msg.id === messageId ? { ...msg, content: newContent } : msg
                );
                updatedSession = { ...session, messages: newMessages };
                return updatedSession;
            });

            if (updatedSession) {
                await dbService.addOrUpdateChatSession(updatedSession);
            }

            openMermaidModal({
                code: fixedCode,
                messageId: messageId,
                fullContent: newContent,
            });

            showToast("Mermaid diagram fixed by AI!", "success");

        } catch (error: any) {
            console.error("AI fix failed:", error);
            showToast(`AI fix failed: ${error.message}`, "error");
        }
    },
}));