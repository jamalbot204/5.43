import React, { memo, useState, useEffect } from 'react';
import { CloseIcon, KeyIcon } from '../common/Icons.tsx';
import ApiKeyManager from '../settings/ApiKeyManager.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Button } from '../ui/Button.tsx';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = memo(({ isOpen, onClose }) => {
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);
      return () => clearTimeout(timerId);
    }
  }, [isOpen]);
  
  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 backdrop-blur-sm" 
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-modal-title"
    >
      <div 
        className="bg-bg-panel/90 backdrop-blur-xl border border-border-base p-6 rounded-2xl shadow-panel w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-text-primary animate-modal-open" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 id="api-key-modal-title" className="text-xl font-semibold text-text-primary flex items-center">
            <KeyIcon className="w-5 h-5 mr-3 text-brand-primary" />
            {t.apiKeyTitle}
          </h2>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={areButtonsDisabled}
            className="p-1.5 rounded-full text-text-secondary bg-bg-element hover:bg-bg-hover transition-colors"
            aria-label={t.close}
          >
            <CloseIcon className="w-6 h-6" />
          </Button>
        </div>

        <div className="flex-grow min-h-0 overflow-auto pr-2 -mr-2 custom-scrollbar">
          <fieldset disabled={areButtonsDisabled}>
            <p className="text-sm text-text-secondary mb-4">
                {t.apiKeyDesc}
            </p>
            <ApiKeyManager />
          </fieldset>
        </div>

        <div className="mt-8 flex justify-end flex-shrink-0 pt-4 border-t border-border-base">
          <Button 
            variant="secondary"
            onClick={onClose} 
            type="button" 
            disabled={areButtonsDisabled}
            className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary"
          >
            {t.close}
          </Button>
        </div>
      </div>
    </div>
  );
});

export default ApiKeyModal;