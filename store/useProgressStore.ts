import { create } from 'zustand';
import { ProgressItem } from '../types.ts';

interface ProgressState {
  progressItems: ProgressItem[];
}

interface ProgressActions {
  startProgress: (id: string, title: string, message: string, onCancel?: () => void) => void;
  updateProgress: (id: string, progress: number, message?: string) => void;
  finishProgress: (id: string, message: string, isSuccess: boolean) => void;
  removeProgress: (id: string) => void;
  cancelProgress: (id: string) => void;
}

export const useProgressStore = create<ProgressState & ProgressActions>((set, get) => ({
  progressItems: [],

  startProgress: (id, title, message, onCancel) => {
    const newItem: ProgressItem = {
      id,
      title,
      message,
      progress: 0,
      status: 'running',
      onCancel,
    };
    set(state => ({
      progressItems: [...state.progressItems.filter(p => p.id !== id), newItem],
    }));
  },

  updateProgress: (id, progress, message) => {
    set(state => ({
      progressItems: state.progressItems.map(item =>
        item.id === id
          ? { ...item, progress, message: message ?? item.message }
          : item
      ),
    }));
  },

  finishProgress: (id, message, isSuccess) => {
    set(state => ({
      progressItems: state.progressItems.map(item =>
        item.id === id
          ? { ...item, progress: 100, message, status: isSuccess ? 'success' : 'error' }
          : item
      ),
    }));

    if (isSuccess) {
      setTimeout(() => {
        get().removeProgress(id);
      }, 3000); // Auto-dismiss success notifications after 3 seconds
    }
  },

  removeProgress: (id) => {
    set(state => ({
      progressItems: state.progressItems.filter(item => item.id !== id),
    }));
  },
  
  cancelProgress: (id) => {
    const item = get().progressItems.find(p => p.id === id);
    if (item?.onCancel) {
      item.onCancel();
    }
    get().removeProgress(id);
  },
}));
