import React, { useState, memo, useEffect } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { ApiRequestLog } from '../../types.ts';
import { CloseIcon, TrashIcon, BugAntIcon, ChevronDownIcon, ChevronRightIcon, WrenchScrewdriverIcon } from '../common/Icons.tsx';
import { getModelDisplayName } from '../../services/llm/config.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Button } from '../ui/Button.tsx';

interface LogEntryProps {
  log: ApiRequestLog;
}

const LogEntryComponent: React.FC<LogEntryProps> = ({ log }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const modelName = getModelDisplayName(typeof log.payload.model === 'string' ? log.payload.model : undefined);
  const { t } = useTranslation();

  const isMemoryManager = log.characterName?.includes('Memory Manager');
  const isShadowMode = log.characterName?.includes('Shadow Mode');
  const isToolTrace = log.requestType === 'tool.trace';
  const isCacheCreate = log.requestType === 'cachedContents.create';

  let borderColor = "border-border-base";
  let textColor = "text-text-tertiary";
  let badgeColor = "";
  
  if (isMemoryManager) {
      borderColor = "border-tint-cyan-border/50";
      textColor = "text-tint-cyan-text";
      badgeColor = "bg-tint-cyan-bg/50 text-tint-cyan-text";
  } else if (isShadowMode) {
      borderColor = "border-tint-emerald-border/50";
      textColor = "text-tint-emerald-text";
      badgeColor = "bg-tint-emerald-bg/50 text-tint-emerald-text";
  } else if (isToolTrace) {
      borderColor = "border-tint-amber-border/50";
      textColor = "text-tint-amber-text";
      badgeColor = "bg-tint-amber-bg/50 text-tint-amber-text";
  } else if (isCacheCreate) {
      borderColor = "border-tint-teal-border/50";
      textColor = "text-tint-teal-text";
      badgeColor = "bg-tint-teal-bg/50 text-tint-teal-text";
  } else {
      if (log.requestType === 'chat.create') badgeColor = 'bg-tint-emerald-bg/10 text-tint-emerald-text';
      else if (log.requestType === 'chat.sendMessage') badgeColor = 'bg-tint-emerald-bg/50 text-tint-emerald-text';
      else if (log.requestType === 'files.uploadFile') badgeColor = 'bg-tint-yellow-bg/50 text-tint-yellow-text';
      else if (log.requestType === 'files.getFile') badgeColor = 'bg-tint-indigo-bg/50 text-tint-indigo-text';
      else badgeColor = 'bg-tint-purple-bg/50 text-tint-purple-text';
  }

  const containerBg = isMemoryManager ? "bg-tint-cyan-bg/10 hover:bg-tint-cyan-bg/20" : 
                      isShadowMode ? "bg-tint-emerald-bg/10 hover:bg-tint-emerald-bg/20" : 
                      isToolTrace ? "bg-tint-amber-bg/10 hover:bg-tint-amber-bg/20" :
                      isCacheCreate ? "bg-tint-teal-bg/10 hover:bg-tint-teal-bg/20" :
                      "hover:bg-bg-hover";

  const IconToUse = isToolTrace ? WrenchScrewdriverIcon : (isExpanded ? ChevronDownIcon : ChevronRightIcon);

  return (
    <div className={`border-b ${borderColor} ${containerBg}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 transition-colors focus:outline-none"
        aria-expanded={isExpanded}
        aria-controls={`log-payload-${log.id}`}
      >
        <div className="flex items-center space-x-2 text-left overflow-hidden">
          <IconToUse className={`w-3.5 h-3.5 flex-shrink-0 ${textColor} ${isToolTrace && isExpanded ? 'rotate-180 transition-transform' : ''}`} />
          <span className={`text-xs flex-shrink-0 ${textColor}`}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}</span>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${badgeColor}`}>
            {log.requestType}
          </span>
          {log.characterName && <span className={`text-xs flex-shrink-0 ${isMemoryManager ? 'text-tint-cyan-text font-bold' : (isShadowMode ? 'text-tint-emerald-text font-bold' : (isToolTrace ? 'text-tint-amber-text font-bold' : 'text-tint-purple-text'))}`}>
            ({log.characterName})
          </span>}
          {log.apiSessionId && !isMemoryManager && !isToolTrace && (
            <span className="text-xs text-text-tertiary truncate" title={log.apiSessionId}>
              ID: {log.apiSessionId.substring(0,8)}...
            </span>
          )}
        </div>
        {!isToolTrace && <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">{t.model}: {modelName}</span>}
      </button>
      {isExpanded && (
        <div id={`log-payload-${log.id}`} className="p-3 bg-bg-element">
           {log.apiSessionId && !isToolTrace && (
            <p className="text-xs text-tint-cyan-text mb-1.5">
              <span className="font-semibold">{t.fullApiSessionId}</span> <span className="font-mono break-all">{log.apiSessionId}</span>
            </p>
          )}
          <pre className={`text-xs whitespace-pre-wrap break-all bg-bg-element p-2 rounded-md max-h-96 overflow-auto ${isMemoryManager ? 'text-tint-cyan-text border border-tint-cyan-border/30' : (isToolTrace ? 'text-tint-amber-text border border-tint-amber-border/30' : 'text-text-secondary')}`}>
            <code>{JSON.stringify(log.payload, null, 2).replace(/\\n/g, '\n')}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

const LogEntry = memo(LogEntryComponent);

const DebugTerminalPanel: React.FC = memo(() => {
  const { currentChatSession } = useActiveChatStore();
  const { clearApiLogs } = useInteractionStore();
  const { isDebugTerminalOpen, closeDebugTerminal } = useSettingsUI();
  const { t } = useTranslation();
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);

  useEffect(() => {
    if (isDebugTerminalOpen) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);
      return () => clearTimeout(timerId);
    }
  }, [isDebugTerminalOpen]);

  if (!isDebugTerminalOpen || !currentChatSession) return null;

  const logs = currentChatSession.apiRequestLogs || [];

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4" onClick={closeDebugTerminal}>
      <div className="bg-bg-panel border border-border-base p-0 rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-text-primary animate-modal-open" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border-base sticky top-0 bg-bg-panel/80 backdrop-blur-md z-10 rounded-t-xl">
          <div className="flex items-center">
            <BugAntIcon className="w-5 h-5 mr-2 text-brand-primary" />
            <h2 className="text-xl font-semibold text-text-primary">{t.apiRequestLog}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              onClick={() => clearApiLogs()}
              title={t.clearLogs}
              disabled={areButtonsDisabled || logs.length === 0}
              className="p-1.5 rounded-md hover:text-tint-red-text"
            >
              <TrashIcon className="w-4 h-4" />
            </Button>
            <Button 
                variant="ghost"
                onClick={closeDebugTerminal} 
                disabled={areButtonsDisabled}
                className="p-1 rounded-full"
                aria-label={t.close}
            >
              <CloseIcon className="w-5 h-5" />
            </Button>
          </div>
        </header>
        <div className="px-4 pt-2 pb-1">
            <p className="text-xs text-text-tertiary">{t.showingLogsFor} <span className="font-medium text-text-secondary">{currentChatSession.title}</span></p>
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto border-t border-border-base ${areButtonsDisabled ? 'pointer-events-none opacity-60' : ''}`}>
          {logs.length === 0 ? (
            <p className="p-6 text-center text-text-tertiary italic">{t.noLogsYet}</p>
          ) : (
            <div className="divide-y divide-border-base">
              {logs.slice().reverse().map(log => ( 
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default DebugTerminalPanel;