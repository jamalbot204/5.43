import React, { useState } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { ServerIcon, CheckIcon, PencilIcon, TrashIcon, PlusIcon, CloseIcon, SparklesIcon } from '../common/Icons.tsx';
import { useExternalModelsStore } from '../../store/useExternalModelsStore.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useApiKeyStore } from '../../store/useApiKeyStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { ExternalProvider, ExternalModelItem } from '../../types/settings.ts';

const ExternalModelsModal: React.FC = () => {
  const { t } = useTranslation();
  const { isExternalModelsModalOpen, closeExternalModelsModal } = useSettingsUI();
  const { providers, activeModelId, addProvider, updateProvider, deleteProvider, setActiveModel } = useExternalModelsStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsList, setModelsList] = useState<ExternalModelItem[]>([{ id: crypto.randomUUID(), modelId: '', displayName: '' }]);

  const handleEdit = (provider: ExternalProvider) => {
    setEditingId(provider.id);
    setProviderName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey(provider.apiKey);
    setModelsList(provider.models.length > 0 ? [...provider.models] : [{ id: crypto.randomUUID(), modelId: '', displayName: '' }]);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setProviderName('');
    setBaseUrl('');
    setApiKey('');
    setModelsList([{ id: crypto.randomUUID(), modelId: '', displayName: '' }]);
  };

  const handleAddModelField = () => {
    setModelsList([...modelsList, { id: crypto.randomUUID(), modelId: '', displayName: '' }]);
  };

  const handleRemoveModelField = (id: string) => {
    if (modelsList.length > 1) {
      setModelsList(modelsList.filter(m => m.id !== id));
    }
  };

  const handleModelChange = (id: string, field: 'modelId' | 'displayName', value: string) => {
    setModelsList(modelsList.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value };
        // Auto-fill displayName if it's empty and we're typing modelId
        if (field === 'modelId' && !m.displayName) {
            updated.displayName = value;
        }
        return updated;
      }
      return m;
    }));
  };

  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isAIFiltering, setIsAIFiltering] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleAIFilter = async () => {
    const activeKey = useApiKeyStore.getState().activeApiKey?.value;
    if (!activeKey) {
      setFetchError('Gemini API key is required for AI filtering. Please set it in settings.');
      return;
    }

    const validModels = modelsList.filter(m => m.modelId.trim() !== '');
    if (validModels.length === 0) {
      setFetchError('No models to filter.');
      return;
    }

    setIsAIFiltering(true);
    setFetchError(null);

    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: activeKey });
      
      const prompt = `You are an AI expert. I will provide a JSON list of AI models. Your task is to:
      1. Filter the list to include ONLY models capable of general text-based chat or text generation. Strictly EXCLUDE: image generation, TTS, ASR/Whisper, embeddings, moderation, and reranking models.
      2. Generate a clean, user-friendly 'displayName' for each model (e.g., 'Meta Llama 3 8B' instead of 'meta-llama/llama-3-8b-instruct').
      3. Sort the final list from the most powerful/largest models to the weakest/smallest models.
      
      Return the result as a JSON array of objects with 'modelId' and 'displayName' properties.
      
      Models:
      ${JSON.stringify(validModels.map(m => ({ modelId: m.modelId, displayName: m.displayName })))}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                modelId: { type: Type.STRING },
                displayName: { type: Type.STRING }
              },
              required: ['modelId', 'displayName']
            }
          }
        }
      });

      const text = response.text;
      if (text) {
        const filteredModels = JSON.parse(text);
        if (Array.isArray(filteredModels) && filteredModels.length > 0) {
          setModelsList(filteredModels.map((m: any) => ({
            id: crypto.randomUUID(),
            modelId: m.modelId,
            displayName: m.displayName || m.modelId
          })));
        } else {
           setFetchError('AI filter returned no valid chat models.');
        }
      }
    } catch (error: any) {
      console.error("AI Filtering failed:", error);
      setFetchError('AI Filtering failed: ' + (error.message || 'Unknown error'));
    } finally {
      setIsAIFiltering(false);
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl) {
      setFetchError('Base URL is required to fetch models.');
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const endpoint = `${cleanBaseUrl}/models`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      let modelsArray: any[] = [];
      if (data && Array.isArray(data.data)) {
        modelsArray = data.data;
      } else if (Array.isArray(data)) {
        modelsArray = data;
      } else if (data && Array.isArray(data.models)) {
        modelsArray = data.models;
      }

      if (modelsArray.length === 0) {
        setFetchError('No models found at this endpoint.');
        return;
      }

      const nonChatKeywords = ['embed', 'vision', 'image', 'audio', 'tts', 'whisper', 'dall-e', 'diffusion', 'moderation', 'rerank', 'bge', 'nomic', 'text-to-image', 'image-to-text', 'text-to-speech', 'speech-to-text', 'stt'];

      const extractedModels = modelsArray
        .filter(m => {
          const id = (m.id || m.name || '').toLowerCase();
          
          // 1. Metadata filter (e.g., OpenRouter)
          if (m.architecture && m.architecture.modality) {
            const modality = m.architecture.modality;
            // Accept only text outputs
            if (!modality.includes('->text')) return false; 
          }

          // 2. Keyword filter
          if (nonChatKeywords.some(keyword => id.includes(keyword))) {
            return false;
          }

          return true;
        })
        .map(m => ({
          id: crypto.randomUUID(),
          modelId: m.id || m.name,
          displayName: m.name || m.id || m.name
        }));

      // Merge with existing models, avoiding duplicates by modelId
      const existingModelIds = new Set(modelsList.map(m => m.modelId).filter(Boolean));
      const newModels = extractedModels.filter(m => !existingModelIds.has(m.modelId));

      if (newModels.length > 0) {
          // If the only existing model is empty, replace it
          if (modelsList.length === 1 && !modelsList[0].modelId && !modelsList[0].displayName) {
              setModelsList(newModels);
          } else {
              setModelsList([...modelsList, ...newModels]);
          }
      } else {
          setFetchError('All models from this endpoint are already in the list.');
      }

    } catch (error: any) {
      console.error("Failed to fetch models:", error);
      setFetchError(error.message || 'Failed to fetch models. Check URL, API Key, and CORS.');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSave = async () => {
    const validModels = modelsList.filter(m => m.modelId.trim() !== '');
    if (!baseUrl || validModels.length === 0) return;

    if (editingId) {
      await updateProvider(editingId, { 
        name: providerName || 'Unnamed Provider', 
        baseUrl, 
        apiKey, 
        models: validModels 
      });
    } else {
      await addProvider({
        id: crypto.randomUUID(),
        name: providerName || 'Unnamed Provider',
        baseUrl,
        apiKey,
        models: validModels,
      });
    }
    handleCancelEdit();
  };

  return (
    <BaseModal
      isOpen={isExternalModelsModalOpen}
      onClose={closeExternalModelsModal}
      title={t.externalModels}
      headerIcon={<ServerIcon className="w-5 h-5 text-brand-primary" />}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Top Section (List) */}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {!providers || providers.length === 0 ? (
            <div className="text-sm text-text-muted italic text-center py-4">
              No external providers configured.
            </div>
          ) : (
            providers.map(provider => (
              <div 
                key={provider.id} 
                className="p-3 rounded-xl border border-border-base bg-bg-element shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary flex items-center gap-2">
                      {provider.name}
                    </div>
                    <div className="text-xs text-text-muted mt-1 truncate max-w-[200px] sm:max-w-xs">
                      {provider.baseUrl}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost"
                      onClick={() => handleEdit(provider)}
                      className="p-1.5 text-text-secondary hover:text-brand-accent hover:bg-brand-accent/10 h-auto bg-bg-element"
                      title={t.edit}
                      icon={<PencilIcon className="w-4 h-4" />}
                    />
                    <Button 
                      variant="ghost"
                      onClick={() => deleteProvider(provider.id)}
                      className="p-1.5 text-text-secondary hover:text-tint-red-text hover:bg-tint-red-bg/10 h-auto bg-bg-element"
                      title={t.delete}
                      icon={<TrashIcon className="w-4 h-4" />}
                    />
                  </div>
                </div>
                
                {/* Models Badges */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border-base/50">
                  {(provider.models || []).map(model => {
                    const isActive = model.id === activeModelId;
                    return (
                      <div 
                        key={model.id}
                        onClick={() => setActiveModel(model.id)}
                        className={`text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-colors flex items-center gap-1.5 ${
                          isActive 
                            ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary' 
                            : 'bg-bg-element border-border-base text-text-secondary hover:border-brand-primary/30 hover:text-text-primary'
                        }`}
                        title={isActive ? 'Active Model' : 'Click to set active'}
                      >
                        {isActive && <CheckIcon className="w-3 h-3" />}
                        {model.displayName || model.modelId}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="h-px bg-border-base" />

        {/* Bottom Section (Form) */}
        <div className="space-y-4 bg-bg-panel p-4 rounded-xl border border-border-base shadow-sm">
          <h3 className="text-sm font-medium text-text-primary">
            {editingId ? 'Edit Provider' : 'Add Provider'}
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs text-text-secondary">Provider Name (Optional)</label>
              <Input 
                type="text" 
                value={providerName}
                onChange={e => setProviderName(e.target.value)}
                placeholder="e.g., Groq, OpenRouter, Local LM Studio"
                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">{t.baseUrl}</label>
              <Input 
                type="text" 
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="e.g., https://api.groq.com/openai/v1"
                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">{t.apiKey} (Optional)</label>
              <Input 
                type="password" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-text-primary">Models</label>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleFetchModels}
                        disabled={!baseUrl || isFetchingModels || isAIFiltering}
                        className="text-[10px] h-auto py-1 px-2 bg-tint-cyan-bg/10 hover:bg-tint-cyan-bg/20 text-tint-cyan-text border border-tint-cyan-border/30 disabled:opacity-50"
                    >
                        {isFetchingModels ? 'Fetching...' : 'Fetch Models'}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleAIFilter}
                        disabled={modelsList.length === 0 || isFetchingModels || isAIFiltering}
                        className="text-[10px] h-auto py-1 px-2 bg-tint-purple-bg/10 hover:bg-tint-purple-bg/20 text-tint-purple-text border border-tint-purple-border/30 disabled:opacity-50"
                        title="Use Gemini to intelligently filter out non-chat models"
                        icon={<SparklesIcon className="w-3 h-3" />}
                    >
                        {isAIFiltering ? 'Filtering...' : 'AI Filter'}
                    </Button>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleAddModelField}
                    className="text-[10px] h-auto py-1 px-2 bg-bg-element hover:bg-bg-hover text-text-secondary"
                    icon={<PlusIcon className="w-3 h-3" />}
                >
                    Add Model
                </Button>
            </div>
            
            {fetchError && (
                <div className="mb-3 p-2 text-[10px] text-tint-red-text bg-tint-red-bg/10 border border-tint-red-border/30 rounded-lg">
                    {fetchError}
                </div>
            )}

            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {modelsList.map((model, index) => (
                    <div key={model.id} className="flex items-start gap-2">
                        <div className="flex-1 space-y-1.5">
                            <Input 
                                type="text" 
                                value={model.modelId}
                                onChange={e => handleModelChange(model.id, 'modelId', e.target.value)}
                                placeholder="Model ID (e.g., llama3-8b-8192)"
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus text-xs py-1.5"
                            />
                        </div>
                        <div className="flex-1 space-y-1.5">
                            <Input 
                                type="text" 
                                value={model.displayName}
                                onChange={e => handleModelChange(model.id, 'displayName', e.target.value)}
                                placeholder="Display Name"
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus text-xs py-1.5"
                            />
                        </div>
                        <Button 
                            variant="ghost"
                            onClick={() => handleRemoveModelField(model.id)}
                            disabled={modelsList.length === 1}
                            className="p-1.5 mt-0.5 text-text-muted hover:text-tint-red-text h-auto bg-transparent disabled:opacity-30"
                            icon={<CloseIcon className="w-4 h-4" />}
                        />
                    </div>
                ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border-base/50">
            {editingId && (
              <Button 
                variant="ghost"
                onClick={handleCancelEdit}
                className="bg-bg-element hover:bg-bg-hover text-text-primary"
              >
                {t.cancelEdit}
              </Button>
            )}
            <Button 
              variant="secondary"
              onClick={handleSave}
              disabled={!baseUrl || modelsList.every(m => !m.modelId.trim())}
              className="bg-brand-primary/20 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/30 shadow-sm"
            >
              {t.save}
            </Button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
};

export default ExternalModelsModal;
