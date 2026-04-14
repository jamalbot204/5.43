
const IMPORT_WORKER_CODE = `
importScripts('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');

// --- DB CONSTANTS (Must match services/db/core.ts) ---
const DB_NAME = 'GeminiChatDB';
const DB_VERSION = 3;
const CHAT_SESSIONS_STORE = 'chatSessions';
const APP_METADATA_STORE = 'appMetadata';
const AUDIO_CACHE_STORE = 'audioCache';
const VECTOR_INDEX_STORE = 'vectorIndex';

// --- HELPER: Open DB ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            // We assume the DB exists or schema is managed by the main app mostly.
            // But if this runs on a fresh install, we might need to create stores.
            // For safety, we replicate the basic schema creation here just in case.
            const db = request.result;
            if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
                db.createObjectStore(CHAT_SESSIONS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
                db.createObjectStore(APP_METADATA_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
                db.createObjectStore(AUDIO_CACHE_STORE);
            }
            if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
                db.createObjectStore(VECTOR_INDEX_STORE, { keyPath: 'id' });
            }
        };
    });
}

// --- HELPER: FileReaderSync for blazing fast conversions ---
function blobToBase64(blob) {
    const reader = new FileReaderSync();
    const dataUrl = reader.readAsDataURL(blob);
    // Remove "data:mime/type;base64," prefix
    return dataUrl.split(',')[1];
}

function blobToDataUrl(blob) {
    const reader = new FileReaderSync();
    return reader.readAsDataURL(blob);
}

// --- HELPER: Direct DB Operations ---
function bulkPut(db, storeName, items) {
    return new Promise((resolve, reject) => {
        if (items.length === 0) return resolve();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        
        items.forEach(item => store.put(item));
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function bulkPutKeyVal(db, storeName, items) {
    return new Promise((resolve, reject) => {
        if (items.length === 0) return resolve();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        
        items.forEach(({ key, value }) => store.put(value, key));
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- MAIN WORKER LOGIC ---
self.onmessage = async (e) => {
    const { file, defaultSettings, defaultModel } = e.data;
    const isZip = file.name.endsWith('.zip');
    let db;

    try {
        db = await openDB();
        let importedRawData;
        let zip = null;

        self.postMessage({ type: 'progress', percent: 5, message: 'Reading file...' });

        if (isZip) {
            const zipData = await file.arrayBuffer();
            zip = await JSZip.loadAsync(zipData);
            
            const jsonFile = zip.file('export.json');
            if (!jsonFile) throw new Error("Missing export.json in ZIP");
            
            const jsonStr = await jsonFile.async('string');
            importedRawData = JSON.parse(jsonStr);
        } else {
            const text = await file.text();
            importedRawData = JSON.parse(text);
        }

        let uiConfigToRestore = null;

        // 1. Handle Metadata & Globals
        if (importedRawData.data) {
            const d = importedRawData.data;
            const metadataUpdates = [];
            
            // Helper to queue metadata update
            const queueMeta = (key, val) => {
                if (val) metadataUpdates.push({ key: key, value: val });
            };

            // Direct Key Mappings from export to DB keys
            if (d.uiConfiguration) {
                if (d.uiConfiguration.promptButtons) {
                    queueMeta('promptButtons', d.uiConfiguration.promptButtons);
                }
                uiConfigToRestore = {
                    theme: d.uiConfiguration.theme,
                    language: d.uiConfiguration.language
                };
            }
            if (d.userDefinedGlobalDefaults) queueMeta('geminiChatUserDefinedGlobalDefaults', d.userDefinedGlobalDefaults);
            if (d.apiKeys) queueMeta('apiKeys', d.apiKeys);
            if (d.externalModels) queueMeta('externalModels', d.externalModels);
            if (d.activeExternalModelId) queueMeta('activeExternalModelId', d.activeExternalModelId);
            if (d.externalModeActive !== undefined) queueMeta('externalModeActive', d.externalModeActive);
            if (d.customMemoryStrategies) queueMeta('customMemoryStrategies', d.customMemoryStrategies);
            if (d.messageGenerationTimes) queueMeta('messageGenerationTimes', d.messageGenerationTimes);
            if (d.exportConfigurationUsed) queueMeta('exportConfiguration', d.exportConfigurationUsed);

            // Bulk write metadata
            if (metadataUpdates.length > 0) {
                const tx = db.transaction(APP_METADATA_STORE, 'readwrite');
                const store = tx.objectStore(APP_METADATA_STORE);
                metadataUpdates.forEach(m => store.put(m));
                await new Promise(resolve => { tx.oncomplete = resolve; });
            }
        }

        // 2. Handle Vectors (Direct Insert)
        if (importedRawData.data && importedRawData.data.embeddedVectors) {
            self.postMessage({ type: 'progress', percent: 20, message: 'Restoring memory index...' });
            await bulkPut(db, VECTOR_INDEX_STORE, importedRawData.data.embeddedVectors);
        }

        // 3. Handle Chats & Audio (The Heavy Lifting)
        let rawChats = [];
        // Support both full export and simple export formats
        if (importedRawData.data && importedRawData.data.chats) {
            rawChats = importedRawData.data.chats;
        } else if (Array.isArray(importedRawData) || importedRawData.messages) {
            // Simple import - we treat it as a single chat constructed in the main thread? 
            // No, complex hydration logic is in the main thread.
            // For Turbo Import, we focus on the standard format. 
            // If it's simple format, we send it back to main thread to handle logic (it's small anyway).
            self.postMessage({ type: 'simple_import_fallback', data: importedRawData });
            return;
        }

        if (rawChats.length > 0) {
            const CHUNK_SIZE = 10;
            let processed = 0;

            for (let i = 0; i < rawChats.length; i += CHUNK_SIZE) {
                const chunk = rawChats.slice(i, i + CHUNK_SIZE);
                const sessionUpdates = [];
                const audioUpdates = [];

                for (const session of chunk) {
                    // Normalize dates
                    session.createdAt = new Date(session.createdAt);
                    session.lastUpdatedAt = new Date(session.lastUpdatedAt);

                    // Hydrate missing settings/model
                    if (!session.settings && defaultSettings) {
                        session.settings = defaultSettings;
                    }
                    if (!session.model && defaultModel) {
                        session.model = defaultModel;
                    }

                    // Process Messages
                    if (session.messages) {
                        for (const msg of session.messages) {
                            msg.timestamp = new Date(msg.timestamp);
                            
                            // A. Restore Attachments from ZIP
                            if (msg.attachments && zip) {
                                for (const att of msg.attachments) {
                                    if (att.filePath) {
                                        const zipFile = zip.file(att.filePath);
                                        if (zipFile) {
                                            const blob = await zipFile.async('blob');
                                            // Convert to Base64 synchronously (Fast in Worker)
                                            // We do this because the app expects Base64 strings in the DB object currently.
                                            att.base64Data = blobToBase64(blob);
                                            att.dataUrl = blobToDataUrl(blob);
                                            att.uploadState = 'completed';
                                        }
                                    }
                                }
                            }

                            // B. Restore Audio to Cache Store
                            if (msg.audioFilePaths && zip) {
                                for (let j = 0; j < msg.audioFilePaths.length; j++) {
                                    const path = msg.audioFilePaths[j];
                                    const zipFile = zip.file(path);
                                    if (zipFile) {
                                        const arrayBuffer = await zipFile.async('arraybuffer');
                                        const key = \`\${msg.id}_part_\${j}\`;
                                        audioUpdates.push({ key, value: arrayBuffer });
                                    }
                                }
                                msg.cachedAudioSegmentCount = msg.audioFilePaths.length;
                            }
                        }
                    }
                    sessionUpdates.push(session);
                }

                // Parallel Bulk Writes for this chunk
                await Promise.all([
                    bulkPut(db, CHAT_SESSIONS_STORE, sessionUpdates),
                    bulkPutKeyVal(db, AUDIO_CACHE_STORE, audioUpdates)
                ]);

                processed += chunk.length;
                const progress = 20 + ((processed / rawChats.length) * 80);
                self.postMessage({ type: 'progress', percent: progress, message: \`Restoring chats (\${processed}/\${rawChats.length})...\` });
            }
        }

        db.close();
        self.postMessage({ type: 'complete', count: rawChats.length, uiConfigToRestore });

    } catch (e) {
        if(db) db.close();
        self.postMessage({ type: 'error', error: e.message + (e.stack ? '\\n' + e.stack : '') });
    }
};
`;

export class ImportWorkerService {
    private worker: Worker | null = null;

    private getWorker(): Worker {
        if (!this.worker) {
            const blob = new Blob([IMPORT_WORKER_CODE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            this.worker = new Worker(workerUrl);
        }
        return this.worker;
    }

    public runImport(file: File, onProgress: (percent: number, msg: string) => void, options?: { defaultSettings?: any, defaultModel?: string }): Promise<number | any> {
        return new Promise((resolve, reject) => {
            const worker = this.getWorker();
            
            const handleMessage = (e: MessageEvent) => {
                const { type, percent, message, count, error, data, uiConfigToRestore } = e.data;
                
                if (type === 'progress') {
                    onProgress(percent, message);
                } else if (type === 'complete') {
                    cleanup();
                    resolve({ count, uiConfigToRestore });
                } else if (type === 'simple_import_fallback') {
                    // Worker detected simple format, pass back to main thread to handle logic
                    cleanup();
                    resolve({ simpleFallback: true, data });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(error));
                }
            };

            const cleanup = () => {
                worker.removeEventListener('message', handleMessage);
                this.terminate();
            };

            worker.addEventListener('message', handleMessage);
            worker.postMessage({ file, ...options });
        });
    }

    public terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

export const importWorkerService = new ImportWorkerService();
