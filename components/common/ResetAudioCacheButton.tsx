import React, { memo } from 'react';
import { AudioResetIcon } from './Icons.tsx';
import { Button } from '../ui/Button.tsx';

interface ResetAudioCacheButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

const ResetAudioCacheButton: React.FC<ResetAudioCacheButtonProps> = memo(({
  onClick,
  disabled = false,
  title = "Reset Audio Cache",
  className = "",
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      variant="ghost"
      size="none"
      className={`p-1.5 text-tint-yellow-text rounded-md bg-bg-overlay/20 transition focus:outline-none focus:ring-2 focus:ring-tint-yellow-border disabled:opacity-50 disabled:cursor-not-allowed hover:text-tint-yellow-text/80 h-auto w-auto ${className}`}
      icon={<AudioResetIcon className="w-4 h-4" />}
    />
  );
});

export default ResetAudioCacheButton;