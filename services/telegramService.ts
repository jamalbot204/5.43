
import { ChatMessage, ChatMessageRole, ChatSession } from '../types';
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants';

export interface TelegramExport {
    name: string;
    type: string;
    id: number;
    messages: TelegramMessage[];
}

export interface TelegramMessage {
    id: number;
    type: string;
    date: string;
    from?: string;
    from_id?: string;
    text: string | (string | { type: string; text: string })[];
    text_entities: any[];
}

/**
 * Normalizes Telegram's "text" field into a clean string.
 * Telegram exports text as either a string or an array of entities.
 */
function normalizeTelegramText(text: any): string {
    if (typeof text === 'string') return text;
    if (Array.isArray(text)) {
        return text.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && item.text) return item.text;
            return '';
        }).join('');
    }
    return '';
}

/**
 * Converts a Telegram export object into a JJ ChatSession.
 * @param data The raw JSON data from Telegram.
 * @param userFromId The 'from_id' that should be mapped to the USER role.
 * @param modelFromId The 'from_id' that should be mapped to the MODEL role.
 */
export function convertTelegramToSession(
    data: TelegramExport,
    userFromId: string,
    modelFromId: string
): ChatSession {
    const messages: ChatMessage[] = data.messages
        .filter(m => m.type === 'message' && (m.from_id === userFromId || m.from_id === modelFromId))
        .map(m => {
            const role = m.from_id === userFromId ? ChatMessageRole.USER : ChatMessageRole.MODEL;
            const content = normalizeTelegramText(m.text);
            
            return {
                id: `tg-${m.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                role: role,
                content: content,
                timestamp: new Date(m.date),
                attachments: [],
                isStreaming: false
            };
        })
        .filter(m => m.content.trim().length > 0);

    const sessionId = `chat-tg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return {
        id: sessionId,
        title: `TG: ${data.name || 'Imported Chat'}`,
        messages: messages,
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        model: DEFAULT_MODEL_ID,
        settings: {
            ...DEFAULT_SETTINGS,
            safetySettings: [...DEFAULT_SAFETY_SETTINGS],
            ttsSettings: { ...DEFAULT_TTS_SETTINGS }
        },
        isCharacterModeActive: false,
        aiCharacters: [],
        apiRequestLogs: [],
        githubRepoContext: null
    };
}

/**
 * Analyzes the JSON to find all unique participants.
 */
export function getTelegramParticipants(data: TelegramExport): { id: string; name: string; count: number }[] {
    const participantsMap = new Map<string, { name: string; count: number }>();

    data.messages.forEach(m => {
        if (m.type === 'message' && m.from_id && m.from) {
            const existing = participantsMap.get(m.from_id);
            if (existing) {
                existing.count++;
            } else {
                participantsMap.set(m.from_id, { name: m.from, count: 1 });
            }
        }
    });

    return Array.from(participantsMap.entries()).map(([id, info]) => ({
        id,
        name: info.name,
        count: info.count
    })).sort((a, b) => b.count - a.count);
}