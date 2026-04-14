import React, { useState, useEffect, useCallback, memo } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useSettingsPersistence } from '../../hooks/useSettingsPersistence.ts';
import { ShieldCheckIcon, CheckIcon, ClipboardDocumentListIcon, UserIcon } from '../common/Icons.tsx';
import BaseModal from '../common/BaseModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';

const StrategySetupModal: React.FC = memo(() => {
    const { isStrategySetupModalOpen, closeStrategySetupModal } = useSettingsUI();
    const { currentChatSession } = useActiveChatStore();
    const { saveSessionSettings } = useSettingsPersistence();
    const { t } = useTranslation();

    const [isEnabled, setIsEnabled] = useState(false);
    const [strategyContent, setStrategyContent] = useState('');
    const [ghostResponse, setGhostResponse] = useState('');

    useEffect(() => {
        if (isStrategySetupModalOpen && currentChatSession) {
            setIsEnabled(currentChatSession.settings.isStrategyToolEnabled ?? false);
            setStrategyContent(currentChatSession.settings.strategyContent ?? "Execute protocol: [Your detailed instructions here]");
            setGhostResponse(currentChatSession.settings.strategyGhostResponse ?? "");
        }
    }, [isStrategySetupModalOpen, currentChatSession]);

    const handleSave = useCallback(async () => {
        if (!currentChatSession) return;
        
        await saveSessionSettings({
            ...currentChatSession.settings,
            isStrategyToolEnabled: isEnabled,
            strategyContent: strategyContent,
            strategyGhostResponse: ghostResponse
        }, "Strategic Protocol settings saved.");

        closeStrategySetupModal();
    }, [currentChatSession, isEnabled, strategyContent, ghostResponse, saveSessionSettings, closeStrategySetupModal]);

    const footerButtons = (
        <>
            <Button variant="secondary" onClick={closeStrategySetupModal} className="bg-bg-panel/50 border-border-base hover:bg-bg-hover text-text-secondary">{t.cancel}</Button>
            <Button variant="primary" onClick={handleSave} icon={<CheckIcon className="w-4 h-4" />}>
                {t.save}
            </Button>
        </>
    );

    return (
        <BaseModal
            isOpen={isStrategySetupModalOpen}
            onClose={closeStrategySetupModal}
            title="Strategic Protocol (On-Demand Injection)"
            headerIcon={<ClipboardDocumentListIcon className="w-5 h-5 text-brand-primary" />}
            footer={footerButtons}
            maxWidth="sm:max-w-2xl"
        >
            <div className="space-y-5">
                {/* Enable Switch */}
                <div className="flex items-center justify-between bg-bg-panel/40 p-3 rounded-xl border border-border-base shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-primary">Enable Forced Protocol</span>
                        <span className="text-xs text-text-muted">Forces the model to execute a special tool to retrieve your instructions before responding.</span>
                    </div>
                    <div className="flex items-center">
                        <Switch
                            checked={isEnabled}
                            onChange={(e) => setIsEnabled(e.target.checked)}
                            className="text-brand-primary focus:ring-brand-primary"
                        />
                    </div>
                </div>

                {/* Content Editor */}
                <div className={isEnabled ? '' : 'opacity-50 pointer-events-none'}>
                    <label className="block text-xs font-bold text-brand-primary mb-1 uppercase tracking-wider flex items-center">
                        <ShieldCheckIcon className="w-3 h-3 mr-1.5" />
                        Protocol Instructions (Hidden)
                    </label>
                    <p className="text-[10px] text-text-muted mb-2">
                        These instructions are hidden inside a tool. The model MUST call the tool to read them. This bypasses context drift and ensures adherence.
                    </p>
                    <Textarea
                        value={strategyContent}
                        onChange={(e) => setStrategyContent(e.target.value)}
                        className="h-64 resize-y font-mono border-border-base focus:border-brand-primary focus:ring-brand-primary/50 bg-bg-panel/50 backdrop-blur-sm"
                        placeholder="Enter your strict operating protocol here..."
                    />
                </div>

                {/* Ghost Response Editor */}
                <div className={isEnabled ? '' : 'opacity-50 pointer-events-none'}>
                    <label className="block text-xs font-bold text-brand-primary mb-1 uppercase tracking-wider flex items-center">
                        <UserIcon className="w-3 h-3 mr-1.5" />
                        Ghost Response (AI Confirmation)
                    </label>
                    <p className="text-[10px] text-text-muted mb-2">
                        Customize how the AI "acknowledges" the protocol in the hidden history. Leave empty for default.
                    </p>
                    <Textarea
                        value={ghostResponse}
                        onChange={(e) => setGhostResponse(e.target.value)}
                        className="h-20 resize-y font-mono border-border-base focus:border-brand-primary focus:ring-brand-primary/50 bg-bg-panel/50 backdrop-blur-sm"
                        placeholder="Default: OK I UNDERSTAND AND I WILL FOLLOW THEM STEP BY STEP"
                    />
                </div>
            </div>
        </BaseModal>
    );
});

export default StrategySetupModal;