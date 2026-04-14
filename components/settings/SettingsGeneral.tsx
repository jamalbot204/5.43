import React, { memo, useState, useCallback } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { KeyIcon, SparklesIcon, SpeakerWaveIcon, ShieldCheckIcon, PencilIcon, UserIcon, ServerIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { GeminiSettings } from '../../types.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';
import { useExternalModelsStore } from '../../store/useExternalModelsStore.ts';

interface SettingsGeneralProps {
  localModel: string;
  localSettings: GeminiSettings;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onOpenApiKeyModal: () => void;
  onOpenInstructionModal: (type: 'systemInstruction') => void;
  onOpenTtsModal: () => void;
  onOpenSafetyModal: () => void;
  onOpenExternalModelsModal: () => void;
}

const SettingsGeneral: React.FC<SettingsGeneralProps> = memo(({
  localModel,
  localSettings,
  handleInputChange,
  onOpenApiKeyModal,
  onOpenInstructionModal,
  onOpenTtsModal,
  onOpenSafetyModal,
  onOpenExternalModelsModal
}) => {
  const { t } = useTranslation();
  const { isExternalModeActive, toggleExternalMode } = useExternalModelsStore();
  const [isCustomModelMode, setIsCustomModelMode] = useState(
      !MODEL_DEFINITIONS.some(m => m.id === localModel) && localModel.trim() !== ''
  );

  const toggleCustomMode = useCallback(() => {
      setIsCustomModelMode(prev => !prev);
  }, []);

  return (
    <div className="space-y-4">
      
      {/* API Key Card - Yellow/Gold */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-yellow-border bg-bg-panel">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tint-yellow-bg/10 me-3 text-tint-yellow-text shadow-[0_0_10px_rgba(250,204,21,0.1)]">
                <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t.apiKeyManagement}</h3>
              <p className="text-xs text-text-secondary mt-0.5">{t.apiKeyDesc}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={onOpenApiKeyModal}
            className="px-3 py-1.5 text-xs text-tint-yellow-text bg-tint-yellow-bg/10 border-tint-yellow-border/20 hover:bg-tint-yellow-bg/80 hover:text-tint-yellow-text"
          >
            {t.manage}
          </Button>
        </div>
      </div>

      {/* Model Selection Card - Electric Blue */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-emerald-border bg-bg-panel">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tint-emerald-bg/10 me-3 text-tint-emerald-text shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                    <SparklesIcon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{t.model}</h3>
            </div>
            <Button onClick={toggleCustomMode} variant="ghost" size="sm" className="text-xs text-tint-emerald-text hover:text-tint-emerald-text underline decoration-dashed p-0 h-auto w-auto">
                {isCustomModelMode ? t.resetDefaults : t.useCustomModel}
            </Button>
        </div>
        
        {isCustomModelMode ? (
            <div className="relative">
                <Input
                    type="text"
                    name="model"
                    value={localModel}
                    onChange={handleInputChange}
                    placeholder={t.enterCustomModel}
                    className="font-mono"
                />
            </div>
        ) : (
            <Select
            id="model"
            name="model"
            value={localModel}
            onChange={handleInputChange}
            >
            {MODEL_DEFINITIONS.map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
            ))}
            </Select>
        )}
      </div>

      {/* External Providers Card - Cyan */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-cyan-border bg-bg-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tint-cyan-bg/10 me-3 text-tint-cyan-text shadow-[0_0_10px_rgba(6,182,212,0.1)]">
              <ServerIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t.externalProviders}</h3>
              <p className="text-xs text-text-secondary mt-0.5">{t.useOpenAiCompatibleApis}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={onOpenExternalModelsModal}
            className="px-3 py-1.5 text-xs text-tint-cyan-text bg-tint-cyan-bg/10 border-tint-cyan-border/20 hover:bg-tint-cyan-bg/80 hover:text-tint-cyan-text"
          >
            {t.manageModels}
          </Button>
        </div>

        <div className="flex items-center justify-between p-3 bg-transparent rounded-lg border border-border-base">
          <div className="flex-1 pe-4">
            <div className="text-sm font-medium text-text-primary">{t.enableExternalMode}</div>
            <div className="text-xs text-text-secondary mt-1">
              {t.externalModeDesc}
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <Switch
              checked={isExternalModeActive}
              onChange={() => toggleExternalMode()}
            />
          </label>
        </div>
      </div>

      {/* Persona / System Instruction Card - Purple */}
      <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-purple-border bg-bg-panel">
        <div className="flex items-center mb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tint-purple-bg/10 me-3 text-tint-purple-text shadow-[0_0_10px_rgba(168,85,247,0.1)]">
            <UserIcon className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">{t.systemInstruction}</h3>
        </div>
        <Button
          type="button"
          onClick={() => onOpenInstructionModal('systemInstruction')}
          variant="outline"
          className="w-full p-3 bg-bg-panel border border-border-base text-text-primary rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-left flex justify-between items-start hover:bg-bg-hover group h-auto"
        >
          <span className={`text-sm line-clamp-2 ${localSettings.systemInstruction ? 'text-text-primary' : 'text-text-secondary italic'}`}>
            {localSettings.systemInstruction || t.systemInstructionPlaceholder}
          </span>
          <PencilIcon className="w-4 h-4 text-text-muted group-hover:text-tint-purple-text mt-0.5 flex-shrink-0 ms-2" />
        </Button>
      </div>

      {/* Audio & Safety Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* TTS Settings - Emerald Green */}
        <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-emerald-border bg-bg-panel flex flex-col justify-between">
          <div>
            <div className="flex items-center mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tint-emerald-bg/10 me-2 text-tint-emerald-text">
                    <SpeakerWaveIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{t.ttsSettings}</h3>
            </div>
            <p className="text-xs text-text-secondary mb-3 ms-1">{t.ttsDesc}</p>
          </div>
          <Button
            variant="secondary"
            onClick={onOpenTtsModal}
            className="w-full px-3 py-2 text-xs text-tint-emerald-text bg-tint-emerald-bg/10 border-tint-emerald-border/20 hover:bg-tint-emerald-bg/80"
          >
            {t.configure}
          </Button>
        </div>

        {/* Safety Settings - Red */}
        <div className="relative p-4 rounded-e-xl rounded-s-md border-s-4 border-s-tint-red-border bg-bg-panel flex flex-col justify-between">
          <div>
            <div className="flex items-center mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tint-red-bg/10 me-2 text-tint-red-text">
                    <ShieldCheckIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{t.safetySettings}</h3>
            </div>
            <p className="text-xs text-text-secondary mb-3 ms-1">{t.safetyDesc}</p>
          </div>
          <Button
            variant="danger"
            onClick={onOpenSafetyModal}
            className="w-full px-3 py-2 text-xs text-tint-red-text bg-tint-red-bg/10 border-tint-red-border/20 hover:bg-tint-red-bg/80"
          >
            {t.configure}
          </Button>
        </div>
      </div>

    </div>
  );
});

export default SettingsGeneral;