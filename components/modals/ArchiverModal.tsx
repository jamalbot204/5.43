
import React, { useEffect, memo, useCallback } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useArchiverStore } from '../../store/useArchiverStore.ts'; 
import { ArchiveBoxIcon, ArrowDownTrayIcon, PlayIcon, StopIcon, PauseIcon, ArrowRightStartOnRectangleIcon, BookOpenIcon, ArrowPathIcon, PlusIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { triggerDownload, sanitizeFilename } from '../../services/utils.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { useSettingsPersistence } from '../../hooks/useSettingsPersistence.ts';

const ArchiverModal: React.FC = memo(() => {
    const { isArchiverModalOpen, closeArchiverModal, openStoryManagerModal } = useSettingsUI();
    const { currentChatSession } = useActiveChatStore();
    const { showToast } = useToastStore();
    const { t } = useTranslation();
    const { saveSessionSettings } = useSettingsPersistence();

    // Connect to Global Archiver Store
    const { 
        isProcessing, 
        isPaused,
        reviewMode,
        chunks,
        nextChunkIndex, 
        progress, 
        currentStatus, 
        chapters, 
        userName, 
        charName, 
        selectedModel,
        setNames,
        setModel,
        prepareArchiving,
        executeArchiving,
        pauseArchiving,
        cancelArchiving,
        resetArchiver,
        toggleChunkSelection,
        setAllChunksSelection,
        saveGeneratedChaptersToStory,
        retryChapterGeneration
    } = useArchiverStore();

    // Initial Setup - Load from Settings first, then fallback
    useEffect(() => {
        if (isArchiverModalOpen && currentChatSession && !isProcessing && chapters.length === 0 && !reviewMode) {
            let uName = "User";
            let cName = "AI";
            
            if (currentChatSession.settings.archiverConfig) {
                uName = currentChatSession.settings.archiverConfig.userName;
                cName = currentChatSession.settings.archiverConfig.characterName;
            } else {
                if (currentChatSession.settings.contextUserName) {
                    uName = currentChatSession.settings.contextUserName;
                }
                if (currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0) {
                    cName = currentChatSession.aiCharacters[0].name;
                }
            }
            
            setNames(uName, cName);
        }
    }, [isArchiverModalOpen, currentChatSession, isProcessing, chapters.length, reviewMode, setNames]);

    const handleSaveConfig = useCallback(async () => {
        if (!currentChatSession) return;
        
        await saveSessionSettings({
            ...currentChatSession.settings,
            archiverConfig: {
                userName: userName,
                characterName: charName
            }
        }, null); 
    }, [currentChatSession, userName, charName, saveSessionSettings]);

    const handleDownload = useCallback(() => {
        if (chapters.length === 0 || !currentChatSession) return;

        const archiveData = {
            meta: {
                chat_title: currentChatSession.title,
                archived_at: new Date().toISOString(),
                total_chapters: chapters.length,
                generated_by: "JJ Chat Archiver",
                model_used: selectedModel
            },
            chapters: chapters
        };

        const jsonStr = JSON.stringify(archiveData, null, 2);
        const filename = sanitizeFilename(`${currentChatSession.title}_NovelArchive`);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        triggerDownload(blob, `${filename}.json`);
    }, [chapters, currentChatSession, selectedModel]);

    const handleSaveToStory = useCallback(async () => {
        if (chapters.length === 0 || !currentChatSession) return;
        await saveGeneratedChaptersToStory();
        // Option: close modal or switch to Story Manager?
    }, [chapters, currentChatSession, saveGeneratedChaptersToStory]);

    const handleClose = useCallback(() => {
        handleSaveConfig();
        closeArchiverModal();
    }, [closeArchiverModal, handleSaveConfig]);

    const handleStop = useCallback(() => {
        cancelArchiving();
    }, [cancelArchiving]);

    // Phase 1: Review
    const handleReview = useCallback(() => {
        handleSaveConfig();
        prepareArchiving(false); // Calc chunks and go to review
    }, [handleSaveConfig, prepareArchiving]);

    // Phase 2: Execute
    const handleExecute = useCallback(() => {
        executeArchiving();
    }, [executeArchiving]);

    const handleResume = useCallback(() => {
        handleSaveConfig();
        prepareArchiving(true); // Resume
    }, [handleSaveConfig, prepareArchiving]);

    const handleOpenStoryManager = useCallback(() => {
        closeArchiverModal();
        openStoryManagerModal();
    }, [closeArchiverModal, openStoryManagerModal]);

    const footerButtons = (
        <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
            <Button variant="secondary" onClick={handleClose} className="w-full sm:w-auto">
                {t.close}
            </Button>
            
            {/* Initial: Show "Preview Chunks" instead of Start */}
            {!isProcessing && !reviewMode && nextChunkIndex === 0 && chapters.length === 0 && (
                <Button variant="primary" onClick={handleReview} icon={<ArrowPathIcon className="w-4 h-4" />} className="w-full sm:w-auto">
                    Preview Chunks
                </Button>
            )}

            {/* Resume Button */}
            {!isProcessing && nextChunkIndex > 0 && (
                <Button variant="primary" onClick={handleResume} icon={<PlayIcon className="w-4 h-4" />} className="w-full sm:w-auto">
                    Resume
                </Button>
            )}

            {/* Review Mode Actions */}
            {reviewMode && (
                <>
                    <Button variant="secondary" onClick={() => cancelArchiving()} className="w-full sm:w-auto">
                        Back
                    </Button>
                    <Button variant="primary" onClick={handleExecute} icon={<PlayIcon className="w-4 h-4" />} className="w-full sm:w-auto">
                        Start Processing
                    </Button>
                </>
            )}

            {/* Pause/Stop Logic */}
            {isProcessing && !isPaused && (
                <Button variant="primary" onClick={pauseArchiving} icon={<PauseIcon className="w-4 h-4" />} className="bg-brand-secondary hover:bg-brand-secondary/80 shadow-sm w-full sm:w-auto">
                    Pause
                </Button>
            )}

            {(isProcessing || isPaused) && (
                <Button variant="danger" onClick={handleStop} icon={<StopIcon className="w-4 h-4" />} className="w-full sm:w-auto">
                    Reset
                </Button>
            )}

            {/* Results Actions */}
            {chapters.length > 0 && !isProcessing && !reviewMode && (
                <>
                    <Button variant="primary" onClick={handleSaveToStory} icon={<BookOpenIcon className="w-4 h-4" />} className="bg-brand-accent hover:bg-brand-accent/80 shadow-sm w-full sm:w-auto">
                        Save to Story
                    </Button>
                    <Button variant="primary" onClick={handleDownload} icon={<ArrowDownTrayIcon className="w-4 h-4" />} className="w-full sm:w-auto">
                        Download JSON
                    </Button>
                </>
            )}
        </div>
    );

    return (
        <BaseModal
            isOpen={isArchiverModalOpen}
            onClose={handleClose}
            title="Chat Archiver (Novel Mode)"
            headerIcon={<ArchiveBoxIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-2xl"
        >
            <div className="space-y-4">
                {/* Info Header */}
                {!reviewMode && (
                    <div className="bg-brand-primary/10 p-3 rounded-xl border border-brand-primary/30 text-brand-primary text-sm flex justify-between items-start backdrop-blur-sm shadow-sm">
                        <p>Transforms chat history into a structured "Novel". Review and select chunks before processing.</p>
                        <div className="flex gap-2">
                            {chapters.length > 0 && !isProcessing && !isPaused && (
                                <Button variant="ghost" size="sm" onClick={resetArchiver} className="text-brand-primary underline whitespace-nowrap p-0 h-auto hover:bg-transparent">Clear All</Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={handleOpenStoryManager} className="text-brand-primary underline font-bold whitespace-nowrap p-0 h-auto hover:bg-transparent">Manage Chapters</Button>
                        </div>
                    </div>
                )}

                {/* Configuration (Hidden in Review/Processing) */}
                {!isProcessing && !reviewMode && chapters.length === 0 && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in">
                        <div>
                            <label className="block text-xs font-bold text-text-secondary mb-1">User Name (for Story)</label>
                            <Input 
                                type="text" 
                                value={userName} 
                                onChange={(e) => setNames(e.target.value, charName)}
                                onBlur={handleSaveConfig}
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-secondary mb-1">AI Character Name</label>
                            <Input 
                                type="text" 
                                value={charName} 
                                onChange={(e) => setNames(userName, e.target.value)}
                                onBlur={handleSaveConfig}
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                            />
                        </div>
                        <div className="col-span-2">
                             <label className="block text-xs font-bold text-text-secondary mb-1">
                                 Archiver Model
                             </label>
                             <Select 
                                value={selectedModel}
                                onChange={(e) => setModel(e.target.value)}
                                options={MODEL_DEFINITIONS.map(m => ({ value: m.id, label: m.name }))}
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                             />
                        </div>
                    </div>
                )}

                {/* Review List Mode */}
                {reviewMode && !isProcessing && (
                    <div className="animate-fade-in-right">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-text-primary">Select Chapters to Archive</h3>
                            <div className="space-x-2 flex">
                                <Button variant="ghost" size="sm" onClick={() => setAllChunksSelection(true)} className="text-[10px] bg-brand-primary/20 text-brand-primary px-2 py-1 h-auto hover:bg-brand-primary/30 border border-brand-primary/20">Select All</Button>
                                <Button variant="ghost" size="sm" onClick={() => setAllChunksSelection(false)} className="text-[10px] bg-bg-element text-text-secondary px-2 py-1 h-auto hover:bg-bg-hover border border-border-base">None</Button>
                            </div>
                        </div>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar border border-border-base rounded-xl bg-bg-panel/20 p-2 space-y-2 backdrop-blur-sm shadow-inner">
                            {chunks.map((chunk, idx) => (
                                <div 
                                    key={idx} 
                                    className={`flex items-start p-2 rounded-lg cursor-pointer border transition-colors ${chunk.selected ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm' : 'bg-bg-panel/40 border-border-base opacity-60'}`}
                                    onClick={() => toggleChunkSelection(idx)}
                                >
                                    <div className="flex items-center h-full mr-3 pt-1">
                                        <Switch 
                                            checked={chunk.selected} 
                                            readOnly 
                                            className="pointer-events-none"
                                        />
                                    </div>
                                    <div className="flex-grow">
                                        <div className="flex justify-between">
                                            <span className={`text-sm font-bold ${chunk.selected ? 'text-brand-primary' : 'text-text-secondary'}`}>
                                                Chapter {chunk.displayId}
                                            </span>
                                            <span className="text-[10px] text-text-muted">{chunk.msgCount} msgs</span>
                                        </div>
                                        <p className="text-xs text-text-secondary mt-1 italic line-clamp-1">{chunk.previewText}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-text-muted mt-2 text-center">
                            Note: Chapter numbers in the final archive will match the numbers shown here (e.g. skipping Ch.2 preserves Ch.3's ID).
                        </p>
                    </div>
                )}

                {/* Progress UI */}
                {(isProcessing || isPaused) && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-text-muted font-mono">
                            <span>{currentStatus}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full h-2 bg-bg-track rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition duration-300 ease-out ${isPaused ? 'bg-brand-secondary' : 'bg-brand-primary'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* PAUSED CONFIGURATION INJECTION */}
                {isPaused && (
                    <div className="bg-brand-secondary/10 p-3 rounded border border-brand-secondary/30 animate-fade-in">
                        <label className="block text-xs font-bold text-brand-secondary mb-2 uppercase tracking-wider">
                            Change Model for Remaining Chapters
                        </label>
                        <Select
                            value={selectedModel}
                            onChange={(e) => setModel(e.target.value)}
                            options={MODEL_DEFINITIONS.map(m => ({ value: m.id, label: m.name }))}
                            className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                        />
                        <p className="text-[10px] text-brand-secondary/60 mt-1">
                            The new model will be applied when you click Resume.
                        </p>
                    </div>
                )}

                {/* Results Preview */}
                {chapters.length > 0 && !reviewMode && (
                    <div className="mt-4 max-h-64 overflow-y-auto custom-scrollbar space-y-3 bg-bg-panel/20 p-2 rounded-xl border border-border-base backdrop-blur-sm shadow-inner">
                        {chapters.map((chapter, idx) => {
                            // Find corresponding chunk status
                            const matchingChunk = chunks.find(c => c.displayId === chapter.chapterNumber);
                            const chunkStatus = matchingChunk?.status;
                            
                            return (
                                <div key={idx} className={`p-3 rounded-lg border animate-fade-in shadow-sm ${chapter.isError ? 'bg-tint-red-bg/10 border-tint-red-border/30' : 'bg-bg-panel/60 border-border-base'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className={`text-sm font-bold ${chapter.isError ? 'text-tint-red-text' : 'text-brand-primary'}`}>
                                            Chapter {chapter.chapterNumber ?? (idx + 1)}: {chapter.title}
                                        </h4>
                                        <span className="text-[10px] text-text-muted">{chapter.time_range}</span>
                                    </div>
                                    <p className="text-xs text-text-primary mb-2 leading-relaxed">{chapter.narrative}</p>
                                    
                                    {chapter.isError && matchingChunk && (
                                        <div className="flex justify-end mt-2">
                                            <Button 
                                                variant="danger"
                                                size="sm"
                                                onClick={() => retryChapterGeneration(matchingChunk.index)}
                                                disabled={chunkStatus === 'processing'}
                                                icon={<ArrowPathIcon className={chunkStatus === 'processing' ? 'animate-spin' : ''} />}
                                                className="shadow-sm"
                                            >
                                                {chunkStatus === 'processing' ? "Retrying..." : "Retry Generation"}
                                            </Button>
                                        </div>
                                    )}

                                    {chapter.key_quotes && chapter.key_quotes.length > 0 && !chapter.isError && (
                                        <div className="bg-bg-element p-2 rounded-lg border border-border-base">
                                            <p className="text-[10px] font-bold text-text-muted uppercase mb-1">Key Quotes</p>
                                            <ul className="list-disc list-inside text-[10px] text-text-secondary italic">
                                                {chapter.key_quotes.map((q, i) => <li key={i}>{q}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </BaseModal>
    );
});

export default ArchiverModal;
