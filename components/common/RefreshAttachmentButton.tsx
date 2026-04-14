import React, { memo, useCallback } from 'react';
import { ArrowPathIcon, XCircleIcon } from './Icons.tsx';
import { Attachment } from '../../types.ts';
import { Button } from '../ui/Button.tsx';

interface RefreshAttachmentButtonProps {
  attachment: Attachment;
  onReUpload: () => Promise<void>;
  disabled?: boolean;
}

const RefreshAttachmentButton: React.FC<RefreshAttachmentButtonProps> = memo(({
  attachment,
  onReUpload,
  disabled,
}) => {
  const isLoading = attachment.isReUploading;
  const hasError = !!attachment.reUploadError;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoading && !disabled) {
      onReUpload();
    }
  }, [isLoading, disabled, onReUpload]);

  let IconComponent = ArrowPathIcon;
  let iconColor = 'text-brand-primary hover:text-brand-secondary';
  let title = "Refresh cloud link";

  if (isLoading) {
    IconComponent = () => (
      <svg className="animate-spin h-3 w-3 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    );
    title = "Refreshing link...";
    iconColor = 'text-brand-primary';
  } else if (hasError) {
    IconComponent = XCircleIcon;
    iconColor = 'text-tint-red-text';
    title = `Error refreshing: ${attachment.reUploadError}`;
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={title}
      aria-label={title}
      variant="ghost"
      size="none"
      className={`p-1 bg-bg-overlay/40 rounded-full transition h-auto w-auto
                  ${disabled || isLoading ? 'cursor-not-allowed opacity-70' : 'hover:bg-bg-overlay/60'}
                  ${iconColor}
                `}
      icon={<IconComponent className="w-3 h-3" />}
    />
  );
});

export default RefreshAttachmentButton;