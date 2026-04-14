
import { openDB, AUDIO_CACHE_STORE } from './core.ts';

export async function getAudioBuffer(key: string): Promise<ArrayBuffer | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            return reject(new Error(`Object store ${AUDIO_CACHE_STORE} not found.`));
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readonly');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function setAudioBuffer(key: string, buffer: ArrayBuffer): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            return reject(new Error(`Object store ${AUDIO_CACHE_STORE} not found.`));
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readwrite');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        store.put(buffer, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function deleteAudioBuffer(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            return resolve();
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readwrite');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}
