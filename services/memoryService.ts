
import { GoogleGenAI } from "@google/genai";
import * as dbService from './dbService';
import { ChatMessage } from '../types';

// Calculate Cosine Similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const generateEmbedding = async (apiKey: string, text: string): Promise<number[]> => {
    if (!text || !text.trim()) throw new Error("Cannot embed empty text");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: [{ parts: [{ text: text }] }]
    });
    const values = (response as any).embedding?.values || response.embeddings?.[0]?.values;
    if (!values) {
        throw new Error("Failed to generate embedding: No values returned");
    }
    return values;
};

export const generateBatchEmbeddings = async (apiKey: string, texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) return [];
    const model = 'gemini-embedding-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
    const requests = texts.map(t => ({
        model: `models/${model}`,
        content: { parts: [{ text: t }] }
    }));
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests })
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Batch embedding API failed: ${response.status} ${errorBody}`);
        }
        const data = await response.json();
        if (!data.embeddings) throw new Error("No embeddings returned from batch request");
        return data.embeddings.map((e: any) => e.values || []);
    } catch (e) {
        console.error("Batch embedding failed:", e);
        throw e;
    }
};

export interface IndexingContext {
    sessionId: string;
    sessionTitle: string;
    systemInstructionSnapshot?: string;
    precedingUserText?: string; // ADDED: To store pairs
    partnerRole?: string; // ADDED: To store partner role classification
}

export interface BatchIndexItem {
    message: ChatMessage;
    context: IndexingContext;
}

export const indexMessage = async (apiKey: string, message: ChatMessage, context: IndexingContext): Promise<boolean> => {
    if (!message.content || message.content.length < 10) return false; 
    try {
        const vector = await generateEmbedding(apiKey, message.content);
        await dbService.storeVector({
            id: message.id,
            text: message.content,
            vector: vector,
            timestamp: message.timestamp.getTime(),
            metadata: { 
                role: message.role,
                characterName: message.characterName,
                sessionId: context.sessionId,
                sessionTitle: context.sessionTitle,
                systemInstructionSnapshot: context.systemInstructionSnapshot,
                context_user_text: context.precedingUserText, // STORE PAIR CONTEXT
                partnerRole: context.partnerRole // STORE PARTNER ROLE
            }
        });
        return true;
    } catch (e) {
        console.error("Failed to index message:", e);
        return false;
    }
};

export const indexMessagesBatch = async (apiKey: string, items: BatchIndexItem[]): Promise<string[]> => {
    if (items.length === 0) return [];
    try {
        const texts = items.map(item => item.message.content);
        const embeddings = await generateBatchEmbeddings(apiKey, texts);
        if (embeddings.length !== items.length) throw new Error("Embedding count mismatch");
        const vectorEntries: dbService.VectorEntry[] = items.map((item, index) => ({
            id: item.message.id,
            text: item.message.content,
            vector: embeddings[index],
            timestamp: item.message.timestamp.getTime(),
            metadata: { 
                role: item.message.role,
                characterName: item.message.characterName,
                sessionId: item.context.sessionId,
                sessionTitle: item.context.sessionTitle,
                systemInstructionSnapshot: item.context.systemInstructionSnapshot,
                context_user_text: item.context.precedingUserText, // STORE PAIR CONTEXT
                partnerRole: item.context.partnerRole // STORE PARTNER ROLE
            }
        }));
        await dbService.storeVectorsBatch(vectorEntries);
        return items.map(item => item.message.id);
    } catch (e) {
        console.error("Batch index failed:", e);
        return [];
    }
};

export const searchMemory = async (
    apiKey: string, 
    query: string, 
    allowedChatIds?: string[],
    maxResults: number = 15,
    minRelevance: number = 0.35
): Promise<string> => {
    try {
        const queryVector = await generateEmbedding(apiKey, query);
        const allVectors = await dbService.getAllVectors();
        if (allVectors.length === 0) return "No memories stored yet.";

        let candidates = allVectors;
        if (allowedChatIds && allowedChatIds.length > 0) {
            const allowedSet = new Set(allowedChatIds);
            candidates = allVectors.filter(item => item.metadata?.sessionId && allowedSet.has(item.metadata.sessionId));
        }

        // We specifically look for AI responses (model role) to provide "Companion" examples
        const results = candidates
            .filter(item => item.metadata?.role === 'model') 
            .map(item => ({ ...item, similarity: cosineSimilarity(queryVector, item.vector) }))
            .sort((a, b) => b.similarity - a.similarity);

        if (results.length === 0 || results[0].similarity < minRelevance) { 
             return "No relevant examples found in history.";
        }
        
        const topResults = results
            .filter(r => r.similarity >= minRelevance)
            .slice(0, maxResults);

        // FORMATTING AS STRUCTURED XML
        const formattedExamples = topResults.map((r) => {
            const userText = r.metadata?.context_user_text || "[Contextual query]";
            const companionText = r.text;
            const role = r.metadata?.partnerRole || "User"; // Retrieve partner role from metadata
            
            return `  <example>
    <context>Conversation with ${role}</context>
    <user_query>${userText}</user_query>
    <companion_reply>${companionText}</companion_reply>
  </example>`;
        }).join('\n\n');

        return `<search_results>\n  <instruction>\n    These are PAST examples for style reference ONLY. Do NOT reply to them.\n    Use them to shape your tone for the current user message.\n  </instruction>\n\n${formattedExamples}\n</search_results>`;
    } catch (e) {
        console.error("[Memory] Search failed:", e);
        return "Error occurred while searching memory database.";
    }
};
