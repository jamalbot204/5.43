
import { create } from 'zustand';
import { ChatMessage } from '../types.ts';

interface SelectionState {
  isSelectionModeActive: boolean;
  selectedMessageIds: string[];
  lastSelectedId: string | null; // Tracks the anchor for range selection
  getSelectionOrder: (messageId: string) => number;
  toggleSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  selectRange: (targetId: string, allMessages: ChatMessage[]) => void;
  clearSelection: () => void;
  selectAllVisible: (visibleMessageIds: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  isSelectionModeActive: false,
  selectedMessageIds: [],
  lastSelectedId: null,

  getSelectionOrder: (messageId: string) => {
    return get().selectedMessageIds.indexOf(messageId) + 1;
  },

  clearSelection: () => {
    set({ selectedMessageIds: [], lastSelectedId: null });
  },

  toggleSelectionMode: () => {
    const isNowActive = !get().isSelectionModeActive;
    if (!isNowActive) {
      get().clearSelection();
    }
    set({ isSelectionModeActive: isNowActive });
  },

  toggleMessageSelection: (messageId: string) => {
    set(state => {
      const currentSelection = state.selectedMessageIds;
      if (currentSelection.includes(messageId)) {
        // Deselecting: Remove from list, but UPDATE ANCHOR to this message
        return { 
            selectedMessageIds: currentSelection.filter(id => id !== messageId),
            lastSelectedId: messageId 
        };
      } else {
        // Selecting: Add to list, UPDATE ANCHOR to this message
        return { 
            selectedMessageIds: [...currentSelection, messageId],
            lastSelectedId: messageId
        };
      }
    });
  },

  selectRange: (targetId: string, allMessages: ChatMessage[]) => {
    const { lastSelectedId, selectedMessageIds } = get();
    
    if (!lastSelectedId) {
        // No anchor, treat as normal toggle
        get().toggleMessageSelection(targetId);
        return;
    }

    const lastIndex = allMessages.findIndex(m => m.id === lastSelectedId);
    const targetIndex = allMessages.findIndex(m => m.id === targetId);

    if (lastIndex === -1 || targetIndex === -1) return;

    const start = Math.min(lastIndex, targetIndex);
    const end = Math.max(lastIndex, targetIndex);

    const newIds = new Set(selectedMessageIds);
    
    // Add all messages in range to selection
    for (let i = start; i <= end; i++) {
        newIds.add(allMessages[i].id);
    }

    set({ 
        selectedMessageIds: Array.from(newIds),
        // NOTE: We do NOT update lastSelectedId here. 
        // This preserves the original anchor, allowing the user to Shift+Click different targets 
        // to adjust the range relative to the same starting point (Standard OS behavior).
    });
  },

  selectAllVisible: (visibleMessageIds: string[]) => {
    set({ selectedMessageIds: [...visibleMessageIds] });
  },
}));
