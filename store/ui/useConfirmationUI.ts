
import { create } from 'zustand';

interface ConfirmationUIState {
  isDeleteConfirmationOpen: boolean;
  deleteTarget: { sessionId: string; messageId: string } | null;
  
  isDeleteChatConfirmationOpen: boolean;
  deleteChatTarget: { sessionId: string; sessionTitle: string } | null;
  
  isResetAudioConfirmationOpen: boolean;
  resetAudioTarget: { sessionId: string; messageId: string } | null;
  
  isDeleteHistoryConfirmationOpen: boolean;
  deleteHistoryCount: number;

  isDeletePromptButtonConfirmationOpen: boolean;
  deletePromptButtonTarget: string | null;

  isDeleteChapterConfirmationOpen: boolean;
  deleteChapterIndex: number | null;

  isDeleteAllChaptersConfirmationOpen: boolean;

  // Actions
  requestDeleteConfirmation: (target: { sessionId: string; messageId: string }) => void;
  cancelDeleteConfirmation: () => void;
  
  requestDeleteChatConfirmation: (target: { sessionId: string; sessionTitle: string }) => void;
  cancelDeleteChatConfirmation: () => void;
  
  requestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => void;
  cancelResetAudioCacheConfirmation: () => void;
  
  requestDeleteHistoryConfirmation: (count: number) => void;
  cancelDeleteHistoryConfirmation: () => void;

  requestDeletePromptButtonConfirmation: (id: string) => void;
  cancelDeletePromptButtonConfirmation: () => void;

  requestDeleteChapterConfirmation: (index: number) => void;
  cancelDeleteChapterConfirmation: () => void;

  requestDeleteAllChaptersConfirmation: () => void;
  cancelDeleteAllChaptersConfirmation: () => void;
}

export const useConfirmationUI = create<ConfirmationUIState>((set) => ({
  isDeleteConfirmationOpen: false,
  deleteTarget: null,
  isDeleteChatConfirmationOpen: false,
  deleteChatTarget: null,
  isResetAudioConfirmationOpen: false,
  resetAudioTarget: null,
  isDeleteHistoryConfirmationOpen: false,
  deleteHistoryCount: 0,
  isDeletePromptButtonConfirmationOpen: false,
  deletePromptButtonTarget: null,
  isDeleteChapterConfirmationOpen: false,
  deleteChapterIndex: null,
  isDeleteAllChaptersConfirmationOpen: false,

  requestDeleteConfirmation: (target) => {
    set({ deleteTarget: target, isDeleteConfirmationOpen: true });
  },
  cancelDeleteConfirmation: () => {
    set({ isDeleteConfirmationOpen: false, deleteTarget: null });
  },

  requestDeleteChatConfirmation: (target) => {
    set({ deleteChatTarget: target, isDeleteChatConfirmationOpen: true });
  },
  cancelDeleteChatConfirmation: () => {
    set({ isDeleteChatConfirmationOpen: false, deleteChatTarget: null });
  },

  requestResetAudioCacheConfirmation: (sessionId, messageId) => {
    set({ resetAudioTarget: { sessionId, messageId }, isResetAudioConfirmationOpen: true });
  },
  cancelResetAudioCacheConfirmation: () => {
    set({ isResetAudioConfirmationOpen: false, resetAudioTarget: null });
  },

  requestDeleteHistoryConfirmation: (count) => {
    set({ isDeleteHistoryConfirmationOpen: true, deleteHistoryCount: count });
  },
  cancelDeleteHistoryConfirmation: () => {
    set({ isDeleteHistoryConfirmationOpen: false, deleteHistoryCount: 0 });
  },

  requestDeletePromptButtonConfirmation: (id) => {
    set({ isDeletePromptButtonConfirmationOpen: true, deletePromptButtonTarget: id });
  },
  cancelDeletePromptButtonConfirmation: () => {
    set({ isDeletePromptButtonConfirmationOpen: false, deletePromptButtonTarget: null });
  },

  requestDeleteChapterConfirmation: (index) => {
    set({ isDeleteChapterConfirmationOpen: true, deleteChapterIndex: index });
  },
  cancelDeleteChapterConfirmation: () => {
    set({ isDeleteChapterConfirmationOpen: false, deleteChapterIndex: null });
  },

  requestDeleteAllChaptersConfirmation: () => {
    set({ isDeleteAllChaptersConfirmationOpen: true });
  },
  cancelDeleteAllChaptersConfirmation: () => {
    set({ isDeleteAllChaptersConfirmationOpen: false });
  },
}));
