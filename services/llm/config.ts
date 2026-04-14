import { GoogleGenAI } from "@google/genai";
import { MODEL_DEFINITIONS } from '../../constants.ts';

const aiInstancesCache = new Map<string, GoogleGenAI>();

export function createAiInstance(apiKey: string): GoogleGenAI {
    if (aiInstancesCache.has(apiKey)) {
        return aiInstancesCache.get(apiKey)!;
    }
    const newInstance = new GoogleGenAI({ apiKey });
    aiInstancesCache.set(apiKey, newInstance);
    return newInstance;
}

export const getModelDisplayName = (modelId: string | undefined): string => {
    if (!modelId) return "Unknown Model";
    const model = MODEL_DEFINITIONS.find(m => m.id === modelId);
    return model ? model.name : modelId.split('/').pop() || modelId;
};