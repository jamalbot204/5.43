
import { GoogleGenAI, Content, GenerateContentResponse } from "@google/genai";
import { ChatMessage, ChatMessageRole, HarmCategory, HarmBlockThreshold, LogApiRequestCallback, LoggedGeminiGenerationConfig, GeminiSettings } from '../types.ts';
import { UNRESTRICTED_PRIMING_HISTORY } from './unrestrictedScenario.ts';
import { getMemoryToolDefinition, sanitizeToolName } from './tools/memoryTool.ts';
import { getSurgicalMemoryTool } from './tools/memoryBoxTool.ts';
import * as memoryService from './memoryService.ts';
import { useMemoryStore } from '../store/useMemoryStore.ts';
import { useDataStore } from '../store/useDataStore.ts';
import { MODELS_SENDING_THINKING_CONFIG_API, MODELS_SENDING_THINKING_LEVEL_API, MEMORY_STRATEGIES, MEMORY_SURGEON_SYSTEM_PROMPT } from '../constants.ts';
import { parseShadowOutput } from './llm/utils.ts';

const aiInstancesCache = new Map<string, GoogleGenAI>();

function createAiInstance(apiKey: string): GoogleGenAI {
    if (aiInstancesCache.has(apiKey)) {
        return aiInstancesCache.get(apiKey)!;
    }
    const newInstance = new GoogleGenAI({ apiKey });
    aiInstancesCache.set(apiKey, newInstance);
    return newInstance;
}

export function buildShadowTranscript(
    historyMessages: ChatMessage[],
    lastUserText: string,
    settings: GeminiSettings
): string {
    let transcriptText = "";
    
    const eligibleMessages = historyMessages.filter(
        msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL
    );

    let userMsgCount = 0;
    let aiMsgCount = 0;

    const transcriptUserName = settings.shadowTranscriptUserName || "User";
    const transcriptAiName = settings.shadowTranscriptAiName || "AI";

    eligibleMessages.forEach((msg, index) => {
        const isUser = msg.role === ChatMessageRole.USER;
        let label = "";
        let header = "";

        if (isUser) {
            userMsgCount++;
            label = `${transcriptUserName} #${userMsgCount}`;
        } else {
            aiMsgCount++;
            label = `${transcriptAiName} #${aiMsgCount}`;
        }

        if (index === eligibleMessages.length - 1) {
            const roleName = isUser ? transcriptUserName : transcriptAiName;
            const count = isUser ? userMsgCount : aiMsgCount;
            header = `\n=== LAST ${roleName.toUpperCase()} MESSAGE #${count} (HISTORY) ===\n`;
        }

        transcriptText += `${header}[${label}]: ${msg.content}\n\n`;
    });

    if (lastUserText) {
        userMsgCount++;
        const label = `${transcriptUserName} #${userMsgCount}`;
        const header = `\n=== LAST ${transcriptUserName.toUpperCase()} MESSAGE ===\n`;
        transcriptText += `${header}[${label}]: ${lastUserText}\n\n`;
    }

    let dataContextText = `Here is the conversation transcript with numbered turns:\n\n${transcriptText}`;

    if (settings.isMemoryBoxEnabled || settings.isMemoryReadOnly) {
        const currentMemory = settings.memoryBoxContent || "{}";
        dataContextText = `Here is the current User Profile (context) and conversation transcript:\n\n` +
                          `=== CURRENT USER PROFILE ===\n${currentMemory}\n\n` +
                          `=== CONVERSATION TRANSCRIPT ===\n${transcriptText}`;
    }

    return dataContextText;
}

export async function generateShadowResponse(
    apiKey: string,
    modelId: string,
    historyMessages: ChatMessage[],
    lastUserText: string,
    shadowPersona: string,
    shadowTaskInstruction: string,
    settings: GeminiSettings,
    logApiRequestCallback?: LogApiRequestCallback
): Promise<{ text: string, thoughts: string, hasMemoryUpdate: boolean }> {
    const ai = createAiInstance(apiKey);
    let hasMemoryUpdate = false;

    const dataContextText = buildShadowTranscript(historyMessages, lastUserText, settings);

    const transcriptUserName = settings.shadowTranscriptUserName || "User";

    const lastAiMessage = [...historyMessages].reverse().find(m => m.role === ChatMessageRole.MODEL);
    const lastAiTextContent = lastAiMessage ? lastAiMessage.content : "None";

    const shadowRequestPayload = `
=== CURRENT TASK ===
${shadowTaskInstruction}

=== INSTRUCTION ===
Read the above data. Respond to the LAST ${transcriptUserName} message found in the transcript (marked with === LAST ${transcriptUserName.toUpperCase()} MESSAGE ===), applying the persona (defined in system instructions) and task instructions.
${settings.isMemoryBoxEnabled ? "If the user's message implies a change in their permanent profile (Identity, Preferences, Beliefs), YOU MUST call the 'update_user_profile_structure' tool." : ""}
`;

    const contents: Content[] = [
        ...UNRESTRICTED_PRIMING_HISTORY,
        {
            role: 'user',
            parts: [{ text: dataContextText }]
        },
        {
            role: 'model',
            parts: [{ text: "Data context received. I have read and understood the numbered transcript. Ready for instructions." }]
        },
        {
            role: 'user',
            parts: [{ text: shadowRequestPayload }]
        },
        {
            role: 'model',
            parts: [{ text: `Understood. I will now generate the response based on the transcript, persona, and task.
I have read and located the last user message in this transcript which is: ${lastUserText}
and the last AI message: ${lastAiTextContent}
and I am ready to analyze this and apply your instructions and send the full steps step by step and give you the strict output you defined.` }]
        },
        {
            role: 'user',
            parts: [{ text: "Go." }]
        }
    ];

    let fullSystemInstruction = shadowPersona;
    if (settings.isMemoryBoxEnabled) {
        fullSystemInstruction += `\n\n${MEMORY_SURGEON_SYSTEM_PROMPT}`;
    }

    const config: any = {
        systemInstruction: { role: 'system', parts: [{ text: fullSystemInstruction }] },
        temperature: settings.temperature ?? 0.7,
        topP: settings.topP ?? 0.95,
        topK: settings.topK ?? 64,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ].map(s => ({ category: s.category, threshold: s.threshold }))
    };

    if (MODELS_SENDING_THINKING_LEVEL_API.includes(modelId)) {
         const level = settings.thinkingLevel ? settings.thinkingLevel.toUpperCase() : 'HIGH';
         config.thinkingConfig = { thinkingLevel: level };
         if (settings.showThinkingProcess) {
            config.thinkingConfig.includeThoughts = true;
         }
    } else if (MODELS_SENDING_THINKING_CONFIG_API.includes(modelId) && settings.thinkingBudget !== undefined) {
        config.thinkingConfig = { thinkingBudget: settings.thinkingBudget };
        if (settings.showThinkingProcess) {
            config.thinkingConfig.includeThoughts = true;
        }
    }

    let activeMemoryToolName: string | undefined = undefined;
    const tools = [];
    if (settings.enableLongTermMemory) {
        const strategyKey = settings.memoryQueryStrategy || 'companion';
        const { customMemoryStrategies } = useDataStore.getState();
        let strategy = MEMORY_STRATEGIES[strategyKey];
        if (!strategy) {
            const custom = customMemoryStrategies.find(s => s.id === strategyKey);
            if (custom) strategy = custom;
            else strategy = MEMORY_STRATEGIES['companion'];
        }
        activeMemoryToolName = sanitizeToolName(strategy.label);
        tools.push(getMemoryToolDefinition(activeMemoryToolName, strategy.systemMandate));
    }
    
    if (settings.isMemoryBoxEnabled) {
        // Use Surgical Tool
        tools.push(getSurgicalMemoryTool());
    }

    if (tools.length > 0) {
        config.tools = [{ functionDeclarations: tools }];
    }

    if (settings.forceToolAlways && config.tools && config.tools.length > 0) {
        config.toolConfig = {
            functionCallingConfig: {
                mode: 'ANY',
            },
        };
    }

    if (logApiRequestCallback) {
        const frozenContents = JSON.parse(JSON.stringify(contents));
        logApiRequestCallback({
            requestType: 'models.generateContent',
            payload: {
                model: modelId,
                contents: frozenContents,
                config: config as Partial<LoggedGeminiGenerationConfig>,
                apiKeyUsed: `...${apiKey.slice(-4)}`
            },
            characterName: "Shadow Mode (Direct Gen)"
        });
    }

    try {
        let response = await ai.models.generateContent({
            model: modelId,
            contents: contents,
            config: config
        });

        let loopCount = 0;
        const MAX_TOOL_LOOPS = 5;

        while (response.functionCalls && response.functionCalls.length > 0 && loopCount < MAX_TOOL_LOOPS) {
            loopCount++;
            const functionResponses = [];

            for (const call of response.functionCalls) {
                if (logApiRequestCallback) {
                    logApiRequestCallback({
                        requestType: 'tool.trace' as any,
                        payload: { toolCall: call },
                        characterName: `Shadow Model Request -> ${call.name}`
                    });
                }

                let result: any;
                if (call.name === 'search_ideal_companion_responses' || (activeMemoryToolName && call.name === activeMemoryToolName)) {
                    const query = call.args['query'] as string;
                    result = await memoryService.searchMemory(
                        apiKey,
                        query,
                        settings.memorySourceChatIds,
                        settings.memoryMaxResults,
                        settings.memoryMinRelevance
                    );
                    
                    functionResponses.push({
                        id: call.id,
                        name: call.name,
                        response: { result: result }
                    });
                } else if (call.name === 'update_user_profile_structure') { // Surgical Tool
                    const category = call.args['category'] as string;
                    const operation = call.args['operation'] as string;
                    const key = call.args['key'] as string;
                    const value = call.args['value'] as string;
                    
                    const memoryStore = useMemoryStore.getState();
                    // Execute surgical update directly
                    const updateResult = await memoryStore.executeSurgicalUpdate(category, operation, key, value);
                    result = updateResult.message;
                    if (updateResult.success) hasMemoryUpdate = true;
                    
                    functionResponses.push({
                        id: call.id,
                        name: call.name,
                        response: { result: result }
                    });
                }

                if (logApiRequestCallback) {
                    logApiRequestCallback({
                        requestType: 'tool.trace' as any,
                        payload: { toolResult: result },
                        characterName: `Shadow Tool Result <- ${call.name}`
                    });
                }
            }

            if (functionResponses.length > 0) {
                const modelTurnContent = response.candidates?.[0]?.content;
                if (modelTurnContent) {
                    contents.push(modelTurnContent);
                } else {
                    contents.push({ role: 'model', parts: response.functionCalls.map(fc => ({ functionCall: fc })) });
                }

                contents.push({ role: 'tool', parts: functionResponses.map(fr => ({ functionResponse: fr })) });

                if (logApiRequestCallback) {
                     const frozenContents = JSON.parse(JSON.stringify(contents));
                     logApiRequestCallback({
                        requestType: 'models.generateContent', 
                        payload: { contents: frozenContents, config: config as any },
                        characterName: "Shadow Mode (Tool Response)"
                     });
                }

                response = await ai.models.generateContent({
                    model: modelId,
                    contents: contents,
                    config: config
                });
            } else {
                break;
            }
        }

        const rawOutput = response.text || "";
        const { finalResponse, thoughts } = parseShadowOutput(rawOutput);
        
        return { text: finalResponse, thoughts, hasMemoryUpdate };
    } catch (e: any) {
        console.error("Shadow Mode Execution Failed:", e);
        throw new Error(`Shadow Mode Error: ${e.message}`);
    }
}
