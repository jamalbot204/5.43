
import { Part } from "@google/genai";
import { ChatMessage, ChatMessageRole, GeminiSettings, GeminiHistoryEntry, AICharacter } from '../../types.ts';

function sanitizeThoughtsForApi(thoughts?: string): string {
    if (!thoughts) return "";
    let clean = thoughts;
    const traceIndex = clean.indexOf('### 🧠 Enhanced Thinking Trace');
    if (traceIndex !== -1) clean = clean.substring(0, traceIndex);
    const fusionIndex = clean.indexOf('### 🧬 Enhanced Thinking');
    if (fusionIndex !== -1) clean = clean.substring(0, fusionIndex);
    return clean.trim();
}

export function mapMessagesToGeminiHistoryInternal(
  messages: ChatMessage[],
  settings?: GeminiSettings
): GeminiHistoryEntry[] {
  // CHANGED: Removed `&& !msg.hasMemoryUpdate` to preserve continuity of model responses that triggered updates.
  let eligibleMessages = messages.filter(
    msg => (msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)
  );

  const maxMessages = settings?.contextWindowMessages;

  if (typeof maxMessages === 'number' && maxMessages > 0 && eligibleMessages.length > maxMessages) {
    eligibleMessages = eligibleMessages.slice(-maxMessages);
  }

  return eligibleMessages.map(msg => {
    const parts: Part[] = [];
    // We strictly use the content as is, no more injected timestamps.
    let baseContent = msg.content;
    
    // Check if Python Execution History should be injected into the context for memory
    if (settings?.includePythonHistory && msg.toolInvocations && msg.toolInvocations.length > 0) {
        const pythonInvocations = msg.toolInvocations.filter(inv => inv.toolName === 'execute_python');
        if (pythonInvocations.length > 0) {
            const historyBlock = pythonInvocations.map(inv => {
                return `[SYSTEM: EXECUTED PYTHON CODE]\nCode:\n${inv.args.code}\nResult:\n${inv.result}`;
            }).join('\n\n');
            
            // Append execution history to the content string sent to the model
            baseContent = baseContent ? `${baseContent}\n\n${historyBlock}` : historyBlock;
        }
    }
    
    if (msg.role === ChatMessageRole.MODEL && msg.thoughts && settings?.includeThoughtsInHistory !== false) {
        const sanitizedThoughts = sanitizeThoughtsForApi(msg.thoughts);
        if (sanitizedThoughts) {
            parts.push({ text: sanitizedThoughts, thought: true } as any);
        }
    }

    if (baseContent.trim() || msg.isGithubContextMessage) {
      parts.push({ text: baseContent });
    }
    
    // STRICT CLOUD-ONLY IMPLEMENTATION (Relaxed Validation)
    if (msg.attachments) {
      msg.attachments.forEach(att => {
        // We prioritize sending the URI if it exists, regardless of local state tracking.
        // If the link is expired or invalid, the Gemini Server will return an error (e.g. 403/404),
        // which the UI handles by showing the "Refresh Attachments" button.
        if (att.fileUri) {
          parts.push({
            fileData: {
              mimeType: att.mimeType,
              fileUri: att.fileUri,
            }
          });
        } else if (att.base64Data) {
          // Fallback to inlineData if fileUri is not yet available (e.g., still uploading)
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            }
          } as any);
        }
      });
    }
    
    if (parts.length === 0 && (msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)) { 
      parts.push({ text: "" }); 
    }
    
    return {
      role: msg.role as 'user' | 'model',
      parts: parts,
    };
  });
}

export function mapMessagesToFlippedRoleGeminiHistory(
    messages: ChatMessage[],
    settings?: GeminiSettings
): GeminiHistoryEntry[] {
    const history = mapMessagesToGeminiHistoryInternal(messages, settings);
    return history.map(entry => {
        const filteredParts = entry.parts.filter(part => !(part as any).thought);
        // Gemini API crashes if parts array is empty. Provide a fallback empty text part if needed.
        if (filteredParts.length === 0) {
            filteredParts.push({ text: "" });
        }
        return {
            role: entry.role === 'user' ? 'model' : 'user',
            parts: filteredParts
        };
    });
}

export function mapMessagesToCharacterPerspectiveHistory(
    messages: ChatMessage[],
    characterId: string,
    allCharacters: AICharacter[],
    settings: GeminiSettings
): GeminiHistoryEntry[] {
    // CHANGED: Removed `&& !m.hasMemoryUpdate` to consistency.
    const validMessages = messages.filter(m => (m.role === ChatMessageRole.USER || m.role === ChatMessageRole.MODEL));
    const contextWindow = settings.contextWindowMessages;
    const msgsToMap = (contextWindow && contextWindow > 0) ? validMessages.slice(-contextWindow) : validMessages;

    const history: GeminiHistoryEntry[] = [];
    const targetChar = allCharacters.find(c => c.id === characterId);

    msgsToMap.forEach(msg => {
        const parts: Part[] = [];
        let mappedRole: 'user' | 'model' = 'user';
        if (msg.role === ChatMessageRole.MODEL && targetChar && msg.characterName === targetChar.name) {
            mappedRole = 'model';
        }

        if (mappedRole === 'model' && msg.thoughts && settings?.includeThoughtsInHistory !== false) {
            const sanitizedThoughts = sanitizeThoughtsForApi(msg.thoughts);
            if (sanitizedThoughts) {
                parts.push({ text: sanitizedThoughts, thought: true } as any);
            }
        }

        let content = msg.content;

        if (content) {
            if (msg.role === ChatMessageRole.MODEL) {
                if (msg.characterName) {
                    if (targetChar && msg.characterName === targetChar.name) {
                        // This matches the character perspective we are generating for.
                    } else {
                        // Another character speaking. Maps to 'user' role with name prefix.
                        content = `${msg.characterName}: ${content}`;
                    }
                } else {
                    // Generic AI message. Maps to 'user' role with name prefix.
                    content = `Assistant: ${content}`;
                }
            } else {
                // User message. Maps to 'user' role with name prefix.
                content = `User: ${content}`;
            }
            parts.push({ text: content });
        }

        // STRICT CLOUD-ONLY IMPLEMENTATION (Relaxed Validation)
        if (msg.attachments) {
            msg.attachments.forEach(att => {
                if (att.fileUri) {
                    parts.push({ fileData: { mimeType: att.mimeType, fileUri: att.fileUri } });
                }
            });
        }

        if (parts.length > 0) {
            history.push({ role: mappedRole, parts });
        }
    });

    return history;
}
