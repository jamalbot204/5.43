
import { openDB, CHAT_SESSIONS_STORE, APP_METADATA_STORE, VECTOR_INDEX_STORE } from './core.ts';
import { ChatSession, ChatMessage, GeminiSettings, AICharacter } from '../../types.ts';

// Helper function to strip runtime-only properties from a message before persistence.
const stripRuntimeMessageProperties = (message: ChatMessage): ChatMessage => {
    const { cachedAudioBuffers, ...restOfMessage } = message;
    return restOfMessage;
};

export async function getChatSession(id: string): Promise<ChatSession | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllChatSessions(): Promise<ChatSession[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
         if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return resolve([]); 
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()));
        request.onerror = () => reject(request.error);
    });
}

export async function getAllChatSummariesFull(): Promise<ChatSession[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
         if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return resolve([]);
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.openCursor();
        const summaries: ChatSession[] = [];

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                const session = cursor.value as ChatSession;
                // Create a summary object with empty messages
                const summary: ChatSession = {
                    ...session,
                    messages: [] 
                };
                summaries.push(summary);
                cursor.continue();
            } else {
                resolve(summaries.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()));
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getChatSummariesPage(limit: number, cursorTimestampMs?: number): Promise<ChatSession[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return resolve([]);
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const index = store.index('lastUpdatedAt');
        
        let range: IDBKeyRange | undefined = undefined;
        if (cursorTimestampMs) {
            range = IDBKeyRange.upperBound(new Date(cursorTimestampMs), true);
        }
        
        const request = index.openCursor(range, 'prev');
        const summaries: ChatSession[] = [];
        
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && summaries.length < limit) {
                const session = cursor.value as ChatSession;
                const summary: ChatSession = {
                    ...session,
                    messages: []
                };
                summaries.push(summary);
                cursor.continue();
            } else {
                resolve(summaries);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function addOrUpdateChatSession(session: ChatSession): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);

        const sessionToStore = {
            ...session,
            messages: session.messages.map(stripRuntimeMessageProperties)
        };
        const request = store.put(sessionToStore);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => { 
            console.error("Error during addOrUpdateChatSession put request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function deleteChatSession(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.delete(id); 
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => {
            console.error("Error during deleteChatSession delete request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function deleteChatSessions(ids: string[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);

        ids.forEach(id => {
            store.delete(id);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function clearAllChatData(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE) || !db.objectStoreNames.contains(APP_METADATA_STORE)) {
            console.warn("Attempted to clear data, but one or more object stores do not exist.");
            return resolve(); 
        }
        const transaction = db.transaction([CHAT_SESSIONS_STORE, APP_METADATA_STORE, VECTOR_INDEX_STORE], 'readwrite');
        const sessionStore = transaction.objectStore(CHAT_SESSIONS_STORE);
        const metadataStore = transaction.objectStore(APP_METADATA_STORE);
        
        sessionStore.clear(); 
        metadataStore.clear();
        
        if (db.objectStoreNames.contains(VECTOR_INDEX_STORE)) {
            transaction.objectStore(VECTOR_INDEX_STORE).clear();
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            console.error("Error during clearAllChatData transaction:", transaction.error);
            reject(transaction.error);
        };
    });
}

// Granular Updates

async function getAndUpdateSession(chatId: string, updateFn: (session: ChatSession) => ChatSession, updateTimestamp: boolean = true): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.get(chatId);

        request.onsuccess = () => {
            const session = request.result;
            if (session) {
                let updatedSession = updateFn(session);
                if (updateTimestamp) {
                    updatedSession = { ...updatedSession, lastUpdatedAt: new Date() };
                }
                
                const sessionToStore = {
                    ...updatedSession,
                    messages: updatedSession.messages.map(stripRuntimeMessageProperties)
                };

                const putRequest = store.put(sessionToStore);
                putRequest.onerror = (event) => reject((event.target as IDBRequest).error);
            } else {
                console.warn(`Session with id ${chatId} not found for update.`);
            }
        };
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function updateChatTitleInDB(chatId: string, newTitle: string): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, title: newTitle }));
}

export async function updateMessagesInDB(chatId: string, newMessages: ChatMessage[]): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, messages: newMessages }));
}

export async function updateSettingsInDB(chatId: string, newSettings: GeminiSettings): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, settings: newSettings }));
}

export async function updateModelInDB(chatId: string, newModel: string): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, model: newModel }));
}

export async function updateCharactersInDB(chatId: string, newCharacters: AICharacter[]): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, aiCharacters: newCharacters }));
}

export async function updateGithubContextInDB(chatId: string, newContext: ChatSession['githubRepoContext']): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, githubRepoContext: newContext }));
}
