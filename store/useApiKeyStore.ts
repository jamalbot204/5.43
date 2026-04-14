
import { create } from 'zustand';
import { ApiKey } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';

interface ApiKeyState {
  apiKeys: ApiKey[];
  activeApiKey: ApiKey | null;
  isKeyVisible: boolean;
  isLoading: boolean;
  isRotationEnabled: boolean;
  
  // Actions
  loadKeysAndSettings: () => Promise<void>;
  addApiKey: () => void;
  updateApiKey: (id: string, name: string, value: string) => void;
  deleteApiKey: (id: string) => void;
  toggleKeyVisibility: () => void;
  moveKey: (id: string, direction: 'up' | 'down') => void;
  moveKeyToEdge: (id: string, edge: 'top' | 'bottom') => void;
  reorderApiKeys: (newKeys: ApiKey[]) => void;
  rotateActiveKey: () => Promise<void>;
  toggleRotation: () => void;
}

const persistKeys = async (keys: ApiKey[]) => {
  try {
    await dbService.setAppMetadata(METADATA_KEYS.API_KEYS, keys);
  } catch (error) {
    console.error("Failed to save API keys:", error);
  }
};

const persistRotationSetting = async (isEnabled: boolean) => {
    try {
        await dbService.setAppMetadata(METADATA_KEYS.API_KEY_ROTATION, isEnabled);
    } catch (error) {
        console.error("Failed to save API key rotation setting:", error);
    }
};

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  apiKeys: [],
  activeApiKey: null,
  isKeyVisible: false,
  isLoading: true,
  isRotationEnabled: true,

  loadKeysAndSettings: async () => {
    set({ isLoading: true });
    try {
      let storedKeys = await dbService.getAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS);
      
      // Inject default API key if no keys exist (first load or cleared)
      if (!storedKeys || storedKeys.length === 0) {
        const defaultKey: ApiKey = {
          id: 'default-key',
          name: 'Default Key',
          value: 'AIzaSyAeeqZKDm8ojiaACaqF4QOfzRY_y4eOLDM'
        };
        storedKeys = [defaultKey];
        await persistKeys(storedKeys);
      }

      const keys = storedKeys || [];
      const storedRotationSetting = await dbService.getAppMetadata<boolean>(METADATA_KEYS.API_KEY_ROTATION);
      const rotationEnabled = storedRotationSetting !== false; // Default to true if undefined or true

      set({
        apiKeys: keys,
        activeApiKey: keys.length > 0 ? keys[0] : null,
        isRotationEnabled: rotationEnabled,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load API keys or settings from storage:", error);
      set({ apiKeys: [], activeApiKey: null, isRotationEnabled: true, isLoading: false });
    }
  },

  addApiKey: () => {
    const { apiKeys } = get();
    const newKey: ApiKey = {
      id: `apikey-${Date.now()}`,
      name: `Key ${apiKeys.length + 1}`,
      value: '',
    };
    const newKeys = [...apiKeys, newKey];
    set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
    persistKeys(newKeys);
  },

  updateApiKey: (id: string, name: string, value: string) => {
    const newKeys = get().apiKeys.map(key =>
      key.id === id ? { ...key, name, value } : key
    );
    set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
    persistKeys(newKeys);
  },

  deleteApiKey: (id: string) => {
    const newKeys = get().apiKeys.filter(key => key.id !== id);
    set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
    persistKeys(newKeys);
  },

  moveKey: (id: string, direction: 'up' | 'down') => {
    const { apiKeys } = get();
    const index = apiKeys.findIndex(key => key.id === id);
    if (index === -1) return;

    const newKeys = [...apiKeys];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newKeys.length) return;

    [newKeys[index], newKeys[newIndex]] = [newKeys[newIndex], newKeys[index]];
    
    set({ apiKeys: newKeys, activeApiKey: newKeys[0] });
    persistKeys(newKeys);
  },

  moveKeyToEdge: (id: string, edge: 'top' | 'bottom') => {
    const { apiKeys } = get();
    const index = apiKeys.findIndex(key => key.id === id);
    if (index === -1 || (edge === 'top' && index === 0) || (edge === 'bottom' && index === apiKeys.length - 1)) return;

    const newKeys = [...apiKeys];
    const [item] = newKeys.splice(index, 1);

    if (edge === 'top') {
      newKeys.unshift(item);
    } else {
      newKeys.push(item);
    }
    
    set({ apiKeys: newKeys, activeApiKey: newKeys[0] });
    persistKeys(newKeys);
  },

  reorderApiKeys: (newKeys: ApiKey[]) => {
    set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
    persistKeys(newKeys);
  },

  toggleRotation: () => {
    const newRotationState = !get().isRotationEnabled;
    set({ isRotationEnabled: newRotationState });
    persistRotationSetting(newRotationState);
  },

  rotateActiveKey: async () => {
    const { isRotationEnabled, apiKeys } = get();
    if (!isRotationEnabled || apiKeys.length < 2) {
      return;
    }
    const newKeys = [...apiKeys.slice(1), apiKeys[0]];
    set({ apiKeys: newKeys, activeApiKey: newKeys[0] });
    await persistKeys(newKeys);
  },
  
  toggleKeyVisibility: () => set(state => ({ isKeyVisible: !state.isKeyVisible })),
}));

// Initialize the store by loading data from DB
useApiKeyStore.getState().loadKeysAndSettings();
