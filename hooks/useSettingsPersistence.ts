
import { useCallback } from 'react';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { useDataStore } from '../store/useDataStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { GeminiSettings } from '../types.ts';

export const useSettingsPersistence = () => {
    // We do NOT subscribe to the store here to prevent re-renders when chat state changes (streaming).
    // We access the store imperatively in the callback.
    const showToast = useToastStore(state => state.showToast);

    const saveSessionSettings = useCallback(async (newSettings: GeminiSettings, successMessage: string | null = "Settings saved.") => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { updateSettings } = useDataStore.getState();

        if (!currentChatSession) return;

        // 1. Optimistic Update (Immediate UI reflection)
        await updateCurrentChatSession(session => session ? ({ ...session, settings: newSettings }) : null);
        
        // 2. Persist to IndexedDB
        await updateSettings(currentChatSession.id, newSettings);

        // 3. User Feedback (Only if message is provided)
        if (successMessage) {
            showToast(successMessage, "success");
        }
    }, [showToast]);

    return { saveSessionSettings };
};
