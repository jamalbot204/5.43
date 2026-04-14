
import { create } from 'zustand';
import { useGeminiApiStore } from './useGeminiApiStore';
import { useActiveChatStore } from './useActiveChatStore';
import { ChatMessageRole } from '../types';

interface AutoSendState {
  isAutoSendingActive: boolean;
  autoSendText: string;
  _internalAutoSendText: string;
  autoSendRepetitionsInput: string;
  autoSendRemaining: number;
  isWaitingForErrorRetry: boolean;
  errorRetryCountdown: number;
}

interface AutoSendActions {
  setAutoSendText: (text: string) => void;
  setAutoSendRepetitionsInput: (reps: string) => void;
  startAutoSend: (text: string, repetitions: number, targetCharacterId?: string) => void;
  stopAutoSend: () => Promise<void>;
  canStartAutoSend: () => boolean;
  isPreparingAutoSend: () => boolean;
  _tick: () => void;
  _cleanup: () => void;
}

let sendLoopActiveRef = false;
let wasLoadingRef = false;
let delayTimeoutRef: number | null = null;
let errorRetryIntervalRef: number | null = null;
let autoSendTargetCharacterId: string | undefined = undefined;
let autoSendTargetChatId: string | undefined = undefined;

const resetErrorRetryStates = (set: (updater: (state: AutoSendState) => Partial<AutoSendState>) => void) => {
    set(() => ({
        isWaitingForErrorRetry: false,
        errorRetryCountdown: 0,
    }));
    if (errorRetryIntervalRef) {
        clearInterval(errorRetryIntervalRef);
        errorRetryIntervalRef = null;
    }
};

export const useAutoSendStore = create<AutoSendState & AutoSendActions>((set, get) => ({
    isAutoSendingActive: false,
    autoSendText: '',
    _internalAutoSendText: '',
    autoSendRepetitionsInput: '1',
    autoSendRemaining: 0,
    isWaitingForErrorRetry: false,
    errorRetryCountdown: 0,
  
    setAutoSendText: (text) => set({ autoSendText: text }),

    setAutoSendRepetitionsInput: (reps) => set({ autoSendRepetitionsInput: reps }),
    
    isPreparingAutoSend: () => {
        const { autoSendText, autoSendRepetitionsInput, isAutoSendingActive } = get();
        return autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0 && !isAutoSendingActive;
    },

    canStartAutoSend: () => {
        const { autoSendText, autoSendRepetitionsInput } = get();
        const { currentChatSession } = useActiveChatStore.getState();
        return !!currentChatSession && autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0;
    },
  
    startAutoSend: (text, repetitions, characterId) => {
      if (!get().canStartAutoSend()) return;
  
      if (delayTimeoutRef) clearTimeout(delayTimeoutRef);
      delayTimeoutRef = null;
      resetErrorRetryStates(set);
      
      sendLoopActiveRef = true;
      wasLoadingRef = useGeminiApiStore.getState().isLoading;
      autoSendTargetCharacterId = characterId;
      autoSendTargetChatId = useActiveChatStore.getState().currentChatSession?.id;

      set({
        isAutoSendingActive: true,
        _internalAutoSendText: text,
        autoSendRemaining: repetitions,
      });
  
      get()._tick();
    },
  
    stopAutoSend: async () => {
      sendLoopActiveRef = false;
      autoSendTargetCharacterId = undefined;
      autoSendTargetChatId = undefined;
      
      // Removed handleCancelGeneration() call here.
      // This ensures we only stop the *loop* (future messages),
      // allowing the current message to finish generating naturally.
      
      set({ isAutoSendingActive: false, autoSendRemaining: 0 });
      resetErrorRetryStates(set);
      if (delayTimeoutRef) clearTimeout(delayTimeoutRef);
      delayTimeoutRef = null;
    },
  
    _tick: async () => {
      const { isAutoSendingActive, autoSendRemaining, isWaitingForErrorRetry, _internalAutoSendText } = get();
      const { isLoading, handleSendMessage, handleRegenerateResponseForUserMessage } = useGeminiApiStore.getState();
      const { currentChatSession } = useActiveChatStore.getState();
  
      if (!sendLoopActiveRef || !isAutoSendingActive) {
        if (isAutoSendingActive) get().stopAutoSend();
        return;
      }
  
      if (isWaitingForErrorRetry) {
        wasLoadingRef = isLoading;
        return;
      }
      
      if (!isLoading && wasLoadingRef) {
        wasLoadingRef = false;
  
        let sessionToCheck = currentChatSession;
        if (autoSendTargetChatId && autoSendTargetChatId !== currentChatSession?.id) {
            const dbService = await import('../services/dbService');
            const dbSession = await dbService.getChatSession(autoSendTargetChatId);
            if (dbSession) sessionToCheck = dbSession;
        }

        if (!sessionToCheck) {
          get().stopAutoSend();
          return;
        }
  
        const lastMessage = sessionToCheck.messages[sessionToCheck.messages.length - 1];
        if (lastMessage?.role === ChatMessageRole.ERROR && autoSendRemaining > 0) {
            const userMessageThatCausedErrorIndex = sessionToCheck.messages.length - 2;
            if (userMessageThatCausedErrorIndex >= 0) {
                const userMessageToRegenFor = sessionToCheck.messages[userMessageThatCausedErrorIndex];
                if (userMessageToRegenFor.role === ChatMessageRole.USER) {
                    set({ isWaitingForErrorRetry: true, errorRetryCountdown: 30 });
                    errorRetryIntervalRef = window.setInterval(() => {
                        set(state => {
                            const newCountdown = state.errorRetryCountdown - 1;
                            if (newCountdown <= 0) {
                                if (errorRetryIntervalRef) clearInterval(errorRetryIntervalRef);
                                errorRetryIntervalRef = null;
                                set({ isWaitingForErrorRetry: false });
                                handleRegenerateResponseForUserMessage(userMessageToRegenFor.id, autoSendTargetChatId);
                            }
                            return { errorRetryCountdown: newCountdown };
                        });
                    }, 1000);
                    return;
                }
            }
            get().stopAutoSend();
            return;
        } else {
            const newRemaining = autoSendRemaining - 1;
            set({ autoSendRemaining: newRemaining });
  
            if (newRemaining > 0) {
                delayTimeoutRef = window.setTimeout(() => {
                  delayTimeoutRef = null;
                  get()._tick();
                }, 1000);
                return;
            } else {
                get().stopAutoSend();
                return;
            }
        }
      }
      
      if (!isLoading && autoSendRemaining > 0) {
        handleSendMessage(_internalAutoSendText, undefined, undefined, autoSendTargetCharacterId, false, undefined, autoSendTargetChatId);
      }
      
      wasLoadingRef = isLoading;
    },
    
    _cleanup: () => {
      if (delayTimeoutRef) clearTimeout(delayTimeoutRef);
      if (errorRetryIntervalRef) clearInterval(errorRetryIntervalRef);
    },
  }));
  
  useGeminiApiStore.subscribe(
      (state, prevState) => {
          if (state.isLoading !== prevState.isLoading) {
              if (useAutoSendStore.getState().isAutoSendingActive) {
                  useAutoSendStore.getState()._tick();
              }
          }
      }
  );

  // Cleanup on unmount (though for a global store, this is more for hot-reloading scenarios)
  const cleanup = useAutoSendStore.getState()._cleanup;
  window.addEventListener('beforeunload', cleanup);
