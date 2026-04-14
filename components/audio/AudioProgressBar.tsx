
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useAudioStore } from '../../store/useAudioStore.ts';
import { useShallow } from 'zustand/react/shallow';

interface AudioProgressBarProps {
  onSeekToAbsolute: (timeInSeconds: number) => void;
  isLoading: boolean;
}

const AudioProgressBar: React.FC<AudioProgressBarProps> = memo(({ onSeekToAbsolute, isLoading }) => {
  // Isolate volatile state here. Only this component re-renders on time updates.
  const { currentTime, duration } = useAudioStore(useShallow(state => ({
    currentTime: state.audioPlayerState.currentTime,
    duration: state.audioPlayerState.duration
  })));

  const [isSeeking, setIsSeeking] = useState(false);
  const [visualSeekTime, setVisualSeekTime] = useState<number | null>(null);
  const rangeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSeeking) {
      setVisualSeekTime(null);
    }
  }, [isSeeking, currentTime]);

  const formatTime = useCallback((timeInSeconds: number | undefined): string => {
    if (timeInSeconds === undefined || isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleRangeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(event.target.value);
    setVisualSeekTime(newTime);
  }, []);

  const handleRangeMouseDown = useCallback(() => {
    if (!duration) return;
    setIsSeeking(true);
    setVisualSeekTime(currentTime || 0);
  }, [duration, currentTime]);

  const handleRangeMouseUp = useCallback(() => {
    if (isSeeking && visualSeekTime !== null && duration && duration > 0) {
      onSeekToAbsolute(visualSeekTime);
    }
    setIsSeeking(false);
    setVisualSeekTime(null);
  }, [isSeeking, visualSeekTime, duration, onSeekToAbsolute]);

  const handleProgressClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.currentTarget || !duration) return;
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    if (width === 0) return;
    const newTime = (clickX / width) * duration;
    onSeekToAbsolute(newTime);
  }, [duration, onSeekToAbsolute]);

  const displayTime = isSeeking && visualSeekTime !== null ? visualSeekTime : (currentTime || 0);
  const totalDuration = duration || 0;
  const progressPercent = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center w-full space-x-1 px-1 pt-1.5 sm:pt-2" dir="ltr">
      <span className="text-xs text-text-tertiary w-8 text-right tabular-nums flex-shrink-0">{formatTime(displayTime)}</span>
      <div
        className="flex-grow h-1.5 sm:h-2 bg-bg-overlay/30 rounded-full cursor-pointer group relative min-w-[30px] sm:min-w-[50px]"
        onClick={handleProgressClick}
      >
        <div
          className="absolute top-0 left-0 h-full bg-brand-primary group-hover:bg-brand-secondary rounded-full transition-colors"
          style={{ width: `${progressPercent}%` }}
        />
        <input
          ref={rangeInputRef}
          type="range"
          min="0"
          max={totalDuration}
          value={displayTime}
          onMouseDown={handleRangeMouseDown}
          onMouseUp={handleRangeMouseUp}
          onTouchStart={handleRangeMouseDown}
          onTouchEnd={handleRangeMouseUp}
          onChange={handleRangeChange}
          className="absolute top-1/2 left-0 w-full h-4 opacity-0 cursor-pointer m-0 p-0 transform -translate-y-1/2"
          disabled={isLoading || !totalDuration}
          aria-label="Audio progress seek"
        />
      </div>
      <span className="text-xs text-text-tertiary w-8 tabular-nums flex-shrink-0">{formatTime(totalDuration)}</span>
    </div>
  );
});

export default AudioProgressBar;
