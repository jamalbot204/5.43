
import { openDB, VECTOR_INDEX_STORE } from './core.ts';

export interface VectorEntry {
    id: string; // Message ID
    text: string;
    vector: number[];
    timestamp: number;
    metadata?: any;
}

export async function storeVector(entry: VectorEntry): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return reject(new Error(`Object store ${VECTOR_INDEX_STORE} not found.`));
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readwrite');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        store.put(entry);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function storeVectorsBatch(entries: VectorEntry[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return reject(new Error(`Object store ${VECTOR_INDEX_STORE} not found.`));
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readwrite');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        
        entries.forEach(entry => {
            store.put(entry);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBRequest).error);
    });
}

export async function getAllVectors(): Promise<VectorEntry[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return resolve([]);
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readonly');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function getVectors(ids: string[]): Promise<VectorEntry[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return resolve([]);
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readonly');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        
        const vectors: VectorEntry[] = [];
        let completed = 0;
        
        if (ids.length === 0) return resolve([]);

        ids.forEach(id => {
            const request = store.get(id);
            request.onsuccess = () => {
                if (request.result) {
                    vectors.push(request.result);
                }
                completed++;
                if (completed === ids.length) {
                    resolve(vectors);
                }
            };
            request.onerror = () => {
                console.warn(`Failed to fetch vector for id: ${id}`);
                completed++;
                if (completed === ids.length) {
                    resolve(vectors);
                }
            };
        });
    });
}

export async function deleteVector(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return resolve();
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readwrite');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function deleteVectors(ids: string[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return resolve();
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readwrite');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        ids.forEach(id => store.delete(id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function updateSessionVectorMetadata(sessionId: string, metadataUpdates: any): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            return resolve();
        }
        const transaction = db.transaction(VECTOR_INDEX_STORE, 'readwrite');
        const store = transaction.objectStore(VECTOR_INDEX_STORE);
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                const entry = cursor.value;
                if (entry.metadata && entry.metadata.sessionId === sessionId) {
                    const updatedEntry = { 
                        ...entry, 
                        metadata: { ...entry.metadata, ...metadataUpdates } 
                    };
                    cursor.update(updatedEntry);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}
