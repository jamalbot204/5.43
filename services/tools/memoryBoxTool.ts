
import { FunctionDeclaration, Type } from "@google/genai";

export const getMemoryUpdateTool = (userDescription?: string): FunctionDeclaration => {
    // Default description if none provided
    const descriptionText = userDescription && userDescription.trim().length > 0 
        ? userDescription 
        : "Call this tool to update the 'User Profile' (JSON). Use this to persist permanent user details (identity, preferences, beliefs). Do NOT use for temporary context.";

    return {
        name: "update_reference_notes",
        description: descriptionText,
        parameters: {
            type: Type.OBJECT,
            properties: {
                mutation_logic: {
                    type: Type.STRING,
                    description: "The logic for the Profile Manager to update the profile."
                }
            },
            required: ["mutation_logic"]
        }
    };
};

export const getSurgicalMemoryTool = (): FunctionDeclaration => {
    return {
        name: "update_user_profile_structure",
        description: "Updates the User Profile (JSON) to persist long-term user traits, preferences, and knowledge. Do NOT use for conversation state.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                category: {
                    type: Type.STRING,
                    description: "Category: 'identity' (facts), 'preferences' (likes/dislikes), 'beliefs' (views), 'active_projects' (long-term tasks).",
                    enum: ["identity", "preferences", "beliefs", "active_projects"]
                },
                operation: {
                    type: Type.STRING,
                    description: "Action type.",
                    enum: ["set_key", "delete_key", "append_to_list", "remove_from_list"]
                },
                key: {
                    type: Type.STRING,
                    description: "The key for object categories (identity, preferences). e.g., 'name', 'tone'."
                },
                value: {
                    type: Type.STRING,
                    description: "The value to set or append. e.g. 'John', 'Brief', 'I like cats'."
                }
            },
            required: ["category", "operation"]
        }
    };
};
