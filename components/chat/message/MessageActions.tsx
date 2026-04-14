
import React, { memo, useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage, ChatSession, ChatMessageRole } from '../../../types.ts';
import { 
    EllipsisVerticalIcon, BookOpenIcon, PdfIcon, ClipboardDocumentListIcon, 
    ChatBubblePlusIcon, ArrowDownTrayIcon, PencilIcon, ArrowPathIcon, XCircleIcon, TrashIcon, CheckCircleIcon 
} from '../../common/Icons.tsx';
import { useEditorUI } from '../../../store/ui/useEditorUI.ts';
import { useConfirmationUI } from '../../../store/ui/useConfirmationUI.ts';
import { useInteractionStore } from '../../../store/useInteractionStore.ts';
import { useGeminiApiStore } from '../../../store/useGeminiApiStore.ts';
import { useAudioStore } from '../../../store/useAudioStore.ts';
import { useMessageStore } from '../../../store/useMessageStore.ts';
import { useSelectionStore } from '../../../store/useSelectionStore.ts';
import { useTranslation } from '../../../hooks/useTranslation.ts';
import { sanitizeFilename } from '../../../services/utils.ts';
import { useShallow } from 'zustand/react/shallow';
import { useActiveChatStore } from '../../../store/useActiveChatStore.ts';

import { Button } from '../../ui/Button.tsx';
import { useStreamingStore } from '../../../store/useStreamingStore.ts';

interface MessageActionsProps {
    message: ChatMessage;
    isSelectionModeActive: boolean;
    canRegenerateFollowingAI: boolean;
    onEnterReadMode: (messageId: string) => void;
    displayContent: string;
    allTtsPartsCached: boolean;
    textSegmentsForTts: string[];
}

const DropdownMenuItem: React.FC<{
    onClick: () => void;
    icon: React.FC<{ className?: string }>;
    label: string;
    hoverGlowClassName?: string;
    className?: string;
    iconClassName?: string;
    disabled?: boolean;
}> = memo(({ onClick, icon: Icon, label, hoverGlowClassName, className, iconClassName, disabled = false }) => (
    <Button 
        variant="ghost"
        size="sm"
        role="menuitem" 
        disabled={disabled} 
        title={label} 
        aria-label={label} 
        className={`w-auto p-2 flex items-center justify-center ${hoverGlowClassName || ''} ${className || ''}`} 
        onMouseDown={() => { if (!disabled) onClick(); }} 
        onTouchStart={() => { if (!disabled) onClick(); }} 
        onClick={(e) => { e.preventDefault(); }}
        icon={<Icon className={`w-5 h-5 ${disabled ? 'text-text-muted' : (iconClassName || '')}`} />}
    />
));

const MessageActions: React.FC<MessageActionsProps> = memo(({ 
    message, 
    isSelectionModeActive, 
    canRegenerateFollowingAI, 
    onEnterReadMode, 
    displayContent,
    allTtsPartsCached,
    textSegmentsForTts
}) => {
    const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ opacity: 0, position: 'fixed' });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const optionsButtonRef = useRef<HTMLButtonElement>(null);

    const { showReadModeButton, showExportPdfButton } = useActiveChatStore(useShallow(state => ({
        showReadModeButton: state.currentChatSession?.settings.showReadModeButton ?? false,
        showExportPdfButton: state.currentChatSession?.settings.showExportPdfButton ?? false
    })));

    const { openEditPanel, openFilenameInputModal } = useEditorUI();
    const { requestDeleteConfirmation } = useConfirmationUI();
    const { deleteSingleMessage, copyMessage, handleExportMessagePdf } = useInteractionStore();
    const { handleRegenerateAIMessage, handleRegenerateResponseForUserMessage } = useGeminiApiStore.getState();
    const { insertUserAiPairAfter } = useMessageStore();
    const { lastSelectedId, selectRange } = useSelectionStore();
    
    const audioState = useAudioStore(useShallow(state => ({
        currentMessageId: state.audioPlayerState.currentMessageId,
        isPlaying: state.audioPlayerState.isPlaying,
        isLoading: state.audioPlayerState.isLoading,
        fetchingSegmentIds: state.fetchingSegmentIds,
        activeMultiPartFetches: state.activeMultiPartFetches
    })));
    const handleDownloadAudio = useAudioStore(state => state.handleDownloadAudio);

    const { t } = useTranslation();

    const isUser = message.role === ChatMessageRole.USER;
    const isError = message.role === ChatMessageRole.ERROR;
    const isModel = message.role === ChatMessageRole.MODEL;

    const exportTargetId = `message-content-${message.id}`; 

    const isStreaming = useStreamingStore(state => state.streamingMessageId === message.id);
    const streamingText = useStreamingStore(state => state.streamingText);

    const isAnyAudioOperationActiveForMessage = isStreaming || audioState.activeMultiPartFetches.has(message.id) || textSegmentsForTts.some((_, partIdx) => audioState.fetchingSegmentIds.has(`${message.id}_part_${partIdx}`)) || (textSegmentsForTts.length <= 1 && audioState.fetchingSegmentIds.has(message.id)) || (audioState.currentMessageId?.startsWith(message.id) && (audioState.isLoading || audioState.isPlaying));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && optionsButtonRef.current && !optionsButtonRef.current.contains(event.target as Node)) {
            setIsOptionsMenuOpen(false);
          }
        };
        const handleEscapeKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOptionsMenuOpen(false); };
        const handleScroll = () => { setIsOptionsMenuOpen(false); };

        if (isOptionsMenuOpen) {
          document.addEventListener('mousedown', handleClickOutside);
          document.addEventListener('keydown', handleEscapeKey);
          window.addEventListener('scroll', handleScroll, true);
          window.addEventListener('resize', handleScroll);
        }
        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
          document.removeEventListener('keydown', handleEscapeKey);
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('resize', handleScroll);
        };
    }, [isOptionsMenuOpen]);

    useLayoutEffect(() => {
        if (isOptionsMenuOpen && dropdownRef.current && optionsButtonRef.current) {
            const buttonRect = optionsButtonRef.current.getBoundingClientRect();
            const menuRect = dropdownRef.current.getBoundingClientRect();
            
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            const isRTL = document.documentElement.dir === 'rtl';
            
            const GAP = 5;
            const EDGE_MARGIN = 10;

            let top = buttonRect.bottom + GAP;
            let left: number | undefined = undefined;
            let right: number | undefined = undefined;

            // Vertical flip logic
            if (top + menuRect.height > vh - EDGE_MARGIN) {
                const topAbove = buttonRect.top - menuRect.height - GAP;
                if (topAbove > EDGE_MARGIN) {
                    top = topAbove;
                } else {
                    top = vh - menuRect.height - EDGE_MARGIN;
                }
            }

            // Horizontal alignment logic (RTL aware)
            if (isRTL) {
                right = vw - buttonRect.right;
                if (right + menuRect.width > vw - EDGE_MARGIN) {
                    right = EDGE_MARGIN;
                }
            } else {
                left = buttonRect.left;
                if (left + menuRect.width > vw - EDGE_MARGIN) {
                    left = vw - menuRect.width - EDGE_MARGIN;
                }
                if (left < EDGE_MARGIN) {
                    left = EDGE_MARGIN;
                }
            }

            setMenuStyle({
                position: 'fixed',
                top: top,
                left: left,
                right: right,
                opacity: 1,
                zIndex: 9999,
                maxHeight: `calc(100vh - ${EDGE_MARGIN * 2}px)`,
                overflowY: 'auto'
            });
        } else {
            setMenuStyle({ opacity: 0, position: 'fixed' });
        }
    }, [isOptionsMenuOpen]);

    const handleOptionsClick = useCallback((e: React.MouseEvent) => {
        // Allow opening menu even in selection mode to access Range Select
        e.stopPropagation();
        setIsOptionsMenuOpen(prev => !prev);
    }, []);

    const handleEditClick = () => {
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (!currentChatSession) return;
        openEditPanel({ sessionId: currentChatSession.id, messageId: message.id, originalContent: message.content, role: message.role, attachments: message.attachments });
        setIsOptionsMenuOpen(false);
    };

    const handleReadModeClick = () => { onEnterReadMode(message.id); setIsOptionsMenuOpen(false); }; // Pass ID
    const handleCopyMessageClick = async () => { 
        const contentToCopy = isStreaming ? streamingText : message.content;
        await copyMessage(contentToCopy); 
        setIsOptionsMenuOpen(false); 
    };
    
    const triggerAudioDownloadModal = (messageId: string) => {
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (!currentChatSession) return;
        const content = isStreaming ? streamingText : message.content;
        const words = content.trim().split(/\s+/);
        const firstWords = words.slice(0, 7).join(' ');
        const defaultNameSuggestion = sanitizeFilename(firstWords, 50) || 'audio_download';
        openFilenameInputModal({
          title: t.downloadAudio,
          defaultFilename: defaultNameSuggestion,
          promptMessage: "Enter filename for audio (extension .mp3 will be added):",
          onSubmit: (userProvidedName) => {
            const finalName = userProvidedName.trim() === '' ? defaultNameSuggestion : userProvidedName.trim();
            handleDownloadAudio(messageId, finalName);
          }
        });
        setIsOptionsMenuOpen(false);
    };

    const handleInjectPairClick = () => { 
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (!currentChatSession) return; 
        insertUserAiPairAfter(message.id); 
        setIsOptionsMenuOpen(false); 
    };

    const handleSelectRange = () => {
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (currentChatSession?.messages) {
            selectRange(message.id, currentChatSession.messages);
        }
        setIsOptionsMenuOpen(false);
    };

    return (
        <>
            <Button 
                ref={optionsButtonRef} 
                id={`options-menu-button-${message.id}`} 
                onClick={handleOptionsClick} 
                title="Options" 
                aria-haspopup="true" 
                aria-expanded={isOptionsMenuOpen} 
                variant="ghost"
                size="sm"
                className="p-1.5 rounded-full bg-transparent focus:ring-2 ring-brand-primary hover:bg-bg-hover"
                icon={<EllipsisVerticalIcon className="w-4 h-4" />}
            />
            {isOptionsMenuOpen && createPortal(
                <div 
                    ref={dropdownRef} 
                    className="bg-bg-panel w-auto max-w-[90vw] rounded-xl shadow-panel p-1 flex space-x-1 focus:outline-none border border-border-base"
                    style={menuStyle}
                    role="menu" 
                    aria-orientation="horizontal" 
                    aria-labelledby={`options-menu-button-${message.id}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {isSelectionModeActive && lastSelectedId && lastSelectedId !== message.id && (
                        <DropdownMenuItem onClick={handleSelectRange} icon={CheckCircleIcon} label="Select Range to Here" iconClassName="text-tint-emerald-text" hoverGlowClassName="hover:bg-tint-emerald-bg/20" />
                    )}
                    
                    {!isSelectionModeActive && (
                        <>
                            {(showReadModeButton) && (<DropdownMenuItem onClick={handleReadModeClick} icon={BookOpenIcon} label={t.readMode} hoverGlowClassName="hover:bg-bg-hover"/>)}
                            {(showExportPdfButton) && (<DropdownMenuItem onClick={() => { handleExportMessagePdf(message.id, exportTargetId); setIsOptionsMenuOpen(false); }} icon={PdfIcon} label={t.exportToPdf} iconClassName="text-tint-red-text" hoverGlowClassName="hover:bg-bg-hover" disabled={isAnyAudioOperationActiveForMessage} />)}
                            <DropdownMenuItem onClick={handleCopyMessageClick} icon={ClipboardDocumentListIcon} label={t.copyText} hoverGlowClassName="hover:bg-bg-hover"/>
                            {(isUser || isModel) && <DropdownMenuItem onClick={handleInjectPairClick} icon={ChatBubblePlusIcon} label={t.insertPairAfter} disabled={isAnyAudioOperationActiveForMessage} hoverGlowClassName="hover:bg-bg-hover"/>}
                            {message.content.trim() && !isError && allTtsPartsCached && (<DropdownMenuItem onClick={() => triggerAudioDownloadModal(message.id)} icon={ArrowDownTrayIcon} label={t.downloadAudio} disabled={isAnyAudioOperationActiveForMessage} hoverGlowClassName="hover:bg-bg-hover"/>)}
                            {!isError && (isUser || isModel) && (<DropdownMenuItem onClick={handleEditClick} icon={PencilIcon} label={t.edit} disabled={isAnyAudioOperationActiveForMessage} hoverGlowClassName="hover:bg-tint-indigo-bg/20"/>)}
                            {!isError && isModel && !message.characterName && (<DropdownMenuItem onClick={() => { handleRegenerateAIMessage(message.id); setIsOptionsMenuOpen(false); }} icon={ArrowPathIcon} label={t.regenerateJustThis} disabled={isAnyAudioOperationActiveForMessage} hoverGlowClassName="hover:bg-tint-indigo-bg/20"/>)}
                            {isUser && canRegenerateFollowingAI && !message.characterName && (<DropdownMenuItem onClick={() => { handleRegenerateResponseForUserMessage(message.id); setIsOptionsMenuOpen(false); }} icon={ArrowPathIcon} label={t.regenerateJustThis} disabled={isAnyAudioOperationActiveForMessage} hoverGlowClassName="hover:bg-tint-indigo-bg/20"/>)}
                            <DropdownMenuItem onClick={() => { deleteSingleMessage(message.id); setIsOptionsMenuOpen(false); }} icon={XCircleIcon} label={t.deleteThisMessage} className="text-tint-red-text" hoverGlowClassName="hover:bg-tint-red-bg/20" disabled={isAnyAudioOperationActiveForMessage}/>
                            <DropdownMenuItem onClick={() => { 
                                const currentChatSession = useActiveChatStore.getState().currentChatSession;
                                if (currentChatSession) {
                                    requestDeleteConfirmation({ sessionId: currentChatSession.id, messageId: message.id }); 
                                }
                                setIsOptionsMenuOpen(false); 
                            }} icon={TrashIcon} label={t.deleteMessageHistory} className="text-tint-red-text" hoverGlowClassName="hover:bg-tint-red-bg/20" disabled={isAnyAudioOperationActiveForMessage}/>
                        </>
                    )}
                </div>,
                document.body
            )}
        </>
    );
});

export default MessageActions;
