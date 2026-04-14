import React, { useState, useEffect, memo, useCallback } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { AICharacter } from '../../types.ts';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { CloseIcon, PencilIcon, TrashIcon, InfoIcon, UsersIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';

const CharacterManagementModal: React.FC = memo(() => {
  const { currentChatSession } = useActiveChatStore();
  const { addCharacter, editCharacter, deleteCharacter } = useCharacterStore();
  const { isCharacterManagementModalOpen, closeCharacterManagementModal, openCharacterContextualInfoModal } = useSettingsUI();
  const { t } = useTranslation();

  const [editingCharacter, setEditingCharacter] = useState<AICharacter | null>(null);
  const [newCharName, setNewCharName] = useState('');
  const [newCharInstruction, setNewCharInstruction] = useState('');
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);

  const characters = currentChatSession?.aiCharacters || [];

  useEffect(() => {
    if (isCharacterManagementModalOpen) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
          setAreButtonsDisabled(false);
      }, 500);

      setEditingCharacter(null);
      setNewCharName('');
      setNewCharInstruction('');
      return () => clearTimeout(timerId);
    }
  }, [isCharacterManagementModalOpen]);

  const handleSave = useCallback(() => {
    if (editingCharacter) {
      editCharacter(editingCharacter.id, newCharName, newCharInstruction);
    } else {
      addCharacter(newCharName, newCharInstruction);
    }
    setNewCharName('');
    setNewCharInstruction('');
    setEditingCharacter(null);
  }, [editingCharacter, newCharName, newCharInstruction, editCharacter, addCharacter]);
  
  const startEdit = useCallback((char: AICharacter) => {
    setEditingCharacter(char);
    setNewCharName(char.name);
    setNewCharInstruction(char.systemInstruction);
  }, []);

  if (!isCharacterManagementModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={closeCharacterManagementModal}>
      <div className="bg-bg-panel border border-border-base p-6 rounded-2xl shadow-panel w-full sm:max-w-lg max-h-[90vh] flex flex-col text-text-primary overflow-hidden animate-modal-open" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 className="text-xl font-semibold flex items-center text-text-primary">
            <UsersIcon className="w-6 h-6 mr-3 text-brand-primary" />
            {t.manageCharacters}
          </h2>
          <Button variant="ghost" onClick={closeCharacterManagementModal} disabled={areButtonsDisabled} className="p-1 rounded-full h-auto text-text-secondary hover:text-text-primary bg-bg-element hover:bg-bg-hover" aria-label={t.close} icon={<CloseIcon />} />
        </div>

        <div className="flex-grow min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-3 mb-4">
            {characters.length === 0 && (
                <div className="p-8 text-center border-2 border-dashed border-border-base rounded-xl bg-bg-element backdrop-blur-sm">
                    <p className="text-text-muted italic">{t.noCharacters}</p>
                </div>
            )}
            {characters.map(char => (
                <div key={char.id} className="relative p-3 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/5 to-transparent flex justify-between items-center group transition hover:bg-bg-hover backdrop-blur-sm shadow-sm">
                    <div className="min-w-0 pr-2">
                        <p className="font-semibold text-text-primary">{char.name}</p>
                        <p className="text-xs text-text-secondary truncate" title={char.systemInstruction}>{char.systemInstruction}</p>
                    </div>
                    <div className="flex space-x-1 flex-shrink-0">
                        <Button variant="ghost" disabled={areButtonsDisabled} onClick={() => openCharacterContextualInfoModal(char)} className="p-1.5 text-text-secondary hover:text-brand-primary bg-bg-element hover:bg-bg-hover h-auto shadow-sm" title={t.contextualInfoFor} icon={<InfoIcon className="w-4 h-4"/>} />
                        <Button variant="ghost" disabled={areButtonsDisabled} onClick={() => startEdit(char)} className="p-1.5 text-text-secondary hover:text-brand-primary bg-bg-element hover:bg-bg-hover h-auto shadow-sm" title={t.edit} icon={<PencilIcon className="w-4 h-4"/>} />
                        <Button variant="ghost" disabled={areButtonsDisabled} onClick={() => deleteCharacter(char.id)} className="p-1.5 text-text-secondary hover:text-tint-red-text bg-bg-element hover:bg-bg-hover h-auto shadow-sm" title={t.delete} icon={<TrashIcon className="w-4 h-4"/>} />
                    </div>
                </div>
            ))}
        </div>
        
        <div className="border-t border-border-base pt-4 flex-shrink-0 bg-bg-element/40 -mx-6 px-6 pb-4 backdrop-blur-md">
          <h3 className="text-md font-semibold text-text-primary mb-3 flex items-center">
             <PencilIcon className="w-4 h-4 mr-2 text-brand-primary" />
             {editingCharacter ? t.editCharacter : t.addNewCharacter}
          </h3>
          
          <div className="space-y-3">
            <div>
                <Input 
                    type="text" 
                    disabled={areButtonsDisabled}
                    placeholder={t.characterName}
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    aria-label={t.characterName}
                    className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                />
            </div>
            <div>
                <Textarea 
                    disabled={areButtonsDisabled}
                    placeholder={t.characterInstruction}
                    value={newCharInstruction}
                    onChange={(e) => setNewCharInstruction(e.target.value)}
                    rows={3}
                    aria-label={t.characterInstruction}
                    className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            {editingCharacter && <Button variant="secondary" disabled={areButtonsDisabled} onClick={() => { setEditingCharacter(null); setNewCharName(''); setNewCharInstruction('');}} className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary">{t.cancelEdit}</Button>}
            <Button 
                variant="primary"
                onClick={handleSave} 
                disabled={areButtonsDisabled || !newCharName.trim() || !newCharInstruction.trim()}
                className="bg-brand-primary hover:bg-brand-hover text-text-on-brand shadow-sm"
            >
                {editingCharacter ? t.saveChanges : t.addCharacter}
            </Button>
          </div>
        </div>

        <div className="flex justify-end flex-shrink-0 border-t border-border-base pt-4 mt-0">
          <Button variant="secondary" onClick={closeCharacterManagementModal} disabled={areButtonsDisabled} className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary">{t.close}</Button>
        </div>
      </div>
    </div>
  );
});

export default CharacterManagementModal;