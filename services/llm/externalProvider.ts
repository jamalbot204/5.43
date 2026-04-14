import { Content, GenerateContentResponse } from '@google/genai';

export async function generateExternalResponse(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  contents: Content[],
  config: any,
  onStreamUpdate?: (text: string) => void
): Promise<GenerateContentResponse> {
  const messages: any[] = [];

  if (config?.systemInstruction) {
    let systemContent = '';
    if (typeof config.systemInstruction === 'string') {
      systemContent = config.systemInstruction;
    } else if (config.systemInstruction.parts) {
      systemContent = config.systemInstruction.parts.map((p: any) => p.text || '').join('');
    }
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }
  }

  for (const content of contents) {
    const role = content.role === 'user' ? 'user' : 'assistant';
    const text = content.parts?.map(p => p.text || '').join('') || '';
    if (text) {
      messages.push({ role, content: text });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    model: modelId,
    messages,
    temperature: config?.temperature ?? 0.7,
    top_p: config?.topP ?? 1.0,
    stream: !!onStreamUpdate,
  });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`External API Error (${response.status}): ${errorText}`);
  }

  if (onStreamUpdate) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                accumulatedText += delta;
                onStreamUpdate(accumulatedText);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    }

    return {
      text: accumulatedText,
      candidates: [{
        content: { parts: [{ text: accumulatedText }], role: 'model' },
        finishReason: 'STOP',
      }],
    } as any;
  } else {
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      text,
      candidates: [{
        content: { parts: [{ text }], role: 'model' },
        finishReason: 'STOP',
      }],
    } as any;
  }
}
