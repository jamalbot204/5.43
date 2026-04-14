
import { create } from 'zustand';

interface DummyAudioControls {
  play: () => void;
  pause: () => void;
}

interface DummyAudioState {
  controls: DummyAudioControls | null;
  setAudioControls: (controls: DummyAudioControls | null) => void;
  playDummyAudio: () => void;
  pauseDummyAudio: () => void;
}

/**
 * Zustand store for managing the dummy audio element.
 * This provides a global way to control the hidden <audio> element's playback,
 * which is necessary for integrating with hardware media keys and the Media Session API.
 */
export const useDummyAudioStore = create<DummyAudioState>((set, get) => ({
  controls: null,
  setAudioControls: (controls) => set({ controls }),
  
  /**
   * Plays the silent, looping dummy audio element.
   * This should be called whenever the main application audio (from Web Audio API) starts playing.
   */
  playDummyAudio: () => {
    get().controls?.play();
  },

  /**
   * Pauses the silent, looping dummy audio element.
   * This should be called whenever the main application audio (from Web Audio API) is paused or stopped.
   */
  pauseDummyAudio: () => {
    get().controls?.pause();
  },
}));
