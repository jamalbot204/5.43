
import { create } from 'zustand';

interface GenerationTimerState {
  currentGenerationTimeDisplay: string;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
}

export const useGenerationTimerStore = create<GenerationTimerState>((set) => {
  let timerIntervalId: number | undefined;
  let startTime: number | null = null;

  return {
    currentGenerationTimeDisplay: "0.0s",

    startTimer: () => {
      // Clear any existing timer just in case
      if (timerIntervalId) clearInterval(timerIntervalId);
      
      startTime = Date.now();
      set({ currentGenerationTimeDisplay: "0.0s" });

      timerIntervalId = window.setInterval(() => {
        if (startTime !== null) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          set({ currentGenerationTimeDisplay: `${elapsedSeconds.toFixed(1)}s` });
        }
      }, 100);
    },

    stopTimer: () => {
      if (timerIntervalId) clearInterval(timerIntervalId);
      timerIntervalId = undefined;
      startTime = null;
    },

    resetTimer: () => {
      if (timerIntervalId) clearInterval(timerIntervalId);
      timerIntervalId = undefined;
      startTime = null;
      set({ currentGenerationTimeDisplay: "0.0s" });
    }
  };
});
