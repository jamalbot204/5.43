
import { create } from 'zustand';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { pythonWorkerService } from '../services/python/pythonWorker.ts';

interface PythonState {
  isEnabled: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  isRunning: boolean;
  
  // Actions
  init: () => Promise<void>;
  enableAndLoad: () => Promise<void>;
  runPythonCode: (code: string) => Promise<string>;
  toggleEnabled: () => void;
}

export const usePythonStore = create<PythonState>((set, get) => ({
  isEnabled: false,
  isLoaded: false,
  isLoading: false,
  isRunning: false,

  init: async () => {
    try {
      const isEnabled = await dbService.getAppMetadata<boolean>(METADATA_KEYS.PYTHON_ENABLED);
      if (isEnabled) {
        set({ isEnabled: true });
        // We do NOT auto-load on init per user request ("Zero auto-load").
        // We only load if the user explicitly re-enables or if we want to restore session state?
        // Actually, if it's enabled in settings, we MIGHT want to load it eventually, 
        // but the prompt said "never load automatically when app opens".
        // So even if enabled in DB, we wait for a manual trigger or perhaps lazy load on first tool call?
        // Let's lazy load on first tool call OR manual button press.
        // So here we just set the flag.
      }
    } catch (e) {
      console.error("Failed to load Python settings", e);
    }
  },

  enableAndLoad: async () => {
    set({ isLoading: true });
    try {
      await pythonWorkerService.load();
      await dbService.setAppMetadata(METADATA_KEYS.PYTHON_ENABLED, true);
      set({ isEnabled: true, isLoaded: true, isLoading: false });
    } catch (error) {
      console.error("Failed to load Pyodide:", error);
      set({ isLoading: false, isEnabled: false }); // Revert enabled state on failure
      throw error;
    }
  },

  runPythonCode: async (code: string) => {
    const { isLoaded, enableAndLoad } = get();
    
    // Lazy load logic: If enabled but not loaded (e.g. page refresh), load now.
    if (!isLoaded) {
       // Check if enabled first? The tool call implies intent.
       // We'll treat the tool call as an implicit permission if the feature flag is on.
       // If flag is off, this shouldn't be called because tool definition isn't injected.
       await enableAndLoad();
    }

    set({ isRunning: true });
    try {
      const { output, result } = await pythonWorkerService.run(code);
      set({ isRunning: false });
      
      let finalOutput = "";
      if (output && output.trim()) finalOutput += `STDOUT:\n${output}\n`;
      if (result && result.trim() && result !== 'null') finalOutput += `RESULT:\n${result}`;
      
      return finalOutput || "Code executed successfully (no output).";
    } catch (error: any) {
      set({ isRunning: false });
      return `ERROR:\n${error.message}`;
    }
  },

  toggleEnabled: () => {
      const newState = !get().isEnabled;
      set({ isEnabled: newState });
      dbService.setAppMetadata(METADATA_KEYS.PYTHON_ENABLED, newState).catch(console.error);
  }
}));

// Initialize
usePythonStore.getState().init();
