
import { ChatMessage } from '../../types.ts';

// These mutable references were previously local variables inside useGeminiApiStore.
// We move them here to ensure all split stores access the exact same instances.

export const geminiRefs = {
    generationStartTime: null as number | null,
    abortController: null as AbortController | null,
    pendingMessageId: null as string | null,
    originalMessageSnapshot: null as ChatMessage | null,
    requestCancelledByUser: false,
    onFullResponseCalledForPendingMessage: false,
};
