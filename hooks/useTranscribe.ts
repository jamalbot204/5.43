
import { useState, useRef, useCallback, useEffect } from 'react';
import { useToastStore } from '../store/useToastStore.ts';
import { useGlobalUiStore } from '../store/useGlobalUiStore.ts';

export const useTranscribe = (onTranscriptionComplete: (text: string) => void) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false); // Kept for compatibility
  
  const recognitionRef = useRef<any>(null);
  const { showToast } = useToastStore();
  const language = useGlobalUiStore(state => state.language);

  // Initialize Speech Recognition
  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true; // Allow continuous dictation
        recognition.interimResults = false; // We use final results to append cleanly
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const transcript = event.results[i][0].transcript.trim();
                    if (transcript) {
                        onTranscriptionComplete(transcript);
                    }
                }
            }
        };

        recognition.onerror = (event: any) => {
            // Ignore "no-speech" as it just means silence before a timeout
            if (event.error === 'no-speech') return;
            
            console.error("Speech recognition error", event.error);
            
            // Force state update on error
            setIsRecording(false);

            // Critical errors should stop the recording
            if (event.error === 'not-allowed') {
                showToast("Microphone access denied.", "error");
            } else if (event.error === 'network') {
                showToast("Network error during recognition.", "error");
            } else if (event.error === 'aborted') {
                // Ignore intentional stops
            } else {
                showToast(`Speech recognition error: ${event.error}`, "error");
            }
        };

        recognition.onend = () => {
            // Simply update state to reflect stopped recording.
            // No auto-restart logic.
            setIsRecording(false);
        };

        recognitionRef.current = recognition;
    }

    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }
    };
  }, [onTranscriptionComplete, showToast]);

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) {
        showToast("Speech Recognition is not supported in this browser.", "error");
        return;
    }

    if (isRecording) return;

    try {
        // Set language dynamically
        const langCode = language === 'ar' ? 'ar-SA' : 'en-US';
        recognitionRef.current.lang = langCode;
        
        recognitionRef.current.start();
        setIsRecording(true);
    } catch (e) {
        console.error("Failed to start recognition:", e);
    }
  }, [isRecording, language, showToast]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        // State update happens in onend
    }
  }, []);

  return {
    isRecording,
    isTranscribing, // Always false in this implementation as results are streaming
    startRecording,
    stopRecording
  };
};
