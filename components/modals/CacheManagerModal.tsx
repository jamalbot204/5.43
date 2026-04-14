import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button.tsx';
import { CloseIcon, ServerIcon, XCircleIcon, InfoIcon, CheckCircleIcon, TrashIcon } from '../common/Icons.tsx';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';
import { generateChatFingerprint } from '../../services/utils.ts';
import { getFullChatResponse } from '../../services/llm/chat.ts'; // We will create this

export const CacheManagerModal: React.FC = () => {
  const { isCacheManagerModalOpen, closeCacheManagerModal } = useSettingsUI();
  const { currentChatSession, updateCurrentChatSession } = useActiveChatStore();
  const showToast = useToastStore((state) => state.showToast);

  const [messageCount, setMessageCount] = useState<number>(0);
  const [isCreating, setIsCreating] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isCacheManagerModalOpen && currentChatSession) {
      if (currentChatSession.manualCacheInfo) {
        setMessageCount(currentChatSession.manualCacheInfo.cachedMessageCount);
      } else {
        // Default to all messages except the last few, or half
        setMessageCount(Math.max(0, currentChatSession.messages.length - 2));
      }
    }
  }, [isCacheManagerModalOpen, currentChatSession]);

  const messages = currentChatSession?.messages || [];
  const maxMessages = messages.length;

  // Estimate tokens (rough estimate: ~3.5 chars per token)
  const estimateTokens = (count: number) => {
    let totalChars = 0;
    const safeCount = Math.min(count, messages.length);
    for (let i = 0; i < safeCount; i++) {
      totalChars += messages[i]?.content?.length || 0;
    }
    return Math.ceil(totalChars / 3.5);
  };

  const estimatedTokens = estimateTokens(messageCount);
  const MIN_TOKENS_FOR_CACHE = 32000;
  const isEligible = estimatedTokens >= MIN_TOKENS_FOR_CACHE;

  const currentCache = currentChatSession?.manualCacheInfo;
  const isExpired = currentCache ? currentCache.expireTime < Date.now() : false;
  const currentFingerprint = currentCache && currentChatSession ? generateChatFingerprint(currentChatSession, currentCache.cachedMessageCount) : '';
  const isInvalid = currentCache ? currentCache.fingerprint !== currentFingerprint : false;

  const handleCreateCache = async () => {
    if (!isEligible || !currentChatSession) {
      showToast("Not enough tokens to cache. Minimum is ~32,000.", "error");
      return;
    }

    setIsCreating(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
      if (!apiKey) throw new Error("API Key not found");

      const cacheResult = await getFullChatResponse({
        apiKey,
        sessionId: currentChatSession.id,
        userMessageInput: { text: '' }, // Dummy input
        model: currentChatSession.model || 'gemini-3.1-pro-preview',
        baseSettings: currentChatSession.settings,
        currentChatMessages: messages,
        onFullResponse: () => {},
        onError: (err) => { throw new Error(err); },
        onComplete: () => {},
        logApiRequestCallback: () => {},
        isManualCacheCreationMode: true,
        manualCacheMessageCount: messageCount,
        sessionToUpdate: currentChatSession
      });

      if (!cacheResult) {
          throw new Error("Failed to create cache.");
      }

      const fingerprint = generateChatFingerprint(currentChatSession, messageCount);

      updateCurrentChatSession(session => {
        if (!session) return null;
        return {
          ...session,
          manualCacheInfo: {
            id: cacheResult.id,
            expireTime: cacheResult.expireTime,
            cachedMessageCount: messageCount,
            fingerprint
          }
        };
      });

      showToast("Cache created successfully!", "success");
      closeCacheManagerModal();
    } catch (error: any) {
      console.error("Failed to create cache:", error);
      showToast(`Failed to create cache: ${error.message}`, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClearCache = () => {
    updateCurrentChatSession(session => {
      if (!session) return null;
      return { ...session, manualCacheInfo: undefined };
    });
    showToast("Cache cleared.", "success");
  };

  if (!isCacheManagerModalOpen || !currentChatSession) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay/80 backdrop-blur-sm p-4" onClick={closeCacheManagerModal}>
      <div className="bg-bg-panel border border-border-base rounded-2xl shadow-panel w-full max-w-md overflow-hidden flex flex-col animate-modal-open text-text-primary" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-base bg-bg-element">
              <div className="flex items-center gap-2 text-text-primary">
                <ServerIcon className="w-5 h-5 text-brand-primary" />
                <h2 className="font-semibold">Context Caching</h2>
              </div>
              <Button
                variant="ghost"
                onClick={closeCacheManagerModal}
                className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary"
              >
                <CloseIcon className="w-5 h-5" />
              </Button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              
              {/* Status Banner */}
              {currentCache && (
                <div className={`p-3 rounded-xl flex items-start gap-3 text-sm ${
                  isInvalid ? 'bg-tint-red-bg/10 text-tint-red-text border border-tint-red-border/20' :
                  isExpired ? 'bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20' :
                  'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                }`}>
                  {isInvalid ? <XCircleIcon className="w-5 h-5 shrink-0" /> :
                   isExpired ? <InfoIcon className="w-5 h-5 shrink-0" /> :
                   <CheckCircleIcon className="w-5 h-5 shrink-0" />}
                  <div>
                    <p className="font-medium">
                      {isInvalid ? 'Cache Invalidated' : isExpired ? 'Cache Expired' : 'Cache Active'}
                    </p>
                    <p className="opacity-80 mt-0.5">
                      {isInvalid ? 'The chat history or settings have changed since the cache was created.' : 
                       isExpired ? 'The cache has reached its TTL and needs to be recreated.' : 
                       `Caching ${currentCache.cachedMessageCount} messages. Expires in ${Math.round((currentCache.expireTime - Date.now()) / 60000)} mins.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-bg-element rounded-xl p-4 text-sm text-text-secondary space-y-2 border border-border-base">
                <p className="flex gap-2">
                  <InfoIcon className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                  <span>Caching reduces token costs and latency for long conversations.</span>
                </p>
                <p className="pl-6 opacity-80">
                  Select how many messages from the beginning of the chat to cache. A minimum of ~32,000 tokens is required.
                </p>
              </div>

              {/* Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-sm font-medium text-text-primary">Messages to Cache</label>
                  <span className="text-xs text-text-muted font-mono">{messageCount} / {maxMessages}</span>
                </div>
                
                <input
                  type="range"
                  min="0"
                  max={maxMessages}
                  value={messageCount}
                  onChange={(e) => setMessageCount(parseInt(e.target.value))}
                  className="w-full accent-brand-primary bg-bg-track rounded-lg appearance-none h-2 cursor-pointer"
                />

                <div className="flex justify-between text-xs">
                  <span className={`font-mono ${isEligible ? 'text-brand-primary' : 'text-text-muted'}`}>
                    ~{estimatedTokens.toLocaleString()} tokens
                  </span>
                  {!isEligible && messageCount > 0 && (
                    <span className="text-tint-red-text">Need 32k+ tokens</span>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-base bg-bg-element flex justify-between gap-3">
              {currentCache ? (
                <Button
                  variant="ghost"
                  onClick={handleClearCache}
                  icon={<TrashIcon className="w-4 h-4" />}
                  className="text-tint-red-text hover:text-tint-red-text/80 hover:bg-tint-red-bg/10"
                >
                  Clear Cache
                </Button>
              ) : <div />}
              
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={closeCacheManagerModal}
                  className="hover:bg-bg-hover"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateCache}
                  disabled={!isEligible || isCreating}
                  isLoading={isCreating}
                  className="bg-brand-primary hover:bg-brand-primary/80"
                >
                  {isCreating ? 'Creating...' : 'Create Cache'}
                </Button>
              </div>
            </div>
      </div>
    </div>
  );
};
