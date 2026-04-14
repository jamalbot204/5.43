
import React, { useState, useCallback, memo, useRef } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { usePromptButtonStore } from '../../store/usePromptButtonStore.ts';
import { useExternalModelsStore } from '../../store/useExternalModelsStore.ts';
import { useConfirmationUI } from '../../store/ui/useConfirmationUI.ts';
import { PromptButton } from '../../types.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Select } from '../ui/Select.tsx';
import { WrenchScrewdriverIcon, PlusIcon, TrashIcon, PencilIcon, GripVerticalIcon, CheckIcon, CloseIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';

const PromptButtonManagerModal: React.FC = memo(() => {
    const { isPromptButtonManagerOpen, closePromptButtonManager } = useSettingsUI();
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const { promptButtons, addPromptButton, updatePromptButton, reorderPromptButtons } = usePromptButtonStore();
    const { requestDeletePromptButtonConfirmation } = useConfirmationUI(); // ADDED

    const [label, setLabel] = useState('');
    const [content, setContent] = useState('');
    const [action, setAction] = useState<'insert' | 'send'>('insert');
    const [modelId, setModelId] = useState<string>('default');
    const [editingId, setEditingId] = useState<string | null>(null);

    const { providers } = useExternalModelsStore();

    const handleSave = useCallback(async () => {
        if (!label.trim() || !content.trim()) return;

        const finalModelId = modelId === 'default' ? undefined : modelId;

        if (editingId) {
            await updatePromptButton(editingId, { label, content, action, modelId: finalModelId });
        } else {
            await addPromptButton(label, content, action, finalModelId);
        }
        
        // Reset form
        setLabel('');
        setContent('');
        setAction('insert');
        setModelId('default');
        setEditingId(null);
    }, [label, content, action, modelId, editingId, addPromptButton, updatePromptButton]);

    const handleEdit = useCallback((btn: PromptButton) => {
        setLabel(btn.label);
        setContent(btn.content);
        setAction(btn.action);
        setModelId(btn.modelId || 'default');
        setEditingId(btn.id);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setLabel('');
        setContent('');
        setAction('insert');
        setModelId('default');
        setEditingId(null);
    }, []);

    const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Request confirmation via global modal system instead of direct delete
        requestDeletePromptButtonConfirmation(id);
        
        // We don't clear edit state here immediately. 
        // If the item is deleted by ModalManager, it will disappear from the list.
        // We could clear it if editingId === id, but waiting for deletion is safer UX.
    }, [requestDeletePromptButtonConfirmation]);

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
        // Set the drag image to the parent row so it looks like we are dragging the whole item
        if (e.currentTarget.parentElement) {
            e.dataTransfer.setDragImage(e.currentTarget.parentElement, 20, 20);
        }
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
        dragOverItem.current = position;
        if (dragItem.current !== null && dragItem.current !== position) {
            const newOrder = [...promptButtons];
            const draggedItem = newOrder[dragItem.current];
            newOrder.splice(dragItem.current, 1);
            newOrder.splice(position, 0, draggedItem);
            dragItem.current = position;
            reorderPromptButtons(newOrder); // Optimistic Update
        }
    };

    const handleDragEnd = () => {
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const footerButtons = (
        <Button variant="secondary" onClick={closePromptButtonManager}>Close</Button>
    );

    return (
        <BaseModal
            isOpen={isPromptButtonManagerOpen}
            onClose={closePromptButtonManager}
            title="Quick Action Buttons"
            headerIcon={<WrenchScrewdriverIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-xl"
        >
            <div className="space-y-4">
                {/* List */}
                <div className="bg-bg-panel/20 p-2 rounded border border-border-base max-h-60 overflow-y-auto custom-scrollbar space-y-2 shadow-inner">
                    {promptButtons.length === 0 && <p className="text-center text-text-muted py-4 italic text-xs">No buttons created yet.</p>}
                    {promptButtons.map((btn, idx) => (
                        <div 
                            key={btn.id}
                            onDragEnter={(e) => handleDragEnter(e, idx)}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex items-center p-2 bg-bg-element rounded hover:bg-bg-hover group border border-transparent hover:border-border-base transition-colors"
                        >
                            <div 
                                className="text-text-muted mr-2 cursor-grab active:cursor-grabbing p-1 hover:text-text-primary transition-colors"
                                draggable
                                onDragStart={(e) => handleDragStart(e, idx)}
                                onDragEnd={handleDragEnd}
                            >
                                <GripVerticalIcon className="w-4 h-4" />
                            </div>
                            
                            <div className="flex-grow min-w-0 mr-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-text-primary">{btn.label}</span>
                                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${btn.action === 'send' ? 'bg-tint-emerald-bg/20 text-tint-emerald-text border-tint-emerald-border/20' : 'bg-tint-blue-bg/20 text-tint-blue-text border-tint-blue-border/20'}`}>
                                        {btn.action}
                                    </span>
                                    {btn.modelId && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-tint-purple-bg/20 text-tint-purple-text border-tint-purple-border/20">
                                            {MODEL_DEFINITIONS.find(m => m.id === btn.modelId)?.name || providers.flatMap(p => p.models || []).find(m => m.id === btn.modelId)?.displayName || btn.modelId}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-text-muted truncate">{btn.content}</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                    variant="ghost"
                                    onClick={() => handleEdit(btn)} 
                                    className="p-1.5 text-status-success hover:bg-status-success/10 h-auto"
                                    icon={<PencilIcon className="w-3.5 h-3.5"/>}
                                />
                                <Button 
                                    variant="ghost"
                                    onClick={(e) => handleDelete(e, btn.id)} 
                                    className="p-1.5 text-status-error hover:bg-status-error/10 h-auto"
                                    icon={<TrashIcon className="w-3.5 h-3.5"/>}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Editor */}
                <div className="bg-bg-panel/30 p-4 rounded border border-border-base relative shadow-sm">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center">
                        {editingId ? <PencilIcon className="w-3 h-3 mr-1.5 text-status-success"/> : <PlusIcon className="w-3 h-3 mr-1.5 text-status-success"/>}
                        {editingId ? "Edit Button" : "Create New Button"}
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] text-text-muted mb-1">Label</label>
                            <Input 
                                type="text" 
                                value={label} 
                                onChange={e => setLabel(e.target.value)} 
                                placeholder="e.g. Fix Grammar"
                                className="bg-bg-element"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-text-muted mb-1">Type</label>
                            <Select 
                                value={action} 
                                onChange={e => setAction(e.target.value as any)}
                                options={[
                                    { value: 'insert', label: 'Insert Text' },
                                    { value: 'send', label: 'Send Immediately' }
                                ]}
                                className="bg-bg-element"
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="block text-[10px] text-text-muted mb-1">Model Override (Optional)</label>
                        <Select 
                            value={modelId} 
                            onChange={e => setModelId(e.target.value)}
                            className="bg-bg-element"
                        >
                            <option value="default">Default (Current Chat Model)</option>
                            <optgroup label="Base Models">
                                {MODEL_DEFINITIONS.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                            {providers.length > 0 && (
                                <optgroup label="External Models">
                                    {providers.flatMap(p => p.models || []).map(m => (
                                        <option key={m.id} value={m.id}>{m.displayName}</option>
                                    ))}
                                </optgroup>
                            )}
                        </Select>
                    </div>
                    
                    <div className="mb-3">
                        <label className="block text-[10px] text-text-muted mb-1">Content / Prompt</label>
                        <Textarea 
                            value={content} 
                            onChange={e => setContent(e.target.value)} 
                            placeholder="e.g. Please fix the grammar in the following text:"
                            className="h-20 bg-bg-element"
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        {editingId && <Button variant="secondary" onClick={handleCancelEdit}>Cancel</Button>}
                        <Button 
                            variant="primary"
                            onClick={handleSave} 
                            disabled={!label.trim() || !content.trim()}
                            icon={<CheckIcon className="w-3.5 h-3.5" />}
                        >
                            {editingId ? "Update" : "Create"}
                        </Button>
                    </div>
                </div>
            </div>
        </BaseModal>
    );
});

export default PromptButtonManagerModal;
