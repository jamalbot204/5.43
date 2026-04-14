
import React, { useState, useCallback, memo, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useGeminiApiStore } from '../../store/useGeminiApiStore.ts';
import { useFileHandler } from '../../hooks/useFileHandler.ts';
import { useAutoSendStore } from '../../store/useAutoSendStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { useSelectionStore } from '../../store/useSelectionStore.ts';
import { useMessageStore } from '../../store/useMessageStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { 
    ChevronDoubleDownIcon, ChevronDoubleUpIcon, FlowRightIcon, SparklesIcon,
    Bars3Icon, UsersIcon, ClipboardDocumentCheckIcon, 
    XCircleIcon, StarIcon, ArrowsUpDownIcon, CheckIcon, PlusIcon,
    ServerIcon, DocumentIcon, BrainIcon, ClockIcon, TrashIcon, KeyIcon,
    MagnifyingGlassIcon, GitHubIcon, ArrowPathIcon
} from '../common/Icons.tsx';
import GenerationTimer from '../common/GenerationTimer.tsx';
import AutoSendControls from './AutoSendControls.tsx';
import { useShallow } from 'zustand/react/shallow';
import { useTranscribe } from '../../hooks/useTranscribe.ts';
import { ChatMessageRole } from '../../types.ts';

import AttachmentZone from './input/AttachmentZone.tsx';
import CharacterBar from './input/CharacterBar.tsx';
import InputActions from './input/InputActions.tsx';
import ChatTextArea, { ChatTextAreaHandle } from './input/ChatTextArea.tsx';
import PromptButtonsBar from './input/PromptButtonsBar.tsx';

interface ChatInputAreaProps {
    isReorderingActive: boolean;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = memo(({ isReorderingActive }) => {
    const { 
        currentChatSessionId, 
        isCharacterMode, 
        showContinueFlowButton, 
        showAutoSendControls,
        showPromptButtonsBar,
        lastMessageRole 
    } = useActiveChatStore(useShallow(state => {
        const msgs = state.currentChatSession?.messages;
        return {
            currentChatSessionId: state.currentChatSession?.id,
            isCharacterMode: state.currentChatSession?.isCharacterModeActive || false,
            showContinueFlowButton: state.currentChatSession?.settings?.showContinueFlowButton || false,
            showAutoSendControls: state.currentChatSession?.settings?.showAutoSendControls || false,
            showPromptButtonsBar: state.currentChatSession?.settings?.showPromptButtonsBar ?? true,
            lastMessageRole: msgs && msgs.length > 0 ? msgs[msgs.length - 1].role : null,
        };
    }));

    const { isLoading, handleSendMessage, handleContinueFlow, handleCancelGeneration, handleRegenerateResponseForUserMessage } = useGeminiApiStore();
    
    const { 
        isAutoSendingActive, autoSendText, setAutoSendText, autoSendRepetitionsInput, 
        setAutoSendRepetitionsInput, autoSendRemaining, startAutoSend, stopAutoSend, 
        canStartAutoSend, isWaitingForErrorRetry, errorRetryCountdown 
    } = useAutoSendStore();

    const showToast = useToastStore(state => state.showToast);
    const { isSelectionModeActive } = useSelectionStore();
    const { t } = useTranslation();

    const chatTextAreaRef = useRef<ChatTextAreaHandle>(null);
    const [isTextEmpty, setIsTextEmpty] = useState(true); 
    const [isInfoInputModeActive, setIsInfoInputModeActive] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [pendingModelOverride, setPendingModelOverride] = useState<string | undefined>(undefined);

    // Toolbar switching state
    const [activeToolbar, setActiveToolbar] = useState<'characters' | 'prompts'>(isCharacterMode ? 'characters' : 'prompts');

    // Sync toolbar with mode changes
    React.useEffect(() => {
        setActiveToolbar(isCharacterMode ? 'characters' : 'prompts');
    }, [isCharacterMode]);

    // Use local file handler hook
    const {
        files: selectedFiles,
        handleFileSelection,
        handlePaste,
        removeFile,
        resetFiles,
        getValidFiles,
        isAnyFileStillProcessing
    } = useFileHandler();

    const isAnyAiMediaUploading = useActiveChatStore(state => {
        const msgs = state.currentChatSession?.messages || [];
        return msgs.some(msg => msg.attachments?.some(att => att.uploadState === 'uploading_to_cloud'));
    });

    const onTranscriptionComplete = useCallback((text: string) => {
        if (chatTextAreaRef.current) {
            const currentText = chatTextAreaRef.current.getText();
            const newText = currentText ? `${currentText} ${text}` : text;
            chatTextAreaRef.current.setText(newText);
            chatTextAreaRef.current.focus();
        }
    }, []);

    const { isRecording, isTranscribing, startRecording, stopRecording } = useTranscribe(onTranscriptionComplete);

    const pendingInputText = useMessageStore(state => state.pendingInputText);
    const setPendingInputText = useMessageStore(state => state.setPendingInputText);

    const isPreparingAutoSend = useMemo(() => {
        return autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0 && !isAutoSendingActive;
    }, [autoSendText, autoSendRepetitionsInput, isAutoSendingActive]);

    const canResend = useMemo(() => {
        return isTextEmpty && selectedFiles.length === 0 && (lastMessageRole === ChatMessageRole.USER || lastMessageRole === ChatMessageRole.ERROR);
    }, [isTextEmpty, selectedFiles.length, lastMessageRole]);

    const handleSendMessageClick = useCallback(async (characterId?: string, forceText?: string, modelOverrideId?: string) => {
        let currentInputMessageValue = forceText !== undefined ? forceText : (chatTextAreaRef.current?.getText() || '');
        let attachmentsToSend = getValidFiles();
        let temporaryContextFlag = false;

        const finalModelOverride = modelOverrideId || pendingModelOverride;

        if (isLoading || !currentChatSessionId || isAutoSendingActive) return;

        if (isAnyFileStillProcessing || isAnyAiMediaUploading) {
            showToast("Some files are still being processed. Please wait.", "error");
            return;
        }

        if (canResend && !currentInputMessageValue && attachmentsToSend.length === 0 && !isCharacterMode) {
             const currentSession = useActiveChatStore.getState().currentChatSession;
             if (currentSession) {
                 const msgs = currentSession.messages;
                 const lastUserMsg = msgs.slice().reverse().find(m => m.role === ChatMessageRole.USER);
                 
                 if (lastUserMsg) {
                     handleRegenerateResponseForUserMessage(lastUserMsg.id);
                     return; 
                 }
             }
        }

        if (isCharacterMode && characterId) {
            if (isPreparingAutoSend) {
                startAutoSend(autoSendText, parseInt(autoSendRepetitionsInput, 10) || 1, characterId);
                chatTextAreaRef.current?.clear();
                resetFiles();
                return;
            }
            if (isInfoInputModeActive) { temporaryContextFlag = !!currentInputMessageValue.trim(); }
        } else if (!isCharacterMode) {
            if (currentInputMessageValue.trim() === '' && attachmentsToSend.length === 0) return;
        } else { return; }

        chatTextAreaRef.current?.clear();
        resetFiles();
        setPendingModelOverride(undefined);
        if (isInfoInputModeActive && temporaryContextFlag) setIsInfoInputModeActive(false);

        await handleSendMessage(currentInputMessageValue, attachmentsToSend, undefined, characterId, temporaryContextFlag, undefined, undefined, finalModelOverride);
    }, [getValidFiles, isLoading, currentChatSessionId, isAutoSendingActive, isAnyFileStillProcessing, isAnyAiMediaUploading, showToast, isCharacterMode, isInfoInputModeActive, handleSendMessage, resetFiles, isPreparingAutoSend, startAutoSend, autoSendText, autoSendRepetitionsInput, canResend, handleRegenerateResponseForUserMessage, pendingModelOverride]);

    const handleInsertText = useCallback((text: string, modelId?: string) => {
        if (chatTextAreaRef.current) {
            const current = chatTextAreaRef.current.getText();
            const newText = current ? `${current}\n${text}` : text;
            chatTextAreaRef.current.setText(newText);
            chatTextAreaRef.current.focus();
            if (modelId) setPendingModelOverride(modelId);
        }
    }, []);

    useEffect(() => {
        if (pendingInputText !== null) {
            handleInsertText(pendingInputText);
            setPendingInputText(null);
        }
    }, [pendingInputText, handleInsertText, setPendingInputText]);

    const handleDirectSend = useCallback((text: string, modelId?: string) => {
        handleSendMessageClick(undefined, text, modelId);
    }, [handleSendMessageClick]);

    const handleContinueFlowClick = useCallback(async () => {
        if (isLoading || !currentChatSessionId || isCharacterMode || isAutoSendingActive) return;
        chatTextAreaRef.current?.clear();
        resetFiles();
        await handleContinueFlow();
    }, [isLoading, currentChatSessionId, isCharacterMode, isAutoSendingActive, handleContinueFlow, resetFiles]);

    const toggleInfoInputMode = useCallback(() => {
        setIsInfoInputModeActive(prev => {
            if (!prev) {
                chatTextAreaRef.current?.clear();
                resetFiles();
                setTimeout(() => chatTextAreaRef.current?.focus(), 50);
            }
            return !prev;
        });
    }, [resetFiles]);

    const handleMainCancelButtonClick = useCallback(async () => {
        if (isAutoSendingActive) await stopAutoSend();
        else if (isLoading) handleCancelGeneration();
    }, [isAutoSendingActive, stopAutoSend, isLoading, handleCancelGeneration]);

    const handleViewAttachments = useCallback(() => {
        const session = useActiveChatStore.getState().currentChatSession;
        if (session) {
            useSettingsUI.getState().openChatAttachmentsModal(session);
        } else {
            showToast("No active chat session.", "error");
        }
    }, [showToast]);

    const handleFileDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    }, [isDragging]);

    const handleFileDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files);
        }
    }, [handleFileSelection]);

    const onAttachHandler = useCallback((files: FileList | null) => {
        handleFileSelection(files);
    }, [handleFileSelection]);

    const onPasteHandler = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handlePaste(e);
    }, [handlePaste]);

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    const hasValidInputForMainSend = !isTextEmpty || selectedFiles.length > 0 || canResend;
    
    let placeholderText = isCharacterMode ? (isInfoInputModeActive ? t.enterContextualInfo : t.typeMessageChar) : t.typeMessage;

    return (
        <div className="sticky bottom-0 z-20 pb-[env(safe-area-inset-bottom,1.5rem)] px-2 sm:px-4">
            <div className="mx-auto w-full max-w-4xl relative">
                {/* Global Thinking Pill */}
                <AnimatePresence>
                    {isLoading && (
                        <motion.div 
                            initial={{ opacity: 0, y: 5, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 5, scale: 0.9 }}
                            className="absolute bottom-full mb-2 left-0 right-0 flex justify-center z-50 pointer-events-none"
                        >
                            <div className="flex items-center gap-1.5 px-2 py-0.5 whitespace-nowrap opacity-80 select-none pointer-events-none">
                                <div className="w-3 h-3 bg-transparent flex items-center justify-center">
                                    <SparklesIcon className="w-2.5 h-2.5 text-tint-emerald-text animate-pulse" />
                                </div>
                                <span className="text-brand-primary font-medium tracking-tight text-[9px] uppercase">
                                    {t.thinking}
                                </span>
                                <div className="bg-brand-primary/20 w-[1px] h-2" />
                                <span className="text-brand-primary/70 font-mono text-[9px]">
                                    <GenerationTimer />
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div 
                    className={`border transition duration-200 relative overflow-hidden rounded-2xl ${isDragging ? 'border-dashed border-brand-primary bg-tint-emerald-bg/10 ring-2 ring-ring-focus scale-[1.01]' : 'bg-bg-panel border border-border-base shadow-panel'} ${isLoading ? 'ring-1 ring-ring-focus/50' : 'focus-within:ring-1 focus-within:ring-ring-focus focus-within:border-brand-primary'}`}
                    onDragOver={handleFileDragOver}
                    onDragLeave={handleFileDragLeave}
                    onDrop={handleFileDrop}
                >
                    {isDragging && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-overlay/80 pointer-events-none transition-opacity">
                            <div className="text-text-on-brand font-bold text-lg flex items-center animate-bounce">
                                <DocumentIcon className="w-8 h-8 mr-3 text-brand-primary" />
                                <span>Drop files to attach</span>
                            </div>
                        </div>
                    )}
                    
                    {showAutoSendControls && (
                        <AutoSendControls 
                            isAutoSendingActive={isAutoSendingActive} 
                            autoSendText={autoSendText} 
                            setAutoSendText={setAutoSendText} 
                            autoSendRepetitionsInput={autoSendRepetitionsInput} 
                            setAutoSendRepetitionsInput={setAutoSendRepetitionsInput} 
                            autoSendRemaining={autoSendRemaining} 
                            onStartAutoSend={() => { if (!isCharacterMode && canStartAutoSend() && !isAutoSendingActive && !isLoading) { startAutoSend(autoSendText, parseInt(autoSendRepetitionsInput, 10) || 1); } }} 
                            onStopAutoSend={() => stopAutoSend()} 
                            canStart={canStartAutoSend()} 
                            isChatViewLoading={isLoading} 
                            currentChatSessionExists={!!currentChatSessionId} 
                            isCharacterMode={isCharacterMode} 
                            isPreparingAutoSend={isPreparingAutoSend} 
                            isWaitingForErrorRetry={isWaitingForErrorRetry} 
                            errorRetryCountdown={errorRetryCountdown} 
                        />
                    )}

                    <AttachmentZone files={selectedFiles} onRemove={removeFile} disabled={isSelectionModeActive} />

                    <div className="px-3 pt-2">
                        {activeToolbar === 'characters' && isCharacterMode && (
                            <CharacterBar 
                                isReorderingActive={isReorderingActive} 
                                onCharacterClick={handleSendMessageClick} 
                                isInfoInputModeActive={isInfoInputModeActive}
                                disabled={!currentChatSessionId}
                                isFileProcessing={isAnyFileStillProcessing || isAnyAiMediaUploading}
                                showSwitchButton={showPromptButtonsBar}
                                onSwitchToolbar={() => setActiveToolbar('prompts')}
                            />
                        )}

                        {activeToolbar === 'prompts' && showPromptButtonsBar && (
                            <PromptButtonsBar 
                                onInsert={handleInsertText} 
                                onSend={handleDirectSend} 
                                showSwitchButton={isCharacterMode}
                                onSwitchToolbar={() => setActiveToolbar('characters')}
                            />
                        )}
                    </div>

                    <div className="p-2 sm:p-3 relative flex items-end gap-2">
                        <InputActions 
                            group="start"
                            isLoading={isLoading}
                            isAutoSendingActive={isAutoSendingActive}
                            isCharacterMode={isCharacterMode}
                            isSelectionModeActive={isSelectionModeActive}
                            isInfoInputModeActive={isInfoInputModeActive}
                            showContinueFlow={showContinueFlowButton}
                            hasValidInput={hasValidInputForMainSend}
                            onAttachClick={onAttachHandler}
                            onToggleInfoInput={toggleInfoInputMode}
                            onContinueFlow={handleContinueFlowClick}
                            onSend={handleSendMessageClick}
                            onCancel={handleMainCancelButtonClick}
                            onViewAttachments={handleViewAttachments}
                            onToggleRecording={toggleRecording}
                            isRecording={isRecording}
                            isTranscribing={isTranscribing}
                            isFileProcessing={isAnyFileStillProcessing || isAnyAiMediaUploading}
                        />

                        <ChatTextArea
                            ref={chatTextAreaRef}
                            placeholder={placeholderText}
                            disabled={!currentChatSessionId || isAutoSendingActive || isSelectionModeActive}
                            onSend={() => { if (!isCharacterMode && !isAutoSendingActive) handleSendMessageClick(); }}
                            onPaste={onPasteHandler}
                            onEmptyChange={(empty) => {
                                setIsTextEmpty(empty);
                                if (empty) setPendingModelOverride(undefined);
                            }}
                        />
                        
                        <InputActions 
                            group="end"
                            isLoading={isLoading}
                            isAutoSendingActive={isAutoSendingActive}
                            isCharacterMode={isCharacterMode}
                            isSelectionModeActive={isSelectionModeActive}
                            isInfoInputModeActive={isInfoInputModeActive}
                            showContinueFlow={showContinueFlowButton}
                            hasValidInput={hasValidInputForMainSend}
                            onAttachClick={onAttachHandler}
                            onToggleInfoInput={toggleInfoInputMode}
                            onContinueFlow={handleContinueFlowClick}
                            onSend={handleSendMessageClick}
                            onCancel={handleMainCancelButtonClick}
                            onViewAttachments={handleViewAttachments}
                            onToggleRecording={toggleRecording}
                            isRecording={isRecording}
                            isTranscribing={isTranscribing}
                            isFileProcessing={isAnyFileStillProcessing || isAnyAiMediaUploading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ChatInputArea;
