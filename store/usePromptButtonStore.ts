
import { create } from 'zustand';
import { PromptButton } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';

interface PromptButtonStoreState {
  promptButtons: PromptButton[];
  isLoading: boolean;
  
  // Actions
  loadPromptButtons: () => Promise<void>;
  addPromptButton: (label: string, content: string, action: 'insert' | 'send', modelId?: string) => Promise<void>;
  updatePromptButton: (id: string, updates: Partial<PromptButton>) => Promise<void>;
  deletePromptButton: (id: string) => Promise<void>;
  reorderPromptButtons: (newOrder: PromptButton[]) => Promise<void>;
}

export const usePromptButtonStore = create<PromptButtonStoreState>((set, get) => ({
  promptButtons: [],
  isLoading: true,

  loadPromptButtons: async () => {
    set({ isLoading: true });
    try {
      const stored = await dbService.getAppMetadata<PromptButton[]>(METADATA_KEYS.PROMPT_BUTTONS);
      set({ promptButtons: stored || [], isLoading: false });
    } catch (e) {
      console.error("Failed to load prompt buttons", e);
      set({ promptButtons: [], isLoading: false });
    }
  },

  addPromptButton: async (label, content, action, modelId) => {
    const { promptButtons } = get();
    const newBtn: PromptButton = {
      id: `pb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      content,
      action,
      order: promptButtons.length,
      modelId
    };
    const newButtons = [...promptButtons, newBtn];
    set({ promptButtons: newButtons });
    await dbService.setAppMetadata(METADATA_KEYS.PROMPT_BUTTONS, newButtons);
  },

  updatePromptButton: async (id, updates) => {
    const { promptButtons } = get();
    const newButtons = promptButtons.map(b => b.id === id ? { ...b, ...updates } : b);
    set({ promptButtons: newButtons });
    await dbService.setAppMetadata(METADATA_KEYS.PROMPT_BUTTONS, newButtons);
  },

  deletePromptButton: async (id) => {
    const { promptButtons } = get();
    const newButtons = promptButtons.filter(b => b.id !== id);
    set({ promptButtons: newButtons });
    await dbService.setAppMetadata(METADATA_KEYS.PROMPT_BUTTONS, newButtons);
  },

  reorderPromptButtons: async (newOrder) => {
    // Ensure order property is updated
    const updated = newOrder.map((b, idx) => ({ ...b, order: idx }));
    set({ promptButtons: updated });
    await dbService.setAppMetadata(METADATA_KEYS.PROMPT_BUTTONS, updated);
  }
}));

// Init
usePromptButtonStore.getState().loadPromptButtons();
