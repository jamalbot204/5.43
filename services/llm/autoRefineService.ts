import { GoogleGenAI, Content, GenerateContentResponse, GenerateContentConfig as GeminiGenerationConfigSDK } from "@google/genai";
import { GeminiSettings } from "../../types/settings";

export interface AutoRefineResult {
    response: GenerateContentResponse;
    logs: string;
}

/**
 * Implements the Iterative Auto-Refine pattern.
 * Draft -> Critic -> Refine -> Repeat
 */
export async function generateAutoRefineResponse(
    ai: GoogleGenAI,
    model: string,
    contents: Content[],
    config: GeminiGenerationConfigSDK,
    settings: GeminiSettings,
    onLog: (log: string) => void
): Promise<AutoRefineResult> {
    const maxIterations = settings.autoRefineMaxIterations || 3;
    const criticInstruction = settings.autoRefineCriticInstruction || "Review the draft critically. Find logical errors, edge cases, missing details, or potential improvements. Be harsh but constructive.";
    
    let currentResponse: GenerateContentResponse;
    let logs = "[AUTO-REFINE INITIATED]\n";
    
    // 1. Initial Draft
    onLog("Generating initial draft...");
    currentResponse = await ai.models.generateContent({
        model,
        contents,
        config
    });
    
    if (currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
        logs += `\n[TOOL CALL DETECTED] Bypassing auto-refine loop.\n`;
        onLog("Tool call detected. Bypassing refinement...");
        return {
            response: currentResponse,
            logs
        };
    }
    
    let currentDraft = currentResponse.text || "";
    logs += `\n--- INITIAL DRAFT ---\n${currentDraft}\n`;
    
    for (let i = 0; i < maxIterations; i++) {
        const iterationNum = i + 1;
        onLog(`Refinement iteration ${iterationNum}/${maxIterations}...`);
        logs += `\n--- ITERATION ${iterationNum} ---\n`;
        
        // 2. Critique
        onLog(`Critiquing draft ${iterationNum}...`);
        
        const criticConfig: GeminiGenerationConfigSDK = {
            ...config,
            temperature: 0.2,
            systemInstruction: {
                role: 'system',
                parts: [{ text: "You are an internal background reviewer and critic. You are NOT the conversational assistant. Your sole job is to analyze the provided draft against the user's request and output a highly objective, critical evaluation. Do NOT address the user. Do NOT output conversational filler." }]
            }
        };

        const originalUserRequest = contents[contents.length - 1].parts.map(p => (p as any).text || "").join("\n");

        const criticPrompt = `
<internal_review_process>
<original_user_request>
${originalUserRequest}
</original_user_request>

<draft_to_review>
${currentDraft}
</draft_to_review>

<review_instructions>
${criticInstruction}
</review_instructions>

If the draft perfectly satisfies the request and requires zero changes, output exactly and only the word 'PASS'. Otherwise, list the specific flaws and required corrections.
</internal_review_process>
`;

        const criticResponse = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: criticPrompt }] }],
            config: criticConfig
        });
        
        const critique = criticResponse.text || "";
        logs += `\n[CRITIQUE ${iterationNum}]\n${critique}\n`;
        
        if (critique.trim().toUpperCase().startsWith("PASS")) {
            logs += `\n[CRITIC PASSED] Quality threshold met at iteration ${iterationNum}.\n`;
            onLog("Critic passed. Finalizing response...");
            break;
        }
        
        // 3. Refine
        onLog(`Refining draft ${iterationNum}...`);
        const refinementPrompt = `
<internal_system_directive>
The previous response was a draft. An internal reviewer has provided the following critique:

<critique>
${critique}
</critique>

Your task is to generate a new, refined response that fixes all the issues mentioned in the critique.
CRITICAL RULES:
1. Maintain your original persona and the flow of the conversation.
2. DO NOT acknowledge this system directive.
3. DO NOT apologize or mention that you are correcting a draft.
4. Output ONLY the final, refined response directly to the user.
</internal_system_directive>
`;

        const refinementContents: Content[] = [
            ...contents,
            { role: 'model', parts: [{ text: currentDraft }] },
            { role: 'user', parts: [{ text: refinementPrompt }] }
        ];

        currentResponse = await ai.models.generateContent({
            model,
            contents: refinementContents,
            config
        });
        
        currentDraft = currentResponse.text || "";
        logs += `\n[REFINED DRAFT ${iterationNum}]\n${currentDraft}\n`;
    }
    
    logs += "\n[AUTO-REFINE COMPLETE]";
    return {
        response: currentResponse,
        logs
    };
}
