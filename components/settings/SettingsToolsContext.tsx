
import React, { memo } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { MagnifyingGlassIcon, GitHubIcon, FolderOpenIcon, TrashIcon, PencilIcon, SparklesIcon, CogIcon, ArrowPathIcon, BrainIcon, WrenchScrewdriverIcon, ClockIcon, CheckIcon, StopCircleIcon, CloudArrowUpIcon, ServerIcon, XCircleIcon, ArchiveBoxIcon, PlusIcon, BookOpenIcon, LinkIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { ChatSession, GeminiSettings } from '../../types.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { usePythonStore } from '../../store/usePythonStore.ts';
import { useArchiverStore } from '../../store/useArchiverStore.ts'; // ADDED
import { useExternalModelsStore } from '../../store/useExternalModelsStore.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';

interface SettingsToolsContextProps {
  sessionId: string;
  githubRepoContext: ChatSession['githubRepoContext'];
  localSettings: GeminiSettings;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleNumericInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onOpenGitHubImport: () => void;
  onRemoveGithubRepo: () => void;
  onViewAttachments: () => void;
  onOpenInstructionModal: (type: 'customReminderMessage' | 'enhancedThinkingJudgeInstruction' | 'autoRefineCriticInstruction') => void;
}

const SettingsToolsContext: React.FC<SettingsToolsContextProps> = memo(({
  sessionId,
  githubRepoContext,
  localSettings,
  handleInputChange,
  handleNumericInputChange,
  onOpenGitHubImport,
  onRemoveGithubRepo,
  onViewAttachments,
  onOpenInstructionModal
}) => {
  const { t } = useTranslation();
  const { openMemorySourceModal, openReasoningSetupModal, openShadowSetupModal, openArchiverModal } = useSettingsUI();
  const { cleanSystemReminders } = useDataStore();
  const { isEnabled, isLoaded, isLoading, enableAndLoad, toggleEnabled } = usePythonStore();
  const { generateIncrementalChapter, isProcessing } = useArchiverStore(); // ADDED
  const { isExternalModeActive } = useExternalModelsStore();

  const handleCleanContext = () => {
    if (sessionId) {
      cleanSystemReminders(sessionId);
    }
  };

  const handleManualArchiveTrigger = async () => {
      // Force archive with 0 threshold (immediate)
      await generateIncrementalChapter(true);
  };

  const pythonMode = localSettings.pythonExecutionMode || 'cloud';

  return (
    <div className="space-y-4">
      
      {/* Capabilities Card - Cyan */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-cyan-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-cyan-text uppercase tracking-wider mb-4 flex items-center">
          <SparklesIcon className="w-4 h-4 me-2" />
          Active Capabilities
        </h3>
        
        {/* Google Search */}
        <div className="flex items-start justify-between mb-4 ps-1 gap-2">
          <div className="flex items-center min-w-0 flex-1">
            <MagnifyingGlassIcon className="w-5 h-5 me-3 text-tint-cyan-text flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <label htmlFor="useGoogleSearch" className="block text-sm font-medium text-text-primary cursor-pointer truncate">
                {t.useGoogleSearch}
              </label>
              <p className="text-xs text-text-secondary">{t.useGoogleSearchDesc}</p>
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            <Switch
              id="useGoogleSearch"
              name="useGoogleSearch"
              checked={localSettings.useGoogleSearch ?? false}
              onChange={handleInputChange}
              disabled={isExternalModeActive}
            />
          </div>
        </div>
        {isExternalModeActive && (
          <div className="text-[10px] text-tint-red-text ms-9 mb-4">
            {t.externalModeWarning}
          </div>
        )}

        {/* Web Reader (Deep Scraper) */}
        <div className="flex items-start justify-between mb-4 ps-1 gap-2">
          <div className="flex items-center min-w-0 flex-1">
            <LinkIcon className="w-5 h-5 me-3 text-tint-cyan-text flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <label htmlFor="enableWebReader" className="block text-sm font-medium text-text-primary cursor-pointer truncate">
                Web Reader (Deep Scraper)
              </label>
              <p className="text-xs text-text-secondary">Allows the AI to read the full, uncensored content of any URL provided in the chat or found via search.</p>
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            <Switch
              id="enableWebReader"
              name="enableWebReader"
              checked={localSettings.enableWebReader ?? false}
              onChange={handleInputChange}
              disabled={isExternalModeActive}
            />
          </div>
        </div>
        {isExternalModeActive && (
          <div className="text-[10px] text-tint-red-text ms-9 mb-4">
            {t.externalModeWarning}
          </div>
        )}

        {/* Python Interpreter (Hybrid) */}
        <div className="flex flex-col ps-1 border-t border-border-base pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 ps-1">
            <div className="flex items-center min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-tint-cyan-bg/10 flex items-center justify-center me-3 text-tint-cyan-text font-mono text-xs font-bold border border-tint-cyan-border/20 flex-shrink-0">
                Py
                </div>
                <div className="min-w-0">
                <label className="block text-sm font-medium text-text-primary truncate">Python Interpreter</label>
                <p className="text-xs text-text-secondary truncate">Choose execution environment.</p>
                </div>
            </div>
            
            {/* Mode Switcher */}
            <div className={`flex bg-bg-element rounded-xl p-1 border border-border-base w-full sm:w-auto justify-between ${isExternalModeActive ? 'opacity-50 pointer-events-none' : ''}`}>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleInputChange({ target: { name: 'pythonExecutionMode', value: 'cloud' } } as any)}
                    className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition h-auto w-auto flex-1 sm:flex-none ${pythonMode === 'cloud' ? 'bg-tint-cyan-bg/10 text-tint-cyan-text shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                    <CloudArrowUpIcon className="w-3 h-3 inline me-1" /> Cloud
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleInputChange({ target: { name: 'pythonExecutionMode', value: 'local' } } as any)}
                    className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition h-auto w-auto flex-1 sm:flex-none ${pythonMode === 'local' ? 'bg-tint-cyan-bg/10 text-tint-cyan-text shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                    <ServerIcon className="w-3 h-3 inline me-1" /> Local
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleInputChange({ target: { name: 'pythonExecutionMode', value: 'disabled' } } as any)}
                    className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition h-auto w-auto flex-1 sm:flex-none ${pythonMode === 'disabled' ? 'bg-bg-element text-text-primary shadow-sm border border-border-base' : 'text-text-secondary hover:text-text-primary'}`}
                >
                    <StopCircleIcon className="w-3 h-3 inline me-1" /> Off
                </Button>
            </div>
          </div>

          {pythonMode === 'cloud' ? (
              <div className="ms-2 sm:ms-11 mb-2">
                  <p className="text-xs text-tint-green-text bg-tint-green-bg/10 p-2 rounded border border-tint-green-border/20">
                      <CheckIcon className="w-3 h-3 inline me-1" />
                      Uses Google's secure cloud environment. No download required. Fast & Reliable.
                  </p>
              </div>
          ) : pythonMode === 'local' ? (
              <div className="ms-2 sm:ms-11 mb-2 flex flex-col gap-3">
                 <p className="text-xs text-text-secondary">Runs in-browser (Pyodide). Requires ~10MB download.</p>
                 <div className="flex items-center">
                    {isLoading ? (
                        <div className="px-3 py-1.5 text-xs font-bold text-tint-cyan-text bg-tint-cyan-bg/10 rounded border border-tint-cyan-border/20 flex items-center w-full sm:w-auto justify-center">
                            <ArrowPathIcon className="w-3 h-3 me-2 animate-spin" />
                            Loading...
                        </div>
                    ) : isLoaded ? (
                        <Button 
                            onClick={toggleEnabled}
                            variant="outline"
                            className={`flex items-center px-3 py-1.5 text-xs font-bold rounded border transition group h-auto w-full sm:w-auto justify-center ${
                                isEnabled 
                                ? 'bg-tint-green-bg/10 text-tint-green-text border-tint-green-border/20 hover:bg-tint-red-bg/20 hover:text-tint-red-text hover:border-tint-red-border/20' 
                                : 'bg-tint-yellow-bg/10 text-tint-yellow-text border-tint-yellow-border/20 hover:bg-tint-green-bg/20 hover:text-tint-green-text hover:border-tint-green-border/20'
                            }`}
                            title={isEnabled ? "Click to Disable" : "Click to Reactivate (Ready)"}
                        >
                            {isEnabled ? (
                                <>
                                    <span className="group-hover:hidden flex items-center"><CheckIcon className="w-3.5 h-3.5 me-1.5" /> Active</span>
                                    <span className="hidden group-hover:flex items-center"><XCircleIcon className="w-3.5 h-3.5 me-1.5" /> Disable</span>
                                </>
                            ) : (
                                <>
                                    <StopCircleIcon className="w-3.5 h-3.5 me-1.5" />
                                    Disabled
                                </>
                            )}
                        </Button>
                    ) : isEnabled ? (
                        <Button 
                            onClick={toggleEnabled}
                            variant="outline"
                            className="flex items-center px-3 py-1.5 text-xs font-bold text-tint-green-text bg-tint-green-bg/10 border border-tint-green-border/20 rounded hover:bg-tint-red-bg/20 hover:text-tint-red-text hover:border-tint-red-border/20 transition group h-auto w-full sm:w-auto justify-center"
                            title="Click to Disable"
                        >
                            <span className="group-hover:hidden">Enabled (Lazy)</span>
                            <span className="hidden group-hover:inline">Disable</span>
                        </Button>
                    ) : (
                        <Button 
                            onClick={enableAndLoad}
                            variant="primary"
                            className="flex items-center px-3 py-1.5 text-xs font-bold rounded disabled:opacity-50 transition-colors h-auto w-full sm:w-auto justify-center"
                        >
                            Enable Local
                        </Button>
                    )}
                 </div>
              </div>
          ) : (
              <div className="ms-2 sm:ms-11 mb-2">
                  <p className="text-xs text-text-secondary italic bg-bg-element p-2 rounded border border-border-base">
                      Python execution is disabled. The model will not be able to execute code.
                  </p>
              </div>
          )}
          {isExternalModeActive && (
              <div className="text-[10px] text-tint-red-text ms-2 sm:ms-11 mb-2">
                  {t.externalModeWarning}
              </div>
          )}
        </div>
        
        {/* Include History Checkbox */}
        {pythonMode !== 'disabled' && (
            <div className="ms-2 sm:ms-11 mt-4 sm:mt-[-4px] mb-4">
                <div className="flex items-center">
                    <Switch
                        id="includePythonHistory"
                        name="includePythonHistory"
                        checked={localSettings.includePythonHistory ?? false}
                        onChange={handleInputChange}
                        disabled={pythonMode === 'local' && !isEnabled} 
                    />
                    <label htmlFor="includePythonHistory" className={`ms-2 block text-xs font-medium cursor-pointer ${(pythonMode === 'cloud' || isEnabled) ? 'text-text-primary' : 'text-text-tertiary'}`}>
                        Include Execution History in Context
                    </label>
                </div>
                <p className={`text-[10px] ps-7 sm:ps-0 sm:ms-5 mt-0.5 ${(pythonMode === 'cloud' || isEnabled) ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                    Sends past code and results back to the model. Allows "memory" of variables.
                </p>
            </div>
        )}

        {/* Smart Time Bridge */}
        <div className="flex flex-col ps-1 border-t border-border-base pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <ClockIcon className="w-5 h-5 me-3 text-tint-cyan-text" />
              <div>
                <label htmlFor="enableTimeBridge" className="block text-sm font-medium text-text-primary cursor-pointer">
                  Smart Time Bridge
                </label>
                <p className="text-xs text-text-secondary">Injects context updates after long pauses.</p>
              </div>
            </div>
            <Switch
              id="enableTimeBridge"
              name="enableTimeBridge"
              checked={localSettings.enableTimeBridge ?? true}
              onChange={handleInputChange}
            />
          </div>
          
          {(localSettings.enableTimeBridge ?? true) && (
             <div className="ms-2 sm:ms-8 mt-3 flex flex-wrap items-center gap-2 animate-fade-in">
                 <label htmlFor="timeBridgeThreshold" className="text-xs text-text-secondary">Injection Threshold (Minutes):</label>
                 <Input
                    type="number"
                    id="timeBridgeThreshold"
                    name="timeBridgeThreshold"
                    min="1"
                    max="1440"
                    className="w-20 sm:w-24 text-center"
                    value={localSettings.timeBridgeThreshold ?? 15}
                    onChange={handleNumericInputChange}
                 />
             </div>
          )}
        </div>
      </div>

      {/* Memory & Reasoning Card - Indigo/Fuchsia */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-indigo-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-indigo-text uppercase tracking-wider mb-4 flex items-center">
          <BrainIcon className="w-4 h-4 me-2" />
          Advanced Logic
        </h3>
        
        {/* Force Tool Execution (ANY Mode) */}
        <div className="flex items-start justify-between ps-1 mb-4 border-b border-border-base pb-4">
            <div className="flex-grow">
                <div className="flex items-center mb-1">
                    <Switch
                        id="forceToolAlways"
                        name="forceToolAlways"
                        checked={localSettings.forceToolAlways ?? false}
                        onChange={handleInputChange}
                    />
                    <label htmlFor="forceToolAlways" className="ms-2 block text-sm text-tint-red-text font-medium cursor-pointer">
                        Force Tool Execution (ANY Mode)
                    </label>
                </div>
                <p className="text-xs text-text-secondary ms-6">
                    Strictly forces the model to call a tool (like Memory Search) before generating any text response.
                </p>
            </div>
            <div className="flex-shrink-0 ms-2">
                <WrenchScrewdriverIcon className="w-4 h-4 text-tint-red-text opacity-70" />
            </div>
        </div>

        {/* Enhanced Thinking (Best-of-3) */}
        <div className="flex flex-col ps-1 mb-4 border-b border-border-base pb-4">
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="enhancedThinkingMode" className="block text-sm text-tint-indigo-text font-medium">
                {t.enhancedThinkingMode}
            </label>
            <Select
                id="enhancedThinkingMode"
                name="enhancedThinkingMode"
                value={localSettings.enhancedThinkingMode || 'off'}
                onChange={handleInputChange}
            >
                <option value="off">{t.etModeOff}</option>
                <option value="judge">{t.etModeJudge}</option>
                <option value="fusion">{t.etModeFusion}</option>
                <option value="auto_refine">{t.etModeAutoRefine}</option>
            </Select>
          </div>
          <p className="text-xs text-text-secondary mt-1 mb-2">
            {t.etModeDesc}
          </p>
          
          {/* Custom Judge Instruction */}
          {(localSettings.enhancedThinkingMode === 'judge' || localSettings.enhancedThinkingMode === 'fusion') && (
             <div className="ms-6 mt-3 animate-fade-in">
                 <div className="flex justify-between items-center mb-1">
                     <label className="block text-xs font-medium text-tint-indigo-text flex items-center">
                         <BrainIcon className="w-3 h-3 me-1.5" />
                         {t.judgeCustomInstruction}
                     </label>
                     <Button 
                         onClick={() => onOpenInstructionModal('enhancedThinkingJudgeInstruction')} 
                         variant="ghost"
                         size="sm"
                         className="text-[10px] text-tint-indigo-text hover:text-tint-indigo-text/80 flex items-center transition-colors p-0 h-auto w-auto"
                     >
                         <PencilIcon className="w-3 h-3 me-1" />
                         {t.customize}
                     </Button>
                 </div>
                 <div 
                     className="w-full p-2 bg-bg-element border border-border-base rounded-md text-[10px] text-text-secondary truncate cursor-pointer hover:border-tint-indigo-border/20 transition-colors"
                     onClick={() => onOpenInstructionModal('enhancedThinkingJudgeInstruction')}
                 >
                     {localSettings.enhancedThinkingJudgeInstruction || t.judgeCustomInstructionPlaceholder}
                 </div>
             </div>
          )}

          {/* Auto-Refine Controls */}
          {localSettings.enhancedThinkingMode === 'auto_refine' && (
            <div className="ms-6 mt-3 animate-fade-in space-y-3">
              {/* Max Iterations */}
              <div className="flex items-center justify-between">
                <label htmlFor="autoRefineMaxIterations" className="text-xs font-medium text-tint-indigo-text">
                  {t.autoRefineMaxIterations}
                </label>
                <Input
                  type="number"
                  id="autoRefineMaxIterations"
                  name="autoRefineMaxIterations"
                  min="1"
                  max="10"
                  className="w-20 text-center text-xs h-8"
                  value={localSettings.autoRefineMaxIterations ?? 3}
                  onChange={handleNumericInputChange}
                />
              </div>

              {/* Critic Instruction */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-tint-indigo-text flex items-center">
                    <BrainIcon className="w-3 h-3 me-1.5" />
                    {t.autoRefineCriticInstruction}
                  </label>
                  <Button 
                    onClick={() => onOpenInstructionModal('autoRefineCriticInstruction')} 
                    variant="ghost"
                    size="sm"
                    className="text-[10px] text-tint-indigo-text hover:text-tint-indigo-text/80 flex items-center transition-colors p-0 h-auto w-auto"
                  >
                    <PencilIcon className="w-3 h-3 me-1" />
                    {t.customize}
                  </Button>
                </div>
                <div 
                  className="w-full p-2 bg-bg-element border border-border-base rounded-md text-[10px] text-text-secondary truncate cursor-pointer hover:border-tint-indigo-border/20 transition-colors"
                  onClick={() => onOpenInstructionModal('autoRefineCriticInstruction')}
                >
                  {localSettings.autoRefineCriticInstruction || t.autoRefineCriticPlaceholder}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reasoning Workflow */}
        <div className="flex items-start justify-between ps-1 mb-4 border-b border-border-base pb-4">
          <div className="flex-grow">
            <div className="flex items-center mb-1">
              <Switch
                id="enableReasoningWorkflow"
                name="enableReasoningWorkflow"
                checked={localSettings.enableReasoningWorkflow ?? false}
                onChange={handleInputChange}
              />
              <label htmlFor="enableReasoningWorkflow" className="ms-2 block text-sm text-tint-purple-text font-medium cursor-pointer">
                Agentic Multi-Step Workflow
              </label>
            </div>
            <p className="text-xs text-text-secondary ms-6">
              Enable complex sequential reasoning steps before final answer.
            </p>
            {localSettings.enableReasoningWorkflow && (
              <>
                <p className="text-[10px] text-tint-purple-text ms-6 mt-1">
                  Steps: {localSettings.reasoningSteps?.length || 0} configured
                </p>
                <div className="ms-6 mt-2">
                    <label htmlFor="agentModel" className="block text-xs font-medium text-text-secondary mb-1">Agent Model (Reasoning Engine)</label>
                    <Select
                        id="agentModel"
                        name="agentModel"
                        value={localSettings.agentModel || ''}
                        onChange={handleInputChange}
                    >
                        <option value="">Use Chat Model (Default)</option>
                        {MODEL_DEFINITIONS.map(model => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                    </Select>
                </div>
                <div className="ms-6 mt-2">
                    <label htmlFor="contextUserName" className="block text-xs font-medium text-text-secondary mb-1">{t.contextUserName}</label>
                    <Input
                        type="text"
                        id="contextUserName"
                        name="contextUserName"
                        value={localSettings.contextUserName || ''}
                        onChange={handleInputChange}
                        placeholder={t.contextUserNamePlaceholder}
                    />
                    <p className="text-[10px] text-text-secondary mt-1">{t.contextUserNameDesc}</p>
                </div>
              </>
            )}
          </div>
          {localSettings.enableReasoningWorkflow && (
            <Button
              onClick={openReasoningSetupModal}
              variant="outline"
              className="flex items-center px-2 py-1.5 text-xs font-medium text-tint-purple-text bg-tint-purple-bg/10 rounded-md hover:bg-tint-purple-bg/80 transition-colors border border-tint-purple-border/20 ms-2 flex-shrink-0 h-auto w-auto"
            >
              <CogIcon className="w-3 h-3 me-1.5" />
              {t.customize}
            </Button>
          )}
        </div>

        {/* Shadow Mode Feature */}
        <div className="flex items-start justify-between ps-1 mb-4 border-b border-border-base pb-4">
          <div className="flex-grow">
            <div className="flex items-center mb-1">
              <Switch
                id="enableShadowMode"
                name="enableShadowMode"
                checked={localSettings.enableShadowMode ?? false}
                onChange={handleInputChange}
              />
              <label htmlFor="enableShadowMode" className="ms-2 block text-sm text-tint-green-text font-medium cursor-pointer">
                Shadow Mode (Direct Generation)
              </label>
            </div>
            <p className="text-xs text-text-secondary ms-6">
              Bypasses standard generation. Directly generates response using a custom Persona and Task instruction based on history.
            </p>
          </div>
          {localSettings.enableShadowMode && (
            <Button
                onClick={openShadowSetupModal}
                variant="outline"
                className="flex items-center px-2 py-1.5 text-xs font-medium text-tint-green-text bg-tint-green-bg/10 rounded-md hover:bg-tint-green-bg/80 transition-colors border border-tint-green-border/20 ms-2 flex-shrink-0 h-auto w-auto"
            >
                <CogIcon className="w-3 h-3 me-1.5" />
                {t.customize}
            </Button>
          )}
        </div>

        {/* Long Term Memory */}
        <div className="flex items-start justify-between ps-1 mb-4 border-b border-border-base pb-4">
          <div className="flex-grow">
            <div className="flex items-center mb-1">
              <Switch
                id="enableLongTermMemory"
                name="enableLongTermMemory"
                checked={localSettings.enableLongTermMemory ?? false}
                onChange={handleInputChange}
                disabled={isExternalModeActive}
              />
              <label htmlFor="enableLongTermMemory" className="ms-2 block text-sm text-text-primary font-medium cursor-pointer">
                Agentic Memory (RAG)
              </label>
            </div>
            <p className="text-xs text-text-secondary ms-6">
              Allows Gemini to search past conversations for context.
            </p>
            {isExternalModeActive && (
              <p className="text-[10px] text-tint-red-text ms-6 mt-1">
                {t.externalModeWarning}
              </p>
            )}
            {localSettings.enableLongTermMemory && !isExternalModeActive && (
              <p className="text-[10px] text-tint-indigo-text ms-6 mt-1">
                Scope: {localSettings.memorySourceChatIds ? `${localSettings.memorySourceChatIds.length} chats selected` : "All chats"}
              </p>
            )}
          </div>
          {localSettings.enableLongTermMemory && !isExternalModeActive && (
            <Button
              onClick={openMemorySourceModal}
              variant="outline"
              className="flex items-center px-2 py-1.5 text-xs font-medium text-tint-indigo-text bg-tint-indigo-bg/10 rounded-md hover:bg-tint-indigo-bg/80 transition-colors border border-tint-indigo-border/20 ms-2 flex-shrink-0 h-auto w-auto"
            >
              <CogIcon className="w-3 h-3 me-1.5" />
              {t.customize}
            </Button>
          )}
        </div>

        {/* Novel Archiver */}
        <div className="flex flex-col ps-1 mb-2">
          <div className="flex items-start justify-between">
            <div className="flex-grow">
                <div className="flex items-center mb-1">
                <div className="flex items-center justify-center w-5 h-5 rounded-md bg-tint-indigo-bg/10 text-tint-indigo-text me-2">
                    <ArchiveBoxIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm text-tint-indigo-text font-medium">
                    Novel Archiver
                </span>
                </div>
                <p className="text-xs text-text-secondary ms-7">
                Convert chat history into a structured narrative with chapters and key quotes.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    onClick={openArchiverModal}
                    variant="outline"
                    className="flex items-center px-2 py-1.5 text-xs font-medium text-tint-indigo-text bg-tint-indigo-bg/10 rounded-md hover:bg-tint-indigo-bg/80 transition-colors border border-tint-indigo-border/20 h-auto w-auto"
                >
                    <WrenchScrewdriverIcon className="w-3 h-3 me-1.5" />
                    Launch
                </Button>
            </div>
          </div>
          
          {/* Auto Archiving Checkbox */}
          <div className="ms-7 mt-2 flex items-center gap-2">
             <Switch
                id="autoArchivingEnabled"
                name="autoArchivingEnabled"
                checked={localSettings.autoArchivingEnabled ?? false}
                onChange={handleInputChange}
             />
             <label htmlFor="autoArchivingEnabled" className="text-xs text-text-primary cursor-pointer select-none">
                Auto-archive (Every 40 messages)
             </label>
             {(localSettings.autoArchivingEnabled ?? false) && (
                 <Button 
                    onClick={handleManualArchiveTrigger}
                    disabled={isProcessing}
                    variant="outline"
                    className="ms-auto text-[10px] bg-tint-indigo-bg/10 text-tint-indigo-text px-2 py-0.5 rounded border border-tint-indigo-border/20 hover:bg-tint-indigo-bg/80 transition-colors flex items-center h-auto w-auto"
                    title="Force create next chapter immediately"
                 >
                    {isProcessing ? <ArrowPathIcon className="w-3 h-3 animate-spin"/> : <PlusIcon className="w-3 h-3 me-1"/>}
                    Add Chapter
                 </Button>
             )}
          </div>
        </div>

      </div>

      {/* External Sources Card - Slate/Gray */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-text-muted bg-bg-panel">
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center">
          <GitHubIcon className="w-4 h-4 me-2" />
          External Sources
        </h3>

        {/* GitHub Repo */}
        <div className="mb-4 ps-1">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-text-primary">{t.githubRepo}</label>
            {!githubRepoContext && (
              <Button
                onClick={onOpenGitHubImport}
                variant="outline"
                className="text-xs text-text-secondary flex items-center hover:text-text-primary bg-bg-element px-2 py-1 rounded border border-border-base h-auto w-auto"
              >
                <PencilIcon className="w-3 h-3 me-1" /> {t.importRepo}
              </Button>
            )}
          </div>
          {githubRepoContext ? (
            <div className="p-2 bg-bg-element rounded-md flex items-center justify-between border border-border-base">
              <p className="text-xs text-text-primary truncate font-mono" title={githubRepoContext.url}>
                {githubRepoContext.url}
              </p>
              <Button onClick={onRemoveGithubRepo} variant="ghost" size="none" className="p-1 text-tint-red-text hover:text-tint-red-text/80 ms-2 h-auto w-auto" title="Remove" icon={<TrashIcon className="w-4 h-4" />} />
            </div>
          ) : (
            <div className="p-2 border border-dashed border-border-base rounded-md text-center">
              <p className="text-xs text-text-secondary">{t.githubRepoHint}</p>
            </div>
          )}
        </div>

        {/* URL Context */}
        <div className="ps-1">
          <label htmlFor="urlContext" className="block text-sm font-medium text-text-secondary mb-1">{t.urlContext}</label>
          <Textarea
            id="urlContext"
            name="urlContext"
            rows={3}
            placeholder="https://example.com/page1&#10;https://example.com/page2"
            value={(localSettings.urlContext || []).join('\n')}
            onChange={handleInputChange}
          />
        </div>
      </div>

      {/* Files Card - Orange */}
      <div className={`relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-orange-border bg-bg-panel flex items-center justify-between ${isExternalModeActive ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tint-orange-bg/10 me-3 text-tint-orange-text">
            <FolderOpenIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary">{t.chatAttachments}</h3>
            {isExternalModeActive && <p className="text-[10px] text-tint-red-text mt-0.5">{t.externalModeWarning}</p>}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={onViewAttachments}
          disabled={isExternalModeActive}
          className="px-3 py-1.5 text-xs text-tint-orange-text bg-tint-orange-bg/10 border-tint-orange-border/20 hover:bg-tint-orange-bg/80"
        >
          {t.view}
        </Button>
      </div>

      {/* Periodic Reminder Card - Pink */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-pink-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-pink-text uppercase tracking-wider mb-4 flex items-center">
            <ArrowPathIcon className="w-4 h-4 me-2" />
            Reinforcement (System Reminder)
        </h3>
        
        <div className="flex items-center space-x-3 mb-3 ps-1">
            <div className="flex-grow">
                <label htmlFor="systemReminderFrequency" className="block text-xs font-medium text-text-secondary mb-1">{t.systemReminderFrequency}</label>
                <Input
                    type="number"
                    id="systemReminderFrequency"
                    name="systemReminderFrequency"
                    min="0"
                    step="1"
                    placeholder="0 (Disabled)"
                    value={localSettings.systemReminderFrequency ?? ''}
                    onChange={handleNumericInputChange}
                />
            </div>
             <div className="flex-shrink-0 self-end">
                 <Button
                    type="button"
                    onClick={handleCleanContext}
                    disabled={!sessionId}
                    variant="outline"
                    size="none"
                    className="p-2 bg-tint-pink-bg/10 text-tint-pink-text hover:text-tint-pink-text rounded-md transition-colors hover:bg-tint-pink-bg/80 flex items-center border border-tint-pink-border/20 h-auto w-auto"
                    title={t.cleanContextDesc}
                    icon={<TrashIcon className="w-4 h-4" />}
                />
            </div>
        </div>
        
        <div className="ps-1">
            <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-text-secondary">{t.systemReminderContent}</label>
                <Button 
                    onClick={() => onOpenInstructionModal('customReminderMessage')} 
                    variant="ghost"
                    size="sm"
                    className="text-[10px] text-tint-pink-text hover:text-tint-pink-text flex items-center transition-colors p-0 h-auto w-auto"
                >
                    <PencilIcon className="w-3 h-3 me-1" />
                    {t.customize}
                </Button>
            </div>
            <div 
                className="w-full p-2 bg-bg-element border border-tint-pink-border/20 rounded-md text-[10px] text-text-secondary truncate cursor-pointer hover:border-tint-pink-border/20 transition-colors"
                onClick={() => onOpenInstructionModal('customReminderMessage')}
            >
                {localSettings.customReminderMessage || t.defaultReminderMessage}
            </div>
        </div>
      </div>

      {/* Lorebook Card - Fuchsia */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-purple-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-purple-text uppercase tracking-wider mb-4 flex items-center">
            <BookOpenIcon className="w-4 h-4 me-2" />
            Lorebook (Dynamic Context)
        </h3>
        
        <div className="flex items-start justify-between mb-4 ps-1 gap-2">
          <div className="flex items-center min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <label htmlFor="isLorebookEnabled" className="block text-sm font-medium text-text-primary cursor-pointer truncate">
                Enable Lorebook
              </label>
              <p className="text-xs text-text-secondary">Injects context dynamically based on keywords.</p>
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            <Switch
              id="isLorebookEnabled"
              name="isLorebookEnabled"
              checked={localSettings.isLorebookEnabled ?? false}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="ps-1">
            <Button 
                onClick={useSettingsUI.getState().openLorebookModal} 
                variant="outline"
                className="w-full text-xs text-tint-purple-text border-tint-purple-border/20 hover:bg-tint-purple-bg/20"
            >
                <PencilIcon className="w-3.5 h-3.5 me-2" />
                Manage Entries
            </Button>
        </div>
      </div>

    </div>
  );
});

export default SettingsToolsContext;
