
import { create } from 'zustand';

interface HistorySelectionState {
  isHistorySelectionModeActive: boolean;
  selectedChatIds: string[];
  toggleHistorySelectionMode: () => void;
  toggleChatSelection: (chatId: string) => void;
  selectAllChats: (chatIds: string[]) => void;
  deselectAllChats: () => void;
  resetHistorySelection: () => void;
}

export const useHistorySelectionStore = create<HistorySelectionState>((set, get) => ({
  isHistorySelectionModeActive: false,
  selectedChatIds: [],

  toggleHistorySelectionMode: () => {
    const isActive = get().isHistorySelectionModeActive;
    if (isActive) {
      // Exiting mode, clear selection
      set({ isHistorySelectionModeActive: false, selectedChatIds: [] });
    } else {
      set({ isHistorySelectionModeActive: true });
    }
  },

  toggleChatSelection: (chatId: string) => {
    set(state => {
      const isSelected = state.selectedChatIds.includes(chatId);
      if (isSelected) {
        return { selectedChatIds: state.selectedChatIds.filter(id => id !== chatId) };
      } else {
        return { selectedChatIds: [...state.selectedChatIds, chatId] };
      }
    });
  },

  selectAllChats: (chatIds: string[]) => {
    set({ selectedChatIds: [...chatIds] });
  },

  deselectAllChats: () => {
    set({ selectedChatIds: [] });
  },

  resetHistorySelection: () => {
    set({ isHistorySelectionModeActive: false, selectedChatIds: [] });
  }
}));
