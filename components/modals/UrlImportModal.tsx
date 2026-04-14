import React, { useState } from 'react';
import BaseModal from '../common/BaseModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Switch } from '../ui/Switch.tsx';
import { readWebpage, fetchRawHtml } from '../../services/webReaderService.ts';
import { sanitizeFilename } from '../../services/utils.ts';
import { useEditorUI } from '../../store/ui/useEditorUI.ts';
import { useGeminiApiStore } from '../../store/useGeminiApiStore.ts';
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { UNRESTRICTED_PRIMING_HISTORY } from '../../services/unrestrictedScenario.ts';
import { useApiKeyStore } from '../../store/useApiKeyStore.ts';

interface DiscoveredLink {
    url: string;
    linkText: string;
    selected: boolean;
}

export default function UrlImportModal() {
    const { isUrlImportModalOpen, closeUrlImportModal, urlImportOnAttach } = useEditorUI();
    const [url, setUrl] = useState('');
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [mainPage, setMainPage] = useState<{ title: string; content: string } | null>(null);
    const [discoveredLinks, setDiscoveredLinks] = useState<DiscoveredLink[]>([]);
    const [error, setError] = useState<string | null>(null);

    if (!isUrlImportModalOpen) return null;

    const handleAnalyze = async () => {
        if (!url.trim()) return;
        setError(null);
        setStep(2);

        const validUrl = url.startsWith('http') ? url : 'https://' + url;

        try {
            // Fetch Clean Markdown (for the file) AND Raw HTML (for the LLM) concurrently
            const [cleanWebData, rawHtml] = await Promise.all([
                readWebpage(validUrl),
                fetchRawHtml(validUrl).catch(e => { console.warn("Raw HTML fetch failed, falling back to markdown", e); return null; })
            ]);

            setMainPage({ title: cleanWebData.title, content: cleanWebData.content });

            // Log the Raw HTML to the internal Debug Terminal
            const { logApiRequest } = useGeminiApiStore.getState();
            const contentToAnalyze = rawHtml || cleanWebData.content;
            
            logApiRequest({
                requestType: 'tool.trace' as any,
                payload: { toolCall: { name: 'fetchRawHtml', args: { url: validUrl } }, toolResult: { html_snippet: contentToAnalyze } },
                characterName: 'Raw HTML Fetcher'
            });

            const apiKey = useApiKeyStore.getState().activeApiKey?.value;
            const links: DiscoveredLink[] = [];
            const seenUrls = new Set<string>();

            if (apiKey) {
                try {
                    const ai = new GoogleGenAI({ apiKey });
                    const contents = [
                        ...UNRESTRICTED_PRIMING_HISTORY,
                        { role: 'user', parts:[{ text: `Here is the RAW HTML of the webpage (${validUrl}):\n\n${contentToAnalyze}` }] },
                        { role: 'model', parts: [{ text: "Raw HTML received. I am ready to extract pagination links." }] },
                        { role: 'user', parts:[{ text: "CRITICAL EXTRACTION TASK: Find all links (href attributes) in the HTML that point to the NEXT parts, chapters, or pages of this specific article/story. Ignore external links, ads, or unrelated articles. Return the result STRICTLY as a JSON array of objects with 'url' (the exact raw href) and 'title' (the link text) properties. If no continuation links exist, return an empty array []." }] }
                    ];

                    console.log('[UrlImportModal] Sending payload to Gemini 2.5 Flash...', { model: 'gemini-2.5-flash', contentsLength: contents.length });

                    const response = await ai.models.generateContent({
                        model: 'gemma-4-31b-it',
                        contents: contents as any,
                        config: {
                            temperature: 0.1,
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        url: { type: Type.STRING },
                                        title: { type: Type.STRING }
                                    },
                                    required: ["url", "title"]
                                }
                            },
                            safetySettings: [
                                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                            ]
                        }
                    });

                    const jsonText = response.text;
                    console.log('[UrlImportModal] Raw Gemini Response:', jsonText);
                    
                    if (jsonText) {
                        const rawText = jsonText || "[]";
                        const cleanJsonText = rawText.replace(/```json\s*|\s*```/g, '').trim();
                        console.log('[UrlImportModal] Cleaned JSON Text:', cleanJsonText);
                        const parsedLinks = JSON.parse(cleanJsonText);
                        console.log('[UrlImportModal] Parsed Links Array:', parsedLinks);
                        
                        if (Array.isArray(parsedLinks)) {
                            for (const link of parsedLinks) {
                                if (!link.url || !link.title) continue;
                                let absoluteUrl;
                                try {
                                    absoluteUrl = new URL(link.url, validUrl).href;
                                } catch {
                                    continue;
                                }

                                const isSameHost = new URL(absoluteUrl).hostname.replace(/^www\./, '') === new URL(validUrl).hostname.replace(/^www\./, '');

                                if (isSameHost && !seenUrls.has(absoluteUrl)) {
                                    seenUrls.add(absoluteUrl);
                                    links.push({ url: absoluteUrl, linkText: link.title, selected: true });
                                }
                            }
                        }
                    }
                    console.log('[UrlImportModal] Final Filtered Links:', links);
                } catch (llmErr) {
                    console.error('[UrlImportModal] LLM Extraction Failed:', llmErr);
                }
            }

            setDiscoveredLinks(links);
            setStep(3);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch the URL.');
            setStep(1);
        }
    };

    const handleImport = async () => {
        if (!mainPage || !urlImportOnAttach) return;
        setStep(4);

        const selectedLinks = discoveredLinks.filter(l => l.selected);
        const fetchPromises = selectedLinks.map(link => 
            readWebpage(link.url).catch(e => null)
        );

        const subPages = await Promise.all(fetchPromises);
        const validSubPages = subPages.filter(p => p !== null) as { title: string; content: string }[];

        const dt = new DataTransfer();
        
        dt.items.add(new File([mainPage.content], sanitizeFilename(mainPage.title || 'Main Page', 40) + '.txt', { type: 'text/plain' }));
        
        validSubPages.forEach((subPage, index) => {
            dt.items.add(new File([subPage.content], sanitizeFilename(subPage.title || 'Page', 30) + '_' + (index + 1) + '.txt', { type: 'text/plain' }));
        });

        urlImportOnAttach(dt.files);
        closeUrlImportModal();
    };

    const toggleLink = (index: number) => {
        const newLinks = [...discoveredLinks];
        newLinks[index].selected = !newLinks[index].selected;
        setDiscoveredLinks(newLinks);
    };

    return (
        <BaseModal isOpen={isUrlImportModalOpen} onClose={closeUrlImportModal} title="Fetch from URL">
            <div className="flex flex-col gap-4">
                {step === 1 && (
                    <>
                        <p className="text-sm text-text-secondary">
                            Enter a URL to fetch its content. We will automatically scan for pagination links (e.g., "Next Page", "Part 2").
                        </p>
                        <Input 
                            value={url} 
                            onChange={(e) => setUrl(e.target.value)} 
                            placeholder="https://example.com/article" 
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAnalyze();
                            }}
                        />
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={closeUrlImportModal}>Cancel</Button>
                            <Button variant="primary" onClick={handleAnalyze} disabled={!url.trim()}>Analyze</Button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-sm text-text-secondary">Fetching and analyzing content...</p>
                    </div>
                )}

                {step === 3 && mainPage && (
                    <>
                        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
                            <div className="flex items-center justify-between p-3 rounded-lg border border-border-base bg-bg-panel">
                                <span className="text-sm font-medium truncate flex-1 mr-4">{mainPage.title || 'Main Page'}</span>
                                <Switch checked={true} disabled={true} onChange={() => {}} />
                            </div>

                            {discoveredLinks.length === 0 ? (
                                <p className="text-sm text-text-secondary italic mt-2">No additional parts found.</p>
                            ) : (
                                <>
                                    <p className="text-sm font-medium mt-2">Discovered Parts:</p>
                                    {discoveredLinks.map((link, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border-base bg-bg-panel">
                                            <span className="text-sm truncate flex-1 mr-4" title={link.url}>{link.linkText}</span>
                                            <Switch checked={link.selected} onChange={() => toggleLink(i)} />
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={closeUrlImportModal}>Cancel</Button>
                            <Button variant="primary" onClick={handleImport}>Import Selected</Button>
                        </div>
                    </>
                )}

                {step === 4 && (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-sm text-text-secondary">Fetching selected parts...</p>
                    </div>
                )}
            </div>
        </BaseModal>
    );
}
