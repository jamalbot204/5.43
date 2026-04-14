
import { create } from 'zustand';

interface StreamingState {
    streamingMessageId: string | null;
    streamingText: string;
    isStreaming: boolean;
    setStreamingMessage: (messageId: string, text: string) => void;
    updateStreamingText: (text: string) => void;
    clearStreaming: () => void;
}

export const useStreamingStore = create<StreamingState>((set) => ({
    streamingMessageId: null,
    streamingText: '',
    isStreaming: false,
    setStreamingMessage: (messageId, text) => set({ streamingMessageId: messageId, streamingText: text, isStreaming: true }),
    updateStreamingText: (text) => set({ streamingText: text }),
    clearStreaming: () => set({ streamingMessageId: null, streamingText: '', isStreaming: false }),
}));
