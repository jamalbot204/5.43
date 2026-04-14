
import { Content, GenerationConfig as GeminiGenerationConfigSDK, SafetySetting as GeminiSafetySettingFromSDK, GenerateContentResponse } from "@google/genai";
import { ChatMessage, ChatMessageRole, GeminiSettings, GeminiHistoryEntry, LogApiRequestCallback, LoggedGeminiGenerationConfig, HarmCategory, HarmBlockThreshold } from '../../types.ts';
import { createAiInstance } from './config.ts';
import { formatGeminiError } from './utils.ts';
import * as memoryService from '../memoryService.ts';
import { getMemoryToolDefinition, sanitizeToolName } from '../tools/memoryTool.ts';
import { UNRESTRICTED_PRIMING_HISTORY } from '../unrestrictedScenario.ts';
import { DEFAULT_AGENT_SYSTEM_INSTRUCTION, MODELS_SENDING_THINKING_LEVEL_API, MODELS_SENDING_THINKING_CONFIG_API, MEMORY_STRATEGIES } from '../../constants.ts';
import { useDataStore } from '../../store/useDataStore.ts';

export async function executeAgenticStep(
    apiKey: string,
    modelId: string,
    history: ChatMessage[],
    stepInstruction: string,
    userOriginalPrompt: string,
    previousThoughtsContext: string,
    settings: GeminiSettings,
    logApiRequest?: LogApiRequestCallback
): Promise<string> {
    const ai = createAiInstance(apiKey);
    
    // --- 1. TRANSCRIPT GENERATION (NARRATIVE FRAMING) ---
    const contextUserName = settings.contextUserName || "User";
    let transcriptText = "";
    
    const maxMessages = settings.contextWindowMessages;
    let eligibleMessages = history.filter(
        msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL
    );
    if (typeof maxMessages === 'number' && maxMessages > 0 && eligibleMessages.length > maxMessages) {
        eligibleMessages = eligibleMessages.slice(-maxMessages);
    }

    eligibleMessages.forEach(msg => {
        let label = "";
        if (msg.role === ChatMessageRole.USER) {
            label = contextUserName;
        } else {
            label = msg.characterName || "AI";
        }
        
        let content = msg.content;
        if (msg.attachments && msg.attachments.length > 0) {
            const attNames = msg.attachments.map(a => a.name).join(', ');
            content += `\n[System Note: ${label} attached: ${attNames}]`;
        }
        
        transcriptText += `[${label}]: ${content}\n\n`;
    });

    // --- 2. SYSTEM INSTRUCTION ---
    let augmentedSystemInstruction = settings.agentSystemInstruction || DEFAULT_AGENT_SYSTEM_INSTRUCTION;

    if (settings.useGoogleSearch) {
        const searchProtocol = `\n\nSEARCH MODE ACTIVATED - DEEP RESEARCH PROTOCOL (This must ALWAYS be applied whenever the Google Search tool is available):

You are a professional researcher using the Google Search tool for comprehensive, real-time verification.

MANDATORY STEPS - Follow them in exact order:

1. Before answering ANY factual, recent, or data-related question: Create a detailed research plan (think step by step and write it down).

2. Generate 5-8 diverse, high-quality search queries:
   - Main keywords + synonyms
   - Long-tail questions
   - Recent date filters (2025 OR 2026)
   - Authoritative sites (site:gov OR site:edu OR site:news OR site:co OR site:io)

3. You MUST call the google_search tool MULTIPLE TIMES (at least 4-6 calls, using parallel calls when possible) BEFORE producing any final answer.

4. After each tool response, update your research plan and cross-verify information across sources.

5. Only after full verification:
   - Summarize findings from each source
   - Cite at least 4-6 reliable sources with direct links
   - Use inline citations (e.g., [Source 1])
   - Clearly label information as “confirmed”, “probable”, or “according to latest data”

6. Do NOT give a final answer until you have called the search tool enough times and verified everything. If you need more information, call the tool again.

7. Maintain your current personality and style, but accuracy, up-to-dateness, and thoroughness are your absolute #1 priority.`;
        augmentedSystemInstruction += searchProtocol;
    }

    // --- 3. CONTENTS CONSTRUCTION ---
    const finalStepPrompt = `
<analysis_request>
  <context_from_previous_steps>
${previousThoughtsContext || "No previous steps."}
  </context_from_previous_steps>

  <original_user_request>
${userOriginalPrompt}
  </original_user_request>

  <current_task_instruction>
${stepInstruction}
  </current_task_instruction>
</analysis_request>
    `;

    const contents: Content[] = [
        ...UNRESTRICTED_PRIMING_HISTORY,
        { 
            role: 'user', 
            parts: [{ text: `Here is the raw transcript data for analysis:\n${transcriptText}` }] 
        },
        {
            role: 'model',
            parts: [{ text: "ok i read this whole text and i am ready to your ask" }]
        },
        {
            role: 'user',
            parts: [{ text: finalStepPrompt }]
        },
        {
            role: 'model',
            parts: [{ text: "ok i understand your ask perfect do you want me to start doning it now" }]
        },
        {
            role: 'user',
            parts: [{ text: "yes start doing the ask" }]
        }
    ];

    const config: any = {
        systemInstruction: { role: 'system', parts: [{ text: augmentedSystemInstruction }] },
        temperature: settings.temperature ?? 0.7,
        topP: settings.topP ?? 0.95,
        topK: settings.topK ?? 64,
    };

    // Tools
    let activeMemoryToolName: string | undefined = undefined;
    const tools = [];
    if (settings.useGoogleSearch) tools.push({ googleSearch: {} });
    if (settings.enableLongTermMemory) {
        // Resolve Strategy
        const strategyKey = settings.memoryQueryStrategy || 'companion';
        const { customMemoryStrategies } = useDataStore.getState();
        let strategy = MEMORY_STRATEGIES[strategyKey];
        if (!strategy) {
            const custom = customMemoryStrategies.find(s => s.id === strategyKey);
            if (custom) strategy = custom;
            else strategy = MEMORY_STRATEGIES['companion'];
        }
        
        activeMemoryToolName = sanitizeToolName(strategy.label);
        tools.push({ functionDeclarations: [getMemoryToolDefinition(activeMemoryToolName, strategy.systemMandate)] });
    }
    if (tools.length > 0) config.tools = tools;

    // Safety
    config.safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ].map(s => ({ category: s.category, threshold: s.threshold }));

    if (logApiRequest) {
        const frozenContents = JSON.parse(JSON.stringify(contents));
        logApiRequest({
            requestType: 'models.generateContent',
            payload: {
                model: modelId,
                contents: frozenContents,
                config: config as Partial<LoggedGeminiGenerationConfig>,
                apiKeyUsed: `...${apiKey.slice(-4)}`
            },
            characterName: "Agent (Reasoning Step)"
        });
    }

    try {
        let response = await ai.models.generateContent({
            model: modelId,
            contents: contents,
            config: config as GeminiGenerationConfigSDK
        });

        // Tool Loop
        let loopCount = 0;
        const MAX_TOOL_LOOPS = 5;

        while (response.functionCalls && response.functionCalls.length > 0 && loopCount < MAX_TOOL_LOOPS) {
            loopCount++;
            const functionResponses = [];
            for (const call of response.functionCalls) {
                if (call.name === 'search_ideal_companion_responses' || (activeMemoryToolName && call.name === activeMemoryToolName)) {
                    const query = call.args['query'] as string;
                    const result = await memoryService.searchMemory(apiKey, query, settings.memorySourceChatIds, settings.memoryMaxResults, settings.memoryMinRelevance);
                    functionResponses.push({
                        id: call.id,
                        name: call.name,
                        response: { result: result }
                    });
                }
            }

            if (functionResponses.length > 0) {
                const modelTurnContent = response.candidates?.[0]?.content;
                if (modelTurnContent) contents.push(modelTurnContent);
                else contents.push({ role: 'model', parts: response.functionCalls.map(fc => ({ functionCall: fc })) });

                contents.push({ role: 'tool', parts: functionResponses.map(fr => ({ functionResponse: fr })) });
                
                if (logApiRequest) {
                    const frozenContents = JSON.parse(JSON.stringify(contents));
                    logApiRequest({
                       requestType: 'models.generateContent',
                       payload: { contents: frozenContents, config: config as any },
                       characterName: "Agent (Reasoning Tool Response)"
                    });
                }

                response = await ai.models.generateContent({
                    model: modelId,
                    contents: contents,
                    config: config as GeminiGenerationConfigSDK
                });
            } else {
                break;
            }
        }

        return response.text || "";
    } catch (e: any) {
        console.error("Error in agentic step:", e);
        return `[Error in step execution: ${e.message}]`;
    }
}

export async function generateMimicUserResponse(
    apiKey: string,
    modelId: string,
    standardChatHistory: GeminiHistoryEntry[], 
    userPersonaInstructionText: string, 
    baseSettings: GeminiSettings,
    logApiRequestCallback: LogApiRequestCallback, 
    signal?: AbortSignal,
    settingsOverride?: Partial<GeminiSettings> 
): Promise<string> {
    if (!apiKey) throw new Error("API Key is not configured. Please add a key in Settings.");
    const ai = createAiInstance(apiKey);

    if (signal?.aborted) {
        throw new Error("Request aborted by user before sending.");
    }
    
    const combinedSettings = { ...baseSettings, ...settingsOverride }; 
    
    const safetySettingsForSDK: GeminiSafetySettingFromSDK[] | undefined = combinedSettings.safetySettings
        ? combinedSettings.safetySettings.map(s => ({
            category: s.category,
            threshold: s.threshold,
          }))
        : undefined;

    const generationConfigForCall: any = {}; 
    if (combinedSettings.temperature !== undefined) generationConfigForCall.temperature = combinedSettings.temperature;
    if (combinedSettings.topP !== undefined) generationConfigForCall.topP = combinedSettings.topP;
    if (combinedSettings.topK !== undefined) generationConfigForCall.topK = combinedSettings.topK;
    
    if (userPersonaInstructionText) {
        generationConfigForCall.systemInstruction = { role: "system", parts: [{text: userPersonaInstructionText }] };
    }
    if (safetySettingsForSDK) {
        generationConfigForCall.safetySettings = safetySettingsForSDK;
    }

    if (MODELS_SENDING_THINKING_LEVEL_API.includes(modelId)) {
        const level = combinedSettings.thinkingLevel ? combinedSettings.thinkingLevel.toUpperCase() : 'HIGH';
        generationConfigForCall.thinkingConfig = { thinkingLevel: level };
    } else if (MODELS_SENDING_THINKING_CONFIG_API.includes(modelId) && combinedSettings.thinkingBudget !== undefined) {
        generationConfigForCall.thinkingConfig = { thinkingBudget: combinedSettings.thinkingBudget };
    }

    const requestContents: Content[] = standardChatHistory.map(entry => ({
        role: entry.role,
        parts: entry.parts
    }));
    const requestPayloadForGenerateContent: any = {
        model: modelId,
        contents: requestContents,
        config: generationConfigForCall as Partial<LoggedGeminiGenerationConfig>,
        apiKeyUsed: `...${apiKey.slice(-4)}`
    };
    
    try {
        if (combinedSettings.debugApiRequests) {
           const logPayload = JSON.parse(JSON.stringify(requestPayloadForGenerateContent));
           logApiRequestCallback({
                requestType: 'models.generateContent',
                payload: logPayload,
                characterName: (combinedSettings as any)._characterNameForLog || "[User Mimic Instruction Active]"
           });
        }

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelId,
            contents: requestContents, 
            config: generationConfigForCall as GeminiGenerationConfigSDK, 
        });
        
        if (signal?.aborted) {
             throw new Error("Request aborted during generation.");
        }
        return response.text ?? ""; 
    } catch (error: any) {
        if (signal?.aborted) {
            throw error; 
        }
        console.error("Error in generateMimicUserResponse:", error, { originalError: error });
        const formattedError = formatGeminiError(error, requestPayloadForGenerateContent);
        throw new Error(formattedError);
    }
}
