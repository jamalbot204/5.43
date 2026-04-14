import React, { memo } from 'react';
import { PlayIcon, StopIcon, XCircleIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Input } from '../ui/Input.tsx';
import { Button } from '../ui/Button.tsx';

interface AutoSendControlsProps {
  isAutoSendingActive: boolean;
  autoSendText: string;
  setAutoSendText: (text: string) => void;
  autoSendRepetitionsInput: string;
  setAutoSendRepetitionsInput: (reps: string) => void;
  autoSendRemaining: number;
  onStartAutoSend: () => void; 
  onStopAutoSend: () => void;
  canStart: boolean; 
  isChatViewLoading: boolean;
  currentChatSessionExists: boolean;
  isCharacterMode: boolean;
  isPreparingAutoSend: boolean;
  isWaitingForErrorRetry: boolean; 
  errorRetryCountdown: number;    
}

const AutoSendControls: React.FC<AutoSendControlsProps> = memo(({
  isAutoSendingActive,
  autoSendText,
  setAutoSendText,
  autoSendRepetitionsInput,
  setAutoSendRepetitionsInput,
  autoSendRemaining,
  onStartAutoSend,
  onStopAutoSend,
  canStart,
  isChatViewLoading,
  currentChatSessionExists,
  isCharacterMode,
  isPreparingAutoSend,
  isWaitingForErrorRetry,
  errorRetryCountdown,    
}) => {
  const { t } = useTranslation();

  if (isAutoSendingActive) {
    return (
        <div className="mx-2 mt-2 px-3 py-1.5 rounded-xl border border-tint-emerald-border/20 bg-tint-emerald-bg/10 backdrop-blur-md shadow-sm flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-tint-emerald-bg/10 animate-pulse" />
                <span className="text-xs font-medium text-tint-emerald-text">
                    {t.autoSending}: {autoSendRemaining} {t.remaining}
                </span>
            </div>
            <Button 
                variant="ghost" 
                size="none" 
                onClick={onStopAutoSend}
                className="text-tint-emerald-text hover:text-tint-red-text transition-colors p-1"
            >
                <XCircleIcon className="w-4 h-4" />
            </Button>
        </div>
    );
  }

  const showGenericStartButton = !isCharacterMode && !isAutoSendingActive && !isWaitingForErrorRetry;

  return (
    <div className="mx-2 mt-2 p-2 rounded-xl bg-transparent backdrop-blur-md space-y-2 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            placeholder={t.textToAutoSend}
            value={autoSendText}
            onChange={(e) => setAutoSendText(e.target.value)}
            disabled={isAutoSendingActive || !currentChatSessionExists || isWaitingForErrorRetry}
            aria-label="Text for automated sending"
          />
        </div>
        <div className="w-16 sm:w-20 flex-shrink-0">
          <Input
            type="number"
            placeholder={t.times}
            value={autoSendRepetitionsInput}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || (parseInt(val, 10) >= 1 && parseInt(val, 10) <= 100)) {
                   setAutoSendRepetitionsInput(val);
              } else if (parseInt(val, 10) > 100) {
                   setAutoSendRepetitionsInput('100');
              } else if (parseInt(val, 10) < 1 && val !== '') {
                   setAutoSendRepetitionsInput('1');
              }
            }}
            min="1"
            max="100"
            className="text-center"
            disabled={isAutoSendingActive || !currentChatSessionExists || isWaitingForErrorRetry}
            aria-label="Number of times to send"
          />
        </div>
        {showGenericStartButton && (
          <Button
            variant="primary"
            onClick={onStartAutoSend}
            disabled={!canStart || isChatViewLoading || !currentChatSessionExists || isWaitingForErrorRetry}
            className="flex items-center shadow-sm flex-shrink-0"
            title={t.start}
          >
            <PlayIcon className="w-4 h-4 mr-1" />
            {t.start}
          </Button>
        )}
      </div>
      {isCharacterMode && isPreparingAutoSend && !isAutoSendingActive && !isWaitingForErrorRetry && (
        <p className="text-xs text-tint-amber-text">
          Auto-send configured. Click a character button below to start sending to them.
        </p>
      )}
      {isWaitingForErrorRetry && (
        <p className="text-xs text-tint-amber-text animate-pulse text-center">
          Error detected. Attempting to regenerate in {errorRetryCountdown}s...
        </p>
      )}
    </div>
  );
});

export default AutoSendControls;