import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Switch } from '../ui/Switch.tsx';
import { ExportConfiguration } from '../../types.ts';
import { useChatListStore } from '../../store/useChatListStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts'; 
import { DEFAULT_EXPORT_CONFIGURATION } from '../../constants.ts';
import { CloseIcon, CheckIcon, ArrowPathIcon, UsersIcon, DocumentDuplicateIcon, KeyIcon, ExportBoxIcon, ServerIcon, CogIcon, BrainIcon } from '../common/Icons.tsx';
import { useExportStore } from '../../store/useExportStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';

const ToggleOption: React.FC<{
  id: keyof ExportConfiguration;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (id: keyof ExportConfiguration, checked: boolean) => void;
  indented?: boolean;
  warning?: string;
  disabled?: boolean;
  accentColorClass?: string;
}> = memo(({ id, label, description, checked, onChange, indented, warning, disabled, accentColorClass = "text-brand-primary" }) => (
  <div className={`py-2 ${indented ? 'ltr:pl-6 rtl:pr-6 border-l border-border-base ml-1' : ''} ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex items-start">
      <div className="flex items-center h-5">
        <Switch
          id={id}
          name={id}
          className={`focus:ring-2 h-4 w-4 border-border-base rounded bg-bg-element disabled:cursor-not-allowed ${accentColorClass.replace('text-', 'text-').replace('focus:ring-', 'focus:ring-')}`} 
          checked={checked}
          onChange={(e) => !disabled && onChange(id, e.target.checked)}
          disabled={disabled}
        />
      </div>
      <div className="ltr:ml-3 rtl:mr-3 text-sm">
        <label htmlFor={id} className={`font-medium cursor-pointer ${disabled ? 'text-text-muted' : 'text-text-primary'}`}>{label}</label>
        {description && <p className={`text-xs ${disabled ? 'text-text-muted' : 'text-text-secondary'} mt-0.5`}>{description}</p>}
        {warning && <p className="text-xs text-tint-amber-text mt-0.5 bg-tint-amber-bg/20 p-1 rounded inline-block">{warning}</p>}
      </div>
    </div>
  </div>
));

const ExportConfigurationModal: React.FC = memo(() => {
  const { chatHistory, loadAllChatsForModals } = useChatListStore();
  const { currentExportConfig, setCurrentExportConfig, handleExportChats, handleExportTrainingData, isExporting, exportProgress } = useExportStore();
  const { isExportConfigModalOpen, closeExportConfigurationModal } = useSettingsUI();
  const showToast = useToastStore(state => state.showToast);
  const { t } = useTranslation();

  const [localConfig, setLocalConfig] = useState<ExportConfiguration>(currentExportConfig);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);
  const [isPreparingData, setIsPreparingData] = useState(false);

  useEffect(() => {
    if (isExportConfigModalOpen) {
      const initData = async () => {
        setIsPreparingData(true);
        await loadAllChatsForModals();
        setIsPreparingData(false);
        
        // After loading, initialize selection
        const history = useChatListStore.getState().chatHistory;
        setSelectedChatIds(
          history.length > 0 
            ? history.filter(s => s.title !== 'New Chat').map(s => s.id) 
            : []
        );
      };

      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);

      setLocalConfig(currentExportConfig);
      initData();
      setSearchTerm('');
      return () => clearTimeout(timerId);
    }
  }, [isExportConfigModalOpen, currentExportConfig, loadAllChatsForModals]);

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return chatHistory;
    return chatHistory.filter(session =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chatHistory, searchTerm]);

  const handleToggleChange = useCallback((id: keyof ExportConfiguration, checked: boolean) => {
    setLocalConfig(prev => ({ ...prev, [id]: checked }));
  }, []);

  const handleChatSelectionChange = useCallback((chatId: string) => {
    setSelectedChatIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  }, []);

  const handleSelectAllChats = useCallback(() => {
    setSelectedChatIds(filteredSessions.map(s => s.id));
  }, [filteredSessions]);

  const handleDeselectAllChats = useCallback(() => {
    setSelectedChatIds([]);
  }, []);

  const handleSaveCurrentConfig = useCallback(() => {
    setCurrentExportConfig(localConfig);
    showToast("Export preferences saved!", "success");
  }, [localConfig, setCurrentExportConfig, showToast]);
  
  const handleInitiateExport = useCallback(() => {
    if (selectedChatIds.length === 0) {
      alert("Please select at least one chat to export.");
      return;
    }
    handleExportChats(selectedChatIds, localConfig);
  }, [selectedChatIds, localConfig, handleExportChats]);

  const handleInitiateTrainingExport = useCallback(() => {
    if (selectedChatIds.length === 0) {
        alert("Please select at least one chat to export.");
        return;
    }
    handleExportTrainingData(selectedChatIds);
  }, [selectedChatIds, handleExportTrainingData]);

  const handleResetConfigDefaults = useCallback(() => {
    setLocalConfig(DEFAULT_EXPORT_CONFIGURATION);
  }, []);

  if (!isExportConfigModalOpen) return null;

  const isCoreDataDisabled = !localConfig.includeChatSessionsAndMessages;
  const exportButtonText = isExporting ? `${t.loading} (${exportProgress}%)` : `${t.exportSelected} (${selectedChatIds.length})`;

  return (
    <div 
        className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-2 sm:p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-config-modal-title"
        onClick={closeExportConfigurationModal}
    >
      <div className="bg-bg-panel p-5 sm:p-6 rounded-2xl shadow-panel w-full sm:max-w-3xl max-h-[95vh] grid grid-rows-[auto_1fr_auto] text-text-primary border border-border-base backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id="export-config-modal-title" className="text-xl font-semibold text-text-primary flex items-center">
            <ExportBoxIcon className="w-6 h-6 mr-3 text-brand-primary" />
            {t.exportTitle}
          </h2>
          <Button
            variant="ghost"
            onClick={closeExportConfigurationModal}
            disabled={areButtonsDisabled}
            className="p-1.5 rounded-full bg-bg-element hover:bg-bg-hover text-text-secondary hover:text-text-primary"
            aria-label={t.close}
          >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>

        <fieldset disabled={areButtonsDisabled} className="overflow-y-auto pr-1 sm:pr-2 space-y-4 min-h-0 custom-scrollbar">
          {/* Chat Selection Card - Emerald */}
          <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/10 to-transparent backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-brand-primary uppercase tracking-wider flex items-center">
                    <DocumentDuplicateIcon className="w-4 h-4 mr-2" /> {t.selectChatsToExport}
                </h4>
                <div className="space-x-2">
                    <Button variant="ghost" size="sm" onClick={handleSelectAllChats} className="text-[10px] bg-brand-primary/20 text-brand-primary px-2 py-1 rounded hover:bg-brand-primary/30 disabled:opacity-50" disabled={filteredSessions.length === 0}>{t.selectAll}</Button>
                    <Button variant="ghost" size="sm" onClick={handleDeselectAllChats} className="text-[10px] bg-bg-element text-text-secondary px-2 py-1 rounded hover:bg-bg-hover disabled:opacity-50" disabled={selectedChatIds.length === 0}>{t.deselectAll}</Button>
                </div>
            </div>
            
            {isPreparingData ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <ArrowPathIcon className="w-8 h-8 text-brand-primary animate-spin" />
                <p className="text-sm text-brand-primary font-medium animate-pulse">Loading full history...</p>
              </div>
            ) : chatHistory.length > 0 ? (
              <>
                <Input
                  type="text"
                  placeholder="Search chats..."
                  className="mb-2 bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto border border-border-base rounded-md p-1 space-y-1 bg-bg-panel/20 custom-scrollbar shadow-inner">
                  {filteredSessions.map(session => (
                    <div key={session.id} className={`flex items-center p-1.5 rounded-md cursor-pointer transition-colors ${selectedChatIds.includes(session.id) ? 'bg-brand-primary/10' : 'hover:bg-bg-hover'}`} onClick={() => handleChatSelectionChange(session.id)}>
                      <Switch
                        checked={selectedChatIds.includes(session.id)}
                        readOnly
                        className="h-4 w-4 text-brand-primary bg-bg-element border-border-base rounded focus:ring-ring-focus"
                      />
                      <label className="ltr:ml-2 rtl:mr-2 text-sm text-text-primary truncate cursor-pointer flex items-center flex-grow">
                        {session.isCharacterModeActive && <UsersIcon className="w-3.5 h-3.5 ltr:mr-1.5 rtl:ml-1.5 text-tint-purple-text flex-shrink-0"/>}
                        {session.title}
                      </label>
                    </div>
                  ))}
                  {filteredSessions.length === 0 && <p className="text-sm text-text-muted italic text-center py-2">No chats match.</p>}
                </div>
                <p className="text-xs text-text-muted mt-2 text-right">{selectedChatIds.length} of {filteredSessions.length} chat(s) selected.</p>
              </>
            ) : (
              <p className="text-sm text-text-muted italic">{t.noChats}</p>
            )}
          </div>

          {/* Config Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Core Data Card - Emerald */}
              <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/10 to-transparent backdrop-blur-sm shadow-sm">
                <h4 className="text-sm font-bold text-brand-primary uppercase tracking-wider mb-3 flex items-center">
                    <ServerIcon className="w-4 h-4 mr-2" /> {t.dataInclusionPref}
                </h4>
                <div className="space-y-1">
                    <ToggleOption id="includeChatSessionsAndMessages" label={t.exp_chatSessions} description={t.exp_chatSessionsDesc} checked={localConfig.includeChatSessionsAndMessages} onChange={handleToggleChange} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                    <ToggleOption id="includeMessageContent" label={t.exp_msgContent} checked={localConfig.includeMessageContent} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                    <ToggleOption id="includeMessageAttachmentsMetadata" label={t.exp_attMeta} description={t.exp_attMetaDesc} checked={localConfig.includeMessageAttachmentsMetadata} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                    <ToggleOption id="includeFullAttachmentFileData" label={t.exp_fullFiles} checked={localConfig.includeFullAttachmentFileData} onChange={handleToggleChange} indented disabled={isCoreDataDisabled || !localConfig.includeMessageAttachmentsMetadata} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                    <ToggleOption id="includeCachedMessageAudio" label={t.exp_audio} checked={localConfig.includeCachedMessageAudio} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                    <ToggleOption id="includeThoughts" label={t.exp_thoughts} checked={localConfig.includeThoughts ?? true} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} accentColorClass="text-brand-primary focus:ring-ring-focus" />
                </div>
              </div>

              {/* Settings & Tech Card - Purple/Red */}
              <div className="space-y-4">
                  <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-tint-purple-border bg-gradient-to-r from-tint-purple-bg/10 to-transparent backdrop-blur-sm shadow-sm">
                    <h4 className="text-sm font-bold text-tint-purple-text uppercase tracking-wider mb-3 flex items-center">
                        <CogIcon className="w-4 h-4 mr-2" /> Settings & Chars
                    </h4>
                    <div className="space-y-1">
                        <ToggleOption id="includeChatSpecificSettings" label={t.exp_chatSettings} checked={localConfig.includeChatSpecificSettings} onChange={handleToggleChange} disabled={isCoreDataDisabled} accentColorClass="text-tint-purple-text focus:ring-ring-focus" />
                        <ToggleOption id="includeAiCharacterDefinitions" label={t.exp_aiChars} checked={localConfig.includeAiCharacterDefinitions} onChange={handleToggleChange} disabled={isCoreDataDisabled} accentColorClass="text-tint-purple-text focus:ring-ring-focus" />
                        <ToggleOption id="includeUserDefinedGlobalDefaults" label={t.exp_userDefaults} checked={localConfig.includeUserDefinedGlobalDefaults} onChange={handleToggleChange} accentColorClass="text-tint-purple-text focus:ring-ring-focus" />
                    </div>
                  </div>

                  <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-tint-red-border bg-gradient-to-r from-tint-red-bg/10 to-transparent backdrop-blur-sm shadow-sm">
                    <h4 className="text-sm font-bold text-tint-red-text uppercase tracking-wider mb-3 flex items-center">
                        <KeyIcon className="w-4 h-4 mr-2" /> Tech & Creds
                    </h4>
                    <div className="space-y-1">
                        <ToggleOption id="includeApiLogs" label={t.exp_apiLogs} warning={t.exp_apiLogsWarn} checked={localConfig.includeApiLogs} onChange={handleToggleChange} disabled={isCoreDataDisabled} accentColorClass="text-tint-red-text focus:ring-ring-focus" />
                        <ToggleOption id="includeApiKeys" label={t.exp_apiKeys} warning={t.exp_apiKeysWarn} checked={localConfig.includeApiKeys} onChange={handleToggleChange} accentColorClass="text-tint-red-text focus:ring-ring-focus" />
                        <ToggleOption id="includeExternalModels" label={t.externalModels || "External Models"} description="Include external model configurations" checked={localConfig.includeExternalModels ?? false} onChange={handleToggleChange} accentColorClass="text-tint-red-text focus:ring-ring-focus" />
                    </div>
                  </div>
                  
                  {/* New: Portable Python Env */}
                  <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-tint-cyan-border bg-gradient-to-r from-tint-cyan-bg/10 to-transparent backdrop-blur-sm shadow-sm">
                    <h4 className="text-sm font-bold text-tint-cyan-text uppercase tracking-wider mb-3 flex items-center">
                        <ArrowPathIcon className="w-4 h-4 mr-2" /> Portable Environment
                    </h4>
                    <div className="space-y-1">
                        <ToggleOption 
                            id="includeOfflinePythonEnv" 
                            label="Include Offline Python Environment" 
                            warning="Increases file size (+20MB~)" 
                            description="Includes Pyodide binaries and installed packages for fully offline execution on another device."
                            checked={localConfig.includeOfflinePythonEnv ?? false} 
                            onChange={handleToggleChange} 
                            accentColorClass="text-tint-cyan-text focus:ring-ring-focus" 
                        />
                    </div>
                  </div>
              </div>
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-border-base space-y-3 sm:space-y-0">
          <div className="flex gap-2 w-full sm:w-auto">
             <Button variant="ghost" size="sm" onClick={handleResetConfigDefaults} disabled={areButtonsDisabled} type="button" className="text-brand-primary hover:text-text-primary bg-bg-element hover:bg-bg-hover sm:w-auto w-full"><ArrowPathIcon className="w-3.5 h-3.5 ltr:mr-1.5 rtl:ml-1.5" /> {t.resetDefaults}</Button>
             <Button variant="ghost" size="sm" onClick={handleInitiateTrainingExport} disabled={areButtonsDisabled || selectedChatIds.length === 0} type="button" className="text-tint-purple-text bg-tint-purple-bg/10 border border-tint-purple-border/20 hover:text-tint-purple-text hover:bg-tint-purple-bg/20 sm:w-auto w-full"><BrainIcon className="w-3.5 h-3.5 ltr:mr-1.5 rtl:ml-1.5" /> {t.exportTrainingData}</Button>
          </div>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 sm:rtl:space-x-reverse w-full sm:w-auto">
            <Button variant="secondary" onClick={closeExportConfigurationModal} disabled={areButtonsDisabled || isPreparingData} type="button" className="w-full sm:w-auto bg-bg-element border-border-base hover:bg-bg-hover text-text-primary">{t.cancel}</Button>
            <Button variant="primary" onClick={handleSaveCurrentConfig} disabled={areButtonsDisabled || isPreparingData} type="button" className="w-full sm:w-auto bg-brand-primary hover:bg-brand-hover text-text-on-brand shadow-sm"><CheckIcon className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" /> {t.save}</Button>
            <Button variant="primary" onClick={handleInitiateExport} type="button" disabled={areButtonsDisabled || selectedChatIds.length === 0 || isExporting || isPreparingData} className="bg-brand-secondary text-text-on-brand hover:bg-brand-secondary/80 w-full sm:w-auto"><ExportBoxIcon className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" /> {exportButtonText}</Button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ExportConfigurationModal;