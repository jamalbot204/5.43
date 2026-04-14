
import { ChatSession, ChatMessage } from '../../types.ts';

export const DB_NAME = 'GeminiChatDB';
export const DB_VERSION = 3;
export const CHAT_SESSIONS_STORE = 'chatSessions';
export const APP_METADATA_STORE = 'appMetadata';
export const AUDIO_CACHE_STORE = 'audioCache';
export const VECTOR_INDEX_STORE = 'vectorIndex';

let dbInstance: IDBDatabase | null = null;
let openingPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
    if (dbInstance && dbInstance.objectStoreNames.length > 0) { 
        return Promise.resolve(dbInstance);
    }

    if (openingPromise) {
        return openingPromise;
    }

    openingPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = request.result;
            const oldVersion = event.oldVersion;
            
            if (oldVersion < 1) {
                if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
                    const sessionStore = db.createObjectStore(CHAT_SESSIONS_STORE, { keyPath: 'id' });
                    sessionStore.createIndex('lastUpdatedAt', 'lastUpdatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
                    db.createObjectStore(APP_METADATA_STORE, { keyPath: 'key' });
                }
            }

            if (oldVersion < 2) {
                if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
                    db.createObjectStore(AUDIO_CACHE_STORE);
                }

                // Data migration logic v1 -> v2
                const transaction = request.transaction;
                if (!transaction) return;
                const sessionStore = transaction.objectStore(CHAT_SESSIONS_STORE);
                const audioStore = transaction.objectStore(AUDIO_CACHE_STORE);
                
                sessionStore.getAll().onsuccess = (getAllEvent) => {
                    const sessions: ChatSession[] = (getAllEvent.target as IDBRequest<ChatSession[]>).result;
                    sessions.forEach(session => {
                        let sessionModified = false;
                        const updatedMessages = session.messages.map(message => {
                            const msgWithBuffers = message as any;
                            if (msgWithBuffers.cachedAudioBuffers && Array.isArray(msgWithBuffers.cachedAudioBuffers)) {
                                const buffersToMigrate = msgWithBuffers.cachedAudioBuffers.filter((b: any) => b instanceof ArrayBuffer);
                                if (buffersToMigrate.length > 0) {
                                    buffersToMigrate.forEach((buffer: ArrayBuffer, index: number) => {
                                        const key = `${message.id}_part_${index}`;
                                        audioStore.put(buffer, key);
                                    });

                                    const newMessage: Partial<ChatMessage> & { cachedAudioBuffers?: any } = { ...message };
                                    newMessage.cachedAudioSegmentCount = buffersToMigrate.length;
                                    delete newMessage.cachedAudioBuffers;
                                    
                                    sessionModified = true;
                                    return newMessage as ChatMessage;
                                }
                            }
                            return message;
                        });

                        if (sessionModified) {
                            session.messages = updatedMessages;
                            sessionStore.put(session);
                        }
                    });
                };
            }

            if (oldVersion < 3) {
                if (!db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
                    db.createObjectStore(VECTOR_INDEX_STORE, { keyPath: 'id' });
                }
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onclose = () => {
                console.warn("IndexedDB connection closed.");
                dbInstance = null;
                openingPromise = null;
            };
            dbInstance.onversionchange = () => {
                console.warn("IndexedDB version change detected from another tab. Closing this connection.");
                if(dbInstance) {
                    dbInstance.close();
                }
            };
            resolve(dbInstance);
        };

        request.onerror = (_event) => {
            console.error('IndexedDB open error:', request.error);
            openingPromise = null;
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn('IndexedDB open is blocked.');
            reject(new Error('Database open request was blocked. Please close other tabs.'));
        };
    });
    return openingPromise;
}
