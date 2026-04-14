
import React, { memo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useSelectionStore } from '../../store/useSelectionStore.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useGeminiApiStore } from '../../store/useGeminiApiStore.ts';
import { clearCacheAndReload } from '../../services/pwaService.ts';
import { getModelDisplayName } from '../../services/llm/config.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';
import { applyModelSwitchWithMemory } from '../../services/utils.ts';
import { 
    Bars3Icon, UsersIcon, ClipboardDocumentCheckIcon, 
    XCircleIcon, StarIcon, ArrowsUpDownIcon, CheckIcon, PlusIcon, SparklesIcon,
    ChevronDownIcon, ServerIcon
} from '../common/Icons.tsx';
import FavoritesDropdown from '../common/FavoritesDropdown.tsx';
import { useGlobalUiStore } from '../../store/useGlobalUiStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useExternalModelsStore } from '../../store/useExternalModelsStore.ts';
import { generateChatFingerprint } from '../../services/utils.ts';
import { Button } from '../ui/Button.tsx';
import { Dropdown } from '../ui/Dropdown.tsx';
import { Badge } from '../ui/Badge.tsx';

interface ChatHeaderProps {
    isReorderingActive: boolean;
    toggleReordering: () => void;
    onJumpToMessage: (messageId: string) => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = memo(({ isReorderingActive, toggleReordering, onJumpToMessage }) => {
    const { id, title, model, isCharacterModeActive } = useActiveChatStore(useShallow(state => ({
        id: state.currentChatSession?.id,
        title: state.currentChatSession?.title,
        model: state.currentChatSession?.model,
        isCharacterModeActive: state.currentChatSession?.isCharacterModeActive
    })));
    const { toggleSidebar, isSidebarOpen } = useGlobalUiStore();
    const { updateModel, updateSettings } = useDataStore();
    const { isSelectionModeActive, toggleSelectionMode } = useSelectionStore();
    const { toggleFavoriteMessage } = useInteractionStore();
    const { openCharacterManagementModal, openCacheManagerModal } = useSettingsUI();
    const { t } = useTranslation();
    const { isExternalModeActive, activeModelId, providers, getActiveModelDetails } = useExternalModelsStore();
    
    const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
    const favoritesButtonRef = useRef<HTMLButtonElement>(null);

    const isCharacterMode = isCharacterModeActive || false;
    
    let modelName = model ? getModelDisplayName(model) : '';
    if (isExternalModeActive && activeModelId) {
        const activeModel = getActiveModelDetails();
        if (activeModel) {
            modelName = activeModel.displayName;
        }
    }

    const currentChatSession = useActiveChatStore(state => state.currentChatSession);
    const manualCacheInfo = currentChatSession?.manualCacheInfo;
    const isCacheExpired = manualCacheInfo ? manualCacheInfo.expireTime < Date.now() : false;
    const currentFingerprint = manualCacheInfo && currentChatSession ? generateChatFingerprint(currentChatSession, manualCacheInfo.cachedMessageCount) : '';
    const isCacheInvalid = manualCacheInfo ? manualCacheInfo.fingerprint !== currentFingerprint : false;

    const handleModelSelect = async (modelId: string) => {
        const currentChatSession = useActiveChatStore.getState().currentChatSession;
        if (!currentChatSession) return;
        
        const newSettings = applyModelSwitchWithMemory(currentChatSession.model, modelId, currentChatSession.settings);

        // Optimistic UI Update
        await useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, model: modelId, settings: newSettings }) : null);
        
        // Persist to Database
        await updateModel(currentChatSession.id, modelId);
        await updateSettings(currentChatSession.id, newSettings);
    };

    return (
        <header className="sticky top-0 z-20 flex items-center justify-between min-h-[3.5rem] sm:min-h-[4rem] h-auto py-2 sm:py-0 px-3 sm:px-6 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] bg-bg-panel/80 backdrop-blur-md border-b border-border-base shadow-panel transition duration-300">
            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden flex-1 min-w-0">
                <Button 
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar} 
                    className="flex-shrink-0 w-9 h-9 bg-bg-element hover:bg-bg-hover rounded-xl border border-border-base shadow-panel transition-all" 
                    title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"} 
                    aria-label={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                >
                    <Bars3Icon className="w-5 h-5" />
                </Button>
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0">
                    <h1 className="text-sm sm:text-base font-bold text-text-primary truncate flex items-center gap-2 tracking-tight leading-tight min-w-0">
                        {title ? title : t.chatInterface}
                        {isCharacterMode && <UsersIcon className="w-4 h-4 text-tint-fuchsia-text flex-shrink-0" />}
                    </h1>
                    {id && (
                        <div className="flex items-center gap-2 min-w-0">
                            {isExternalModeActive ? (
                                <Dropdown
                                    trigger={
                                        <Button 
                                            variant="ghost"
                                            size="none"
                                            className="inline-flex items-center max-w-[100px] xs:max-w-[140px] sm:max-w-[200px] flex-shrink-0 h-auto min-h-[1.5rem] sm:min-h-[1.75rem] py-1 px-2.5 rounded-full text-[10px] sm:text-xs font-medium border uppercase tracking-wider transition bg-tint-cyan-bg/15 border-tint-cyan-border/30 text-tint-cyan-text hover:bg-tint-cyan-bg/25 cursor-pointer"
                                            title={t.switchModel}
                                        >
                                            <ServerIcon className="w-2.5 h-2.5 me-1.5 flex-shrink-0" />
                                            <span className="whitespace-normal break-words text-center leading-[1.1] text-[10px] sm:text-xs flex-1">{modelName}</span>
                                            <ChevronDownIcon className="w-2.5 h-2.5 ms-1.5 opacity-70 transition-transform flex-shrink-0" />
                                        </Button>
                                    }
                                >
                                    <div className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest border-b border-border-base mb-1">
                                        Select External Model
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 p-1">
                                        {(providers || []).map(provider => (
                                            <div key={provider.id} className="mb-2 last:mb-0 flex-shrink-0 flex flex-col gap-0.5">
                                                <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                                                    {provider.name || provider.baseUrl}
                                                </div>
                                                {(provider.models || []).map(m => (
                                                    <Button
                                                        variant="ghost"
                                                        key={m.id}
                                                        onClick={() => useExternalModelsStore.getState().setActiveModel(m.id)}
                                                        className={`text-left px-3 py-2 text-xs rounded-lg transition-colors flex justify-between items-center w-full ${
                                                            activeModelId === m.id 
                                                                ? 'bg-brand-primary text-text-on-brand font-medium' 
                                                                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                                                        }`}
                                                    >
                                                        <span className="truncate me-2">{m.displayName || m.modelId}</span>
                                                        {activeModelId === m.id && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
                                                    </Button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </Dropdown>
                            ) : (
                                <Dropdown
                                    trigger={
                                        <Button 
                                            variant="ghost"
                                            size="none"
                                            className={`inline-flex items-center max-w-[100px] xs:max-w-[140px] sm:max-w-[200px] flex-shrink-0 h-auto min-h-[1.5rem] sm:min-h-[1.75rem] py-1 px-2.5 rounded-full text-[10px] sm:text-xs font-medium border uppercase tracking-wider transition cursor-pointer ${
                                                isCharacterMode 
                                                    ? 'bg-tint-fuchsia-bg/15 border-tint-fuchsia-border/30 text-tint-fuchsia-text hover:bg-tint-fuchsia-bg/25' 
                                                    : 'bg-tint-emerald-bg/15 border-tint-emerald-border/30 text-tint-emerald-text hover:bg-tint-emerald-bg/25'
                                            }`}
                                            title={t.switchModel}
                                        >
                                            <SparklesIcon className="w-2.5 h-2.5 me-1.5 flex-shrink-0" />
                                            <span className="whitespace-normal break-words text-center leading-[1.1] text-[10px] sm:text-xs flex-1">{modelName}</span>
                                            <ChevronDownIcon className="w-2.5 h-2.5 ms-1.5 opacity-70 transition-transform flex-shrink-0" />
                                        </Button>
                                    }
                                >
                                    <div className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest border-b border-border-base mb-1">
                                        Select Model
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 p-1">
                                        {MODEL_DEFINITIONS.map(def => (
                                            <Button
                                                variant="ghost"
                                                key={def.id}
                                                onClick={() => handleModelSelect(def.id)}
                                                className={`text-left px-3 py-2 text-xs rounded-lg transition-colors flex justify-between items-center ${
                                                    model === def.id 
                                                        ? 'bg-brand-primary text-text-on-brand font-medium' 
                                                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                                                }`}
                                            >
                                                <span className="truncate me-2">{def.name}</span>
                                                {model === def.id && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
                                            </Button>
                                        ))}
                                    </div>
                                </Dropdown>
                            )}
                            
                            <button
                                onClick={openCacheManagerModal}
                                className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full transition cursor-pointer hover:bg-bg-hover flex-shrink-0"
                                title={!manualCacheInfo ? t.cacheManage : isCacheInvalid ? t.cacheInvalid : isCacheExpired ? t.cacheExpired : t.cacheActive}
                            >
                                <ServerIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted" />
                                <span className={`text-[9px] sm:text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider ${
                                    !manualCacheInfo ? 'text-text-muted' : isCacheInvalid ? 'text-tint-red-text' : isCacheExpired ? 'text-tint-amber-text' : 'text-tint-emerald-text'
                                }`}>
                                    {!manualCacheInfo ? 'Cache' : isCacheInvalid ? 'Invalid' : isCacheExpired ? 'Expired' : 'Active'}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ms-2">
                {id && (
                    <>
                        <div className="flex items-center gap-1">
                            <Button 
                                variant="ghost"
                                size="icon"
                                onClick={toggleSelectionMode} 
                                className={`w-9 h-9 rounded-xl transition-all ${
                                    isSelectionModeActive 
                                        ? 'bg-tint-emerald-bg/10 text-tint-emerald-text border border-tint-emerald-border/20 shadow-panel' 
                                        : 'bg-bg-element hover:bg-bg-hover border border-border-base shadow-panel text-text-secondary'
                                }`} 
                                title={isSelectionModeActive ? t.done : t.selectMultiple} 
                                aria-label={isSelectionModeActive ? t.done : t.selectMultiple}
                            >
                                {isSelectionModeActive ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentCheckIcon className="w-4 h-4" />}
                            </Button>
                            
                            <div className="relative">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    ref={favoritesButtonRef}
                                    onClick={() => setIsFavoritesOpen(prev => !prev)}
                                    className={`w-9 h-9 rounded-xl transition-all ${
                                        isFavoritesOpen 
                                            ? 'bg-tint-amber-bg/10 text-tint-amber-text border border-tint-amber-border/20 shadow-panel' 
                                            : 'bg-bg-element hover:bg-tint-amber-bg/20 border border-border-base shadow-panel text-text-secondary hover:text-tint-amber-text'
                                    }`}
                                    title={t.viewFavorites}
                                    aria-label={t.viewFavorites}
                                >
                                    <StarIcon className="w-4 h-4" />
                                </Button>
                                <FavoritesDropdown
                                    triggerRef={favoritesButtonRef}
                                    isOpen={isFavoritesOpen}
                                    onClose={() => setIsFavoritesOpen(false)}
                                    onJumpToMessage={(messageId) => {
                                        onJumpToMessage(messageId);
                                        setIsFavoritesOpen(false);
                                    }}
                                    onRemoveFavorite={toggleFavoriteMessage}
                                />
                            </div>
                        </div>

                        {isCharacterMode && (
                            <>
                                <div className="w-px h-5 bg-border-base mx-1 sm:mx-2 hidden sm:block"></div>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost"
                                        size="icon"
                                        onClick={toggleReordering} 
                                        className={`w-9 h-9 rounded-xl transition-all ${
                                            isReorderingActive 
                                                ? 'bg-tint-emerald-bg/10 text-tint-emerald-text border border-tint-emerald-border/20 shadow-panel' 
                                                : 'bg-bg-element hover:bg-bg-hover border border-border-base shadow-panel text-text-secondary'
                                        }`} 
                                        title={isReorderingActive ? t.done : t.editOrder}
                                    >
                                        <ArrowsUpDownIcon className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost"
                                        size="icon"
                                        onClick={openCharacterManagementModal} 
                                        className="w-9 h-9 rounded-xl transition-all bg-bg-element hover:bg-tint-fuchsia-bg/20 border border-border-base shadow-panel text-tint-fuchsia-text hover:text-tint-fuchsia-text" 
                                        title={t.manageCharacters}
                                        disabled={isReorderingActive}
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                    </Button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </header>
    );
});

export default ChatHeader;
