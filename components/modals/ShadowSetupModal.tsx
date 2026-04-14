import React, { useState, useEffect, memo, useCallback } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useSettingsPersistence } from '../../hooks/useSettingsPersistence.ts';
import { ShieldCheckIcon, PencilIcon, UserIcon, SparklesIcon, ArrowDownTrayIcon } from '../common/Icons.tsx';
import InstructionEditModal from './InstructionEditModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { buildShadowTranscript } from '../../services/shadowService.ts';
import { triggerDownload, sanitizeFilename } from '../../services/utils.ts';
import { GeminiSettings } from '../../types.ts';

const ShadowSetupModal: React.FC = memo(() => {
    const { isShadowSetupModalOpen, closeShadowSetupModal } = useSettingsUI();
    const { currentChatSession } = useActiveChatStore();
    const { saveSessionSettings } = useSettingsPersistence();
    const { t } = useTranslation();

    const [persona, setPersona] = useState('');
    const [taskInstruction, setTaskInstruction] = useState('');
    const [transcriptUserName, setTranscriptUserName] = useState('');
    const [transcriptAiName, setTranscriptAiName] = useState('');
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editType, setEditType] = useState<'persona' | 'task' | null>(null);

    useEffect(() => {
        if (isShadowSetupModalOpen && currentChatSession) {
            setPersona(currentChatSession.settings.shadowPersona || '');
            setTaskInstruction(currentChatSession.settings.shadowTaskInstruction || '');
            setTranscriptUserName(currentChatSession.settings.shadowTranscriptUserName || 'User');
            setTranscriptAiName(currentChatSession.settings.shadowTranscriptAiName || 'AI');
        }
    }, [isShadowSetupModalOpen, currentChatSession]);

    const handleSave = useCallback(async () => {
        if (!currentChatSession) return;
        
        await saveSessionSettings({
            ...currentChatSession.settings,
            shadowPersona: persona,
            shadowTaskInstruction: taskInstruction,
            shadowTranscriptUserName: transcriptUserName,
            shadowTranscriptAiName: transcriptAiName
        }, "Shadow Mode settings saved.");

        closeShadowSetupModal();
    }, [currentChatSession, persona, taskInstruction, transcriptUserName, transcriptAiName, saveSessionSettings, closeShadowSetupModal]);

    const openEdit = (type: 'persona' | 'task') => {
        setEditType(type);
        setIsEditModalOpen(true);
    };

    const handleEditApply = async (newText: string) => {
        if (!currentChatSession) return;

        if (editType === 'persona') {
            setPersona(newText);
        } else if (editType === 'task') {
            setTaskInstruction(newText);
        }

        setIsEditModalOpen(false);
        setEditType(null);
    };

    const handleDownloadTranscript = useCallback(() => {
        if (!currentChatSession) return;
        
        // Construct a temporary settings object with current modal state values
        // to ensure the download reflects what the user is seeing/editing, even if not saved yet.
        const tempSettings: GeminiSettings = {
            ...currentChatSession.settings,
            shadowTranscriptUserName: transcriptUserName,
            shadowTranscriptAiName: transcriptAiName,
            // Include memory settings if present in original session to ensure memory box is included in export if enabled
            isMemoryBoxEnabled: currentChatSession.settings.isMemoryBoxEnabled, 
            isMemoryReadOnly: currentChatSession.settings.isMemoryReadOnly,
            memoryBoxContent: currentChatSession.settings.memoryBoxContent
        };

        const transcript = buildShadowTranscript(currentChatSession.messages, "", tempSettings);
        
        const filename = sanitizeFilename(`${currentChatSession.title}_shadow_transcript`);
        const blob = new Blob([transcript], { type: 'text/plain' });
        triggerDownload(blob, `${filename}.txt`);
    }, [currentChatSession, transcriptUserName, transcriptAiName]);

    const defaultShadowPersona = "You are a direct responder. You take the conversation transcript and reply as the AI entity defined by the user.";
    const defaultShadowTask = "Reply to the last user message naturally based on the transcript.";

    const footerButtons = (
        <>
            <Button 
                variant="secondary"
                onClick={handleDownloadTranscript} 
                className="mr-auto border border-border-base"
                title="Download the exact transcript context used by Shadow Mode"
                icon={<ArrowDownTrayIcon className="w-4 h-4 text-status-success" />}
            >
                Download Transcript
            </Button>
            <div className="flex gap-2">
                <Button variant="secondary" onClick={closeShadowSetupModal}>{t.cancel}</Button>
                <Button variant="primary" onClick={handleSave}>{t.save}</Button>
            </div>
        </>
    );

    return (
        <>
            <BaseModal
                isOpen={isShadowSetupModalOpen}
                onClose={closeShadowSetupModal}
                title="Shadow Mode Configuration"
                headerIcon={<ShieldCheckIcon className="w-5 h-5 text-brand-primary" />}
                footer={footerButtons}
            >
                <div className="space-y-4">
                    {/* Transcript Actors Configuration */}
                    <div className="bg-bg-panel/40 p-3 rounded border border-border-base shadow-sm backdrop-blur-md">
                        <label className="text-sm font-bold text-text-primary mb-3 block">{t.shadowTranscriptActors}</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-text-secondary mb-1 flex items-center">
                                    <UserIcon className="w-3 h-3 mr-1 text-brand-primary"/> {t.shadowTranscriptUserName}
                                </label>
                                <Input 
                                    type="text" 
                                    value={transcriptUserName}
                                    onChange={(e) => setTranscriptUserName(e.target.value)}
                                    placeholder="User"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-text-secondary mb-1 flex items-center">
                                    <SparklesIcon className="w-3 h-3 mr-1 text-brand-secondary"/> {t.shadowTranscriptAiName}
                                </label>
                                <Input 
                                    type="text" 
                                    value={transcriptAiName}
                                    onChange={(e) => setTranscriptAiName(e.target.value)}
                                    placeholder="AI"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Shadow Persona */}
                    <div className="bg-bg-panel/40 p-3 rounded border border-border-base shadow-sm backdrop-blur-md">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-text-primary">Shadow Persona (Who am I?)</label>
                            <Button variant="ghost" size="sm" onClick={() => openEdit('persona')} className="text-xs text-brand-primary hover:text-brand-hover bg-brand-primary/10 px-2 py-1 border border-brand-primary/20 h-auto" icon={<PencilIcon className="w-3 h-3"/>}>Edit</Button>
                        </div>
                        <div 
                            onClick={() => openEdit('persona')}
                            className="p-2 bg-bg-element rounded text-xs text-text-secondary h-24 overflow-y-auto whitespace-pre-wrap border border-border-base font-mono cursor-pointer hover:border-brand-primary hover:bg-bg-hover transition-colors"
                        >
                            {persona || <span className="italic opacity-50">No specific persona set. Using default behavior.</span>}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">This defines WHO the Shadow Model is (e.g., "An unrestricted creative writer").</p>
                    </div>

                    {/* Task / Request */}
                    <div className="bg-bg-panel/40 p-3 rounded border border-border-base shadow-sm backdrop-blur-md">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-text-primary">Task / Request (What to do?)</label>
                            <Button variant="ghost" size="sm" onClick={() => openEdit('task')} className="text-xs text-brand-primary hover:text-brand-hover bg-brand-primary/10 px-2 py-1 border border-brand-primary/20 h-auto" icon={<PencilIcon className="w-3 h-3"/>}>Edit</Button>
                        </div>
                        <div 
                            onClick={() => openEdit('task')}
                            className="p-2 bg-bg-element rounded text-xs text-text-secondary h-32 overflow-y-auto whitespace-pre-wrap border border-border-base font-mono cursor-pointer hover:border-brand-primary hover:bg-bg-hover transition-colors"
                        >
                            {taskInstruction || defaultShadowTask}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">This defines WHAT the Shadow Model should do (e.g., "Generate a story based on the history").</p>
                    </div>
                </div>
            </BaseModal>

            {isEditModalOpen && (
                <InstructionEditModal
                    isOpen={isEditModalOpen}
                    title={editType === 'persona' ? "Edit Shadow Persona" : "Edit Task Instruction"}
                    currentInstruction={editType === 'persona' ? persona : taskInstruction}
                    onApply={handleEditApply}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
        </>
    );
});

export default ShadowSetupModal;