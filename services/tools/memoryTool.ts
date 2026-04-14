
import { FunctionDeclaration, Type } from "@google/genai";

export const sanitizeToolName = (name: string): string => {
    // Replace non-alphanumeric with underscore
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    // Ensure starts with letter
    if (!/^[a-zA-Z]/.test(sanitized)) {
        sanitized = 'tool_' + sanitized;
    }
    // Max length 63
    return sanitized.substring(0, 63);
};

export const getMemoryToolDefinition = (toolName: string = "search_ideal_companion_responses", toolDescription?: string): FunctionDeclaration => {
    // Default legacy description if none provided
    const defaultDescription = "Retrieves 'ideal companion responses' from the conversation history to inspire and guide the current response. This tool helps maintain the personality of a perfect dialogue partner. YOU MUST USE THIS TOOL ALWAYS BEFORE EVERY RESPONSE to check for context, user preferences, and previous successful interactions. Formulate a specific, descriptive natural language query representing the information or 'inspiration' needed.";
    
    // If user provided a description (mandate), use it EXCLUSIVELY. Otherwise use default.
    const description = (toolDescription && toolDescription.trim().length > 0) 
        ? toolDescription 
        : defaultDescription;

    return {
        name: toolName,
        description: description,
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: "The semantic search query used to find relevant information or examples."
                }
            },
            required: ["query"]
        }
    };
};

export const memoryToolDefinition: FunctionDeclaration = getMemoryToolDefinition();
