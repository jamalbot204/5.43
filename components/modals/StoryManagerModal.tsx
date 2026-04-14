
import React, { useState, useEffect, useCallback, memo } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useArchiverStore } from '../../store/useArchiverStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useConfirmationUI } from '../../store/ui/useConfirmationUI.ts'; // ADDED
import { ArchivedChapter } from '../../types.ts';
import { ArchiveBoxIcon, TrashIcon, PencilIcon, GripVerticalIcon, PlusIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';
import useAutoResizeTextarea from '../../hooks/useAutoResizeTextarea.ts';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';

const ChapterItem: React.FC<{
    chapter: ArchivedChapter;
    index: number;
    onEdit: (index: number) => void;
    onDelete: (index: number) => void;
    onMove: (index: number, direction: 'up' | 'down') => void;
    isFirst: boolean;
    isLast: boolean;
}> = memo(({ chapter, index, onEdit, onDelete, onMove, isFirst, isLast }) => {
    return (
        <div className="relative p-3 mb-3 rounded-md bg-bg-panel/40 border border-border-base shadow-sm backdrop-blur-md flex flex-col gap-2 group transition hover:bg-bg-hover">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="text-text-muted cursor-grab active:cursor-grabbing">
                        <GripVerticalIcon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                            Chapter {chapter.chapterNumber ?? (index + 1)}
                        </span>
                        <span className="text-sm font-semibold text-text-primary">{chapter.title}</span>
                        <span className="text-[10px] text-text-muted">{chapter.time_range}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-1">
                    <Button variant="ghost" onClick={() => onMove(index, 'up')} disabled={isFirst} className="p-1 text-text-muted hover:text-text-primary">▲</Button>
                    <Button variant="ghost" onClick={() => onMove(index, 'down')} disabled={isLast} className="p-1 text-text-muted hover:text-text-primary">▼</Button>
                    <Button variant="ghost" onClick={() => onEdit(index)} className="p-1.5 ml-2 hover:text-brand-primary bg-bg-panel/60" title="Edit"><PencilIcon className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" onClick={() => onDelete(index)} className="p-1.5 ml-1 hover:text-status-error bg-bg-panel/60" title="Delete"><TrashIcon className="w-3.5 h-3.5" /></Button>
                </div>
            </div>
            <div className="text-xs text-text-secondary line-clamp-2 pl-7">
                {chapter.narrative}
            </div>
        </div>
    );
});

const ChapterEditor: React.FC<{
    chapter: ArchivedChapter;
    onSave: (c: ArchivedChapter) => void;
    onCancel: () => void;
}> = memo(({ chapter, onSave, onCancel }) => {
    const [title, setTitle] = useState(chapter.title);
    const [timeRange, setTimeRange] = useState(chapter.time_range);
    const [narrative, setNarrative] = useState(chapter.narrative);
    const [quotes, setQuotes] = useState(chapter.key_quotes.join('\n'));
    
    const narrativeRef = useAutoResizeTextarea<HTMLTextAreaElement>(narrative);

    const handleSave = () => {
        onSave({
            ...chapter,
            title,
            time_range: timeRange,
            narrative,
            key_quotes: quotes.split('\n').filter(q => q.trim())
        });
    };

    return (
        <div className="space-y-4 p-1">
            <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Title</label>
                <Input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Time Range</label>
                <Input 
                    type="text" 
                    value={timeRange} 
                    onChange={e => setTimeRange(e.target.value)} 
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Narrative Summary</label>
                <Textarea 
                    ref={narrativeRef}
                    value={narrative} 
                    onChange={e => setNarrative(e.target.value)} 
                    className="min-h-[100px]"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Key Quotes (One per line)</label>
                <Textarea 
                    value={quotes} 
                    onChange={e => setQuotes(e.target.value)} 
                    className="h-24"
                />
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleSave} className="bg-brand-primary hover:bg-brand-hover">Save</Button>
            </div>
        </div>
    );
});

const StoryManagerModal: React.FC = memo(() => {
    const { isStoryManagerModalOpen, closeStoryManagerModal } = useSettingsUI();
    const { reorderChapters } = useArchiverStore();
    const { requestDeleteChapterConfirmation, requestDeleteAllChaptersConfirmation } = useConfirmationUI(); // ADDED
    
    const { currentChatSession } = useActiveChatStore();
    const [localChapters, setLocalChapters] = useState<ArchivedChapter[]>([]);
    
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Sync from active session to local state
    useEffect(() => {
        if (isStoryManagerModalOpen && currentChatSession) {
            setLocalChapters(currentChatSession.settings.archivedChapters || []);
        }
    }, [isStoryManagerModalOpen, currentChatSession]);

    // Helpers to persist changes back to global stores
    const persistChanges = useCallback(async (newChapters: ArchivedChapter[]) => {
        setLocalChapters(newChapters);
        await reorderChapters(newChapters);
    }, [reorderChapters]);

    const handleMove = useCallback((index: number, direction: 'up' | 'down') => {
        const newChapters = [...localChapters];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < newChapters.length) {
            [newChapters[index], newChapters[targetIndex]] = [newChapters[targetIndex], newChapters[index]];
            persistChanges(newChapters);
        }
    }, [localChapters, persistChanges]);

    const handleDelete = useCallback((index: number) => {
        // Use global confirmation UI instead of window.confirm
        requestDeleteChapterConfirmation(index);
    }, [requestDeleteChapterConfirmation]);

    const handleSaveEdit = useCallback(async (updatedChapter: ArchivedChapter) => {
        if (editingIndex === null) return;
        const newChapters = [...localChapters];
        newChapters[editingIndex] = updatedChapter;
        await persistChanges(newChapters);
        setEditingIndex(null);
    }, [localChapters, editingIndex, persistChanges]);

    const handleAddManual = useCallback(async () => {
        const newChapter: ArchivedChapter = {
            chapterNumber: localChapters.length + 1,
            title: "New Chapter",
            time_range: "Unknown",
            narrative: "",
            key_quotes: []
        };
        const newChapters = [...localChapters, newChapter];
        await persistChanges(newChapters);
        setEditingIndex(newChapters.length - 1);
    }, [localChapters, persistChanges]);

    const footerButtons = (
        <Button variant="secondary" onClick={closeStoryManagerModal}>Close</Button>
    );

    return (
        <BaseModal
            isOpen={isStoryManagerModalOpen}
            onClose={closeStoryManagerModal}
            title="Story Manager (Archived Chapters)"
            headerIcon={<ArchiveBoxIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-2xl"
        >
            <div className="space-y-4">
                <div className="bg-brand-primary/10 p-3 rounded border border-brand-primary/20 text-text-secondary text-sm mb-4 backdrop-blur-sm">
                    <p>Manage the story context injected into the AI. Chapters listed here are sent with every message.</p>
                </div>

                <div className="flex justify-between items-center mb-2">
                    <Button 
                        variant="ghost"
                        size="sm"
                        onClick={requestDeleteAllChaptersConfirmation} 
                        disabled={localChapters.length === 0}
                        className="text-status-error bg-status-error/10 hover:bg-status-error/20"
                        icon={<TrashIcon className="w-3.5 h-3.5" />}
                    >
                        Delete All
                    </Button>
                    <Button 
                        variant="ghost"
                        size="sm"
                        onClick={handleAddManual} 
                        className="text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20"
                        icon={<PlusIcon className="w-3.5 h-3.5" />}
                    >
                        Add Manual Chapter
                    </Button>
                </div>

                {editingIndex !== null ? (
                    <ChapterEditor 
                        chapter={localChapters[editingIndex]} 
                        onSave={handleSaveEdit} 
                        onCancel={() => setEditingIndex(null)} 
                    />
                ) : (
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {localChapters.length === 0 && (
                            <p className="text-center text-text-muted py-10 italic">No chapters archived yet.</p>
                        )}
                        {localChapters.map((chapter, idx) => (
                            <ChapterItem
                                key={idx}
                                chapter={chapter}
                                index={idx}
                                onEdit={setEditingIndex}
                                onDelete={handleDelete}
                                onMove={handleMove}
                                isFirst={idx === 0}
                                isLast={idx === localChapters.length - 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        </BaseModal>
    );
});

export default StoryManagerModal;
