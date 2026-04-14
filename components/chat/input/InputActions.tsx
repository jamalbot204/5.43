
import React, { memo, useRef, useCallback } from 'react';
import { 
    PaperClipIcon, 
    InfoIcon, 
    FlowRightIcon, 
    StopIcon, 
    SendIcon, 
    FolderOpenIcon, 
    PlusIcon, 
    MicrophoneIcon, 
    StopCircleIcon,
    BookOpenIcon,
    CogIcon,
    WrenchScrewdriverIcon,
    LinkIcon
} from '../../common/Icons.tsx';
import { useTranslation } from '../../../hooks/useTranslation.ts';
import { useExternalModelsStore } from '../../../store/useExternalModelsStore.ts';
import { useActiveChatStore } from '../../../store/useActiveChatStore.ts';
import { useDataStore } from '../../../store/useDataStore.ts';
import { useSettingsUI } from '../../../store/ui/useSettingsUI.ts';
import { useEditorUI } from '../../../store/ui/useEditorUI.ts';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../ui/Button.tsx';
import { Dropdown } from '../../ui/Dropdown.tsx';
import { GeminiSettings } from '../../../types.ts';

interface InputActionsProps {
    group: 'start' | 'end';
    isLoading: boolean;
    isAutoSendingActive: boolean;
    isCharacterMode: boolean;
    isSelectionModeActive: boolean;
    isInfoInputModeActive: boolean;
    showContinueFlow: boolean;
    hasValidInput: boolean;
    onAttachClick: (files: FileList | null) => void;
    onToggleInfoInput: () => void;
    onContinueFlow: () => void;
    onSend: () => void;
    onCancel: () => void;
    onViewAttachments: () => void;
    onToggleRecording: () => void;
    isRecording: boolean;
    isTranscribing: boolean;
    isFileProcessing: boolean;
}

const InputActions: React.FC<InputActionsProps> = memo(({
    group,
    isLoading,
    isAutoSendingActive,
    isCharacterMode,
    isSelectionModeActive,
    isInfoInputModeActive,
    showContinueFlow,
    hasValidInput,
    onAttachClick,
    onToggleInfoInput,
    onContinueFlow,
    onSend,
    onCancel,
    onViewAttachments,
    onToggleRecording,
    isRecording,
    isTranscribing,
    isFileProcessing
}) => {
    const { t } = useTranslation();
    const { isExternalModeActive } = useExternalModelsStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { settings, updateCurrentChatSession } = useActiveChatStore(useShallow(state => ({
        settings: state.currentChatSession?.settings,
        updateCurrentChatSession: state.updateCurrentChatSession
    })));
    const { updateSettings } = useDataStore();
    const { 
        openActiveMemoryModal, 
        openStrategySetupModal, 
        openStoryManagerModal 
    } = useSettingsUI();

    const toggleSetting = useCallback(async (key: keyof GeminiSettings) => {
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (!currentChatSession) return;
        
        const currentVal = currentChatSession.settings[key];
        const newVal = !currentVal;
        
        const newSettings = { ...currentChatSession.settings, [key]: newVal };
        await updateCurrentChatSession(s => s ? ({ ...s, settings: newSettings }) : null);
        await updateSettings(currentChatSession.id, newSettings);
    }, [updateCurrentChatSession, updateSettings]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onAttachClick(e.target.files);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [onAttachClick]);

    const isDisabledGeneral = isInfoInputModeActive || isAutoSendingActive || isSelectionModeActive;

    if (group === 'start') {
        const isStrategyActive = settings?.isStrategyToolEnabled ?? false;
        const isActiveMemoryEnabled = settings?.isMemoryBoxEnabled ?? false;

        return (
            <div className="flex items-center gap-1 pb-1">
                <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                />
                
                <Dropdown
                    trigger={
                        <Button 
                            disabled={isDisabledGeneral} 
                            variant="ghost"
                            size="icon"
                            className="rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors" 
                            title={t.plusMenuTitle}
                        >
                            <PlusIcon className="w-5 h-5" />
                        </Button>
                    }
                    className="w-56"
                >
                    {({ close }) => (
                        <>
                            {/* Add Files */}
                            <Button 
                                onClick={() => { fileInputRef.current?.click(); close(); }}
                                variant="ghost"
                                disabled={isExternalModeActive}
                                className="flex items-center justify-start px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors w-full text-left"
                            >
                                <PaperClipIcon className="w-4 h-4 mr-2 text-brand-primary" />
                                {t.addFiles}
                            </Button>

                            {/* Fetch from URL */}
                            <Button 
                                onClick={() => { useEditorUI.getState().openUrlImportModal(onAttachClick); close(); }}
                                variant="ghost"
                                disabled={isExternalModeActive}
                                className="flex items-center justify-start px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors w-full text-left"
                            >
                                <LinkIcon className="w-4 h-4 mr-2 text-brand-primary" />
                                Fetch from URL
                            </Button>

                            {/* Chat Attachments */}
                            <Button 
                                onClick={() => { onViewAttachments(); close(); }}
                                variant="ghost"
                                className="flex items-center justify-start px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors w-full text-left"
                            >
                                <FolderOpenIcon className="w-4 h-4 mr-2 text-tint-amber-text" />
                                {t.chatAttachments}
                            </Button>

                            {/* Context Input (Conditional) */}
                            {isCharacterMode && (
                                <Button 
                                    onClick={() => { onToggleInfoInput(); close(); }}
                                    variant="ghost"
                                    className={`flex items-center justify-start px-3 py-2 text-xs font-medium rounded-lg transition-colors w-full text-left ${isInfoInputModeActive ? 'bg-tint-amber-bg/10 text-tint-amber-text' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}`}
                                >
                                    <InfoIcon className="w-4 h-4 mr-2" />
                                    {isInfoInputModeActive ? t.disableContextInput : t.enableContextInput}
                                </Button>
                            )}

                            <div className="h-px bg-border-light my-1 mx-2" />

                            {/* Story Manager */}
                            <Button 
                                onClick={() => { openStoryManagerModal(); close(); }}
                                variant="ghost"
                                className="flex items-center justify-start px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors w-full text-left"
                            >
                                <BookOpenIcon className="w-4 h-4 mr-2 text-tint-cyan-text" />
                                <span>Story Manager</span>
                            </Button>

                            {/* Strategic Protocol */}
                            <div className="flex items-center gap-1 px-1">
                                <Button 
                                    onClick={() => { toggleSetting('isStrategyToolEnabled'); close(); }}
                                    variant="ghost"
                                    className={`flex-1 flex items-center justify-start px-2 py-2 text-xs font-medium rounded-lg transition-colors text-left ${isStrategyActive ? 'bg-tint-amber-bg/10 text-tint-amber-text' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}`}
                                >
                                    <WrenchScrewdriverIcon className="w-4 h-4 mr-2" />
                                    <span>Protocol</span>
                                </Button>
                                <Button 
                                    onClick={(e) => { e.stopPropagation(); openStrategySetupModal(); close(); }} 
                                    variant="ghost"
                                    size="none"
                                    className="p-2 text-text-muted hover:text-text-primary"
                                >
                                    <CogIcon className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* User Profile */}
                            <div className="flex items-center gap-1 px-1">
                                <Button 
                                    onClick={() => { toggleSetting('isMemoryBoxEnabled'); close(); }}
                                    variant="ghost"
                                    className={`flex-1 flex items-center justify-start px-2 py-2 text-xs font-medium rounded-lg transition-colors text-left ${isActiveMemoryEnabled ? 'bg-tint-cyan-bg/10 text-tint-cyan-text' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}`}
                                >
                                    <PlusIcon className="w-4 h-4 mr-2" />
                                    <span>User Profile</span>
                                </Button>
                                <Button 
                                    onClick={(e) => { e.stopPropagation(); openActiveMemoryModal(); close(); }} 
                                    variant="ghost"
                                    size="none"
                                    className="p-2 text-text-muted hover:text-text-primary"
                                >
                                    <CogIcon className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </Dropdown>
            </div>
        );
    }

    if (group === 'end') {
        const isStopActive = isLoading || isAutoSendingActive;

        return (
            <div className="flex items-center gap-1 pb-1">
                {isStopActive ? (
                    <Button 
                        onClick={onCancel} 
                        variant="danger"
                        size="icon"
                        className="rounded-xl transition-colors" 
                        aria-label={t.stop}
                    >
                        <StopIcon className="w-5 h-5" />
                    </Button>
                ) : !isCharacterMode ? (
                    <Button 
                        onClick={onSend} 
                        disabled={!hasValidInput || isFileProcessing || isAutoSendingActive || isSelectionModeActive || isRecording} 
                        variant="primary"
                        size="icon"
                        className="rounded-xl transition disabled:opacity-50" 
                        aria-label={t.sendMessage}
                    >
                        <SendIcon className="w-5 h-5" />
                    </Button>
                ) : (
                    <div className="flex items-center gap-1">
                        <Button
                            onClick={onToggleRecording}
                            disabled={isTranscribing || isLoading || isAutoSendingActive || isSelectionModeActive}
                            variant="ghost"
                            size="icon"
                            className={`rounded-xl transition duration-200 disabled:opacity-50 
                                ${isRecording 
                                    ? 'bg-tint-red-bg/10 text-tint-red-text border-tint-red-border/20' 
                                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                                }`}
                            title={isRecording ? "Stop Recording" : "Voice Input"}
                        >
                            {isTranscribing ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-primary border-t-transparent"></div>
                            ) : isRecording ? (
                                <StopCircleIcon className="w-6 h-6 animate-pulse" />
                            ) : (
                                <MicrophoneIcon className="w-5 h-5" />
                            )}
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    return null;
});

export default InputActions;

