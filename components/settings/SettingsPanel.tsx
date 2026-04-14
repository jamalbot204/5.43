
import React, { useState, useEffect, memo, useCallback } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { GeminiSettings, SafetySetting, TTSSettings } from '../../types.ts';
import { DEFAULT_SETTINGS, DEFAULT_MODEL_ID, MODELS_SUPPORTING_THINKING_BUDGET_UI, MODELS_SUPPORTING_THINKING_LEVEL_UI, THINKING_BUDGET_MAX_FLASH } from '../../constants.ts';
import { CloseIcon, CogIcon, LinkIcon, CalculatorIcon, ArrowPathIcon } from '../common/Icons.tsx';
import SafetySettingsModal from '../modals/SafetySettingsModal.tsx';
import InstructionEditModal from '../modals/InstructionEditModal.tsx';
import TtsSettingsModal from '../modals/TtsSettingsModal.tsx';
import * as dbService from '../../services/dbService.ts';
import { METADATA_KEYS } from '../../services/dbService.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useGithubStore } from '../../store/useGithubStore.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { useExportStore } from '../../store/useExportStore.ts';
import { useSettingsPersistence } from '../../hooks/useSettingsPersistence.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useShallow } from 'zustand/react/shallow';
import { applyModelSwitchWithMemory } from '../../services/utils.ts';
import { Button } from '../ui/Button.tsx';
import { clearCacheAndReload } from '../../services/pwaService.ts';

// New Modular Components (Siblings)
import SettingsGeneral from './SettingsGeneral.tsx';
import SettingsToolsContext from './SettingsToolsContext.tsx';
import SettingsAdvanced from './SettingsAdvanced.tsx';

type SettingsTab = 'general' | 'tools' | 'advanced';

const SettingsPanel: React.FC = memo(() => {
    // Optimized Selector: Only fetch what is needed for the panel logic.
    // Crucially, we DO NOT select 'messages', so text generation won't re-render this panel.
    const sessionData = useActiveChatStore(useShallow(state => {
        const s = state.currentChatSession;
        return {
            id: s?.id,
            title: s?.title,
            settings: s?.settings,
            model: s?.model,
            isCharacterModeActive: s?.isCharacterModeActive,
            githubRepoContext: s?.githubRepoContext,
            aiCharacters: s?.aiCharacters,
            hasApiLogs: (s?.apiRequestLogs?.length ?? 0) > 0,
            apiLogsCount: s?.apiRequestLogs?.length ?? 0,
        };
    }));

    const { setGithubRepo } = useGithubStore();
    
    // Optimized UI Store Selectors
    const isSettingsPanelOpen = useSettingsUI(state => state.isSettingsPanelOpen);
    const closeSettingsPanel = useSettingsUI(state => state.closeSettingsPanel);
    const openApiKeyModal = useSettingsUI(state => state.openApiKeyModal);
    const openGitHubImportModal = useSettingsUI(state => state.openGitHubImportModal);
    const openChatAttachmentsModal = useSettingsUI(state => state.openChatAttachmentsModal);
    const openDebugTerminal = useSettingsUI(state => state.openDebugTerminal);
    const openExportConfigurationModal = useSettingsUI(state => state.openExportConfigurationModal);
    const openExternalModelsModal = useSettingsUI(state => state.openExternalModelsModal);

    // Optimized Data Store Selectors: Select only functions to prevent re-render on data changes (like generation times)
    const cleanSystemReminders = useDataStore(state => state.cleanSystemReminders);
    const updateModel = useDataStore(state => state.updateModel);

    const { exportChatToTxt } = useExportStore(); 
    const showToast = useToastStore.getState().showToast;
    const { saveSessionSettings } = useSettingsPersistence();
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    
    // Initialize local state. 
    // Default to session data if available, otherwise global defaults.
    const [localSettings, setLocalSettings] = useState<GeminiSettings>(sessionData.settings || DEFAULT_SETTINGS);
    const [localModel, setLocalModel] = useState<string>(sessionData.model || DEFAULT_MODEL_ID);
    
    const latestSettings = React.useRef(localSettings);
    const latestModel = React.useRef(localModel);
    const lastSavedSettings = React.useRef(sessionData.settings || DEFAULT_SETTINGS);
    const lastSavedModel = React.useRef(sessionData.model || DEFAULT_MODEL_ID);

    // Modals state
    const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
    const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
    const [editingInstructionType, setEditingInstructionType] = useState<'systemInstruction' | 'userPersonaInstruction' | 'customReminderMessage' | 'enhancedThinkingJudgeInstruction' | 'autoRefineCriticInstruction' | null>(null);
    const [instructionModalContent, setInstructionModalContent] = useState('');
    
    // Local TTS Modal State (for Draft Mode)
    const [isLocalTtsModalOpen, setIsLocalTtsModalOpen] = useState(false);

    // Initialization Effect: Sync from store when panel opens
    useEffect(() => {
        if (isSettingsPanelOpen && sessionData.settings && sessionData.model) {
            setLocalSettings(sessionData.settings);
            setLocalModel(sessionData.model);
            lastSavedSettings.current = sessionData.settings;
            lastSavedModel.current = sessionData.model;
        }
    }, [isSettingsPanelOpen]); 

    // Listen for external changes (e.g., from ReasoningSetupModal or ShadowSetupModal)
    useEffect(() => {
        if (isSettingsPanelOpen && sessionData.settings && sessionData.model) {
            const externalSettingsStr = JSON.stringify(sessionData.settings);
            const lastSavedStr = JSON.stringify(lastSavedSettings.current);
            
            if (externalSettingsStr !== lastSavedStr) {
                setLocalSettings(prev => ({ ...prev, ...sessionData.settings }));
                lastSavedSettings.current = sessionData.settings;
            }

            if (sessionData.model !== lastSavedModel.current) {
                setLocalModel(sessionData.model);
                lastSavedModel.current = sessionData.model;
            }
        }
    }, [sessionData.settings, sessionData.model, isSettingsPanelOpen]);

    // Keep refs updated for on-close save
    useEffect(() => {
        latestSettings.current = localSettings;
        latestModel.current = localModel;
    }, [localSettings, localModel]);

    // Auto-save effect (Debounced)
    useEffect(() => {
        if (!isSettingsPanelOpen || !sessionData.id) return;

        const timeoutId = setTimeout(async () => {
            const currentSession = useActiveChatStore.getState().currentChatSession;
            if (!currentSession) return;

            const settingsChanged = JSON.stringify(localSettings) !== JSON.stringify(currentSession.settings);
            const modelChanged = localModel !== currentSession.model;

            if (settingsChanged) {
                lastSavedSettings.current = localSettings;
                await saveSessionSettings(localSettings, null); // null for no toast
                if (localSettings.systemReminderFrequency !== currentSession.settings.systemReminderFrequency) {
                    await cleanSystemReminders(sessionData.id);
                }
            }

            if (modelChanged) {
                lastSavedModel.current = localModel;
                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, model: localModel }) : null);
                await updateModel(sessionData.id, localModel);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [localSettings, localModel, sessionData.id, isSettingsPanelOpen, saveSessionSettings, updateModel, cleanSystemReminders]);

    // Save immediately on panel close
    useEffect(() => {
        if (!isSettingsPanelOpen && sessionData.id) {
            const currentSession = useActiveChatStore.getState().currentChatSession;
            if (!currentSession) return;

            const settingsChanged = JSON.stringify(latestSettings.current) !== JSON.stringify(currentSession.settings);
            const modelChanged = latestModel.current !== currentSession.model;

            if (settingsChanged) {
                saveSessionSettings(latestSettings.current, null);
                if (latestSettings.current.systemReminderFrequency !== currentSession.settings.systemReminderFrequency) {
                    cleanSystemReminders(sessionData.id);
                }
            }

            if (modelChanged) {
                useActiveChatStore.getState().updateCurrentChatSession(s => s ? ({ ...s, model: latestModel.current }) : null);
                updateModel(sessionData.id, latestModel.current);
            }
        }
    }, [isSettingsPanelOpen, sessionData.id, saveSessionSettings, updateModel, cleanSystemReminders]);

    const handleOpenInstructionModal = useCallback((type: 'systemInstruction' | 'userPersonaInstruction' | 'customReminderMessage' | 'enhancedThinkingJudgeInstruction' | 'autoRefineCriticInstruction') => {
        setEditingInstructionType(type);
        setInstructionModalContent(localSettings[type] || '');
        setIsInstructionModalOpen(true);
    }, [localSettings]);

    const handleApplyInstructionChange = useCallback((newInstruction: string) => {
        if (editingInstructionType) {
            const newSettings = { ...localSettings, [editingInstructionType]: newInstruction };
            setLocalSettings(newSettings);
        }
        setIsInstructionModalOpen(false);
        setEditingInstructionType(null);
    }, [editingInstructionType, localSettings]);

    const handleOpenTtsModal = useCallback(() => {
        setIsLocalTtsModalOpen(true);
    }, []);

    const handleApplyTtsSettings = useCallback((newTtsSettings: TTSSettings) => {
        setLocalSettings(prev => ({ ...prev, ttsSettings: newTtsSettings }));
        setIsLocalTtsModalOpen(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (name === "model") {
            const newSettings = applyModelSwitchWithMemory(localModel, value, localSettings);
            setLocalSettings(newSettings);
            setLocalModel(value);
        } else if (type === 'checkbox') {
            const { checked } = (e.target as HTMLInputElement);
            setLocalSettings(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'urlContext') {
            setLocalSettings(prev => ({ ...prev, urlContext: value.split('\n').map(url => url.trim()).filter(url => url) }));
        } else {
            setLocalSettings(prev => ({ ...prev, [name]: value }));
        }
    }, [localSettings, localModel]);

    const handleRangeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalSettings(prev => ({ ...prev, [name]: parseFloat(value) }));
    }, []);

    const handleNumericInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        let numValue: number | undefined = parseInt(value, 10);
        if (isNaN(numValue) || value === '') {
            numValue = undefined;
        }
        setLocalSettings(prev => ({ ...prev, [name]: numValue }));
    }, []);
    
    const handleThinkingBudgetChange = useCallback((newValue: number | undefined) => {
        setLocalSettings(prev => {
            const modelPreferences = { ...(prev.modelPreferences || {}) };
            modelPreferences[localModel] = {
                ...modelPreferences[localModel],
                thinkingBudget: newValue,
            };
            return { ...prev, thinkingBudget: newValue, modelPreferences };
        });
    }, [localModel]);
    
    const handleThinkingLevelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
         const val = e.target.value as 'minimal' | 'low' | 'medium' | 'high';
         setLocalSettings(prev => {
             const modelPreferences = { ...(prev.modelPreferences || {}) };
             modelPreferences[localModel] = {
                 ...modelPreferences[localModel],
                 thinkingLevel: val,
             };
             return { ...prev, thinkingLevel: val, modelPreferences };
         });
    }, [localModel]);
    
    const handleMakeDefaults = useCallback(async () => {
        await dbService.setAppMetadata(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS, {
            model: localModel,
            settings: localSettings,
        });
        showToast("Global defaults saved.", "success");
    }, [localModel, localSettings, showToast]);

    const resetToDefaults = useCallback(() => {
        setLocalSettings(DEFAULT_SETTINGS);
        setLocalModel(DEFAULT_MODEL_ID);
    }, []);

    const handleApplySafetySettings = useCallback((newSafetySettings: SafetySetting[]) => {
        setLocalSettings(prev => ({ ...prev, safetySettings: newSafetySettings }));
        setIsSafetyModalOpen(false);
    }, []);

    const handleViewChatAttachments = useCallback(() => {
        // Need full session object for the attachment modal logic unfortunately, 
        // or we refactor that modal to take ID.
        // For now, fetching current session from store purely for this action is fine.
        const fullSession = useActiveChatStore.getState().currentChatSession;
        if (fullSession) {
            openChatAttachmentsModal(fullSession);
        } else {
            showToast("No active chat session.", "error");
        }
    }, [openChatAttachmentsModal, showToast]);

    const handleRemoveGithubRepo = useCallback(() => {
        setGithubRepo(null);
    }, [setGithubRepo]);

    const handleOpenDebugTerminal = useCallback(() => {
        openDebugTerminal();
        closeSettingsPanel();
    }, [openDebugTerminal, closeSettingsPanel]);

    if (!isSettingsPanelOpen || !sessionData.id) return null;

    let modalTitle = "";
    if (editingInstructionType === 'systemInstruction') modalTitle = "System Instruction (Persona)";
    else if (editingInstructionType === 'userPersonaInstruction') modalTitle = "User Persona Instruction";
    else if (editingInstructionType === 'customReminderMessage') modalTitle = t.editReminderMessage;
    else if (editingInstructionType === 'enhancedThinkingJudgeInstruction') modalTitle = t.judgeCustomInstruction;
    else if (editingInstructionType === 'autoRefineCriticInstruction') modalTitle = t.autoRefineCriticInstruction;

    return (
        <>
            <div className="fixed inset-0 bg-bg-overlay/80 z-40 flex justify-center items-center p-4" onClick={closeSettingsPanel}>
                <div 
                    className="bg-bg-panel border border-border-base p-0 rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-text-primary relative overflow-hidden min-w-0 animate-modal-open" 
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-5 pb-0 flex justify-between items-center bg-bg-panel">
                        <h2 className="text-xl font-semibold text-text-primary">{t.settings}</h2>
                        <Button onClick={closeSettingsPanel} variant="ghost" size="none" className="text-text-secondary p-1.5 rounded-full hover:bg-bg-hover hover:text-text-primary transition-colors h-auto w-auto" aria-label={t.close} icon={<CloseIcon className="w-6 h-6" />} />
                    </div>
                    
                    {/* Tabs Navigation */}
                    <div className="flex-shrink-0 flex items-stretch overflow-x-auto overflow-y-hidden custom-scrollbar border-b border-border-base px-2 sm:px-5 bg-bg-panel min-h-[48px]">
                        {[
                            { id: 'general', label: 'General', icon: CogIcon },
                            { id: 'tools', label: 'Tools & Context', icon: LinkIcon },
                            { id: 'advanced', label: 'Advanced', icon: CalculatorIcon }
                        ].map((tab) => (
                            <Button
                                key={tab.id}
                                variant="ghost"
                                size="none"
                                className={`flex-1 min-w-max py-3 px-3 sm:px-4 text-xs sm:text-sm font-medium border-b-2 flex items-center justify-center transition-colors duration-200 rounded-none h-full ${
                                    activeTab === tab.id 
                                    ? 'border-tint-emerald-border/20 text-tint-emerald-text' 
                                    : 'border-transparent text-text-secondary hover:text-text-primary'
                                }`}
                                onClick={() => setActiveTab(tab.id as SettingsTab)}
                            >
                                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 me-1.5 sm:me-2 shrink-0" />
                                <span className="whitespace-nowrap">{tab.label}</span>
                            </Button>
                        ))}
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-grow min-h-0 overflow-y-auto p-5 space-y-6 bg-transparent custom-scrollbar">
                        {activeTab === 'general' && (
                            <SettingsGeneral 
                                localModel={localModel}
                                localSettings={localSettings}
                                handleInputChange={handleInputChange}
                                onOpenApiKeyModal={openApiKeyModal}
                                onOpenInstructionModal={handleOpenInstructionModal}
                                onOpenTtsModal={handleOpenTtsModal} // Use local handler
                                onOpenSafetyModal={() => setIsSafetyModalOpen(true)}
                                onOpenExternalModelsModal={openExternalModelsModal}
                            />
                        )}

                        {activeTab === 'tools' && (
                            <SettingsToolsContext 
                                sessionId={sessionData.id}
                                githubRepoContext={sessionData.githubRepoContext}
                                localSettings={localSettings}
                                handleInputChange={handleInputChange}
                                handleNumericInputChange={handleNumericInputChange}
                                onOpenGitHubImport={openGitHubImportModal}
                                onRemoveGithubRepo={handleRemoveGithubRepo}
                                onViewAttachments={handleViewChatAttachments}
                                onOpenInstructionModal={handleOpenInstructionModal}
                            />
                        )}

                        {activeTab === 'advanced' && (
                            <SettingsAdvanced 
                                localSettings={localSettings}
                                localModel={localModel}
                                sessionId={sessionData.id}
                                isCharacterModeActive={!!sessionData.isCharacterModeActive}
                                hasApiLogs={sessionData.hasApiLogs}
                                apiLogsCount={sessionData.apiLogsCount}
                                handleRangeChange={handleRangeChange}
                                handleNumericInputChange={handleNumericInputChange}
                                handleInputChange={handleInputChange}
                                handleThinkingBudgetChange={handleThinkingBudgetChange}
                                handleThinkingLevelChange={handleThinkingLevelChange}
                                onOpenInstructionModal={handleOpenInstructionModal}
                                onOpenDebugTerminal={handleOpenDebugTerminal}
                                onCustomizeExport={openExportConfigurationModal}
                                onExportTxt={exportChatToTxt}
                                onHardReload={clearCacheAndReload}
                            />
                        )}
                    </div>

                    {/* Fixed Footer */}
                    <div className="p-4 border-t border-border-base bg-bg-panel flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
                        <div className="flex space-x-2 w-full justify-between sm:justify-start">
                            <Button onClick={resetToDefaults} variant="ghost" size="sm" className="px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center h-auto">
                                <ArrowPathIcon className="w-3.5 h-3.5 me-1" />
                                {t.resetDefaults}
                            </Button>
                            <Button onClick={handleMakeDefaults} variant="ghost" size="sm" className="px-3 py-2 text-xs font-medium text-tint-emerald-text hover:text-tint-emerald-text/80 transition-colors h-auto">
                                {t.makeGlobalDefaults}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {isSafetyModalOpen && localSettings.safetySettings && (
                <SafetySettingsModal 
                    isOpen={isSafetyModalOpen} 
                    currentSafetySettings={localSettings.safetySettings} 
                    onClose={() => setIsSafetyModalOpen(false)} 
                    onApply={handleApplySafetySettings} 
                />
            )}
            
            {/* Render TTS Modal in Controlled Mode */}
            {isLocalTtsModalOpen && (
                <TtsSettingsModal 
                    isOpen={isLocalTtsModalOpen}
                    initialSettings={localSettings.ttsSettings}
                    onApply={handleApplyTtsSettings}
                    onClose={() => setIsLocalTtsModalOpen(false)}
                />
            )}

            {isInstructionModalOpen && editingInstructionType && (
                <InstructionEditModal 
                    isOpen={isInstructionModalOpen} 
                    title={modalTitle} 
                    currentInstruction={instructionModalContent} 
                    onApply={handleApplyInstructionChange} 
                    onClose={() => { setIsInstructionModalOpen(false); setEditingInstructionType(null); }} 
                />
            )}
        </>
    );
});

export default SettingsPanel;
