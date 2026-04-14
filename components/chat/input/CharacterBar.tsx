
import React, { memo, useRef, useCallback, useState } from 'react';
import { useActiveChatStore } from '../../../store/useActiveChatStore.ts';
import { useCharacterStore } from '../../../store/useCharacterStore.ts';
import { useAutoSendStore } from '../../../store/useAutoSendStore.ts';
import { AICharacter } from '../../../types.ts';
import { useTranslation } from '../../../hooks/useTranslation.ts';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../ui/Button.tsx';
import { WrenchScrewdriverIcon } from '../../common/Icons.tsx';

interface CharacterBarProps {
    isReorderingActive: boolean;
    onCharacterClick: (charId: string) => void;
    isInfoInputModeActive: boolean;
    disabled: boolean;
    isFileProcessing: boolean;
    onSwitchToolbar?: () => void;
    showSwitchButton?: boolean;
}

const CharacterBar: React.FC<CharacterBarProps> = memo(({ 
    isReorderingActive, 
    onCharacterClick, 
    isInfoInputModeActive, 
    disabled, 
    isFileProcessing,
    onSwitchToolbar,
    showSwitchButton
}) => {
    const { t } = useTranslation();
    const { reorderCharacters } = useCharacterStore();
    const { isAutoSendingActive } = useAutoSendStore();
    
    // Optimized selector: only get characters and session ID
    const { characters, sessionId } = useActiveChatStore(useShallow(state => ({
        characters: state.currentChatSession?.aiCharacters || [],
        sessionId: state.currentChatSession?.id
    })));

    const draggedCharRef = useRef<AICharacter | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Drag and Drop Logic
    const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>, char: AICharacter) => {
        if (!isReorderingActive) return;
        draggedCharRef.current = char;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', char.id);
        e.currentTarget.classList.add('opacity-50', 'ring-2', 'ring-fuchsia-500');
    }, [isReorderingActive]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        if (!isReorderingActive || !draggedCharRef.current) return;
        e.dataTransfer.dropEffect = 'move';
    }, [isReorderingActive]);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        if (!isReorderingActive || !draggedCharRef.current || !sessionId) return;
        const targetCharId = (e.target as HTMLElement).closest('button[data-char-id]')?.getAttribute('data-char-id');
        if (!targetCharId) return;
        
        const draggedChar = draggedCharRef.current;
        const currentChars = [...characters];
        const draggedIndex = currentChars.findIndex(c => c.id === draggedChar.id);
        const targetIndex = currentChars.findIndex(c => c.id === targetCharId);
        
        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
        
        const [removed] = currentChars.splice(draggedIndex, 1);
        currentChars.splice(targetIndex, 0, removed);
        
        // Optimistically update store via reorderCharacters which updates both local state and DB
        await reorderCharacters(currentChars);
        draggedCharRef.current = null;
    }, [isReorderingActive, sessionId, characters, reorderCharacters]);

    const handleDragEnd = useCallback((e: React.DragEvent<HTMLButtonElement>) => { 
        if (!isReorderingActive) return; 
        e.currentTarget.classList.remove('opacity-50', 'ring-2', 'ring-fuchsia-500'); 
    }, [isReorderingActive]);

    if (characters.length === 0) return null;

    const isGlobalDisabled = disabled || isFileProcessing || isAutoSendingActive;

    return (
        <div 
            ref={containerRef} 
            className="p-3 bg-transparent" 
            onDragOver={handleDragOver} 
            onDrop={handleDrop}
        >
            <p className="text-[10px] uppercase font-bold text-text-muted mb-2 tracking-wider">
                {isReorderingActive ? t.dragToReorder : (isInfoInputModeActive ? t.selectCharToSpeak : t.selectCharToSpeak)}
            </p>
            
            <div className="flex items-center flex-nowrap w-full">
                {/* Fixed Start */}
                {showSwitchButton && onSwitchToolbar && (
                    <Button
                        onClick={onSwitchToolbar}
                        variant="ghost"
                        size="none"
                        className="p-1.5 text-text-secondary hover:text-text-primary rounded-xl hover:bg-bg-hover transition-colors flex-shrink-0 me-3"
                        title={t.quickActions}
                    >
                        <WrenchScrewdriverIcon className="w-4 h-4" />
                    </Button>
                )}

                {/* Scrollable Center */}
                <div className="flex-1 min-w-0 overflow-x-auto pt-2 pb-1">
                    <div className="w-max flex items-center gap-2 px-1">
                        {characters.map((char) => (
                            <Button 
                                key={char.id} 
                                data-char-id={char.id} 
                                onClick={() => !isReorderingActive && onCharacterClick(char.id)} 
                                disabled={isGlobalDisabled || (isReorderingActive && !!draggedCharRef.current && draggedCharRef.current.id === char.id)} 
                                draggable={isReorderingActive} 
                                onDragStart={(e) => handleDragStart(e, char)} 
                                onDragEnd={handleDragEnd} 
                                className={`px-3 py-1.5 text-xs font-medium bg-tint-fuchsia-bg/10 text-tint-fuchsia-text border border-tint-fuchsia-border/20 hover:bg-tint-fuchsia-bg/80 rounded-xl disabled:opacity-50 transition duration-200 ease-out whitespace-nowrap ${isReorderingActive ? 'cursor-grab hover:ring-2 hover:ring-fuchsia-400' : 'disabled:cursor-not-allowed'} ${draggedCharRef.current?.id === char.id ? 'opacity-50 ring-2 ring-fuchsia-500' : ''}`}
                            >
                                {char.name}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default CharacterBar;
