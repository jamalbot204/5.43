
import React, { useState, useEffect, memo, useCallback } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { TTSSettings, TTSModelId, TTSVoiceId } from '../../types.ts';
import { DEFAULT_TTS_SETTINGS } from '../../constants.ts';
import { CloseIcon, PencilIcon, SpeakerWaveIcon, CogIcon, UserIcon, CalculatorIcon } from '../common/Icons.tsx';
import { TTS_MODELS, TTS_VOICES_MALE, TTS_VOICES_FEMALE } from '../../constants.ts';
import InstructionEditModal from './InstructionEditModal.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Button } from '../ui/Button.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Input } from '../ui/Input.tsx';

interface TtsSettingsModalProps {
  isOpen?: boolean;
  initialSettings?: TTSSettings;
  onApply?: (settings: TTSSettings) => void;
  onClose?: () => void;
}

const TtsSettingsModal: React.FC<TtsSettingsModalProps> = memo(({ isOpen: propIsOpen, initialSettings, onApply, onClose }) => {
  const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
  const { isTtsSettingsModalOpen, closeTtsSettingsModal } = useSettingsUI();
  const { t } = useTranslation();

  const isControlled = propIsOpen !== undefined;
  const showModal = isControlled ? propIsOpen : isTtsSettingsModalOpen;

  const [localTtsSettings, setLocalTtsSettings] = useState<TTSSettings>(DEFAULT_TTS_SETTINGS);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);

  useEffect(() => {
    if (showModal) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);

      if (isControlled && initialSettings) {
          setLocalTtsSettings(initialSettings);
      } else if (currentChatSession) {
          setLocalTtsSettings(currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS);
      }
      return () => clearTimeout(timerId);
    }
  }, [showModal, isControlled, initialSettings, currentChatSession]);

  const handleClose = useCallback(() => {
      if (isControlled && onClose) {
          onClose();
      } else {
          closeTtsSettingsModal();
      }
  }, [isControlled, onClose, closeTtsSettingsModal]);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, model: e.target.value as TTSModelId }));
  }, []);

  const handleVoiceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = e.target.value as TTSVoiceId;
    if (newVoice) {
        setLocalTtsSettings(prev => ({ ...prev, voice: newVoice }));
    }
  }, []);
  
  const handleAutoPlayChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, autoPlayNewMessages: e.target.checked }));
  }, []);

  const handleMaxWordsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const valueString = e.target.value;
    if (valueString === '') {
        setLocalTtsSettings(prev => ({
            ...prev,
            maxWordsPerSegment: 999999
        }));
        return;
    }
    const value = parseInt(valueString, 10);
    setLocalTtsSettings(prev => ({
      ...prev,
      maxWordsPerSegment: (Number.isInteger(value) && value > 0) ? value : 999999
    }));
  }, []);

  const handleTemperatureChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setLocalTtsSettings(prev => ({
      ...prev,
      temperature: value
    }));
  }, []);

  const handleOpenInstructionModal = useCallback(() => {
    setIsInstructionModalOpen(true);
  }, []);

  const handleApplyInstructionChange = useCallback((newInstruction: string) => {
    setLocalTtsSettings(prev => ({ ...prev, systemInstruction: newInstruction }));
    setIsInstructionModalOpen(false);
  }, []);

  const handleApplySettings = useCallback(() => {
    if (isControlled && onApply) {
        onApply(localTtsSettings);
    } else {
        if (!currentChatSession) return;
        updateCurrentChatSession(session => session ? ({
            ...session,
            settings: { ...session.settings, ttsSettings: localTtsSettings }
        }) : null);
        closeTtsSettingsModal();
    }
  }, [isControlled, onApply, localTtsSettings, currentChatSession, updateCurrentChatSession, closeTtsSettingsModal]);
  
  const handleResetDefaults = useCallback(() => {
    setLocalTtsSettings(DEFAULT_TTS_SETTINGS);
  }, []);

  if (!showModal) return null;

  return (
    <>
      <div className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={handleClose}>
        <div className="bg-bg-panel border border-border-base p-0 rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-text-primary relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
          
          <div className="p-5 flex justify-between items-center bg-bg-panel/50 border-b border-border-base">
            <h2 className="text-xl font-semibold text-text-primary flex items-center">
                <SpeakerWaveIcon className="w-5 h-5 mr-3 text-brand-primary" />
                {t.ttsSettings}
            </h2>
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={areButtonsDisabled}
              className="p-1.5 rounded-full h-auto text-text-muted hover:text-text-primary"
              aria-label={t.close}
              icon={<CloseIcon className="w-6 h-6" />}
            />
          </div>

          <div className="flex-grow min-h-0 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            <fieldset disabled={areButtonsDisabled} className="space-y-4">
              
              <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-brand-primary/5">
                <h3 className="text-sm font-bold text-brand-primary uppercase tracking-wider mb-3 flex items-center">
                    <SpeakerWaveIcon className="w-4 h-4 mr-2" /> Engine Config
                </h3>
                <div className="space-y-3 pl-1">
                    <div>
                        <label htmlFor="tts-model" className="block text-xs font-medium text-text-secondary mb-1">{t.ttsModel}</label>
                        <Select id="tts-model" name="tts-model" value={localTtsSettings.model} onChange={handleModelChange as any} options={TTS_MODELS.map(model => ({ value: model.id, label: model.name }))} />
                    </div>
                    <div>
                        <label htmlFor="tts-voice" className="block text-xs font-medium text-text-secondary mb-1">{t.voice}</label>
                        <Select
                            id="tts-voice"
                            name="tts-voice"
                            value={localTtsSettings.voice}
                            onChange={handleVoiceChange as any}
                            options={[
                                { value: '', label: 'Select a voice...', disabled: true },
                                ...TTS_VOICES_MALE.map(voice => ({ value: voice.id, label: `${t.male} - ${voice.name} (${voice.description})` })),
                                ...TTS_VOICES_FEMALE.map(voice => ({ value: voice.id, label: `${t.female} - ${voice.name} (${voice.description})` }))
                            ]}
                        />
                    </div>
                    {/* Temperature Slider */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label htmlFor="tts-temperature" className="text-xs font-medium text-text-secondary">Temperature (Variability)</label>
                            <span className="text-xs text-brand-primary font-mono">{localTtsSettings.temperature?.toFixed(1) ?? "1.0"}</span>
                        </div>
                        <input
                            type="range"
                            id="tts-temperature"
                            name="tts-temperature"
                            min="0.0"
                            max="2.0"
                            step="0.1"
                            className="w-full h-1.5 bg-bg-track rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            value={localTtsSettings.temperature ?? 1.0}
                            onChange={handleTemperatureChange}
                        />
                        <div className="flex justify-between text-[10px] text-text-muted mt-1">
                            <span>Stable (0.0)</span>
                            <span>Expressive (2.0)</span>
                        </div>
                    </div>
                </div>
              </div>

              <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-secondary bg-brand-secondary/5">
                <h3 className="text-sm font-bold text-brand-secondary uppercase tracking-wider mb-3 flex items-center">
                    <CogIcon className="w-4 h-4 mr-2" /> Behavior
                </h3>
                <div className="space-y-3 pl-1">
                    <div>
                        <div className="flex items-center justify-between">
                            <label htmlFor="autoPlayNewMessages" className="text-sm text-text-primary cursor-pointer">{t.autoPlayNewMessages}</label>
                            <Switch id="autoPlayNewMessages" name="autoPlayNewMessages" checked={localTtsSettings.autoPlayNewMessages ?? false} onChange={(e) => { const val = e.target.checked; setLocalTtsSettings(prev => ({ ...prev, autoPlayNewMessages: val })); }} />
                        </div>
                        <p className="text-xs text-text-muted mt-1">{t.autoPlayDesc}</p>
                    </div>
                    <div>
                        <label htmlFor="tts-max-words" className="block text-xs font-medium text-text-secondary mb-1">{t.maxWordsPerSegment}</label>
                        <Input 
                            type="number" 
                            id="tts-max-words" 
                            name="tts-max-words" 
                            value={localTtsSettings.maxWordsPerSegment ?? ''} 
                            onChange={handleMaxWordsChange} 
                            step="10" 
                            placeholder="Default: No split (999999)" 
                        />
                        <p className="text-xs text-text-muted mt-1">{t.maxWordsDesc}</p>
                    </div>
                </div>
              </div>

              <div className="relative p-4 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-accent bg-brand-accent/5">
                <h3 className="text-sm font-bold text-brand-accent uppercase tracking-wider mb-3 flex items-center">
                    <UserIcon className="w-4 h-4 mr-2" /> Persona
                </h3>
                <div className="pl-1">
                    <label className="block text-xs font-medium text-text-secondary mb-1">{t.ttsSystemInstruction}</label>
                    <Button type="button" onClick={handleOpenInstructionModal} variant="ghost" className="w-full p-2 bg-bg-element border border-border-base text-text-primary rounded-xl focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary text-left flex justify-between items-center transition-shadow hover:shadow-sm group h-auto">
                        <span className={`truncate text-sm ${localTtsSettings.systemInstruction ? 'text-text-primary' : 'text-text-muted italic'}`} title={localTtsSettings.systemInstruction || t.ttsSystemInstructionPlaceholder}>{localTtsSettings.systemInstruction ? (localTtsSettings.systemInstruction.length > 40 ? localTtsSettings.systemInstruction.substring(0, 40) + "..." : localTtsSettings.systemInstruction) : t.ttsSystemInstructionPlaceholder}</span>
                        <PencilIcon className="w-3.5 h-3.5 text-text-muted group-hover:text-brand-accent flex-shrink-0 ml-2" />
                    </Button>
                    <p className="text-xs text-text-muted mt-1">{t.ttsSystemInstructionDesc}</p>
                </div>
              </div>

            </fieldset>
          </div>

          <div className="p-4 border-t border-border-base bg-bg-panel/50 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <Button variant="link" onClick={handleResetDefaults} disabled={areButtonsDisabled} className="text-brand-primary hover:text-brand-hover">{t.resetDefaults}</Button>
            <div className="flex space-x-3 w-full sm:w-auto">
              <Button variant="secondary" onClick={handleClose} disabled={areButtonsDisabled} className="flex-1 sm:flex-none">{t.cancel}</Button>
              <Button variant="primary" onClick={handleApplySettings} disabled={areButtonsDisabled} className="flex-1 sm:flex-none">{t.applyTtsSettings}</Button>
            </div>
          </div>
        </div>
      </div>
      {isInstructionModalOpen && (
        <InstructionEditModal
          isOpen={isInstructionModalOpen}
          title={t.ttsSystemInstruction}
          currentInstruction={localTtsSettings.systemInstruction || ''}
          onApply={handleApplyInstructionChange}
          onClose={() => setIsInstructionModalOpen(false)}
        />
      )}
    </>
  );
});

export default TtsSettingsModal;