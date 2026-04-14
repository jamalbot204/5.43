
import { useGlobalUiStore } from '../../store/useGlobalUiStore.ts';
import { translations } from '../../translations.ts';
import { ApiRequestPayload, MessageErrorType } from '../../types.ts';

export function formatGeminiError(error: any, requestPayloadForContext?: ApiRequestPayload): string {
  // RAW ERROR PASSTHROUGH
  // We bypass the translation/classification for the text message itself to show the exact server response.
  
  if (error?.message) {
      return error.message;
  }
  
  if (typeof error === 'string') {
      return error;
  }
  
  try {
      return JSON.stringify(error, null, 2);
  } catch (e) {
      return "Unknown Error (Could not stringify)";
  }
}

/**
 * Smart Error Classifier
 * Distinguishes between Quota, Geo/Network, Safety, Attachments, and Generic errors.
 * Used for UI logic (colors, refresh buttons) but NOT for the text message anymore.
 */
export function classifyGeminiError(error: any): MessageErrorType {
    const msg = (error.message || "").toLowerCase();
    const status = error.httpStatus || (error.response ? error.response.status : undefined);

    // 1. Quota (Highest Priority)
    if (status === 429 || msg.includes("quota") || msg.includes("resource exhausted") || msg.includes("limit")) {
        return 'quota';
    }

    // 2. Geo / Network
    if (msg.includes("location") || msg.includes("region") || msg.includes("country") || msg.includes("not supported for the api use")) {
        return 'network';
    }
    if (!status || msg.includes("fetch failed") || msg.includes("network") || msg.includes("connection refused") || msg.includes("failed to connect")) {
        return 'network';
    }

    // 3. Safety / Policy
    if (msg.includes("safety") || msg.includes("blocked") || msg.includes("harm")) {
        return 'policy';
    }

    // 4. Attachments (Link Expired)
    if (status === 404 || msg.includes("upload failed") || msg.includes("mime type")) {
        return 'link_expired';
    }
    // Specific check for permission denied related to files
    if (msg.includes("permission denied") && (msg.includes("file") || msg.includes("image") || msg.includes("attachment") || msg.includes("uri") || msg.includes("resource"))) {
        return 'link_expired';
    }

    // 5. Generic / Auth (Default)
    // Note: Plain "permission denied" (403) without file keywords often means API key issues or generic auth failures, 
    // which we treat as generic/raw for transparency as requested.
    return 'generic';
}

export function clearCachedChat(_sessionId: string, _model: string, _settings: any): void {
  // No-op
}

/**
 * Robustly parses the output from Shadow Mode to separate "Thoughts" from "Final Response".
 * Implements a Multi-Pass Extraction Strategy.
 */
export function parseShadowOutput(rawText: string): { finalResponse: string, thoughts: string } {
    if (!rawText) return { finalResponse: "", thoughts: "" };

    // Phase 1: Standard & Flexible Tags (Both Opening and Closing)
    const completeTagRegex = /<\s*generated[_\-\s]+response\s*>([\s\S]*?)<\/\s*generated[_\-\s]+response\s*>/i;
    const completeMatch = rawText.match(completeTagRegex);

    if (completeMatch) {
        const finalResponse = completeMatch[1].trim();
        const thoughts = rawText.replace(completeMatch[0], "").trim();
        return { finalResponse, thoughts };
    }

    // Phase 2: Missing Closing Tag (Opening Tag Only)
    const openTagRegex = /<\s*generated[_\-\s]+response\s*>([\s\S]*)/i;
    const openMatch = rawText.match(openTagRegex);

    if (openMatch) {
        const finalResponse = openMatch[1].trim();
        const thoughts = rawText.substring(0, openMatch.index).trim();
        return { finalResponse, thoughts };
    }

    // Phase 3: Fallback Text Indicators
    const fallbackMarkers = [
        /final\s+response\s*:/i,
        /^response\s*:/im,
        /---\s*response\s*---/i,
        /\*\*response\*\*:/i
    ];

    for (const marker of fallbackMarkers) {
        const markerMatch = rawText.match(marker);
        if (markerMatch && markerMatch.index !== undefined) {
            const thoughts = rawText.substring(0, markerMatch.index).trim();
            const finalResponse = rawText.substring(markerMatch.index + markerMatch[0].length).trim();
            if (finalResponse.length > 0) {
                return { finalResponse, thoughts };
            }
        }
    }

    // Phase 4: Ultimate Fallback
    return { finalResponse: rawText.trim(), thoughts: "" };
}

/**
 * Extracts custom thought tags from the text and returns the cleaned text and extracted thoughts.
 * Handles multiple occurrences of tags and is tolerant of whitespace/formatting variations.
 */
export function extractThoughtsByTag(fullText: string, tagName: string): { cleanText: string; extractedThoughts: string } {
    if (!tagName || !fullText) return { cleanText: fullText, extractedThoughts: "" };

    const closedRegex = new RegExp(`<\\s*${tagName}(?:s)?\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*${tagName}(?:s)?\\s*>`, 'gi');
    
    let extractedThoughts = "";
    
    let cleanText = fullText.replace(closedRegex, (match, group1) => {
        extractedThoughts += (extractedThoughts ? "\n\n" : "") + group1.trim();
        return ""; 
    });

    // Check for unclosed tags at the end of the text (for streaming)
    const unclosedRegex = new RegExp(`<\\s*${tagName}(?:s)?\\b[^>]*>([\\s\\S]*)$`, 'i');
    const unclosedMatch = cleanText.match(unclosedRegex);
    if (unclosedMatch) {
        extractedThoughts += (extractedThoughts ? "\n\n" : "") + unclosedMatch[1].trim();
        cleanText = cleanText.replace(unclosedRegex, "");
    }

    return { cleanText: cleanText.trim(), extractedThoughts };
}
