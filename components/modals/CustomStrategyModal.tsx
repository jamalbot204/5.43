import React, { useState, useCallback, memo } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { PlusIcon, CheckIcon, TrashIcon, PencilIcon } from '../common/Icons.tsx';
import { CustomMemoryStrategy } from '../../types.ts';

const CustomStrategyModal: React.FC = memo(() => {
    const { isCustomStrategyModalOpen, closeCustomStrategyModal } = useSettingsUI();
    const { addCustomStrategy, deleteCustomStrategy, updateCustomStrategy, customMemoryStrategies } = useDataStore();
    const { t } = useTranslation();

    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [systemMandate, setSystemMandate] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleSave = useCallback(async () => {
        if (!label.trim() || !systemMandate.trim()) return;

        if (editingId) {
             await updateCustomStrategy({
                id: editingId,
                label,
                description: description || "Custom strategy defined by user.",
                systemMandate
            });
        } else {
            const newStrategy: CustomMemoryStrategy = {
                id: `custom_${Date.now()}`,
                label,
                description: description || "Custom strategy defined by user.",
                systemMandate
            };
            await addCustomStrategy(newStrategy);
        }
        
        setLabel('');
        setDescription('');
        setSystemMandate('');
        setEditingId(null);
        closeCustomStrategyModal();
    }, [label, description, systemMandate, addCustomStrategy, updateCustomStrategy, editingId, closeCustomStrategyModal]);

    const handleEdit = useCallback((s: CustomMemoryStrategy) => {
        setLabel(s.label);
        setDescription(s.description);
        setSystemMandate(s.systemMandate);
        setEditingId(s.id);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setLabel('');
        setDescription('');
        setSystemMandate('');
        setEditingId(null);
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        if (window.confirm("Delete this strategy?")) {
            await deleteCustomStrategy(id);
            if (editingId === id) {
                handleCancelEdit();
            }
        }
    }, [deleteCustomStrategy, editingId, handleCancelEdit]);

    const footerButtons = (
        <>
            {editingId ? (
                <Button variant="secondary" onClick={handleCancelEdit}>Cancel Edit</Button>
            ) : (
                <Button variant="secondary" onClick={closeCustomStrategyModal}>{t.cancel}</Button>
            )}
            <Button 
                variant="primary"
                onClick={handleSave} 
                disabled={!label.trim() || !systemMandate.trim()}
                icon={<CheckIcon className="w-4 h-4" />}
            >
                {editingId ? "Update" : t.save}
            </Button>
        </>
    );

    return (
        <BaseModal
            isOpen={isCustomStrategyModalOpen}
            onClose={closeCustomStrategyModal}
            title={editingId ? "Edit Strategy" : "Custom Memory Strategies"}
            headerIcon={editingId ? <PencilIcon className="w-5 h-5 text-brand-primary" /> : <PlusIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-xl"
        >
            <div className="space-y-4">
                {/* Existing List */}
                {customMemoryStrategies.length > 0 && !editingId && (
                    <div className="bg-bg-element p-3 rounded border border-border-base mb-4 max-h-40 overflow-y-auto custom-scrollbar shadow-sm backdrop-blur-md">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">Your Strategies</label>
                        <ul className="space-y-2">
                            {customMemoryStrategies.map(s => (
                                <li key={s.id} className="flex justify-between items-center bg-bg-panel p-2 rounded text-sm border border-border-base shadow-sm">
                                    <span className="text-text-primary">{s.label}</span>
                                    <div className="flex items-center space-x-1">
                                        <Button variant="ghost" onClick={() => handleEdit(s)} className="text-brand-primary hover:text-text-primary p-1 h-auto bg-bg-element hover:bg-bg-hover" title="Edit" icon={<PencilIcon className="w-3.5 h-3.5"/>} />
                                        <Button variant="ghost" onClick={() => handleDelete(s.id)} className="text-tint-red-text hover:text-tint-red-text/80 p-1 h-auto bg-bg-element hover:bg-bg-hover" title="Delete" icon={<TrashIcon className="w-3.5 h-3.5"/>} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Form */}
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Strategy Name (Label)</label>
                        <Input 
                            type="text" 
                            value={label} 
                            onChange={e => setLabel(e.target.value)} 
                            placeholder="e.g. Code Assistant"
                            className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Description (Optional)</label>
                        <Input 
                            type="text" 
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                            placeholder="Short description for the dropdown..."
                            className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">System Mandate (Instruction)</label>
                        <p className="text-[10px] text-text-muted mb-2">This instruction is injected into the prompt to tell the model HOW to use the memory search tool.</p>
                        <Textarea 
                            value={systemMandate} 
                            onChange={e => setSystemMandate(e.target.value)} 
                            placeholder="e.g. You MUST use 'search_ideal_companion_responses' to find similar code snippets..."
                            className="h-32 font-mono bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                        />
                    </div>
                </div>
            </div>
        </BaseModal>
    );
});

export default CustomStrategyModal;