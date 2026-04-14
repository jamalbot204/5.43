import React, { useState, useEffect, memo, useCallback } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { CloseIcon, InfoIcon } from '../common/Icons.tsx';
import useAutoResizeTextarea from '../../hooks/useAutoResizeTextarea.ts';
import { Button } from '../ui/Button.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';

const CharacterContextualInfoModal: React.FC = memo(() => {
  const { saveContextualInfo } = useCharacterStore();
  const { isContextualInfoModalOpen, editingCharacterForContextualInfo, closeCharacterContextualInfoModal } = useSettingsUI();
  const { t } = useTranslation();
  
  const [infoText, setInfoText] = useState('');
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(infoText, 250);

  useEffect(() => {
    if (isContextualInfoModalOpen) {
        setAreButtonsDisabled(true);
        const timerId = setTimeout(() => {
            setAreButtonsDisabled(false);
        }, 500);

        if (editingCharacterForContextualInfo) {
            setInfoText(editingCharacterForContextualInfo.contextualInfo || '');
        }
        return () => clearTimeout(timerId);
    }
  }, [isContextualInfoModalOpen, editingCharacterForContextualInfo]);

  useEffect(() => {
    if (isContextualInfoModalOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isContextualInfoModalOpen, textareaRef]);

  const handleSave = useCallback(() => {
    if (!editingCharacterForContextualInfo) return;
    saveContextualInfo(editingCharacterForContextualInfo.id, infoText);
    closeCharacterContextualInfoModal();
  }, [editingCharacterForContextualInfo, saveContextualInfo, infoText, closeCharacterContextualInfoModal]);
  
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInfoText(e.target.value);
  }, []);

  if (!isContextualInfoModalOpen || !editingCharacterForContextualInfo) return null;

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contextual-info-modal-title"
        onClick={closeCharacterContextualInfoModal}
    >
      <div className="bg-bg-panel border border-border-base p-6 rounded-2xl shadow-panel w-full sm:max-w-lg max-h-[90vh] flex flex-col text-text-primary animate-modal-open" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 id="contextual-info-modal-title" className="text-xl font-semibold flex items-center text-text-primary">
            <InfoIcon className="w-5 h-5 mr-3 text-brand-primary" />
            {t.contextualInfoFor} <span className="text-brand-primary ml-2">{editingCharacterForContextualInfo.name}</span>
          </h2>
          <Button variant="ghost" onClick={closeCharacterContextualInfoModal} disabled={areButtonsDisabled} className="p-1 rounded-full text-text-secondary hover:text-text-primary bg-bg-element hover:bg-bg-hover" aria-label={t.close}><CloseIcon /></Button>
        </div>
        
        {/* Editor Card */}
        <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/5 to-transparent flex-grow flex flex-col min-h-0 mb-4 backdrop-blur-sm shadow-sm">
            <p className="text-xs text-text-secondary mb-3">
                {t.contextualInfoDesc}
            </p>
            <Textarea
                ref={textareaRef}
                placeholder={t.contextualPromptPlaceholder}
                value={infoText}
                onChange={handleTextChange}
                rows={8}
                className="hide-scrollbar resize-y flex-grow bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                style={{ minHeight: '150px' }}
                aria-label={`Contextual information for ${editingCharacterForContextualInfo.name}`}
            />
        </div>

        <div className="flex justify-end space-x-3 flex-shrink-0">
          <Button variant="secondary" onClick={closeCharacterContextualInfoModal} disabled={areButtonsDisabled} className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary">{t.cancel}</Button>
          <Button variant="primary" onClick={handleSave} disabled={areButtonsDisabled}>
            {t.saveInfo}
          </Button>
        </div>
      </div>
    </div>
  );
});

export default CharacterContextualInfoModal;