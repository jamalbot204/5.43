import { create } from 'zustand';
import { ExternalProvider, ExternalModelItem } from '../types/settings';
import { getAppMetadata, setAppMetadata, METADATA_KEYS } from '../services/db/metadataDb';

interface ExternalModelsState {
  providers: ExternalProvider[];
  activeModelId: string | null;
  isExternalModeActive: boolean;
  isLoading: boolean;
  init: () => Promise<void>;
  addProvider: (provider: ExternalProvider) => Promise<void>;
  updateProvider: (id: string, updates: Partial<ExternalProvider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setActiveModel: (id: string) => Promise<void>;
  toggleExternalMode: () => Promise<void>;
  getActiveModelDetails: () => { baseUrl: string; apiKey: string; modelId: string; displayName: string } | null;
}

export const useExternalModelsStore = create<ExternalModelsState>((set, get) => ({
  providers: [],
  activeModelId: null,
  isExternalModeActive: false,
  isLoading: true,

  init: async () => {
    try {
      const providers = await getAppMetadata<ExternalProvider[]>(METADATA_KEYS.EXTERNAL_MODELS) || [];
      const isExternalModeActive = await getAppMetadata<boolean>(METADATA_KEYS.EXTERNAL_MODE_ACTIVE) || false;
      const activeId = await getAppMetadata<string>(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID);
      
      let activeModelId = null;
      if (activeId && providers.some(p => p.models?.some(m => m.id === activeId))) {
        activeModelId = activeId;
      } else if (providers.length > 0 && providers[0].models?.length > 0) {
        activeModelId = providers[0].models[0].id;
        await setAppMetadata(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID, activeModelId);
      }

      set({ providers, isExternalModeActive, activeModelId, isLoading: false });
    } catch (error) {
      console.error('Failed to init external models store:', error);
      set({ isLoading: false });
    }
  },

  addProvider: async (provider) => {
    const { providers, activeModelId } = get();
    const newProviders = [...providers, provider];
    await setAppMetadata(METADATA_KEYS.EXTERNAL_MODELS, newProviders);
    
    let newActiveId = activeModelId;
    if (!newActiveId && provider.models?.length > 0) {
      newActiveId = provider.models[0].id;
      await setAppMetadata(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID, newActiveId);
    }
    
    set({ providers: newProviders, activeModelId: newActiveId });
  },

  updateProvider: async (id, updates) => {
    const { providers } = get();
    const newProviders = providers.map(p => p.id === id ? { ...p, ...updates } : p);
    await setAppMetadata(METADATA_KEYS.EXTERNAL_MODELS, newProviders);
    set({ providers: newProviders });
  },

  deleteProvider: async (id) => {
    const { providers, activeModelId } = get();
    const newProviders = providers.filter(p => p.id !== id);
    await setAppMetadata(METADATA_KEYS.EXTERNAL_MODELS, newProviders);
    
    let newActiveId = activeModelId;
    // Check if the active model was in the deleted provider
    const deletedProvider = providers.find(p => p.id === id);
    if (deletedProvider && deletedProvider.models?.some(m => m.id === activeModelId)) {
      newActiveId = (newProviders.length > 0 && newProviders[0].models?.length > 0) ? newProviders[0].models[0].id : null;
      await setAppMetadata(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID, newActiveId);
    }
    
    set({ providers: newProviders, activeModelId: newActiveId });
  },

  setActiveModel: async (id) => {
    await setAppMetadata(METADATA_KEYS.ACTIVE_EXTERNAL_MODEL_ID, id);
    set({ activeModelId: id });
  },

  toggleExternalMode: async () => {
    const { isExternalModeActive } = get();
    const newValue = !isExternalModeActive;
    await setAppMetadata(METADATA_KEYS.EXTERNAL_MODE_ACTIVE, newValue);
    set({ isExternalModeActive: newValue });
  },

  getActiveModelDetails: () => {
    const { providers, activeModelId } = get();
    if (!activeModelId) return null;

    for (const provider of providers) {
      const model = provider.models?.find(m => m.id === activeModelId);
      if (model) {
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          modelId: model.modelId,
          displayName: model.displayName
        };
      }
    }
    return null;
  }
}));

useExternalModelsStore.getState().init();
