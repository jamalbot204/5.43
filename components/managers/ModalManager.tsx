
import React, { useCallback, memo, Suspense } from 'react';
import { AnimatePresence } from 'motion/react';
import { useConfirmationUI } from '../../store/ui/useConfirmationUI.ts';
import { useEditorUI } from '../../store/ui/useEditorUI.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';

import { useApiKeyStore } from '../../store/useApiKeyStore.ts';
import { useChatListStore } from '../../store/useChatListStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { useGithubStore } from '../../store/useGithubStore.ts';
import { useSelectionStore } from '../../store/useSelectionStore.ts';
import { useHistorySelectionStore } from '../../store/useHistorySelectionStore.ts';
import { usePromptButtonStore } from '../../store/usePromptButtonStore.ts';
import { useArchiverStore } from '../../store/useArchiverStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';

// Lazy Imports for Modals (Performance Optimization)
const SettingsPanel = React.lazy(() => import('../settings/SettingsPanel.tsx'));
const EditMessagePanel = React.lazy(() => import('../panels/EditMessagePanel.tsx'));
const CharacterManagementModal = React.lazy(() => import('../modals/CharacterManagementModal.tsx'));
const CharacterContextualInfoModal = React.lazy(() => import('../modals/CharacterContextualInfoModal.tsx'));
const DebugTerminalPanel = React.lazy(() => import('../panels/DebugTerminalPanel.tsx'));
const ConfirmationModal = React.lazy(() => import('../modals/ConfirmationModal.tsx'));
const TtsSettingsModal = React.lazy(() => import('../modals/TtsSettingsModal.tsx'));
const ExportConfigurationModal = React.lazy(() => import('../modals/ExportConfigurationModal.tsx'));
const FilenameInputModal = React.lazy(() => import('../modals/FilenameInputModal.tsx'));
const ChatAttachmentsModal = React.lazy(() => import('../chat/ChatAttachmentsModal.tsx'));
const MultiSelectActionBar = React.lazy(() => import('../chat/MultiSelectActionBar.tsx'));
const ApiKeyModal = React.lazy(() => import('../modals/ApiKeyModal.tsx'));
const GitHubImportModal = React.lazy(() => import('../modals/GitHubImportModal.tsx'));
const InjectedMessageEditModal = React.lazy(() => import('../modals/InjectedMessageEditModal.tsx'));
const MemorySourceSelectionModal = React.lazy(() => import('../modals/MemorySourceSelectionModal.tsx'));
const ReasoningSetupModal = React.lazy(() => import('../modals/ReasoningSetupModal.tsx'));
const ShadowSetupModal = React.lazy(() => import('../modals/ShadowSetupModal.tsx'));
const ActiveMemoryModal = React.lazy(() => import('../modals/ActiveMemoryModal.tsx'));
const StrategySetupModal = React.lazy(() => import('../modals/StrategySetupModal.tsx'));
const TelegramImportModal = React.lazy(() => import('../modals/TelegramImportModal.tsx'));
const CustomStrategyModal = React.lazy(() => import('../modals/CustomStrategyModal.tsx'));
const TextExportModal = React.lazy(() => import('../modals/TextExportModal.tsx'));
const MermaidModal = React.lazy(() => import('../modals/MermaidModal.tsx'));
const MoveMessagesModal = React.lazy(() => import('../modals/MoveMessagesModal.tsx'));
const PromptButtonManagerModal = React.lazy(() => import('../modals/PromptButtonManagerModal.tsx'));
const ArchiverModal = React.lazy(() => import('../modals/ArchiverModal.tsx')); 
const StoryManagerModal = React.lazy(() => import('../modals/StoryManagerModal.tsx')); // ADDED
const ExternalModelsModal = React.lazy(() => import('../modals/ExternalModelsModal.tsx')); // ADDED
const CacheManagerModal = React.lazy(() => import('../modals/CacheManagerModal.tsx').then(m => ({ default: m.CacheManagerModal }))); // ADDED
const LorebookManagerModal = React.lazy(() => import('../modals/LorebookManagerModal.tsx').then(m => ({ default: m.LorebookManagerModal }))); // ADDED
const UrlImportModal = React.lazy(() => import('../modals/UrlImportModal.tsx'));

const ModalLoadingFallback = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-overlay/80 pointer-events-none">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

interface ModalManagerProps {
  onScrollToMessage: (messageId: string) => void;
}

const ModalManager: React.FC<ModalManagerProps> = memo(({ onScrollToMessage }) => {
  const { t } = useTranslation();
  
  // Use specialized stores
  const settingsUI = useSettingsUI();
  const editorUI = useEditorUI();
  const confirmationUI = useConfirmationUI();

  const { deleteApiKey } = useApiKeyStore();
  const { deleteMessageAndSubsequent, resetAudioCache } = useInteractionStore();
  const { deleteChat, deleteMultipleChats } = useChatListStore();
  const { deletePromptButton } = usePromptButtonStore();
  const chatTitle = useActiveChatStore(state => state.currentChatSession?.title);
  const { showToast } = useToastStore();
  const { setGithubRepo } = useGithubStore();
  const { isSelectionModeActive } = useSelectionStore();
  const { selectedChatIds } = useHistorySelectionStore();
  const { deleteChapter, deleteAllChapters } = useArchiverStore();

  const handleConfirmDeletion = useCallback(() => {
    if (confirmationUI.deleteTarget) {
      if (confirmationUI.deleteTarget.messageId === 'api-key') {
        deleteApiKey(confirmationUI.deleteTarget.sessionId);
        showToast("API Key deleted.", "success");
      } else {
        deleteMessageAndSubsequent(confirmationUI.deleteTarget.messageId);
      }
    }
    confirmationUI.cancelDeleteConfirmation();
  }, [confirmationUI.deleteTarget, deleteApiKey, deleteMessageAndSubsequent, showToast, confirmationUI.cancelDeleteConfirmation]);

  const handleConfirmChatDeletion = useCallback(() => {
    if (confirmationUI.deleteChatTarget) {
      deleteChat(confirmationUI.deleteChatTarget.sessionId);
    }
    confirmationUI.cancelDeleteChatConfirmation();
  }, [confirmationUI.deleteChatTarget, deleteChat, confirmationUI.cancelDeleteChatConfirmation]);

  const handleConfirmHistoryDeletion = useCallback(() => {
    if (selectedChatIds.length > 0) {
      deleteMultipleChats(selectedChatIds);
    }
    confirmationUI.cancelDeleteHistoryConfirmation();
  }, [selectedChatIds, deleteMultipleChats, confirmationUI.cancelDeleteHistoryConfirmation]);

  const handleConfirmPromptButtonDeletion = useCallback(() => {
    if (confirmationUI.deletePromptButtonTarget) {
        deletePromptButton(confirmationUI.deletePromptButtonTarget);
    }
    confirmationUI.cancelDeletePromptButtonConfirmation();
  }, [confirmationUI.deletePromptButtonTarget, deletePromptButton, confirmationUI.cancelDeletePromptButtonConfirmation]);

  const handleConfirmChapterDeletion = useCallback(() => {
    if (confirmationUI.deleteChapterIndex !== null) {
        deleteChapter(confirmationUI.deleteChapterIndex);
    }
    confirmationUI.cancelDeleteChapterConfirmation();
  }, [confirmationUI.deleteChapterIndex, deleteChapter, confirmationUI.cancelDeleteChapterConfirmation]);

  const handleConfirmDeleteAllChapters = useCallback(() => {
    deleteAllChapters();
    confirmationUI.cancelDeleteAllChaptersConfirmation();
  }, [deleteAllChapters, confirmationUI.cancelDeleteAllChaptersConfirmation]);

  const handleGoToAttachmentInChat = useCallback((messageId: string) => {
    settingsUI.closeChatAttachmentsModal();
    onScrollToMessage(messageId);
  }, [settingsUI.closeChatAttachmentsModal, onScrollToMessage]);

  const handleJumpToMessageFromMemory = useCallback((messageId: string) => {
    settingsUI.closeActiveMemoryModal();
    onScrollToMessage(messageId);
  }, [settingsUI.closeActiveMemoryModal, onScrollToMessage]);

  return (
    <Suspense fallback={<ModalLoadingFallback />}>
      <AnimatePresence>
        {settingsUI.isSettingsPanelOpen && <SettingsPanel key="settings" />}
        {settingsUI.isApiKeyModalOpen && <ApiKeyModal key="apikey" isOpen={settingsUI.isApiKeyModalOpen} onClose={settingsUI.closeApiKeyModal} />}
        {settingsUI.isGitHubImportModalOpen && (
            <GitHubImportModal
                key="github"
                isOpen={settingsUI.isGitHubImportModalOpen}
                onClose={settingsUI.closeGitHubImportModal}
                onImport={setGithubRepo}
            />
        )}
        {settingsUI.isExportConfigModalOpen && <ExportConfigurationModal key="export" />}
        {settingsUI.isTtsSettingsModalOpen && <TtsSettingsModal key="tts" />}
        {editorUI.isEditPanelOpen && <EditMessagePanel key="edit" />}
        {settingsUI.isCharacterManagementModalOpen && <CharacterManagementModal key="character" />}
        {settingsUI.isContextualInfoModalOpen && <CharacterContextualInfoModal key="contextual" />}
        {settingsUI.isDebugTerminalOpen && <DebugTerminalPanel key="debug" />}
        {isSelectionModeActive && <MultiSelectActionBar key="multiselect" />}
        {settingsUI.isChatAttachmentsModalOpen && (
            <ChatAttachmentsModal
                key="attachments"
                isOpen={settingsUI.isChatAttachmentsModalOpen}
                attachments={settingsUI.attachmentsForModal}
                chatTitle={chatTitle || "Current Chat"}
                onClose={settingsUI.closeChatAttachmentsModal}
                onGoToMessage={handleGoToAttachmentInChat}
                autoHighlightRefresh={settingsUI.autoHighlightRefresh}
            />
        )}

        {editorUI.isFilenameInputModalOpen && editorUI.filenameInputModalProps && (
            <FilenameInputModal
            key="filename"
            isOpen={editorUI.isFilenameInputModalOpen}
            title={editorUI.filenameInputModalProps.title}
            defaultFilename={editorUI.filenameInputModalProps.defaultFilename}
            promptMessage={editorUI.filenameInputModalProps.promptMessage}
            onSubmit={editorUI.submitFilenameInputModal}
            onClose={editorUI.closeFilenameInputModal}
            />
        )}

        {editorUI.isInjectedMessageEditModalOpen && <InjectedMessageEditModal key="injected" />}
        {editorUI.isMermaidModalOpen && <MermaidModal key="mermaid" />}
        {settingsUI.isMemorySourceModalOpen && <MemorySourceSelectionModal key="memorysource" />} 
        {settingsUI.isCustomStrategyModalOpen && <CustomStrategyModal key="customstrategy" />}
        {settingsUI.isReasoningSetupModalOpen && <ReasoningSetupModal key="reasoning" />}
        {settingsUI.isShadowSetupModalOpen && <ShadowSetupModal key="shadow" />}
        {settingsUI.isActiveMemoryModalOpen && <ActiveMemoryModal key="activememory" onJumpToMessage={handleJumpToMessageFromMemory} />}
        {settingsUI.isStrategySetupModalOpen && <StrategySetupModal key="strategy" />}
        {settingsUI.isTelegramImportModalOpen && <TelegramImportModal key="telegram" />}
        {settingsUI.isTextExportModalOpen && <TextExportModal key="textexport" />}
        {settingsUI.isMoveMessagesModalOpen && <MoveMessagesModal key="movemessages" />}
        {settingsUI.isPromptButtonManagerOpen && <PromptButtonManagerModal key="promptbutton" />}
        {settingsUI.isArchiverModalOpen && <ArchiverModal key="archiver" />}
        {settingsUI.isStoryManagerModalOpen && <StoryManagerModal key="storymanager" />}
        {settingsUI.isExternalModelsModalOpen && <ExternalModelsModal key="externalmodels" />}
        {settingsUI.isCacheManagerModalOpen && <CacheManagerModal key="cachemanager" />}
        {settingsUI.isLorebookModalOpen && <LorebookManagerModal key="lorebook" />}
        {editorUI.isUrlImportModalOpen && <UrlImportModal key="urlimport" />}

        {/* Confirmation Modals placed last to ensure they stack on top */}
        {confirmationUI.isDeleteConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete"
                isOpen={confirmationUI.isDeleteConfirmationOpen}
                title={t.confirmDeletion}
                message={confirmationUI.deleteTarget?.messageId === 'api-key' ? t.confirmApiKeyDeletionMsg : <>{t.confirmMsgDeletionMsg} <strong className="text-tint-red-text">{t.subsequentMessages}</strong>? <br/>{t.cannotUndo}</>}
                confirmText={t.yesDelete} cancelText={t.noCancel}
                onConfirm={handleConfirmDeletion}
                onCancel={confirmationUI.cancelDeleteConfirmation}
                isDestructive={true}
            />
        )}
        
        {confirmationUI.isDeleteChatConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete-chat"
                isOpen={confirmationUI.isDeleteChatConfirmationOpen}
                title={t.confirmChatDeletion}
                message={confirmationUI.deleteChatTarget ? `${t.confirmChatDeletionMsg} "${confirmationUI.deleteChatTarget.sessionTitle}"? ${t.cannotUndo}` : ''}
                confirmText={t.yesDelete}
                cancelText={t.noCancel}
                onConfirm={handleConfirmChatDeletion}
                onCancel={confirmationUI.cancelDeleteChatConfirmation}
                isDestructive={true}
            />
        )}

        {confirmationUI.isResetAudioConfirmationOpen && (
            <ConfirmationModal
                key="confirm-reset-audio"
                isOpen={confirmationUI.isResetAudioConfirmationOpen}
                title={t.confirmAudioReset}
                message={t.confirmAudioResetMsg}
                confirmText={t.yesResetAudio} cancelText={t.noCancel}
                onConfirm={() => { 
                if(confirmationUI.resetAudioTarget) {
                    resetAudioCache(confirmationUI.resetAudioTarget.messageId);
                }
                confirmationUI.cancelResetAudioCacheConfirmation(); 
                }} 
                onCancel={confirmationUI.cancelResetAudioCacheConfirmation}
                isDestructive={true}
            />
        )}

        {confirmationUI.isDeleteHistoryConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete-history"
                isOpen={confirmationUI.isDeleteHistoryConfirmationOpen}
                title={t.confirmHistoryDeletion}
                message={`${t.confirmHistoryDeletionMsg} (${confirmationUI.deleteHistoryCount} chats)`}
                confirmText={t.yesDelete}
                cancelText={t.noCancel}
                onConfirm={handleConfirmHistoryDeletion}
                onCancel={confirmationUI.cancelDeleteHistoryConfirmation}
                isDestructive={true}
            />
        )}

        {confirmationUI.isDeletePromptButtonConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete-prompt"
                isOpen={confirmationUI.isDeletePromptButtonConfirmationOpen}
                title="Delete Quick Action"
                message="Are you sure you want to delete this button?"
                confirmText={t.delete}
                cancelText={t.cancel}
                onConfirm={handleConfirmPromptButtonDeletion}
                onCancel={confirmationUI.cancelDeletePromptButtonConfirmation}
                isDestructive={true}
            />
        )}

        {confirmationUI.isDeleteChapterConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete-chapter"
                isOpen={confirmationUI.isDeleteChapterConfirmationOpen}
                title="Delete Chapter"
                message="Are you sure you want to delete this chapter? This cannot be undone."
                confirmText={t.delete}
                cancelText={t.cancel}
                onConfirm={handleConfirmChapterDeletion}
                onCancel={confirmationUI.cancelDeleteChapterConfirmation}
                isDestructive={true}
            />
        )}

        {confirmationUI.isDeleteAllChaptersConfirmationOpen && (
            <ConfirmationModal
                key="confirm-delete-all-chapters"
                isOpen={confirmationUI.isDeleteAllChaptersConfirmationOpen}
                title="Delete All Chapters"
                message="Are you sure you want to delete ALL archived chapters? This cannot be undone."
                confirmText={t.delete}
                cancelText={t.cancel}
                onConfirm={handleConfirmDeleteAllChapters}
                onCancel={confirmationUI.cancelDeleteAllChaptersConfirmation}
                isDestructive={true}
            />
        )}
      </AnimatePresence>
    </Suspense>
  );
});

export default ModalManager;
