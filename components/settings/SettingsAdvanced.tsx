
import React, { memo, useCallback } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { CalculatorIcon, SparklesIcon, Bars3Icon, EyeIcon, ExportBoxIcon, ArrowPathIcon, BugAntIcon, BookOpenIcon, PdfIcon, PlayIcon, FlowRightIcon, DocumentIcon, TextAaIcon, StopCircleIcon, BrainIcon, WrenchScrewdriverIcon, KeyIcon, ArchiveBoxIcon, ServerIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { GeminiSettings } from '../../types.ts';
import { DEFAULT_SETTINGS, DEFAULT_MODEL_ID, MODELS_SUPPORTING_THINKING_BUDGET_UI, MODELS_SUPPORTING_THINKING_LEVEL_UI, MODELS_SENDING_THINKING_CONFIG_API, THINKING_BUDGET_MAX_FLASH, THINKING_BUDGET_MAX, THINKING_BUDGET_MIN_PRO } from '../../constants.ts';
import ThinkingBudgetControl from '../common/ThinkingBudgetControl.tsx';
import SessionStats from './SessionStats.tsx'; 
import { useGlobalUiStore } from '../../store/useGlobalUiStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';

interface SettingsAdvancedProps {
  localSettings: GeminiSettings;
  localModel: string;
  sessionId: string;
  isCharacterModeActive: boolean;
  hasApiLogs: boolean;
  apiLogsCount: number;
  handleRangeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleNumericInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleThinkingBudgetChange: (newValue: number | undefined) => void;
  handleThinkingLevelChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onOpenInstructionModal: (type: 'userPersonaInstruction') => void;
  onOpenDebugTerminal: () => void;
  onCustomizeExport: () => void;
  onExportTxt: () => void;
  onHardReload: () => void;
}

const SettingsAdvanced: React.FC<SettingsAdvancedProps> = memo(({
  localSettings,
  localModel,
  sessionId,
  isCharacterModeActive,
  hasApiLogs,
  apiLogsCount,
  handleRangeChange,
  handleNumericInputChange,
  handleInputChange,
  handleThinkingBudgetChange,
  handleThinkingLevelChange,
  onOpenInstructionModal,
  onOpenDebugTerminal,
  onCustomizeExport,
  onExportTxt,
  onHardReload
}) => {
  const { t } = useTranslation();
  const { chatFontSizeLevel, setChatFontSizeLevel } = useGlobalUiStore();
  const { openPromptButtonManager } = useSettingsUI();
  const { handleCompressChat } = useInteractionStore();
  
  const showThinkingBudgetControl = MODELS_SUPPORTING_THINKING_BUDGET_UI.includes(localModel);
  const thinkingBudgetActuallyUsedByApi = MODELS_SENDING_THINKING_CONFIG_API.includes(localModel);
  const showThinkingLevelControl = MODELS_SUPPORTING_THINKING_LEVEL_UI.includes(localModel);

  // --- Dynamic Thinking Budget Configuration ---
  const isFlashOrLite = localModel.includes('flash') || localModel.includes('lite');
  
  // PRO Configuration
  const proConfig = {
      min: THINKING_BUDGET_MIN_PRO, // 128
      max: THINKING_BUDGET_MAX,     // 32768
      presets: [
          { label: 'Dynamic', value: -1, icon: SparklesIcon, colorClass: 'bg-tint-emerald-bg/10 text-tint-emerald-text border-tint-emerald-border/20' }
      ]
  };

  // FLASH Configuration
  const flashConfig = {
      min: 1,
      max: THINKING_BUDGET_MAX_FLASH, // 24576
      presets: [
          { label: 'Dynamic', value: -1, icon: SparklesIcon, colorClass: 'bg-tint-emerald-bg/10 text-tint-emerald-text border-tint-emerald-border/20' },
          { label: 'Disabled', value: 0, icon: StopCircleIcon, colorClass: 'bg-tint-red-bg/10 text-tint-red-text border-tint-red-border/20' }
      ]
  };

  const activeBudgetConfig = isFlashOrLite ? flashConfig : proConfig;
  // ----------------------------------------------

  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setChatFontSizeLevel(parseInt(e.target.value, 10));
  }, [setChatFontSizeLevel]);

  const handleSeedClear = useCallback(() => {
      handleNumericInputChange({ target: { name: 'seed', value: '' } } as any);
  }, [handleNumericInputChange]);

  return (
    <div className="space-y-6">
      
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-teal-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-teal-text uppercase tracking-wider mb-4 flex items-center">
          <CalculatorIcon className="w-4 h-4 me-2" />
          Model Parameters
        </h3>
        
        <div className="space-y-4 ps-1">
          <div>
            <div className="flex justify-between mb-1">
              <label htmlFor="temperature" className="text-xs font-medium text-text-secondary">{t.temperature}</label>
              <span className="text-xs text-tint-teal-text font-mono">{localSettings.temperature?.toFixed(2) ?? DEFAULT_SETTINGS.temperature?.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="temperature"
              name="temperature"
              min="0"
              max="2"
              step="0.01"
              className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-tint-teal-text"
              value={localSettings.temperature ?? DEFAULT_SETTINGS.temperature}
              onChange={handleRangeChange}
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label htmlFor="topP" className="text-xs font-medium text-text-secondary">{t.topP}</label>
              <span className="text-xs text-tint-teal-text font-mono">{localSettings.topP?.toFixed(2) ?? DEFAULT_SETTINGS.topP?.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="topP"
              name="topP"
              min="0"
              max="1"
              step="0.01"
              className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-tint-teal-text"
              value={localSettings.topP ?? DEFAULT_SETTINGS.topP}
              onChange={handleRangeChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="topK" className="block text-xs font-medium text-text-secondary mb-1">{t.topK}</label>
              <Input
                type="number"
                id="topK"
                name="topK"
                min="1"
                placeholder={`${DEFAULT_SETTINGS.topK}`}
                value={localSettings.topK ?? ''}
                onChange={handleNumericInputChange}
              />
            </div>
            <div>
               <Button
                type="button"
                onClick={() => onOpenInstructionModal('userPersonaInstruction')}
                variant="outline"
                className="w-full h-full flex flex-col items-center justify-center p-2 bg-tint-teal-bg/10 rounded border border-dashed border-tint-teal-border/20 hover:border-tint-teal-text transition-colors"
               >
                 <span className="text-xs text-tint-teal-text font-medium">User Persona</span>
                 <span className="text-[10px] text-tint-teal-text/60">Edit Instruction</span>
               </Button>
            </div>
          </div>

          {/* Seed Input */}
          <div>
              <label htmlFor="seed" className="block text-xs font-medium text-text-secondary mb-1 flex items-center justify-between">
                  <span>{t.seed}</span>
                  <Button onClick={handleSeedClear} variant="ghost" size="sm" className="text-[10px] text-tint-teal-text hover:text-text-primary underline p-0 h-auto w-auto">{t.random}</Button>
              </label>
              <div className="relative">
                  <Input
                    type="number"
                    id="seed"
                    name="seed"
                    className="font-mono"
                    placeholder="Random (Empty)"
                    value={localSettings.seed ?? ''}
                    onChange={handleNumericInputChange}
                  />
                  <div className="absolute inset-y-0 right-0 pe-3 flex items-center pointer-events-none">
                      <KeyIcon className="h-4 w-4 text-tint-teal-text/50" />
                  </div>
              </div>
          </div>
        </div>
      </div>

      {(showThinkingBudgetControl || showThinkingLevelControl) && (
        <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-pink-border bg-bg-panel">
          <h3 className="text-sm font-bold text-tint-pink-text uppercase tracking-wider mb-4 flex items-center">
            <SparklesIcon className="w-4 h-4 me-2" />
            Thinking Config
          </h3>
          
          <div className="space-y-4 ps-1">
            <div>
                <div className="flex items-center mb-1">
                <Switch
                    id="showThinkingProcess"
                    name="showThinkingProcess"
                    checked={localSettings.showThinkingProcess ?? false}
                    onChange={handleInputChange}
                />
                <label htmlFor="showThinkingProcess" className="ms-2 text-sm text-text-primary">
                    {t.showThinkingProcess}
                </label>
                </div>
            </div>

            <div>
                <div className="flex items-center mb-1">
                <Switch
                    id="includeThoughtsInHistory"
                    name="includeThoughtsInHistory"
                    checked={localSettings.includeThoughtsInHistory ?? true}
                    onChange={handleInputChange}
                />
                <label htmlFor="includeThoughtsInHistory" className="ms-2 text-sm text-text-primary">
                    {t.includeThoughtsInHistory}
                </label>
                </div>
                <p className="text-[10px] text-text-secondary ms-10">
                    {t.includeThoughtsInHistoryDesc}
                </p>
            </div>

            {showThinkingBudgetControl && (
                <ThinkingBudgetControl
                    value={localSettings.thinkingBudget}
                    onChange={handleThinkingBudgetChange}
                    modelActuallyUsesApi={thinkingBudgetActuallyUsedByApi}
                    min={activeBudgetConfig.min}
                    max={activeBudgetConfig.max}
                    presets={activeBudgetConfig.presets}
                />
            )}

            {showThinkingLevelControl && (
                <div>
                <label htmlFor="thinkingLevel" className="block text-xs font-medium text-text-secondary mb-1">{t.thinkingLevel}</label>
                <Select
                    id="thinkingLevel"
                    name="thinkingLevel"
                    value={localSettings.thinkingLevel || 'high'}
                    onChange={handleThinkingLevelChange}
                >
                    {(localModel === 'gemini-3-flash-preview' || localModel === 'gemini-3.1-flash-lite-preview' || localModel === 'gemma-4-31b-it' || localModel === 'gemma-4-26b-a4b-it') && <option value="minimal">{t.thinkingLevelMinimal}</option>}
                    <option value="low">{t.thinkingLevelLow}</option>
                    {(localModel === 'gemini-3-flash-preview' || localModel === 'gemini-3.1-flash-lite-preview' || localModel === 'gemma-4-31b-it' || localModel === 'gemma-4-26b-a4b-it') && <option value="medium">{t.thinkingLevelMedium}</option>}
                    <option value="high">{t.thinkingLevelHigh}</option>
                </Select>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Thought Parsing Card - Indigo/Blue-Grey */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-indigo-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-indigo-text uppercase tracking-wider mb-4 flex items-center">
          <BrainIcon className="w-4 h-4 me-2" />
          Thought Parsing
        </h3>
        
        <div className="ps-1 space-y-4">
            <div className="flex items-center justify-between">
                <label htmlFor="enableCustomThoughtParsing" className="block text-sm font-medium text-text-primary cursor-pointer">
                  Enhance Thought Parsing
                </label>
                <Switch
                  id="enableCustomThoughtParsing"
                  name="enableCustomThoughtParsing"
                  checked={localSettings.enableCustomThoughtParsing ?? false}
                  onChange={handleInputChange}
                />
            </div>
            <p className="text-xs text-text-secondary">
                Extracts thoughts hidden within custom XML tags (e.g., &lt;thought&gt;) and moves them to the thought block.
            </p>

            {(localSettings.enableCustomThoughtParsing ?? false) && (
                <div className="mt-2 animate-fade-in">
                    <label htmlFor="customThoughtTagName" className="block text-xs font-medium text-text-secondary mb-1">
                        Custom XML Tag Name
                    </label>
                    <div className="flex items-center">
                        <span className="text-text-secondary text-sm me-1">&lt;</span>
                        <Input
                            type="text"
                            id="customThoughtTagName"
                            name="customThoughtTagName"
                            className="font-mono"
                            placeholder="thought"
                            value={localSettings.customThoughtTagName || ''}
                            onChange={handleInputChange}
                        />
                        <span className="text-text-secondary text-sm ms-1">&gt;</span>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-red-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-red-text uppercase tracking-wider mb-4 flex items-center">
          <Bars3Icon className="w-4 h-4 me-2" />
          Session Limits
        </h3>
        <div className="grid grid-cols-1 gap-4 ps-1">
            <div>
                <label htmlFor="contextWindowMessages" className="block text-xs font-medium text-text-secondary mb-1">{t.contextWindow}</label>
                <Input
                type="number"
                id="contextWindowMessages"
                name="contextWindowMessages"
                min="0"
                placeholder="All (0)"
                value={localSettings.contextWindowMessages ?? ''}
                onChange={handleNumericInputChange}
                />
            </div>
        </div>
      </div>

      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-cyan-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-cyan-text uppercase tracking-wider mb-4 flex items-center">
          <EyeIcon className="w-4 h-4 me-2" />
          Interface & Dev
        </h3>
        
        <div className="space-y-4 ps-1">
            {/* Font Size Control */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="text-sm text-text-primary flex items-center">
                        <TextAaIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> Interface Text Size
                    </label>
                    <span className="text-xs text-tint-cyan-text font-mono">Level {chatFontSizeLevel}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                    className="w-full h-1.5 bg-bg-element rounded-lg appearance-none cursor-pointer accent-tint-cyan-text"
                    value={chatFontSizeLevel}
                    onChange={handleFontSizeChange}
                />
                <div className="flex justify-between text-[10px] text-text-secondary mt-1 px-1">
                    <span>Small</span>
                    <span>Standard</span>
                    <span>Huge</span>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border-base">
                <label htmlFor="showAutoSendControls" className="text-sm text-text-primary flex items-center">
                    <PlayIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.showAutoSend}
                </label>
                <Switch
                    id="showAutoSendControls"
                    name="showAutoSendControls"
                    checked={localSettings.showAutoSendControls ?? false}
                    onChange={handleInputChange}
                />
            </div>
            
            {/* Prompt Buttons Bar Toggle */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <label htmlFor="showPromptButtonsBar" className="text-sm text-text-primary flex items-center">
                        <WrenchScrewdriverIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> Quick Action Bar
                    </label>
                    <span className="text-[10px] text-text-secondary ms-5">Shows the macro buttons above chat input.</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        onClick={openPromptButtonManager}
                        variant="secondary"
                        size="sm"
                        className="text-[10px] bg-tint-cyan-bg/10 text-tint-cyan-text px-2 py-1 rounded border border-tint-cyan-border/20 hover:bg-tint-cyan-bg/80 h-auto w-auto"
                    >
                        Manage
                    </Button>
                    <Switch
                        id="showPromptButtonsBar"
                        name="showPromptButtonsBar"
                        checked={localSettings.showPromptButtonsBar ?? true}
                        onChange={handleInputChange}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <label htmlFor="showReadModeButton" className="text-sm text-text-primary flex items-center">
                    <BookOpenIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.showReadMode}
                </label>
                <Switch
                    id="showReadModeButton"
                    name="showReadModeButton"
                    checked={localSettings.showReadModeButton ?? false}
                    onChange={handleInputChange}
                />
            </div>
            <div className="flex items-center justify-between">
                <label htmlFor="showExportPdfButton" className="text-sm text-text-primary flex items-center">
                    <PdfIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.showExportPdf}
                </label>
                <Switch
                    id="showExportPdfButton"
                    name="showExportPdfButton"
                    checked={localSettings.showExportPdfButton ?? false}
                    onChange={handleInputChange}
                />
            </div>
            <div className="flex items-center justify-between">
                <label htmlFor="showContinueFlowButton" className="text-sm text-text-primary flex items-center">
                    <FlowRightIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.showContinueFlow}
                </label>
                <Switch
                    id="showContinueFlowButton"
                    name="showContinueFlowButton"
                    checked={localSettings.showContinueFlowButton ?? false}
                    onChange={handleInputChange}
                />
            </div>
            <div className="flex items-center justify-between">
                <label htmlFor="showAdvancedDataTools" className="text-sm text-text-primary flex items-center">
                    <ExportBoxIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.showAdvancedDataTools}
                </label>
                <Switch
                    id="showAdvancedDataTools"
                    name="showAdvancedDataTools"
                    checked={localSettings.showAdvancedDataTools ?? false}
                    onChange={handleInputChange}
                />
            </div>
            {/* Interactive Choices Toggle */}
            <div className="flex items-center justify-between">
                <label htmlFor="enableInteractiveChoices" className="text-sm text-text-primary flex items-center">
                    <DocumentIcon className="w-3.5 h-3.5 me-2 text-tint-cyan-text" /> {t.enableInteractiveChoices}
                </label>
                <Switch
                    id="enableInteractiveChoices"
                    name="enableInteractiveChoices"
                    checked={localSettings.enableInteractiveChoices ?? false}
                    onChange={handleInputChange}
                />
            </div>
            
            <div className="pt-2 mt-2 border-t border-border-base">
                <div className="flex items-center justify-between">
                    <label htmlFor="debugApiRequests" className="text-sm text-text-primary flex items-center">
                        <BugAntIcon className="w-3.5 h-3.5 me-2 text-tint-orange-text" /> {t.enableApiLogger}
                    </label>
                    <Switch
                        id="debugApiRequests"
                        name="debugApiRequests"
                        checked={localSettings.debugApiRequests ?? false}
                        onChange={handleInputChange}
                    />
                </div>
                {localSettings.debugApiRequests && (
                    <Button
                        onClick={onOpenDebugTerminal}
                        variant="secondary"
                        className="mt-2 w-full text-xs text-tint-orange-text bg-tint-orange-bg/10 py-1.5 rounded hover:bg-tint-orange-bg/80 transition-colors border border-tint-orange-border/20"
                    >
                        {hasApiLogs ? t.viewApiLogs : t.viewApiLogsNone} ({apiLogsCount})
                    </Button>
                )}
            </div>
            
            <div className="pt-2 text-center">
                <p className="text-[10px] text-text-secondary uppercase tracking-widest">{t.sessionStats}</p>
                <SessionStats />
            </div>
        </div>
      </div>

      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-yellow-border bg-bg-panel">
        <h3 className="text-sm font-bold text-tint-yellow-text uppercase tracking-wider mb-4 flex items-center">
          <ExportBoxIcon className="w-4 h-4 me-2" />
          Data & Cache
        </h3>
        
        <div className="grid grid-cols-2 gap-2 mb-3 ps-1">
            <Button
                variant="secondary"
                onClick={onCustomizeExport}
                className="text-xs text-tint-yellow-text bg-tint-yellow-bg/10 hover:bg-tint-yellow-bg/80 border-tint-yellow-border/20"
            >
                {t.exportJson}
            </Button>
            <Button
                variant="secondary"
                onClick={onExportTxt}
                className="text-xs text-tint-yellow-text bg-tint-yellow-bg/10 hover:bg-tint-yellow-bg/80 border-tint-yellow-border/20"
            >
                {t.exportTxt}
            </Button>
        </div>

        <Button
            variant="secondary"
            onClick={handleCompressChat}
            className="w-full text-xs text-tint-green-text bg-tint-green-bg/10 hover:bg-tint-green-bg/80 border-tint-green-border/20 mb-2"
            icon={<ArchiveBoxIcon className="w-3.5 h-3.5" />}
        >
            {t.compressChat}
        </Button>

        <Button
            variant="secondary"
            onClick={() => useSettingsUI.getState().openCacheManagerModal()}
            className="w-full text-xs text-tint-cyan-text bg-tint-cyan-bg/10 hover:bg-tint-cyan-bg/80 border-tint-cyan-border/20 mb-2"
            icon={<ServerIcon className="w-3.5 h-3.5" />}
        >
            Manage Context Cache
        </Button>

        <Button
            variant="danger"
            onClick={onHardReload}
            className="w-full text-xs text-tint-red-text bg-tint-red-bg/10 hover:bg-tint-red-bg/80 border-tint-red-border/20"
            icon={<ArrowPathIcon className="w-3.5 h-3.5" />}
        >
            {t.hardReload}
        </Button>
      </div>

    </div>
  );
});

export default SettingsAdvanced;
