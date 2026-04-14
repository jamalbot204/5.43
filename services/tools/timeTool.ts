
import { FunctionDeclaration, Type } from "@google/genai";

export const timeToolDefinition: FunctionDeclaration = {
    name: "get_current_realtime",
    description: "Retrieves the precise current real-world date and time. Use this when the user asks about the time, date, or when calculating time durations.",
    parameters: {
        type: Type.OBJECT,
        properties: {}, // No parameters needed
    }
};
