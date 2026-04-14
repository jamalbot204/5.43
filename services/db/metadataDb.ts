
import { openDB, APP_METADATA_STORE } from './core.ts';
import { USER_DEFINED_GLOBAL_DEFAULTS_KEY } from '../../constants.ts';

interface AppMetadataValue {
    key: string;
    value: any;
}

export const METADATA_KEYS = {
    ACTIVE_CHAT_ID: 'activeChatId',
    MESSAGE_GENERATION_TIMES: 'messageGenerationTimes',
    USER_DEFINED_GLOBAL_DEFAULTS: USER_DEFINED_GLOBAL_DEFAULTS_KEY,
    EXPORT_CONFIGURATION: 'exportConfiguration',
    API_KEYS: 'apiKeys',
    API_KEY_ROTATION: 'apiKeyRotationEnabled',
    CUSTOM_MEMORY_STRATEGIES: 'customMemoryStrategies',
    PYTHON_ENABLED: 'pythonEnabled', 
    PROMPT_BUTTONS: 'promptButtons',
    EXTERNAL_MODELS: 'externalModels',
    EXTERNAL_MODE_ACTIVE: 'externalModeActive',
    ACTIVE_EXTERNAL_MODEL_ID: 'activeExternalModelId',
};

export async function getAppMetadata<T>(key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return resolve(undefined); 
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readonly');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.get(key);
        request.onsuccess = () => {
            resolve(request.result ? (request.result as AppMetadataValue).value : undefined);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function setAppMetadata<T>(key: string, value: T): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return reject(new Error(`Object store ${APP_METADATA_STORE} not found.`));
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readwrite');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.put({ key, value });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => {
            console.error("Error during setAppMetadata put request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function deleteAppMetadata(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return reject(new Error(`Object store ${APP_METADATA_STORE} not found.`));
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readwrite');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
         request.onerror = (event) => {
            console.error("Error during deleteAppMetadata delete request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}
