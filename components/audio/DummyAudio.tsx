
import React, { useRef, useEffect, memo } from 'react';
import { useDummyAudioStore } from '../../store/useDummyAudioStore.ts';

// A silent, short WAV file encoded in base64.
// This is used as the source for the dummy audio element.
const SILENT_AUDIO_SRC = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

/**
 * DummyAudio Component
 *
 * This component renders a hidden, looping <audio> element with a silent audio source.
 * Its purpose is to act as a "proxy" for the browser's Media Session API and hardware media keys.
 *
 * Why is this needed?
 * Browsers typically link hardware media keys (like play/pause on headphones) and the Media Session API
 * to the playback state of a standard HTML <audio> or <video> element. Our application uses the
 * Web Audio API for more advanced audio control, which is not directly tied to these browser features.
 *
 * By synchronizing the play/pause state of this silent, hidden <audio> element with our actual
 * Web Audio API playback, we can ensure that the browser correctly recognizes our app as a media player.
 * This allows users to control playback with their hardware media keys, improving the user experience.
 */
const DummyAudio: React.FC = memo(() => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const setAudioControls = useDummyAudioStore(state => state.setAudioControls);

  useEffect(() => {
    if (audioRef.current) {
      // Register the play and pause methods with the global store
      // so they can be called from anywhere, particularly from the main audio store.
      setAudioControls({
        play: () => audioRef.current?.play().catch(e => console.warn("Dummy audio play failed:", e)),
        pause: () => audioRef.current?.pause(),
      });

      // Cleanup on unmount
      return () => {
        setAudioControls(null);
      };
    }
  }, [setAudioControls]);

  return (
    <audio
      ref={audioRef}
      src={SILENT_AUDIO_SRC}
      loop
      playsInline
      hidden // Use the hidden attribute for better semantics
      style={{ display: 'none' }} // Ensure it's not visible
      aria-hidden="true" // Hide from assistive technologies
    />
  );
});

export default DummyAudio;
