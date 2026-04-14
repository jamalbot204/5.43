
import React, { memo } from 'react';
import { usePromptButtonStore } from '../../../store/usePromptButtonStore.ts';
import { useExternalModelsStore } from '../../../store/useExternalModelsStore.ts';
import { useSettingsUI } from '../../../store/ui/useSettingsUI.ts';
import { useToastStore } from '../../../store/useToastStore.ts';
import { CogIcon, SendIcon, PlusIcon, PencilIcon, UsersIcon } from '../../common/Icons.tsx';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../ui/Button.tsx';
import { useTranslation } from '../../../hooks/useTranslation.ts';
import { MODEL_DEFINITIONS } from '../../../constants.ts';

interface PromptButtonsBarProps {
    onInsert: (text: string, modelId?: string) => void;
    onSend: (text: string, modelId?: string) => void;
    onSwitchToolbar?: () => void;
    showSwitchButton?: boolean;
}

const PromptButtonsBar: React.FC<PromptButtonsBarProps> = memo(({ 
    onInsert, 
    onSend,
    onSwitchToolbar,
    showSwitchButton
}) => {
    const { t } = useTranslation();
    const { promptButtons } = usePromptButtonStore(useShallow(state => ({
        promptButtons: state.promptButtons
    })));
    const { openPromptButtonManager } = useSettingsUI();
    const { providers } = useExternalModelsStore();
    const showToast = useToastStore(state => state.showToast);

    const handleButtonClick = (btn: any) => {
        if (btn.modelId) {
            const isBaseModel = MODEL_DEFINITIONS.some(m => m.id === btn.modelId);
            const isExternalModel = providers.some(p => p.models?.some(m => m.id === btn.modelId));
            
            if (!isBaseModel && !isExternalModel) {
                showToast(`Model ${btn.modelId} is no longer available. Please update the button settings.`, "error");
                openPromptButtonManager();
                return;
            }
        }

        if (btn.action === 'send') {
            onSend(btn.content, btn.modelId);
        } else {
            onInsert(btn.content, btn.modelId);
        }
    };

    return (
        <div className="flex flex-nowrap items-center px-3 py-2 bg-transparent gap-1 rounded-t-2xl">
            {/* Fixed Start */}
            {showSwitchButton && onSwitchToolbar && (
                <Button
                    onClick={onSwitchToolbar}
                    variant="ghost"
                    size="none"
                    className="p-1.5 text-text-secondary hover:text-text-primary rounded-xl hover:bg-bg-hover transition-colors flex-shrink-0 me-2"
                    title={t.characters}
                >
                    <UsersIcon className="w-4 h-4" />
                </Button>
            )}

            {/* Scrollable Center */}
            <div className="flex-1 min-w-0 overflow-x-auto pb-1">
                <div className="w-max flex items-center gap-2 px-1">
                    {promptButtons.length === 0 && (
                        <Button 
                            onClick={openPromptButtonManager}
                            variant="ghost"
                            className="text-[10px] text-text-secondary hover:text-text-primary flex items-center px-2 py-1 rounded-lg hover:bg-bg-hover transition-colors whitespace-nowrap"
                        >
                            <PlusIcon className="w-3 h-3 mr-1" />
                            Add Quick Action
                        </Button>
                    )}
                    
                    {promptButtons.map(btn => (
                        <Button
                            key={btn.id}
                            onClick={() => handleButtonClick(btn)}
                            variant="outline"
                            className={`
                                flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap shadow-sm border
                                ${btn.action === 'send' 
                                    ? 'bg-tint-emerald-bg/10 text-tint-emerald-text border-tint-emerald-border/20 hover:bg-tint-emerald-bg/80' 
                                    : 'bg-tint-indigo-bg/10 text-tint-indigo-text border-tint-indigo-border/20 hover:bg-tint-indigo-bg/80'
                                }
                            `}
                            title={btn.content}
                        >
                            {btn.action === 'send' ? <SendIcon className="w-3 h-3 mr-1.5 opacity-70" /> : <PencilIcon className="w-3 h-3 mr-1.5 opacity-70" />}
                            {btn.label}
                            {btn.modelId && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-bg-element/50 text-[8px] border border-current/10 opacity-80">
                                    {MODEL_DEFINITIONS.find(m => m.id === btn.modelId)?.name || 
                                     providers.flatMap(p => p.models || []).find(m => m.id === btn.modelId)?.displayName || 
                                     'Model'}
                                </span>
                            )}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Fixed End */}
            <Button 
                onClick={openPromptButtonManager}
                variant="ghost"
                size="none"
                className="p-1.5 text-text-secondary hover:text-text-primary rounded-xl hover:bg-bg-hover transition-colors flex-shrink-0 ms-2"
                title="Manage Prompt Buttons"
            >
                <CogIcon className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
});

export default PromptButtonsBar;
