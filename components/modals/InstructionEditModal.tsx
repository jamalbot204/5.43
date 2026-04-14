import React, { useState, useEffect, memo, useCallback } from 'react';
import { UserIcon, PencilIcon } from '../common/Icons.tsx';
import useAutoResizeTextarea from '../../hooks/useAutoResizeTextarea.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import BaseModal from '../common/BaseModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Textarea } from '../ui/Textarea.tsx';

interface InstructionEditModalProps {
  isOpen: boolean;
  title: string;
  currentInstruction: string;
  onApply: (newInstruction: string) => void;
  onClose: () => void;
}

const InstructionEditModal: React.FC<InstructionEditModalProps> = memo(({
  isOpen,
  title,
  currentInstruction,
  onApply,
  onClose,
}) => {
  const { t } = useTranslation();
  const [editText, setEditText] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(editText, 400);

  useEffect(() => {
    if (isOpen) {
      setEditText(currentInstruction);
    }
  }, [isOpen, currentInstruction]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
        setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, textareaRef]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
  }, []);

  const handleApplyClick = useCallback(() => {
    onApply(editText);
  }, [onApply, editText]);
  
  const footerButtons = (
    <>
        <Button
            variant="secondary"
            onClick={onClose}
        >
            {t.cancel}
        </Button>
        <Button
            variant="primary"
            onClick={handleApplyClick}
        >
            {t.apply}
        </Button>
    </>
  );

  return (
    <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        headerIcon={<UserIcon className="w-5 h-5 text-brand-primary" />}
        footer={footerButtons}
        maxWidth="sm:max-w-2xl"
    >
        <div className="relative p-1 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/5 to-transparent flex-grow flex flex-col min-h-0">
            <Textarea
                ref={textareaRef}
                value={editText}
                onChange={handleTextChange}
                className="h-full resize-none hide-scrollbar text-sm sm:text-base leading-relaxed bg-transparent border-none focus:ring-0 text-text-primary"
                placeholder={t.enterMessageContent}
                style={{ minHeight: '300px' }} 
                aria-label="Instruction content editor"
            />
            <div className="absolute bottom-2 right-2 pointer-events-none opacity-50">
                <PencilIcon className="w-4 h-4 text-brand-primary" />
            </div>
        </div>
    </BaseModal>
  );
});

export default InstructionEditModal;