import React, { memo } from 'react';
import { LocateIcon } from './Icons.tsx';
import { Button } from '../ui/Button.tsx';

interface GoToMessageButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const GoToMessageButton: React.FC<GoToMessageButtonProps> = memo(({ onClick, disabled }) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      size="none"
      className={`p-1.5 text-text-tertiary hover:text-brand-primary rounded-full hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1 flex-shrink-0 h-auto w-auto`}
      title="Go to playing message"
      aria-label="Go to playing message"
      icon={<LocateIcon />}
    />
  );
});

export default GoToMessageButton;