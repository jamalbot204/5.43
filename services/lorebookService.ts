import { LorebookEntry } from '../types/settings';

export function extractLorebookContext(recentText: string, entries: LorebookEntry[]): string | null {
    if (!entries || entries.length === 0 || !recentText) {
        return null;
    }

    const matchedContexts = new Set<string>();
    
    // Flatten triggers
    const flattenedTriggers: { key: string; context: string }[] = [];
    for (const entry of entries) {
        if (!entry.keys || !entry.context) continue;
        for (const key of entry.keys) {
            const trimmedKey = key.trim();
            if (trimmedKey) {
                flattenedTriggers.push({ key: trimmedKey, context: entry.context });
            }
        }
    }

    // Sort by key length descending
    flattenedTriggers.sort((a, b) => b.key.length - a.key.length);

    for (const trigger of flattenedTriggers) {
        if (matchedContexts.size >= 5) {
            break; // Hard limit
        }

        const escapedKey = trigger.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexibleKey = escapedKey.replace(/\\s+/g, '[\\s\\p{P}]+');
        const regex = new RegExp('(^|[^\\p{L}\\p{N}])(' + flexibleKey + ')([^\\p{L}\\p{N}]|$)', 'iu');

        if (regex.test(recentText)) {
            matchedContexts.add(trigger.context);
        }
    }

    if (matchedContexts.size === 0) {
        return null;
    }

    return `[[SYSTEM_LAYER: LOREBOOK_CONTEXT_INJECTION]]
SOURCE: Dynamic Entity Extractor
TARGET: Response Generation Model (You)
STATUS: ENTITIES_DETECTED

=== BEGIN LOREBOOK ENTRIES ===
${Array.from(matchedContexts).join('\n\n')}
=== END LOREBOOK ENTRIES ===
[SYSTEM: INJECTION COMPLETE. INCOMING USER PROMPT DETECTED...]`;
}
