
import { create } from 'zustand';
import { GoogleGenAI, Content, Type } from "@google/genai";
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import { UNRESTRICTED_PRIMING_HISTORY } from '../services/unrestrictedScenario.ts';
import { HarmCategory, HarmBlockThreshold, MemorySnapshot, ChatMessage } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { getSurgicalMemoryTool } from '../services/tools/memoryBoxTool.ts';

interface MemoryUpdateResult {
    success: boolean;
    message: string;
}

interface MemoryStoreState {
    isUpdatingMemory: boolean;
    lastUpdateTimestamp: Date | null;
    
    // Actions
    performBackgroundUpdate: (instruction: string, contextMessages: any[], relatedMessageId?: string) => Promise<MemoryUpdateResult>;
    autoAnalyzeAndSave: (chatHistory: ChatMessage[]) => Promise<void>;
    executeSurgicalUpdate: (category: string, operation: string, key?: string, value?: string, relatedMessageId?: string) => Promise<MemoryUpdateResult>;
    manualUpdateContent: (newContent: string, source?: 'direct_edit' | 'restore', triggerText?: string, relatedMessageId?: string) => Promise<void>;
    clearMemory: () => Promise<void>;
}

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
    isUpdatingMemory: false,
    lastUpdateTimestamp: null,

    executeSurgicalUpdate: async (category, operation, key, value, relatedMessageId) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        
        if (!currentChatSession) return { success: false, message: "No active session" };

        set({ isUpdatingMemory: true });

        const currentMemoryBox = currentChatSession.settings.memoryBoxContent || "{}";
        let profile: any = {};
        try {
            profile = JSON.parse(currentMemoryBox);
        } catch {
            // Reset if invalid JSON
            profile = { identity: {}, preferences: {}, beliefs: [], active_projects: [] };
        }

        // Helper to ensure path exists
        const ensureCategory = (cat: string, isList: boolean) => {
            if (!profile[cat]) {
                profile[cat] = isList ? [] : {};
            }
        };

        let success = false;
        let message = "";

        try {
            if (operation === 'set_key') {
                ensureCategory(category, false);
                if (key && typeof profile[category] === 'object' && !Array.isArray(profile[category])) {
                    profile[category][key] = value;
                    success = true;
                    message = `Set ${category}.${key} = ${value}`;
                } else {
                    message = `Failed: Category ${category} is not an object or key missing.`;
                }
            } else if (operation === 'delete_key') {
                if (key && profile[category] && typeof profile[category] === 'object') {
                    delete profile[category][key];
                    success = true;
                    message = `Deleted ${category}.${key}`;
                }
            } else if (operation === 'append_to_list') {
                ensureCategory(category, true);
                if (Array.isArray(profile[category]) && value) {
                    // Avoid duplicates
                    if (!profile[category].includes(value)) {
                        profile[category].push(value);
                        success = true;
                        message = `Appended "${value}" to ${category}`;
                    } else {
                        success = true; // No-op success
                        message = `Value already exists in ${category}`;
                    }
                } else {
                    message = `Failed: Category ${category} is not a list.`;
                }
            } else if (operation === 'remove_from_list') {
                if (Array.isArray(profile[category]) && value) {
                    profile[category] = profile[category].filter((item: string) => item !== value);
                    success = true;
                    message = `Removed "${value}" from ${category}`;
                }
            } else {
                message = `Unknown operation: ${operation}`;
            }
        } catch (e: any) {
            success = false;
            message = `Error executing update: ${e.message}`;
        }

        if (success) {
            const newContent = JSON.stringify(profile, null, 2);
            
            // Create Snapshot
            const snapshot: MemorySnapshot = {
                id: `mem-snap-${Date.now()}`,
                timestamp: new Date(),
                content: newContent,
                source: relatedMessageId ? 'ai' : 'manual_trigger',
                triggerText: `Profile Update: ${operation} on ${category}`,
                relatedMessageId: relatedMessageId
            };

            const newHistory = [snapshot, ...(currentChatSession.memoryHistory || [])];
            
            const newSettings = { 
                ...currentChatSession.settings, 
                memoryBoxContent: newContent,
                ...(relatedMessageId ? { activeMemoryAnchorId: relatedMessageId } : {})
            };
            
            await updateCurrentChatSession(s => s ? ({ 
                ...s, 
                settings: newSettings,
                memoryHistory: newHistory
            }) : null);
            
            await dbService.addOrUpdateChatSession(useActiveChatStore.getState().currentChatSession!);
            set({ lastUpdateTimestamp: new Date() });
        }

        set({ isUpdatingMemory: false });
        return { success, message };
    },

    autoAnalyzeAndSave: async (chatHistory) => {
        const { currentChatSession } = useActiveChatStore.getState();
        const { activeApiKey } = useApiKeyStore.getState();
        const { logApiRequest } = useGeminiApiStore.getState();

        if (!currentChatSession || !activeApiKey?.value) return;
        if (!currentChatSession.settings.isMemoryBoxEnabled) return;

        // BATCHING STRATEGY: Only analyze every 20 messages.
        // This reduces token usage and provides a stable window of context for analysis.
        if (chatHistory.length < 20 || chatHistory.length % 20 !== 0) {
            return;
        }

        // Use the user-selected model for memory operations
        const memoryModel = currentChatSession.settings.activeMemoryModel || 'gemini-2.5-flash';

        set({ isUpdatingMemory: true });

        // Context Preparation:
        // 1. Current State (The Profile)
        const currentMemoryBox = currentChatSession.settings.memoryBoxContent || "{}";
        
        // 2. Recent Events (The Stimulus)
        // CHANGED: Slice the last 20 messages for batch processing
        const recentMessages = chatHistory.slice(-20); 
        
        const recentTranscript = recentMessages.map(m => {
            const role = m.role === 'user' ? 'User' : (m.characterName || 'AI');
            return `[${role}]: ${m.content}`;
        }).join('\n');

        const systemPrompt = `
=== IDENTITY: PROFILE MANAGER ===
You are a background process managing the "User Profile" (JSON).
Your goal is to extract PERMANENT attributes about the User from the provided conversation batch.

=== CRITICAL: CONFLICT RESOLUTION & INFERENCE ===
1. **Source of Truth**: The [CURRENT PROFILE JSON] is the baseline. Do not change it unless the user explicitly contradicts it or provides new information.
2. **Context Matters**: 
   - Distinguish between the user *stating* a fact about themselves vs. *quoting* text, *roleplaying*, or *discussing* a topic.
   - Example: If the user quotes a religious text, it does NOT automatically mean they belong to that religion unless they say "As a [Religion] person...".
   - If the user discusses a job (e.g. "My character is a doctor"), do NOT set their job to doctor.
3. **Explicit Override**: Only overwrite core identity fields (Name, Religion, Job) if the user explicitly updates them (e.g. "I have a new job").

=== STORAGE RULES ===
1. **Identity**: Facts (Name, Age, Job, Location).
2. **Preferences**: Likes/Dislikes, Communication Style (e.g. "prefers short answers").
3. **Beliefs**: Core values, political/religious views, worldviews.
4. **Active Projects**: Long-term ongoing tasks the user is working on.

=== EXCLUSION RULES (DO NOT STORE) ===
- Temporary states (Hunger, Current Mood, Inventory items in a game).
- Chit-chat (Greetings).
- Redundant info already in [CURRENT PROFILE].

=== TOOL USAGE ===
Call \`update_user_profile_structure\` to apply changes.
- Use 'set_key' for Identity/Preferences.
- Use 'append_to_list' for Beliefs/Projects.
- Use 'delete_key' or 'remove_from_list' if info is retracted.
`;

        const contents: Content[] = [
            ...UNRESTRICTED_PRIMING_HISTORY,
            {
                role: 'user',
                parts: [{ text: `
[CURRENT PROFILE JSON]
${currentMemoryBox}

[RECENT CONVERSATION BATCH (Last 20 Messages)]
${recentTranscript}

Analyze this batch. Does the User Profile need an update based on these specific interactions?
` }]
            }
        ];
        
        const config: any = {
            systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
            temperature: 0.1, 
            tools: [{ functionDeclarations: [getSurgicalMemoryTool()] }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } }, 
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ].map(s => ({ category: s.category, threshold: s.threshold }))
        };

        logApiRequest({
            requestType: 'models.generateContent',
            payload: {
                model: memoryModel,
                contents: JSON.parse(JSON.stringify(contents)),
                config: config
            },
            characterName: `Profile Manager (${memoryModel})`
        });

        try {
            const ai = new GoogleGenAI({ apiKey: activeApiKey.value });
            
            const response = await ai.models.generateContent({
                model: memoryModel,
                contents: contents,
                config: config
            });

            const functionCalls = response.functionCalls;

            if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                    if (call.name === 'update_user_profile_structure') {
                        const category = call.args['category'] as string;
                        const operation = call.args['operation'] as string;
                        const key = call.args['key'] as string;
                        const value = call.args['value'] as string;

                        // Execute the update
                        const opResult = await get().executeSurgicalUpdate(category, operation, key, value, recentMessages[recentMessages.length - 1].id);
                        
                        logApiRequest({
                            requestType: 'tool.trace',
                            payload: { toolCall: call, toolResult: { result: opResult.message } },
                            characterName: 'Profile Manager (ACTION)'
                        });
                    }
                }
            } else {
                 logApiRequest({
                    requestType: 'tool.trace',
                    payload: { toolResult: { result: "No changes needed." } },
                    characterName: 'Profile Manager (SILENT)'
                });
            }

        } catch (error: any) {
            console.warn("[Profile Manager] Auto-update failed:", error);
            logApiRequest({
                requestType: 'tool.trace',
                payload: { toolResult: { error: error.message || "Unknown error" } },
                characterName: 'Profile Manager (ERROR)'
            });
        } finally {
            set({ isUpdatingMemory: false });
        }
    },

    performBackgroundUpdate: async (instruction, contextMessages, relatedMessageId) => {
        const { currentChatSession } = useActiveChatStore.getState();
        const { activeApiKey } = useApiKeyStore.getState();
        const { logApiRequest } = useGeminiApiStore.getState();

        if (!currentChatSession || !activeApiKey?.value) return { success: false, message: "Error: No session or API key" };

        set({ isUpdatingMemory: true });

        const currentMemoryBox = currentChatSession.settings.memoryBoxContent || "{}";
        const memoryModel = currentChatSession.settings.activeMemoryModel || 'gemini-2.5-flash';
        
        // Convert context messages to transcript (Full History)
        const fullHistory = contextMessages.map((m: any) => {
            const role = m.role === 'user' ? 'User' : 'Model';
            let text = m.parts?.map((p: any) => p.text).join('') || '';
            // Strip tags
            if (text.includes('<background_reference_notes>')) {
                text = text.replace(/<background_reference_notes>[\s\S]*?<\/background_reference_notes>/g, '');
                text = text.replace(/\[SYSTEM NOTE:.*?source of truth\.\]/s, '');
            }
            if (!text.trim()) return null;
            return `[${role}]: ${text}`;
        }).filter(Boolean).join('\n');

        const dataContext = `
=== CURRENT PROFILE ===
${currentMemoryBox}

=== CONVERSATION HISTORY ===
${fullHistory}
`;

        const taskInstruction = `
=== UPDATE REQUEST ===
Current Time: ${new Date().toLocaleString()}
Instruction: "${instruction}"
`;

        const systemInstructionText = `
=== IDENTITY ===
You are the "Profile Manager". You manage the User Profile JSON.
You DO NOT rewrite creatively. You are a State Manager.

=== OBJECTIVE ===
Analyze the "UPDATE REQUEST".
Determine the necessary atomic changes to the Profile.
Use the \`update_user_profile_structure\` tool to Apply changes.
`;

        const contents: Content[] = [
            ...UNRESTRICTED_PRIMING_HISTORY,
            {
                role: 'user',
                parts: [{ text: `Here is the data context:\n${dataContext}` }]
            },
            {
                role: 'model',
                parts: [{ text: "Data context received. I am ready to modify the profile." }]
            },
            {
                role: 'user',
                parts: [{ text: taskInstruction }]
            }
        ];

        const config: any = {
            systemInstruction: { role: 'system', parts: [{ text: systemInstructionText }] },
            temperature: 0.1, 
            tools: [{ functionDeclarations: [getSurgicalMemoryTool()] }],
            toolConfig: { functionCallingConfig: { mode: 'ANY' } }, 
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ].map(s => ({ category: s.category, threshold: s.threshold }))
        };

        try {
            const ai = new GoogleGenAI({ apiKey: activeApiKey.value });
            
            logApiRequest({
                requestType: 'models.generateContent',
                payload: {
                    model: memoryModel,
                    contents: JSON.parse(JSON.stringify(contents)),
                    config: config as any
                },
                characterName: `Profile Manager (${memoryModel})`
            });

            const response = await ai.models.generateContent({
                model: memoryModel,
                contents: contents,
                config: config
            });

            const functionCalls = response.functionCalls;
            let changesMade = false;
            let resultMsg = "No changes applied.";

            if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                    if (call.name === 'update_user_profile_structure') {
                        const category = call.args['category'] as string;
                        const operation = call.args['operation'] as string;
                        const key = call.args['key'] as string;
                        const value = call.args['value'] as string;

                        logApiRequest({
                            requestType: 'tool.trace',
                            payload: { toolCall: call },
                            characterName: 'Profile Manager'
                        });

                        const opResult = await get().executeSurgicalUpdate(category, operation, key, value, relatedMessageId);
                        
                        logApiRequest({
                            requestType: 'tool.trace',
                            payload: { toolResult: { result: opResult.message } },
                            characterName: 'Profile Manager'
                        });

                        if (opResult.success) {
                            changesMade = true;
                            resultMsg = "Profile updated successfully.";
                        }
                    }
                }
            } else {
                console.log("[Profile Manager] No changes requested by model.");
            }

            if (!changesMade) {
                set({ isUpdatingMemory: false });
                return { success: false, message: "No changes applied." };
            }

            set({ isUpdatingMemory: false, lastUpdateTimestamp: new Date() });
            return { success: true, message: resultMsg };

        } catch (error: any) {
            console.error("Profile update failed:", error);
            set({ isUpdatingMemory: false });
            return { success: false, message: `Update failed: ${error.message}` };
        }
    },

    manualUpdateContent: async (newContent: string, source: 'direct_edit' | 'restore' = 'direct_edit', triggerText?: string, relatedMessageId?: string) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();

        if (!currentChatSession) return;

        // Create Snapshot
        const snapshot: MemorySnapshot = {
            id: `mem-snap-${Date.now()}`,
            timestamp: new Date(),
            content: newContent,
            source: source,
            triggerText: triggerText || (source === 'restore' ? "Restored from history" : "Direct Edit"),
            relatedMessageId: relatedMessageId
        };

        const newHistory = [snapshot, ...(currentChatSession.memoryHistory || [])];
        
        // Atomic Update: Set content AND anchor if provided
        const newSettings = { 
            ...currentChatSession.settings, 
            memoryBoxContent: newContent,
            ...(relatedMessageId ? { activeMemoryAnchorId: relatedMessageId } : {})
        };
        
        await updateCurrentChatSession(s => s ? ({ 
            ...s, 
            settings: newSettings,
            memoryHistory: newHistory
        }) : null);
        
        await dbService.addOrUpdateChatSession(useActiveChatStore.getState().currentChatSession!);
        
        set({ lastUpdateTimestamp: new Date() });
    },

    clearMemory: async () => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        
        if (!currentChatSession) return;

        // Reset to skeleton
        const newContent = JSON.stringify({ identity: {}, preferences: {}, beliefs: [], active_projects: [] }, null, 2);
        
        const snapshot: MemorySnapshot = {
            id: `mem-snap-${Date.now()}`,
            timestamp: new Date(),
            content: newContent,
            source: 'direct_edit',
            triggerText: "Profile Cleared"
        };

        const newHistory = [snapshot, ...(currentChatSession.memoryHistory || [])];
        const newSettings = { ...currentChatSession.settings, memoryBoxContent: newContent };
        
        await updateCurrentChatSession(s => s ? ({ 
            ...s, 
            settings: newSettings,
            memoryHistory: newHistory
        }) : null);
        
        await dbService.addOrUpdateChatSession(useActiveChatStore.getState().currentChatSession!);
        
        set({ lastUpdateTimestamp: new Date() });
    }
}));
