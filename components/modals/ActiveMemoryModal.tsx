
import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useSettingsPersistence } from '../../hooks/useSettingsPersistence.ts';
import { BrainIcon, CheckIcon, TrashIcon, ArrowPathIcon, EyeIcon, SparklesIcon, PencilIcon, ClockIcon, LocateIcon, ArrowUturnLeftIcon, SaveDiskIcon, PlusIcon, XCircleIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useMemoryStore } from '../../store/useMemoryStore.ts';
import { MODEL_DEFINITIONS } from '../../constants.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { ChatMessage, ChatMessageRole, MemorySnapshot } from '../../types.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import * as dbService from '../../services/dbService.ts';
import { Button } from '../ui/Button.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Select } from '../ui/Select.tsx';
import { Textarea } from '../ui/Textarea.tsx';

interface ActiveMemoryModalProps {
    onJumpToMessage?: (messageId: string) => void;
}

const ActiveMemoryModal: React.FC<ActiveMemoryModalProps> = memo(({ onJumpToMessage }) => {
    const { isActiveMemoryModalOpen, closeActiveMemoryModal } = useSettingsUI();
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore();
    const { updateMessages } = useDataStore();
    const { saveSessionSettings } = useSettingsPersistence();
    const { isUpdatingMemory, lastUpdateTimestamp, manualUpdateContent, performBackgroundUpdate } = useMemoryStore();
    const { t } = useTranslation();
    const showToast = useToastStore(state => state.showToast); 

    const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

    // Current State Refs
    const [isEnabled, setIsEnabled] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false); 
    const [triggerLogic, setTriggerLogic] = useState('');
    const [memoryContent, setMemoryContent] = useState('');
    const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    
    // New State for Manual Instruction
    const [manualInstruction, setManualInstruction] = useState('');
    const [isExecutingManual, setIsExecutingManual] = useState(false);

    // Initial Load
    useEffect(() => {
        if (isActiveMemoryModalOpen && currentChatSession) {
            const s = currentChatSession.settings;
            setIsEnabled(s.isMemoryBoxEnabled ?? false);
            setIsReadOnly(s.isMemoryReadOnly ?? false);
            setTriggerLogic(s.memoryToolDescription ?? "Call this tool to update the user profile whenever new permanent information is revealed.");
            setMemoryContent(s.memoryBoxContent ?? "{}");
            setSelectedModel(s.activeMemoryModel || 'gemini-2.5-flash');
            setHasUnsavedChanges(false);
            setManualInstruction(''); // Reset manual instruction
            setActiveTab('current');
        }
    }, [isActiveMemoryModalOpen, currentChatSession]);

    // Sync with external updates (e.g. background worker) only if not editing locally
    useEffect(() => {
        if (isActiveMemoryModalOpen && currentChatSession && !hasUnsavedChanges) {
             setMemoryContent(currentChatSession.settings.memoryBoxContent ?? "{}");
        }
    }, [currentChatSession?.settings.memoryBoxContent, hasUnsavedChanges, isActiveMemoryModalOpen]);

    // Helper for auto-saving configuration settings immediately (SILENTLY)
    const autoSaveSettings = useCallback(async (updates: any) => {
        if (!currentChatSession) return;
        
        await saveSessionSettings({
            ...currentChatSession.settings,
            ...updates
        }, null); // Pass null to suppress "Settings Saved" toast
    }, [currentChatSession, saveSessionSettings]);

    // Handler for saving ONLY Content (JSON)
    // This CREATES a history snapshot and INJECTS a chat message anchor.
    const handleSaveContent = useCallback(async () => {
        if (!currentChatSession) return;
        
        // 1. Update Session with Config first (to ensure snapshot includes latest settings)
        const tempSettings = {
            ...currentChatSession.settings,
            isMemoryBoxEnabled: isEnabled,
            isMemoryReadOnly: isReadOnly,
            memoryToolDescription: triggerLogic,
            activeMemoryModel: selectedModel
        };
        // Update store optimistically
        await updateCurrentChatSession(s => s ? ({ ...s, settings: tempSettings }) : null);

        // 2. Inject Anchor Message
        const anchorMessage: ChatMessage = {
            id: `mem-update-${Date.now()}`,
            role: ChatMessageRole.MODEL,
            content: "User Profile updated manually.",
            timestamp: new Date(),
            hasMemoryUpdate: true,
            isSystemReminder: true
        };

        const updatedMessages = [...currentChatSession.messages, anchorMessage];
        
        // Update messages in store
        await updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages }) : null);

        // 3. Perform Memory Update (Content + Anchor + Snapshot + DB Persistence)
        await manualUpdateContent(memoryContent, 'direct_edit', "Manual Snapshot", anchorMessage.id);
        
        // Persist messages explicitly
        await updateMessages(currentChatSession.id, updatedMessages);

        setHasUnsavedChanges(false);
        showToast("Profile Snapshot updated and anchor created.", "success");
    }, [currentChatSession, isEnabled, isReadOnly, triggerLogic, memoryContent, selectedModel, manualUpdateContent, updateCurrentChatSession, updateMessages, showToast]);

    const handleClear = useCallback(() => {
        if(window.confirm("Are you sure you want to clear the profile? It will reset to default skeleton.")) {
            setMemoryContent(JSON.stringify({ identity: {}, preferences: {}, beliefs: [], active_projects: [] }, null, 2));
            setHasUnsavedChanges(true);
        }
    }, []);

    const handleExecuteManualInstruction = useCallback(async () => {
        if (!manualInstruction.trim() || !currentChatSession) return;
        
        setIsExecutingManual(true);
        try {
            const adaptedContext = currentChatSession.messages.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));

            // Generate ID for the upcoming anchor message to link the snapshot
            const anchorId = `mem-manual-inst-${Date.now()}`;

            // Perform update, linking to the future anchor ID
            const result = await performBackgroundUpdate(manualInstruction, adaptedContext, anchorId);
            
            showToast(result.message, result.success ? "success" : "error");
            
            if (result.success) {
                 const anchorMessage: ChatMessage = {
                    id: anchorId,
                    role: ChatMessageRole.MODEL,
                    content: `User Profile updated via instruction: "${manualInstruction}"`,
                    timestamp: new Date(),
                    hasMemoryUpdate: true,
                    isSystemReminder: true
                };
                
                // Fetch fresh session state to ensure we append to latest messages
                const freshSession = useActiveChatStore.getState().currentChatSession;
                if (freshSession) {
                    const updatedMessages = [...freshSession.messages, anchorMessage];
                    await updateCurrentChatSession(s => s ? ({ ...s, messages: updatedMessages, lastUpdatedAt: new Date() }) : null);
                    await updateMessages(freshSession.id, updatedMessages);
                }
            }

            setManualInstruction(''); // Clear input on success
        } catch (error: any) {
            showToast(`Manual update failed: ${error.message}`, "error");
        } finally {
            setIsExecutingManual(false);
        }
    }, [manualInstruction, currentChatSession, performBackgroundUpdate, showToast, updateCurrentChatSession, updateMessages]);

    const handleRestoreSnapshot = useCallback(async (snapshot: MemorySnapshot) => {
        if (!currentChatSession) return;
        
        // Restore content locally first
        setMemoryContent(snapshot.content);
        
        // Restore settings AND Anchor ID
        await saveSessionSettings({
            ...currentChatSession.settings,
            memoryBoxContent: snapshot.content,
            activeMemoryAnchorId: snapshot.relatedMessageId // Restore anchor pointer
        }, "Profile restored from history.");

        showToast("Profile state restored to selected snapshot.", "success");
        
        // Close modal and jump to the restored context message
        closeActiveMemoryModal();
        if (snapshot.relatedMessageId && onJumpToMessage) {
            setTimeout(() => {
                onJumpToMessage(snapshot.relatedMessageId!);
            }, 100);
        }
    }, [currentChatSession, saveSessionSettings, showToast, closeActiveMemoryModal, onJumpToMessage]);

    const footerButtons = (
        <Button variant="secondary" onClick={closeActiveMemoryModal}>{t.close}</Button>
    );

    const formatJson = () => {
        try {
            const parsed = JSON.parse(memoryContent);
            setMemoryContent(JSON.stringify(parsed, null, 2));
            setHasUnsavedChanges(true);
        } catch (e) {
            alert("Invalid JSON content");
        }
    };

    const snapshots = useMemo(() => currentChatSession?.memoryHistory || [], [currentChatSession?.memoryHistory]);

    return (
        <BaseModal
            isOpen={isActiveMemoryModalOpen}
            onClose={closeActiveMemoryModal}
            title={
                <div className="flex items-center">
                    <BrainIcon className="w-5 h-5 mr-2 text-tint-emerald-text" />
                    <span className="text-text-primary">User Profile Manager</span>
                </div>
            }
            footer={footerButtons}
            maxWidth="sm:max-w-3xl"
        >
            {/* Tabs */}
            <div className="flex border-b border-border-base mb-4 bg-bg-panel/40 backdrop-blur-md">
                <Button 
                    variant="ghost"
                    className={`flex-1 py-2 text-sm font-medium text-center transition-colors rounded-none h-auto ${activeTab === 'current' ? 'text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10' : 'text-text-muted hover:text-text-primary bg-transparent hover:bg-bg-hover'}`}
                    onClick={() => setActiveTab('current')}
                >
                    Current State
                </Button>
                <Button 
                    variant="ghost"
                    className={`flex-1 py-2 text-sm font-medium text-center transition-colors rounded-none h-auto ${activeTab === 'history' ? 'text-brand-secondary border-b-2 border-brand-secondary bg-brand-secondary/5 hover:bg-brand-secondary/10' : 'text-text-muted hover:text-text-primary bg-transparent hover:bg-bg-hover'}`}
                    onClick={() => setActiveTab('history')}
                >
                    History Log ({snapshots.length})
                </Button>
            </div>

            {activeTab === 'current' && (
                <div className="space-y-5 animate-fade-in-right">
                    {/* Header Switches */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-bg-element p-3 rounded-lg border border-border-base shadow-sm backdrop-blur-md">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-text-primary">Enable User Profile (Auto-Update)</span>
                                <span className="text-xs text-text-secondary">Allows AI to Read AND Write to the profile (JSON).</span>
                            </div>
                            <Switch
                                checked={isEnabled}
                                onChange={(e) => { 
                                    const val = e.target.checked;
                                    setIsEnabled(val); 
                                    autoSaveSettings({ isMemoryBoxEnabled: val });
                                }}
                                className="text-brand-primary focus:ring-ring-focus"
                            />
                        </div>

                        <div className={`flex items-center justify-between bg-bg-element p-3 rounded-lg border border-border-base shadow-sm backdrop-blur-md transition-opacity ${isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex flex-col">
                                <div className="flex items-center">
                                    <EyeIcon className="w-3.5 h-3.5 mr-2 text-tint-emerald-text" />
                                    <span className="text-sm font-bold text-text-primary">Read Only Mode</span>
                                </div>
                                <span className="text-xs text-text-secondary">Allows AI to Read profile, but prevents modifying it.</span>
                            </div>
                            <Switch
                                checked={isReadOnly}
                                onChange={(e) => { 
                                    const val = e.target.checked;
                                    setIsReadOnly(val); 
                                    autoSaveSettings({ isMemoryReadOnly: val });
                                }}
                                disabled={isEnabled}
                                className="text-brand-primary focus:ring-ring-focus"
                            />
                        </div>
                    </div>

                    {/* Manual Instruction Trigger */}
                    <div className={`relative p-3 rounded-lg border border-tint-emerald-border/30 bg-tint-emerald-bg/10 shadow-sm backdrop-blur-md ${!isEnabled && !isReadOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                        <label className="block text-xs font-bold text-tint-emerald-text mb-1 uppercase tracking-wider flex items-center">
                            <PencilIcon className="w-3 h-3 mr-1.5" />
                            Profile Updater (Manual Trigger)
                        </label>
                        <div className="flex gap-2">
                            <Textarea
                                value={manualInstruction}
                                onChange={(e) => setManualInstruction(e.target.value)}
                                placeholder="e.g., Update Profile: Add 'Coding' to active_projects list."
                                className="flex-grow h-16 resize-none bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                            />
                            <Button
                                variant="primary"
                                onClick={handleExecuteManualInstruction}
                                disabled={isExecutingManual || !manualInstruction.trim()}
                                className="min-w-[80px] bg-brand-primary hover:bg-brand-hover"
                                icon={isExecutingManual ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : undefined}
                            >
                                {!isExecutingManual && "Execute"}
                            </Button>
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div className={isEnabled ? '' : 'opacity-50 pointer-events-none'}>
                         <label className="block text-xs font-bold text-tint-emerald-text mb-1 uppercase tracking-wider flex items-center">
                            <SparklesIcon className="w-3 h-3 mr-1" />
                            Background Profile Manager Model
                         </label>
                         <div className="relative">
                            <Select
                                value={selectedModel}
                                onChange={(e) => { 
                                    const val = e.target.value; 
                                    setSelectedModel(val);
                                    autoSaveSettings({ activeMemoryModel: val });
                                }}
                                options={[
                                    ...MODEL_DEFINITIONS.map(m => ({ value: m.id, label: m.name })),
                                    ...(!MODEL_DEFINITIONS.find(m => m.id === selectedModel) ? [{ value: selectedModel, label: selectedModel }] : [])
                                ]}
                                disabled={!isEnabled}
                                className="bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                            />
                         </div>
                    </div>

                    {/* The Box */}
                    <div className="flex flex-col h-[300px]">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">User Profile (JSON)</label>
                            <div className="flex items-center space-x-2">
                                {isUpdatingMemory && <span className="text-xs text-brand-primary animate-pulse flex items-center"><ArrowPathIcon className="w-3 h-3 mr-1 animate-spin"/> Updating...</span>}
                                {!isUpdatingMemory && lastUpdateTimestamp && <span className="text-[10px] text-text-muted">Updated: {lastUpdateTimestamp.toLocaleTimeString()}</span>}
                                <Button variant="ghost" size="sm" onClick={formatJson} className="text-[10px] text-text-secondary px-2 py-1 h-auto hover:text-text-primary bg-bg-element">Format JSON</Button>
                                <Button variant="ghost" size="sm" onClick={handleClear} className="text-[10px] text-tint-red-text bg-tint-red-bg/10 px-2 py-1 h-auto hover:bg-tint-red-bg/80" title="Reset Profile" icon={<TrashIcon className="w-3 h-3"/>} />
                            </div>
                        </div>
                        <Textarea
                            value={memoryContent}
                            onChange={(e) => { setMemoryContent(e.target.value); setHasUnsavedChanges(true); }}
                            className="flex-grow font-mono text-xs resize-none leading-relaxed bg-bg-element text-text-primary border-border-base focus:border-brand-primary focus:ring-ring-focus backdrop-blur-sm"
                            spellCheck={false}
                        />
                        {/* UPDATE SNAPSHOT BUTTON */}
                        <div className="mt-2 flex justify-end">
                             <Button 
                                variant="outline"
                                size="sm"
                                onClick={handleSaveContent}
                                className="text-tint-emerald-text bg-tint-emerald-bg/20 border-tint-emerald-border/30 hover:bg-tint-emerald-bg/40"
                                title="Saves current content as a new History Snapshot and marks it in the chat."
                                icon={<SaveDiskIcon className="w-3.5 h-3.5" />}
                             >
                                Update Snapshot (Content + Anchor)
                             </Button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-3 h-[600px] overflow-y-auto pr-1 custom-scrollbar animate-fade-in-right">
                    {snapshots.length === 0 && (
                        <p className="text-center text-text-muted py-10 italic">No history available yet.</p>
                    )}
                    {snapshots.map((snap) => (
                        <SnapshotCard 
                            key={snap.id} 
                            snapshot={snap} 
                            onRestore={handleRestoreSnapshot} 
                            onJump={onJumpToMessage}
                            currentAnchorId={currentChatSession?.settings.activeMemoryAnchorId}
                        />
                    ))}
                </div>
            )}
        </BaseModal>
    );
});

// Inner component for Snapshot Item
const SnapshotCard: React.FC<{ 
    snapshot: MemorySnapshot; 
    onRestore: (s: MemorySnapshot) => void; 
    onJump?: (msgId: string) => void; 
    currentAnchorId?: string;
}> = memo(({ snapshot, onRestore, onJump, currentAnchorId }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    let Icon = SparklesIcon;
    let iconClass = "text-brand-secondary";
    let title = "AI Update";

    if (snapshot.source === 'manual_trigger') {
        Icon = BrainIcon; // or generic tool icon
        iconClass = "text-brand-primary";
        title = "Profile Manager Trigger";
    } else if (snapshot.source === 'direct_edit') {
        Icon = PencilIcon;
        iconClass = "text-text-muted";
        title = "Direct Edit";
    } else if (snapshot.source === 'restore') {
        Icon = ArrowUturnLeftIcon;
        iconClass = "text-brand-accent";
        title = "Restored Version";
    }

    const isActive = snapshot.relatedMessageId === currentAnchorId;

    return (
        <div className={`border rounded-lg p-3 transition-colors ${isActive ? 'bg-brand-primary/10 border-brand-primary shadow-sm' : 'bg-bg-panel/40 border-border-base hover:bg-bg-hover shadow-sm backdrop-blur-md'}`}>
            <div className="flex justify-between items-start">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-full bg-bg-element ${iconClass} ${isActive ? 'animate-pulse' : ''}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${isActive ? 'text-brand-primary' : 'text-text-primary'}`}>{title} {isActive && "(Active)"}</span>
                            <span className="text-[10px] text-text-muted flex items-center">
                                <ClockIcon className="w-3 h-3 mr-1" />
                                {new Date(snapshot.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-1 truncate" title={snapshot.triggerText}>
                            {snapshot.triggerText || "No description"}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 text-text-secondary hover:text-text-primary" 
                        title="View Content"
                        icon={<EyeIcon className="w-4 h-4" />}
                    />
                    {snapshot.relatedMessageId && onJump && (
                        <Button 
                            variant="ghost"
                            onClick={() => onJump(snapshot.relatedMessageId!)}
                            className="p-1.5 text-text-secondary hover:text-brand-primary" 
                            title="Jump to Context"
                            icon={<LocateIcon className="w-4 h-4" />}
                        />
                    )}
                    <Button 
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRestore(snapshot);
                        }}
                        disabled={isActive}
                        className={`p-1.5 ${isActive ? 'text-text-muted' : 'text-text-secondary hover:text-brand-primary'}`}
                        title={isActive ? "Currently Active" : "Restore this version"}
                        icon={<ArrowUturnLeftIcon className="w-4 h-4" />}
                    />
                </div>
            </div>

            {isExpanded && (
                <div className="mt-3 pt-2 border-t border-border-base">
                    <pre className="text-[10px] font-mono text-text-primary bg-bg-element p-2 rounded overflow-x-auto backdrop-blur-sm">
                        {snapshot.content}
                    </pre>
                </div>
            )}
        </div>
    );
});

export default ActiveMemoryModal;
