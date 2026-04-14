import React, { useState, useEffect } from 'react';
import BaseModal from '../common/BaseModal.tsx';
import { useSettingsUI } from '../../store/ui/useSettingsUI';
import { useActiveChatStore } from '../../store/useActiveChatStore';
import * as dbService from '../../services/dbService';
import { LorebookEntry } from '../../types/settings';
import { BookOpenIcon, PlusIcon, TrashIcon, PencilIcon } from '../common/Icons.tsx';

export const LorebookManagerModal: React.FC = () => {
    const { isLorebookModalOpen, closeLorebookModal } = useSettingsUI();
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore();

    const [entries, setEntries] = useState<LorebookEntry[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [keysInput, setKeysInput] = useState('');
    const [contextInput, setContextInput] = useState('');

    useEffect(() => {
        if (isLorebookModalOpen && currentChatSession) {
            setEntries(currentChatSession.settings.lorebookEntries || []);
            resetForm();
        }
    }, [isLorebookModalOpen, currentChatSession]);

    const resetForm = () => {
        setEditingId(null);
        setKeysInput('');
        setContextInput('');
    };

    const handleSave = async () => {
        if (!currentChatSession) return;

        const keys = keysInput.split(',').map(k => k.trim()).filter(k => k);
        if (keys.length === 0 || !contextInput.trim()) return;

        let newEntries: LorebookEntry[];
        if (editingId) {
            newEntries = entries.map(e => 
                e.id === editingId ? { ...e, keys, context: contextInput.trim() } : e
            );
        } else {
            const newEntry: LorebookEntry = {
                id: crypto.randomUUID(),
                keys,
                context: contextInput.trim()
            };
            newEntries = [...entries, newEntry];
        }

        setEntries(newEntries);
        
        const updatedSession = {
            ...currentChatSession,
            settings: {
                ...currentChatSession.settings,
                lorebookEntries: newEntries
            }
        };

        updateCurrentChatSession(() => updatedSession);
        await dbService.addOrUpdateChatSession(updatedSession);
        
        resetForm();
    };

    const handleEdit = (entry: LorebookEntry) => {
        setEditingId(entry.id);
        setKeysInput(entry.keys.join(', '));
        setContextInput(entry.context);
    };

    const handleDelete = async (id: string) => {
        if (!currentChatSession) return;

        const newEntries = entries.filter(e => e.id !== id);
        setEntries(newEntries);

        const updatedSession = {
            ...currentChatSession,
            settings: {
                ...currentChatSession.settings,
                lorebookEntries: newEntries
            }
        };

        updateCurrentChatSession(() => updatedSession);
        await dbService.addOrUpdateChatSession(updatedSession);
    };

    if (!isLorebookModalOpen) return null;

    return (
        <BaseModal
            isOpen={isLorebookModalOpen}
            onClose={closeLorebookModal}
            title="Lorebook Manager"
            headerIcon={<BookOpenIcon className="w-5 h-5 text-brand-primary" />}
            maxWidth="max-w-3xl"
        >
            <div className="space-y-6">
                <div className="bg-bg-element/40 backdrop-blur-sm p-4 rounded-xl border border-border-base shadow-sm">
                    <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center">
                        {editingId ? <><PencilIcon className="w-4 h-4 mr-2 text-brand-primary" /> Edit Entry</> : <><PlusIcon className="w-4 h-4 mr-2 text-brand-primary" /> Add New Entry</>}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                                Keywords / Triggers (comma separated)
                            </label>
                            <input
                                type="text"
                                value={keysInput}
                                onChange={(e) => setKeysInput(e.target.value)}
                                placeholder="e.g., The Citadel, magic sword, John Doe"
                                className="w-full px-3 py-2 bg-bg-element border border-border-base rounded-md text-sm focus:ring-2 focus:ring-ring-focus focus:border-brand-primary outline-none transition-all placeholder-text-muted text-text-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                                Context / Definition
                            </label>
                            <textarea
                                value={contextInput}
                                onChange={(e) => setContextInput(e.target.value)}
                                placeholder="Define the lore, background, or facts about these keywords..."
                                rows={4}
                                className="w-full px-3 py-2 bg-bg-element border border-border-base rounded-md text-sm focus:ring-2 focus:ring-ring-focus focus:border-brand-primary outline-none transition-all resize-y placeholder-text-muted text-text-primary custom-scrollbar"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            {editingId && (
                                <button
                                    onClick={resetForm}
                                    className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover rounded-md transition-colors bg-bg-element border border-border-base"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={!keysInput.trim() || !contextInput.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary hover:bg-brand-hover text-text-on-brand text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                {editingId ? 'Save Changes' : <><PlusIcon className="w-3.5 h-3.5" /> Add Entry</>}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-text-primary">
                        Existing Entries ({entries.length})
                    </h3>
                    {entries.length === 0 ? (
                        <p className="text-sm text-text-muted text-center py-8 italic">
                            No lorebook entries yet. Add one above!
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                            {entries.map(entry => (
                                <div key={entry.id} className="bg-bg-panel/40 backdrop-blur-sm p-3 rounded-xl border border-border-base flex flex-col gap-2 group shadow-sm hover:bg-bg-hover transition-colors">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {entry.keys.map((key, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary text-xs font-medium rounded-full border border-brand-primary/20">
                                                    {key}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(entry)}
                                                className="p-1.5 text-text-secondary hover:text-brand-primary rounded-md hover:bg-bg-element transition-colors"
                                                title="Edit entry"
                                            >
                                                <PencilIcon className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(entry.id)}
                                                className="p-1.5 text-text-secondary hover:text-tint-red-text rounded-md hover:bg-bg-element transition-colors"
                                                title="Delete entry"
                                            >
                                                <TrashIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-text-secondary line-clamp-3">
                                        {entry.context}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};
