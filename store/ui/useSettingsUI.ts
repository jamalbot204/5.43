
import { create } from 'zustand';
import { useGlobalUiStore } from '../useGlobalUiStore.ts';
import { AICharacter, ChatSession, AttachmentWithContext } from '../../types.ts';
import { useToastStore } from '../useToastStore.ts';

interface SettingsUIState {
  isSettingsPanelOpen: boolean;
  isTtsSettingsModalOpen: boolean;
  isCharacterManagementModalOpen: boolean;
  isContextualInfoModalOpen: boolean;
  editingCharacterForContextualInfo: AICharacter | null;
  isDebugTerminalOpen: boolean;
  isExportConfigModalOpen: boolean;
  isChatAttachmentsModalOpen: boolean;
  attachmentsForModal: AttachmentWithContext[];
  autoHighlightRefresh: boolean; 
  isApiKeyModalOpen: boolean;
  isGitHubImportModalOpen: boolean;
  isTelegramImportModalOpen: boolean;
  isMemorySourceModalOpen: boolean;
  isReasoningSetupModalOpen: boolean;
  isShadowSetupModalOpen: boolean;
  isActiveMemoryModalOpen: boolean;
  isStrategySetupModalOpen: boolean;
  isCustomStrategyModalOpen: boolean;
  isTextExportModalOpen: boolean;
  isMoveMessagesModalOpen: boolean; 
  isPromptButtonManagerOpen: boolean;
  isArchiverModalOpen: boolean;
  isStoryManagerModalOpen: boolean; 
  isExternalModelsModalOpen: boolean; 
  isCacheManagerModalOpen: boolean; // ADDED
  isLorebookModalOpen: boolean;

  // Actions
  openSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  
  openTtsSettingsModal: () => void;
  closeTtsSettingsModal: () => void;
  
  openCharacterManagementModal: () => void;
  closeCharacterManagementModal: () => void;
  
  openCharacterContextualInfoModal: (character: AICharacter) => void;
  closeCharacterContextualInfoModal: () => void;
  
  openDebugTerminal: () => void;
  closeDebugTerminal: () => void;
  
  openExportConfigurationModal: () => void;
  closeExportConfigurationModal: () => void;
  
  openChatAttachmentsModal: (session: ChatSession | null, options?: { autoHighlightRefresh?: boolean }) => void;
  closeChatAttachmentsModal: () => void;
  
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  
  openGitHubImportModal: () => void;
  closeGitHubImportModal: () => void;

  openTelegramImportModal: () => void;
  closeTelegramImportModal: () => void;
  
  openMemorySourceModal: () => void;
  closeMemorySourceModal: () => void;
  
  openReasoningSetupModal: () => void;
  closeReasoningSetupModal: () => void;
  
  openShadowSetupModal: () => void;
  closeShadowSetupModal: () => void;
  
  openActiveMemoryModal: () => void;
  closeActiveMemoryModal: () => void;
  
  openStrategySetupModal: () => void;
  closeStrategySetupModal: () => void;

  openCustomStrategyModal: () => void;
  closeCustomStrategyModal: () => void;

  openTextExportModal: () => void;
  closeTextExportModal: () => void;

  openMoveMessagesModal: () => void;
  closeMoveMessagesModal: () => void;

  openPromptButtonManager: () => void; 
  closePromptButtonManager: () => void;

  openArchiverModal: () => void; 
  closeArchiverModal: () => void; 

  openStoryManagerModal: () => void; // ADDED
  closeStoryManagerModal: () => void; // ADDED

  openExternalModelsModal: () => void;
  closeExternalModelsModal: () => void;

  openCacheManagerModal: () => void;
  closeCacheManagerModal: () => void;

  openLorebookModal: () => void;
  closeLorebookModal: () => void;
}

export const useSettingsUI = create<SettingsUIState>((set) => ({
  isSettingsPanelOpen: false,
  isTtsSettingsModalOpen: false,
  isCharacterManagementModalOpen: false,
  isContextualInfoModalOpen: false,
  editingCharacterForContextualInfo: null,
  isDebugTerminalOpen: false,
  isExportConfigModalOpen: false,
  isChatAttachmentsModalOpen: false,
  attachmentsForModal: [],
  autoHighlightRefresh: false, 
  isApiKeyModalOpen: false,
  isGitHubImportModalOpen: false,
  isTelegramImportModalOpen: false,
  isMemorySourceModalOpen: false,
  isReasoningSetupModalOpen: false,
  isShadowSetupModalOpen: false,
  isActiveMemoryModalOpen: false,
  isStrategySetupModalOpen: false,
  isCustomStrategyModalOpen: false,
  isTextExportModalOpen: false,
  isMoveMessagesModalOpen: false,
  isPromptButtonManagerOpen: false,
  isArchiverModalOpen: false,
  isStoryManagerModalOpen: false,
  isExternalModelsModalOpen: false,
  isCacheManagerModalOpen: false,
  isLorebookModalOpen: false,

  openSettingsPanel: () => {
    set({ isSettingsPanelOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),

  openTtsSettingsModal: () => {
    set({ isTtsSettingsModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeTtsSettingsModal: () => set({ isTtsSettingsModalOpen: false }),

  openCharacterManagementModal: () => {
    set({ isCharacterManagementModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeCharacterManagementModal: () => set({ isCharacterManagementModalOpen: false }),

  openCharacterContextualInfoModal: (character) => {
    set({ editingCharacterForContextualInfo: character, isContextualInfoModalOpen: true });
  },
  closeCharacterContextualInfoModal: () => {
    set({ isContextualInfoModalOpen: false, editingCharacterForContextualInfo: null });
  },

  openDebugTerminal: () => {
    set({ isDebugTerminalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeDebugTerminal: () => set({ isDebugTerminalOpen: false }),

  openExportConfigurationModal: () => {
    set({ isExportConfigModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeExportConfigurationModal: () => set({ isExportConfigModalOpen: false }),

  openChatAttachmentsModal: (session, options) => {
    if (!session || !session.messages || session.messages.length === 0) {
      useToastStore.getState().showToast("No chat session active or session has no messages.", "error");
      return;
    }

    const allAttachments = session.messages.flatMap(msg =>
      (msg.attachments || []).map(att => ({
        attachment: att,
        messageId: msg.id,
        messageTimestamp: msg.timestamp,
        messageRole: msg.role,
        messageContentSnippet: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
      }))
    ).filter(item => item.attachment);

    if (allAttachments.length === 0) {
      useToastStore.getState().showToast("No attachments found in this chat.", "success");
      return;
    }
    
    allAttachments.sort((a, b) => new Date(b.messageTimestamp).getTime() - new Date(a.messageTimestamp).getTime());
    set(() => ({ 
        attachmentsForModal: allAttachments, 
        isChatAttachmentsModalOpen: true,
        isSettingsPanelOpen: false,
        autoHighlightRefresh: options?.autoHighlightRefresh ?? false
    }));
    useGlobalUiStore.getState().closeSidebar();
  },
  closeChatAttachmentsModal: () => {
    set({ isChatAttachmentsModalOpen: false, attachmentsForModal: [], autoHighlightRefresh: false });
  },

  openApiKeyModal: () => {
    set({ isApiKeyModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),

  openGitHubImportModal: () => {
    set({ isGitHubImportModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeGitHubImportModal: () => set({ isGitHubImportModalOpen: false }),

  openTelegramImportModal: () => {
    set({ isTelegramImportModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeTelegramImportModal: () => set({ isTelegramImportModalOpen: false }),

  openMemorySourceModal: () => set({ isMemorySourceModalOpen: true }),
  closeMemorySourceModal: () => set({ isMemorySourceModalOpen: false }),

  openReasoningSetupModal: () => set({ isReasoningSetupModalOpen: true }),
  closeReasoningSetupModal: () => set({ isReasoningSetupModalOpen: false }),

  openShadowSetupModal: () => set({ isShadowSetupModalOpen: true }),
  closeShadowSetupModal: () => set({ isShadowSetupModalOpen: false }),

  openActiveMemoryModal: () => set({ isActiveMemoryModalOpen: true }),
  closeActiveMemoryModal: () => set({ isActiveMemoryModalOpen: false }),

  openStrategySetupModal: () => set({ isStrategySetupModalOpen: true }),
  closeStrategySetupModal: () => set({ isStrategySetupModalOpen: false }),

  openCustomStrategyModal: () => set({ isCustomStrategyModalOpen: true }),
  closeCustomStrategyModal: () => set({ isCustomStrategyModalOpen: false }),

  openTextExportModal: () => {
    set({ isTextExportModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeTextExportModal: () => set({ isTextExportModalOpen: false }),

  openMoveMessagesModal: () => {
    set({ isMoveMessagesModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeMoveMessagesModal: () => set({ isMoveMessagesModalOpen: false }),

  openPromptButtonManager: () => {
    set({ isPromptButtonManagerOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closePromptButtonManager: () => set({ isPromptButtonManagerOpen: false }),

  openArchiverModal: () => {
    set({ isArchiverModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeArchiverModal: () => set({ isArchiverModalOpen: false }),

  openStoryManagerModal: () => {
    set({ isStoryManagerModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeStoryManagerModal: () => set({ isStoryManagerModalOpen: false }),

  openExternalModelsModal: () => {
    set({ isExternalModelsModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeExternalModelsModal: () => set({ isExternalModelsModalOpen: false }),

  openCacheManagerModal: () => {
    set({ isCacheManagerModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeCacheManagerModal: () => set({ isCacheManagerModalOpen: false }),

  openLorebookModal: () => {
    set({ isLorebookModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeLorebookModal: () => set({ isLorebookModalOpen: false }),
}));
