

import { create } from 'zustand';
import { ToastInfo } from '../types.ts';

interface ToastState {
  toastInfo: ToastInfo | null;
  showToast: (message: string, type?: 'success' | 'error', duration?: number) => void;
  hideToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toastInfo: null,
  showToast: (message: string, type: 'success' | 'error' = 'success', duration: number = 2000) => {
    set({ toastInfo: { message, type, duration } });
  },
  hideToast: () => {
    set({ toastInfo: null });
  },
}));