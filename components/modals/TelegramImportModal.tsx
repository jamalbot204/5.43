import React, { useState, memo, useCallback, useEffect } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useChatListStore } from '../../store/useChatListStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { TelegramIcon, CloseIcon, CheckIcon, DocumentIcon, UserIcon, SparklesIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { getTelegramParticipants, convertTelegramToSession, TelegramExport } from '../../services/telegramService.ts';
import { Button } from '../ui/Button.tsx';

const TelegramImportModal: React.FC = memo(() => {
    const { isTelegramImportModalOpen, closeTelegramImportModal } = useSettingsUI();
    const { addChatSession } = useChatListStore();
    const { selectChat } = useActiveChatStore();
    const showToast = useToastStore(state => state.showToast);
    const { t } = useTranslation();

    const [file, setFile] = useState<File | null>(null);
    const [importData, setImportData] = useState<TelegramExport | null>(null);
    const [participants, setParticipants] = useState<{ id: string; name: string; count: number }[]>([]);
    
    const [userId, setUserId] = useState<string>('');
    const [modelId, setModelId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!isTelegramImportModalOpen) {
            setFile(null);
            setImportData(null);
            setParticipants([]);
            setUserId('');
            setModelId('');
            setIsProcessing(false);
        }
    }, [isTelegramImportModalOpen]);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.json')) {
            showToast("Please upload a valid JSON file exported from Telegram.", "error");
            return;
        }

        setFile(selectedFile);
        
        try {
            const text = await selectedFile.text();
            const data = JSON.parse(text) as TelegramExport;
            
            if (!data.messages || !Array.isArray(data.messages)) {
                throw new Error("Invalid Telegram export format.");
            }

            const parts = getTelegramParticipants(data);
            setImportData(data);
            setParticipants(parts);

            // Auto-select if only 2 participants
            if (parts.length >= 2) {
                setUserId(parts[0].id);
                setModelId(parts[1].id);
            }
        } catch (err: any) {
            showToast(`Failed to parse file: ${err.message}`, "error");
            setFile(null);
        }
    }, [showToast]);

    const handleImport = useCallback(async () => {
        if (!importData || !userId || !modelId) return;

        setIsProcessing(true);
        try {
            const session = convertTelegramToSession(importData, userId, modelId);
            await addChatSession(session);
            await selectChat(session.id);
            showToast("Telegram chat imported successfully!", "success");
            closeTelegramImportModal();
        } catch (err: any) {
            showToast(`Import failed: ${err.message}`, "error");
        } finally {
            setIsProcessing(false);
        }
    }, [importData, userId, modelId, addChatSession, selectChat, showToast, closeTelegramImportModal]);

    const footerButtons = (
        <>
            <Button variant="secondary" onClick={closeTelegramImportModal}>{t.cancel}</Button>
            <Button 
                variant="primary"
                onClick={handleImport} 
                disabled={!userId || !modelId || isProcessing}
                className="bg-brand-primary hover:bg-brand-hover"
                icon={!isProcessing ? <CheckIcon className="w-4 h-4" /> : undefined}
            >
                {isProcessing ? <span className="animate-pulse">{t.loading}</span> : t.import}
            </Button>
        </>
    );

    return (
        <BaseModal
            isOpen={isTelegramImportModalOpen}
            onClose={closeTelegramImportModal}
            title="Import from Telegram"
            headerIcon={<TelegramIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-lg"
        >
            <div className="space-y-6">
                {!importData ? (
                    <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-border-base rounded-xl bg-bg-panel/40 backdrop-blur-sm hover:border-brand-primary transition-colors group shadow-sm">
                        <DocumentIcon className="w-12 h-12 text-text-muted mb-4 group-hover:text-brand-primary transition-colors" />
                        <p className="text-sm text-text-secondary text-center mb-6">
                            Upload the <code className="text-brand-primary bg-brand-primary/10 px-1 rounded border border-brand-primary/10">result.json</code> file exported from Telegram Desktop.
                        </p>
                        <label className="cursor-pointer px-6 py-2.5 bg-brand-primary text-text-on-brand rounded-lg font-bold hover:bg-brand-hover transition shadow-sm">
                            Select JSON File
                            <input type="file" accept=".json" className="hidden" onChange={handleFileChange} />
                        </label>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-brand-primary/5 backdrop-blur-sm border border-brand-primary/20 shadow-sm border-l-4 border-l-brand-primary">
                            <p className="text-xs text-brand-primary font-bold uppercase tracking-wider mb-1">Detected Chat</p>
                            <p className="text-sm text-text-primary font-medium">{importData.name} ({importData.messages.length} messages)</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-3 flex items-center">
                                    <UserIcon className="w-3.5 h-3.5 mr-2 text-brand-primary" />
                                    Who are YOU in this chat?
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {participants.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => setUserId(p.id)}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition backdrop-blur-sm ${userId === p.id ? 'bg-brand-primary/20 border-brand-primary/50 text-brand-primary shadow-sm' : 'bg-bg-panel/50 border-border-base text-text-secondary hover:bg-bg-hover shadow-sm'}`}
                                        >
                                            <span className="text-sm font-medium">{p.name}</span>
                                            <span className="text-[10px] opacity-60 bg-bg-panel/50 px-2 py-0.5 rounded-full border border-border-base">{p.count} msgs</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-3 flex items-center">
                                    <SparklesIcon className="w-3.5 h-3.5 mr-2 text-brand-secondary" />
                                    Who is the AI (Model)?
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {participants.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => setModelId(p.id)}
                                            disabled={p.id === userId}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition backdrop-blur-sm ${modelId === p.id ? 'bg-brand-secondary/20 border-brand-secondary/50 text-brand-secondary shadow-sm' : 'bg-bg-panel/50 border-border-base text-text-secondary hover:bg-bg-hover shadow-sm'} ${p.id === userId ? 'opacity-30 cursor-not-allowed' : ''}`}
                                        >
                                            <span className="text-sm font-medium">{p.name}</span>
                                            <span className="text-[10px] opacity-60 bg-bg-panel/50 px-2 py-0.5 rounded-full border border-border-base">{p.count} msgs</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-text-muted italic mt-4">
                            * Only text messages from selected participants will be imported. Attachments and media are not supported in this version.
                        </p>
                    </div>
                )}
            </div>
        </BaseModal>
    );
});

export default TelegramImportModal;