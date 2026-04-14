import { create } from 'zustand';
import { useGlobalUiStore } from '../useGlobalUiStore.ts';
import { EditMessagePanelDetails } from '../../components/panels/EditMessagePanel.tsx';
import { FilenameInputModalTriggerProps } from '../../types.ts';

interface EditorUIState {
  isEditPanelOpen: boolean;
  editingMessageDetail: EditMessagePanelDetails | null;
  
  isInjectedMessageEditModalOpen: boolean;
  injectedMessageEditTarget: { sessionId: string; messageId: string } | null;
  
  isMermaidModalOpen: boolean;
  mermaidModalData: { code: string; messageId?: string; fullContent?: string } | null;
  
  isFilenameInputModalOpen: boolean;
  filenameInputModalProps: FilenameInputModalTriggerProps | null;

  isUrlImportModalOpen: boolean;
  urlImportOnAttach: ((files: FileList) => void) | null;

  // Actions
  openEditPanel: (details: EditMessagePanelDetails) => void;
  closeEditPanel: () => void;
  
  openInjectedMessageEditModal: (target: { sessionId: string; messageId: string }) => void;
  closeInjectedMessageEditModal: () => void;
  
  openMermaidModal: (data: { code: string; messageId?: string; fullContent?: string }) => void;
  closeMermaidModal: () => void;
  
  openFilenameInputModal: (props: FilenameInputModalTriggerProps) => void;
  closeFilenameInputModal: () => void;
  submitFilenameInputModal: (filename: string) => void;

  openUrlImportModal: (onAttach: (files: FileList) => void) => void;
  closeUrlImportModal: () => void;
}

export const useEditorUI = create<EditorUIState>((set, get) => ({
  isEditPanelOpen: false,
  editingMessageDetail: null,
  isInjectedMessageEditModalOpen: false,
  injectedMessageEditTarget: null,
  isMermaidModalOpen: false,
  mermaidModalData: null,
  isFilenameInputModalOpen: false,
  filenameInputModalProps: null,
  isUrlImportModalOpen: false,
  urlImportOnAttach: null,

  openEditPanel: (details) => {
    set({
      editingMessageDetail: details,
      isEditPanelOpen: true,
    });
    // Assuming Settings might be open, we might want to close sidebar if needed, 
    // but the original logic closed sidebar.
    useGlobalUiStore.getState().closeSidebar();
  },
  closeEditPanel: () => set({ isEditPanelOpen: false, editingMessageDetail: null }),

  openInjectedMessageEditModal: (target) => {
    set({
      isInjectedMessageEditModalOpen: true,
      injectedMessageEditTarget: target,
    });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeInjectedMessageEditModal: () => {
    set({ isInjectedMessageEditModalOpen: false, injectedMessageEditTarget: null });
  },

  openMermaidModal: (data) => {
    set({ isMermaidModalOpen: true, mermaidModalData: data });
  },
  closeMermaidModal: () => {
    set({ isMermaidModalOpen: false, mermaidModalData: null });
  },

  openFilenameInputModal: (props) => {
    set({ filenameInputModalProps: props, isFilenameInputModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeFilenameInputModal: () => {
    set({ isFilenameInputModalOpen: false, filenameInputModalProps: null });
  },
  submitFilenameInputModal: (filename: string) => {
    get().filenameInputModalProps?.onSubmit(filename);
    get().closeFilenameInputModal();
  },

  openUrlImportModal: (onAttach) => {
    set({ isUrlImportModalOpen: true, urlImportOnAttach: onAttach });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeUrlImportModal: () => {
    set({ isUrlImportModalOpen: false, urlImportOnAttach: null });
  },
}));