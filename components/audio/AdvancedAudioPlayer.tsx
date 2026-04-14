
import React, { useState, useRef, useCallback, memo, useMemo } from 'react';
import { useAudioStore } from '../../store/useAudioStore.ts';
import { useShallow } from 'zustand/react/shallow';
import { useStreamingStore } from '../../store/useStreamingStore.ts';
import {
  SpeakerWaveIcon,
  XCircleIcon,
  RewindIcon,
  PlayIcon,
  PauseIcon,
  FastForwardIcon,
  BookOpenIcon,
  BackwardIcon,
  ForwardIcon,
  AdjustmentsHorizontalIcon,
} from '../common/Icons.tsx';
import GoToMessageButton from '../common/GoToMessageButton.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import AudioTuner from './AudioTuner.tsx';
import AudioProgressBar from './AudioProgressBar.tsx';
import { Button } from '../ui/Button.tsx';

import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { splitTextForTts } from '../../services/utils.ts';
import { DEFAULT_TTS_SETTINGS } from '../../constants.ts';

const PlayPauseButtonIcon: React.FC<{ isLoading: boolean; isPlaying: boolean }> = memo(({ isLoading, isPlaying }) => {
  if (isLoading) {
    return (
      <svg className="animate-spin h-5 w-5 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    );
  }
  if (isPlaying) {
    return <PauseIcon className="w-5 h-5 text-tint-orange-text" />;
  }
  return <PlayIcon className="w-5 h-5 text-brand-primary" />;
});

interface AdvancedAudioPlayerProps {
  onCloseView: () => void;
  onSeekRelative: (offsetSeconds: number) => void;
  onSeekToAbsolute: (timeInSeconds: number) => void;
  onTogglePlayPause?: () => void;
  onGoToMessage?: () => void;
  onIncreaseSpeed: (speed: number) => void; 
  onDecreaseSpeed: () => void; 
  onEnterReadMode?: () => void;
  onPlayNext?: () => void;
  onPlayPrevious?: () => void;
}

const AdvancedAudioPlayer: React.FC<AdvancedAudioPlayerProps> = memo(({
  onCloseView,
  onSeekRelative,
  onSeekToAbsolute,
  onTogglePlayPause,
  onGoToMessage,
  onEnterReadMode,
  onPlayNext,
  onPlayPrevious,
}) => {
  const { t } = useTranslation();
  const { messages, settings } = useActiveChatStore(useShallow(state => ({
      messages: state.currentChatSession?.messages || [],
      settings: state.currentChatSession?.settings
  })));
  
  const {
    isLoading,
    isPlaying,
    currentMessageId,
    error,
    currentPlayingText,
    playbackRate,
  } = useAudioStore(useShallow(state => ({
      isLoading: state.audioPlayerState.isLoading,
      isPlaying: state.audioPlayerState.isPlaying,
      currentMessageId: state.audioPlayerState.currentMessageId,
      error: state.audioPlayerState.error,
      currentPlayingText: state.audioPlayerState.currentPlayingText,
      playbackRate: state.audioPlayerState.playbackRate,
  })));
  
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const tunerButtonRef = useRef<HTMLButtonElement>(null);

  const toggleTuner = useCallback(() => {
      setIsTunerOpen(prev => !prev);
  }, []);

  const { isStreamingHere, streamingText } = useStreamingStore(useShallow(state => {
      const isStreamingHere = state.isStreaming && state.streamingMessageId && currentMessageId?.startsWith(state.streamingMessageId);
      return {
          isStreamingHere,
          streamingText: isStreamingHere ? state.streamingText : null
      };
  }));

  const audioPartInfo = useMemo(() => {
    const defaultInfo = { currentPart: -1, totalParts: 0, fullText: currentPlayingText || "" };

    if (!currentMessageId || messages.length === 0) {
        return defaultInfo;
    }

    const parts = currentMessageId.split('_part_');
    const baseId = parts[0];
    const currentPart = parts.length === 2 ? parseInt(parts[1], 10) : 0;
    
    const message = messages.find(m => m.id === baseId);
    if (!message) {
        return { ...defaultInfo, fullText: t.loadingAudio };
    }
    
    const ttsSettings = settings?.ttsSettings || DEFAULT_TTS_SETTINGS;
    const maxWords = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment ?? 999999;
    const textSegments = splitTextForTts(message.content, maxWords);
    const totalParts = textSegments.length;

    const finalCurrentPart = totalParts > 1 ? currentPart : 0;

    return {
        currentPart: finalCurrentPart,
        totalParts,
        fullText: message.content,
    };
  }, [currentMessageId, currentPlayingText, messages, settings, t.loadingAudio]);

  if (!currentMessageId && !isLoading && !isPlaying && !currentPlayingText && !isStreamingHere) {
    return null;
  }

  const displayMessageText = isStreamingHere ? streamingText : (audioPartInfo.fullText || currentPlayingText || t.audioPlayback);
  
  let partNumberDisplay = "";
  if (audioPartInfo.totalParts > 1 && audioPartInfo.currentPart > -1) {
    partNumberDisplay = ` (Part ${audioPartInfo.currentPart + 1}/${audioPartInfo.totalParts})`;
  }

  const snippet = displayMessageText.length > 25 ? displayMessageText.substring(0, 22) + "..." : displayMessageText;

  const playPauseButtonTitle = isLoading ? t.loadingAudio : (isPlaying ? t.pause : t.play);
  
  const showPartControls = audioPartInfo.totalParts > 1 && audioPartInfo.currentPart !== -1;

  return (
    <div
      className="bg-bg-panel text-text-primary p-2 shadow-panel border-b border-border-base flex flex-col relative z-50"
      role="toolbar"
      aria-label={t.audioPlayback}
    >
      <div className="flex items-center w-full space-x-1.5 sm:space-x-2">
        <div className="flex items-center space-x-1.5 flex-shrink min-w-0 max-w-[120px] sm:max-w-[150px] md:max-w-sm">
          <SpeakerWaveIcon className="w-5 h-5 text-brand-primary flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold truncate" title={displayMessageText + partNumberDisplay}>
              {snippet}
              <span className="hidden sm:inline">{partNumberDisplay}</span>
            </span>
            {error && <span className="text-xs text-tint-red-text truncate" title={error}>{error}</span>}
          </div>
          {onGoToMessage && currentMessageId && (
            <GoToMessageButton onClick={onGoToMessage} disabled={!currentMessageId} />
          )}
          {onEnterReadMode && currentMessageId && (
            <Button
              variant="ghost"
              onClick={onEnterReadMode}
              disabled={!currentMessageId}
              className={`p-1.5 rounded-full ml-1 flex-shrink-0`}
              title={t.readMode}
              aria-label={t.readMode}
            >
              <BookOpenIcon className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Media Controls - Forced LTR for consistent button order */}
        <div className="flex items-center space-x-1 sm:space-x-2 flex-grow justify-center" dir="ltr">
            {showPartControls && (
                <Button
                    variant="ghost"
                    onClick={onPlayPrevious}
                    className="p-1.5 rounded-full"
                    title={t.previousPart}
                    aria-label={t.previousPart}
                    disabled={isLoading || !currentMessageId || audioPartInfo.currentPart === 0}
                >
                    <BackwardIcon className="w-4 h-4" />
                </Button>
            )}

            <Button
            variant="ghost"
            onClick={() => onSeekRelative(-10)}
            className="p-1.5 rounded-full hidden sm:flex"
            title={t.rewind10s}
            aria-label={t.rewind10s}
            disabled={isLoading || !currentMessageId}
            >
            <RewindIcon className="w-4 h-4" />
            </Button>

            <Button
            variant="ghost"
            onClick={onTogglePlayPause}
            className="p-1.5 sm:p-2 bg-bg-element rounded-full hover:bg-bg-hover"
            title={playPauseButtonTitle}
            aria-label={playPauseButtonTitle}
            disabled={!onTogglePlayPause || (!isLoading && !currentMessageId)}
            >
              <PlayPauseButtonIcon isLoading={isLoading} isPlaying={isPlaying} />
            </Button>
            
            <Button
            variant="ghost"
            onClick={() => onSeekRelative(10)}
            className="p-1.5 rounded-full hidden sm:flex"
            title={t.fastForward10s}
            aria-label={t.fastForward10s}
            disabled={isLoading || !currentMessageId}
            >
            <FastForwardIcon className="w-4 h-4" />
            </Button>

            {showPartControls && (
                <Button
                    variant="ghost"
                    onClick={onPlayNext}
                    className="p-1.5 rounded-full"
                    title={t.nextPart}
                    aria-label={t.nextPart}
                    disabled={isLoading || !currentMessageId || audioPartInfo.currentPart >= audioPartInfo.totalParts - 1}
                >
                    <ForwardIcon className="w-4 h-4" />
                </Button>
            )}
        </div>
      
        <div className="flex-shrink-0 ml-auto flex items-center space-x-1">
            <div className="relative flex items-center">
                {playbackRate !== 1 && !isTunerOpen && (
                    <span className="text-[10px] font-mono font-medium text-brand-primary mr-0.5 bg-brand-primary/10 px-1.5 py-0.5 rounded-md select-none">
                        {playbackRate}x
                    </span>
                )}
                <Button
                    variant="ghost"
                    ref={tunerButtonRef}
                    onClick={toggleTuner}
                    className={`p-1.5 rounded-full ${isTunerOpen ? 'text-brand-primary bg-tint-emerald-bg/10' : 'hover:text-brand-primary'}`}
                    title="Audio Tuning (Speed, Grain, Overlap)"
                >
                    <AdjustmentsHorizontalIcon className="w-5 h-5" />
                </Button>
                {isTunerOpen && <AudioTuner triggerRef={tunerButtonRef} onClose={() => setIsTunerOpen(false)} />}
            </div>

            <Button
                variant="ghost"
                onClick={onCloseView}
                className="p-1.5 rounded-full hover:text-tint-red-text"
                title={t.closePlayer}
                aria-label={t.closePlayer}
            >
                <XCircleIcon className="w-5 h-5" />
            </Button>
        </div>
      </div>

      <AudioProgressBar onSeekToAbsolute={onSeekToAbsolute} isLoading={isLoading} />
    </div>
  );
});

export default AdvancedAudioPlayer;
