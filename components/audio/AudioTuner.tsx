import React, { memo, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAudioStore } from '../../store/useAudioStore.ts';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDownIcon, ChevronUpIcon, AdjustmentsHorizontalIcon } from '../common/Icons.tsx';
import { Button } from '../ui/Button.tsx';

interface AudioTunerProps {
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}

const AudioTuner: React.FC<AudioTunerProps> = memo(({ triggerRef, onClose }) => {
  // ATOMIC SELECTION: Only subscribe to config values. 
  // We strictly avoid subscribing to 'currentTime' or 'duration' here.
  const { grainSize, overlap, playbackRate } = useAudioStore(useShallow(state => ({
    grainSize: state.audioPlayerState.grainSize,
    overlap: state.audioPlayerState.overlap,
    playbackRate: state.audioPlayerState.playbackRate
  })));

  // Actions are stable, no need for deep selection
  const { setGrainSize, setOverlap, setPlaybackSpeed } = useAudioStore.getState();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
        if (triggerRef.current && panelRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const panelRect = panelRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const GAP = 8;
            const MARGIN = 10;

            // Default placement: Below the button, aligned to right edge of button 
            let left = triggerRect.right - panelRect.width;
            
            if (left < MARGIN) left = triggerRect.left;
            if (left + panelRect.width > viewportWidth - MARGIN) left = viewportWidth - panelRect.width - MARGIN;

            // Vertical placement: Prefer below
            let top = triggerRect.bottom + GAP;

            // If it hits bottom of screen, flip to above the button
            if (top + panelRect.height > viewportHeight - MARGIN) {
                top = triggerRect.top - panelRect.height - GAP;
            }

            setStyle({
                position: 'fixed',
                top,
                left,
                opacity: 1,
                zIndex: 9999
            });
        }
    };

    // Use requestAnimationFrame to ensure DOM dimensions are ready
    requestAnimationFrame(updatePosition);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
    };
  }, [triggerRef, showAdvanced]); // Re-calculate position when expanding

  // Handle click outside to close
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (
              panelRef.current && 
              !panelRef.current.contains(event.target as Node) &&
              triggerRef.current &&
              !triggerRef.current.contains(event.target as Node)
          ) {
              onClose();
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

  return createPortal(
    <div ref={panelRef} style={style} className="w-64 bg-bg-panel border border-border-base rounded-lg p-4 shadow-panel z-50 animate-fade-in text-left">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-border-base">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center">
            <AdjustmentsHorizontalIcon className="w-3 h-3 mr-1.5 text-brand-primary" />
            Audio Tuner
        </h3>
        <Button variant="ghost" onClick={onClose} className="p-1 rounded-full hover:bg-bg-hover" title="Close"><ChevronDownIcon className="w-3 h-3" /></Button>
      </div>
      
      <div className="space-y-5">
        {/* Speed Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-text-primary font-medium">Playback Speed</span>
            <span className="text-tint-emerald-text font-mono bg-tint-emerald-bg/10 px-1.5 rounded border border-tint-emerald-border/20">{playbackRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="3.0"
            step="0.05"
            value={playbackRate}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-brand-primary hover:accent-brand-secondary"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
            <span>Slow (0.25)</span>
            <span>Fast (3.0)</span>
          </div>
        </div>

        {/* Advanced Toggle */}
        <Button 
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-xs font-medium py-2 border-t border-border-base group rounded-none"
        >
            <span className="group-hover:text-tint-purple-text transition-colors">Advanced Settings</span>
            {showAdvanced ? <ChevronUpIcon className="w-3 h-3 text-tint-purple-text" /> : <ChevronDownIcon className="w-3 h-3" />}
        </Button>

        {/* Advanced Controls */}
        {showAdvanced && (
            <div className="space-y-4 animate-fade-in">
                {/* Grain Size Slider */}
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-tertiary">Grain Size</span>
                        <span className="text-tint-purple-text font-mono">{grainSize.toFixed(2)}s</span>
                    </div>
                    <input
                        type="range"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        value={grainSize}
                        onChange={(e) => setGrainSize(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-tint-purple-text hover:accent-tint-purple-text"
                    />
                    <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
                        <span>Tight</span>
                        <span>Smooth</span>
                    </div>
                </div>

                {/* Overlap Slider */}
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-tertiary">Overlap</span>
                        <span className="text-tint-fuchsia-text font-mono">{overlap.toFixed(2)}s</span>
                    </div>
                    <input
                        type="range"
                        min="0.01"
                        max="1.0"
                        step="0.01"
                        value={overlap}
                        onChange={(e) => setOverlap(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-tint-fuchsia-text hover:accent-tint-fuchsia-text"
                    />
                    <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
                        <span>Choppy</span>
                        <span>Seamless</span>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>,
    document.body
  );
});

export default AudioTuner;