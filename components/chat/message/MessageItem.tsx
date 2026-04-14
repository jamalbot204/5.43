
import React, { memo, useMemo, useCallback } from 'react';
import { ChatMessage, ChatMessageRole } from '../../../types.ts';
import ResetAudioCacheButton from '../../common/ResetAudioCacheButton.tsx';
import { useConfirmationUI } from '../../../store/ui/useConfirmationUI.ts';
import { useSelectionStore } from '../../../store/useSelectionStore.ts';
import { useAudioStore } from '../../../store/useAudioStore.ts';
import {
    MagnifyingGlassIcon, UsersIcon, StarIcon, GitHubIcon, ArrowPathIcon, BrainIcon, ClockIcon, TrashIcon, KeyIcon, SparklesIcon
} from '../../common/Icons.tsx';
import { splitTextForTts, parseInteractiveChoices } from '../../../services/utils.ts';
import { extractThoughtsByTag } from '../../../services/llm/utils.ts';
import { useActiveChatStore } from '../../../store/useActiveChatStore.ts';
import { useInteractionStore } from '../../../store/useInteractionStore.ts';
import { useDataStore } from '../../../store/useDataStore.ts';
import { useTranslation } from '../../../hooks/useTranslation.ts';
import { useSettingsUI } from '../../../store/ui/useSettingsUI.ts';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsPersistence } from '../../../hooks/useSettingsPersistence.ts';
import { useStreamingStore } from '../../../store/useStreamingStore.ts';

// Sub-components
import MessageContent from './MessageContent.tsx';
import MessageAudioControls from './MessageAudioControls.tsx';
import MessageAttachments from './MessageAttachments.tsx';
import MessageActions from './MessageActions.tsx';
import MessageThoughts from './MessageThoughts.tsx';
import PythonExecutionBlock from './PythonExecutionBlock.tsx';
import InteractiveChoices from './InteractiveChoices.tsx';
import MessageSources from './MessageSources.tsx';
import { Button } from '../../ui/Button.tsx';

interface MessageItemProps {
  message: ChatMessage;
  canRegenerateFollowingAI?: boolean;
  chatScrollContainerRef?: React.RefObject<HTMLDivElement>;
  highlightTerm?: string;
  onEnterReadMode: (messageId: string) => void;
  isContentExpanded?: boolean;
  isThoughtsExpanded?: boolean;
  onToggleExpansion: (messageId: string, type: 'content' | 'thoughts') => void;
  isLatestMemoryUpdate?: boolean; 
}

const MessageItemComponent: React.FC<MessageItemProps> = ({ message, canRegenerateFollowingAI, highlightTerm, onEnterReadMode, isContentExpanded, isThoughtsExpanded, onToggleExpansion, isLatestMemoryUpdate }) => {
  const streamingState = useStreamingStore(useShallow(state => ({
      isStreamingHere: state.streamingMessageId === message.id,
      text: state.streamingText
  })));

  const { messageGenerationTimes } = useDataStore(useShallow(state => ({
      messageGenerationTimes: state.messageGenerationTimes
  })));
  const { isInteractiveChoicesEnabled, ttsSettings, enableCustomThoughtParsing, customThoughtTagName } = useActiveChatStore(useShallow(state => ({
      isInteractiveChoicesEnabled: state.currentChatSession?.settings.enableInteractiveChoices ?? false,
      ttsSettings: state.currentChatSession?.settings?.ttsSettings,
      enableCustomThoughtParsing: state.currentChatSession?.settings?.enableCustomThoughtParsing ?? false,
      customThoughtTagName: state.currentChatSession?.settings?.customThoughtTagName ?? 'think'
  })));
  const { toggleFavoriteMessage } = useInteractionStore();
  const { saveSessionSettings } = useSettingsPersistence();
  
  const { requestResetAudioCacheConfirmation, requestDeleteConfirmation } = useConfirmationUI();
  
  const audioState = useAudioStore(useShallow(state => ({
      currentMessageId: state.audioPlayerState.currentMessageId,
      isPlaying: state.audioPlayerState.isPlaying,
      isLoading: state.audioPlayerState.isLoading,
      globalError: state.audioPlayerState.error,
      fetchingSegmentIds: state.fetchingSegmentIds,
      segmentFetchErrors: state.segmentFetchErrors,
      activeMultiPartFetches: state.activeMultiPartFetches,
  })));

  const { isSelectionModeActive, toggleMessageSelection, selectRange } = useSelectionStore(useShallow(state => ({
      isSelectionModeActive: state.isSelectionModeActive,
      toggleMessageSelection: state.toggleMessageSelection,
      selectRange: state.selectRange
  })));

  const selectionOrder = useSelectionStore(state => {
      if (!state.isSelectionModeActive) return 0;
      const idx = state.selectedMessageIds.indexOf(message.id);
      return idx + 1;
  });
  const isSelected = selectionOrder > 0;

  const { openChatAttachmentsModal } = useSettingsUI();
  const { t } = useTranslation();

  // --- Range Selection Handler ---
  const handleSelectionClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isSelectionModeActive) return;

      const currentChatSession = useActiveChatStore.getState().currentChatSession;

      if (e.shiftKey && currentChatSession?.messages) {
          e.preventDefault(); // Prevent text selection
          selectRange(message.id, currentChatSession.messages);
      } else {
          toggleMessageSelection(message.id);
      }
  }, [isSelectionModeActive, message.id, selectRange, toggleMessageSelection]);
  // ------------------------------

  // --- Interactive Choices Logic ---
  const rawContentToUse = streamingState.isStreamingHere ? streamingState.text : message.content;

  const { cleanContent, choices, extractedThoughtsStream } = useMemo(() => {
      const content = streamingState.isStreamingHere ? streamingState.text : message.content;
      
      let finalContent = content;
      let thoughts = message.thoughts || "";

      if (enableCustomThoughtParsing && customThoughtTagName && streamingState.isStreamingHere) {
          const extracted = extractThoughtsByTag(content, customThoughtTagName);
          finalContent = extracted.cleanText;
          thoughts = extracted.extractedThoughts;
      }

      if (!isInteractiveChoicesEnabled || !finalContent) {
          return { cleanContent: finalContent, choices: [], extractedThoughtsStream: thoughts };
      }
      return { ...parseInteractiveChoices(finalContent), extractedThoughtsStream: thoughts };
  }, [streamingState.isStreamingHere, streamingState.text, message.content, message.thoughts, isInteractiveChoicesEnabled, enableCustomThoughtParsing, customThoughtTagName]);
  
  const displayContent = cleanContent;
  const extractedThoughts = extractedThoughtsStream;
  // ---------------------------------

  const handleLockSeed = useCallback(async () => {
      const currentChatSession = useActiveChatStore.getState().currentChatSession;
      if (!currentChatSession || message.seedUsed === undefined) return;
      
      await saveSessionSettings({
          ...currentChatSession.settings,
          seed: message.seedUsed
      }, t.seedLocked);
  }, [message.seedUsed, saveSessionSettings, t.seedLocked]);

  if (message.isTimeMarker) {
      const date = new Date(message.timestamp);
      const displayTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const displayDate = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

      return (
          <div className="flex justify-center items-center my-6 w-full opacity-70 select-none pointer-events-none animate-message-enter">
              <span className="text-[10px] sm:text-xs font-medium text-text-muted bg-bg-element px-3 py-1 rounded-full border border-border-light flex items-center shadow-sm">
                  <ClockIcon className="w-3 h-3 mr-1.5 opacity-60" />
                  {displayDate} &bull; {displayTime}
              </span>
          </div>
      );
  }

  const isUser = message.role === ChatMessageRole.USER;
  const isError = message.role === ChatMessageRole.ERROR;
  const isModel = message.role === ChatMessageRole.MODEL;

  const maxWordsForThisMessage = message.ttsWordsPerSegmentCache ?? ttsSettings?.maxWordsPerSegment ?? 999999;
  const textSegmentsForTts = splitTextForTts(displayContent, maxWordsForThisMessage); // Use displayContent (cleaned) for TTS
  const hasAnyCachedAudio = !!message.cachedAudioSegmentCount && message.cachedAudioSegmentCount > 0;
  const allTtsPartsCached = hasAnyCachedAudio && message.cachedAudioSegmentCount === textSegmentsForTts.length;

  if (message.role === ChatMessageRole.SYSTEM) {
    const isGithubMessage = message.content.includes("GitHub repository");
    return ( <div className="flex justify-center items-center my-3 w-full animate-message-enter" id={`message-item-${message.id}`}><div className="text-center text-xs text-text-muted bg-bg-element px-4 py-1.5 rounded-full shadow-inner flex items-center gap-2 border border-border-light">{isGithubMessage && <GitHubIcon className="w-4 h-4 flex-shrink-0" />}<p>{message.content}</p></div></div>);
  }

  if (message.isSystemReminder) {
      const isSelectedAnchor = isSelectionModeActive && isSelected;
      
      const handleDeleteAnchor = (e: React.MouseEvent) => {
          e.stopPropagation();
          const currentChatSession = useActiveChatStore.getState().currentChatSession;
          if (currentChatSession) {
             requestDeleteConfirmation({ sessionId: currentChatSession.id, messageId: message.id });
          }
      };

      return (
          <div 
            className={`flex justify-center items-center my-2 w-full group/divider relative animate-message-enter transition duration-200 ${isSelectionModeActive ? 'cursor-pointer' : ''} ${isSelectedAnchor ? 'bg-tint-emerald-bg/10 py-3 rounded-xl border border-tint-emerald-border/20 my-3' : ''}`} 
            id={`message-item-${message.id}`}
            onClick={handleSelectionClick}
          >
              <div className="relative flex items-center">
                  <div 
                      className={`flex items-center justify-center p-2 rounded-full bg-bg-element border border-border-light transition cursor-help ${isLatestMemoryUpdate ? 'border-tint-cyan-border/20 shadow-glow bg-tint-cyan-bg/10' : 'hover:border-tint-emerald-border/20 hover:bg-tint-emerald-bg/20'}`}
                  >
                      {isLatestMemoryUpdate ? (
                          <BrainIcon className="w-4 h-4 text-tint-cyan-text animate-pulse" />
                      ) : (
                          <ArrowPathIcon className="w-3.5 h-3.5 text-text-muted group-hover/divider:text-tint-emerald-text transition-colors" />
                      )}
                  </div>
                  
                  {!isSelectionModeActive && (
                      <Button
                          onClick={handleDeleteAnchor}
                          variant="ghost"
                          size="none"
                          className="absolute left-full ml-3 p-2 text-text-muted hover:text-tint-red-text bg-bg-panel rounded-full border border-border-light opacity-0 group-hover/divider:opacity-100 transition duration-200 hover:bg-tint-red-bg/20 hover:border-tint-red-border/20 transform -translate-x-2 group-hover/divider:translate-x-0 z-30"
                          title="Delete Anchor (Rollback Memory)"
                      >
                          <TrashIcon className="w-3.5 h-3.5" />
                      </Button>
                  )}
              </div>
              
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-auto max-w-[90vw] sm:max-w-sm bg-bg-panel border border-border-light rounded-lg p-3 shadow-xl opacity-0 group-hover/divider:opacity-100 transition-opacity pointer-events-none group-hover/divider:pointer-events-auto z-20">
                  <p className="text-xs font-bold text-text-muted mb-1 flex items-center">
                      {isLatestMemoryUpdate ? <BrainIcon className="w-3 h-3 mr-1.5 text-tint-cyan-text"/> : null}
                      {message.hasMemoryUpdate ? (isLatestMemoryUpdate ? "USER PROFILE UPDATE (Current)" : "USER PROFILE SNAPSHOT") : "System Reminder Injected"}
                  </p>
                  <pre className="text-[10px] text-text-secondary font-mono whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                      {message.content}
                  </pre>
              </div>
          </div>
      );
  }

  const layoutClasses = isUser ? 'justify-end' : 'justify-start';
  const generationTime = messageGenerationTimes[message.id];
  const groundingChunks = message.groundingMetadata?.groundingChunks;
  
  let bubbleClasses = '';
  if (isUser) {
      bubbleClasses = 'bg-bubble-user border border-border-light rounded-2xl px-5 py-4 text-text-primary shadow-panel';
  } else if (isError) {
      bubbleClasses = 'bg-tint-red-bg/10 border border-tint-red-border/20 text-tint-red-text shadow-panel rounded-2xl rounded-bl-sm';
  } else {
      bubbleClasses = 'bg-bubble-ai border border-border-light rounded-2xl px-5 py-4 text-text-primary shadow-panel';
  }

  const isMainButtonMultiFetching = audioState.activeMultiPartFetches.has(message.id);
  const isFetchingThisSegment = (textSegmentsForTts.length <= 1 && audioState.fetchingSegmentIds.has(message.id));
  const isPlayingThisMessage = audioState.currentMessageId?.startsWith(message.id) && (audioState.isLoading || audioState.isPlaying);
  
  const isAnyAudioOperationActiveForMessage = message.isStreaming || isMainButtonMultiFetching || isFetchingThisSegment || isPlayingThisMessage;

  const handleResetCacheClick = () => { 
      const currentChatSession = useActiveChatStore.getState().currentChatSession;
      if (!currentChatSession) return; 
      requestResetAudioCacheConfirmation(currentChatSession.id, message.id); 
  };

  const segmentFetchError = audioState.segmentFetchErrors.get(message.id);
  const currentPlayerError = (audioState.currentMessageId?.startsWith(message.id) ? audioState.globalError : null);
  const overallAudioErrorMessage = segmentFetchError || currentPlayerError;
  const hasErrorOverall = !!overallAudioErrorMessage;

  // Smart Error Handling Logic
  // Only show Refresh button if error is explicitly about attachments
  const shouldShowRefreshButton = isError && message.errorType === 'link_expired';

  return (
    <div 
        id={`message-item-${message.id}`} 
        className={`group flex items-start mb-4 w-full relative transition-colors duration-200 animate-message-enter ${isSelected ? 'bg-tint-emerald-bg/10 rounded-xl -mx-2 px-2 py-2 border border-tint-emerald-border/20' : ''} ${isSelectionModeActive ? 'cursor-pointer' : ''} ${layoutClasses} message-item-root`} 
        onClick={handleSelectionClick} 
        role="listitem"
    >
      {!isUser && isSelectionModeActive && (
          <div className="flex-shrink-0 self-center px-2 flex items-center space-x-2">
              {selectionOrder > 0 && (
                  <span className="text-xs font-bold text-tint-emerald-text bg-tint-emerald-bg/10 rounded-full w-5 h-5 flex items-center justify-center shadow">
                      {selectionOrder}
                  </span>
              )}
              <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={() => {}} /* Handled by parent div onClick for shift support */
                className="w-4 h-4 text-tint-emerald-text bg-bg-app border-border-base rounded focus:ring-ring-focus cursor-pointer pointer-events-none" 
                aria-label={`Select message from ${message.role}`} 
              />
          </div>
      )}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full lg:max-w-5xl w-full sm:w-auto min-w-0`}>
        {isModel && !isError && extractedThoughts && (
            <MessageThoughts 
                messageId={message.id}
                thoughts={extractedThoughts} 
            />
        )}
        {(isUser || isModel || isError) && (
            <div className={`px-5 py-4 ${bubbleClasses} relative w-full sm:w-auto mt-1 min-w-[100px] max-w-full`}>
                <div className="sticky top-2 z-20 flex w-full h-0 pointer-events-none">
                    <div className="absolute top-0 w-fit ltr:-left-3 rtl:-right-3 flex items-start opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-auto" aria-label="Message actions">
                        <div className="flex items-center gap-1 scale-90 hover:scale-100 origin-top">
                            {displayContent.trim() && !isError && !message.isGithubContextMessage && (
                                <>
                                    <MessageAudioControls 
                                        message={message} 
                                        displayContent={displayContent} 
                                        textSegmentsForTts={textSegmentsForTts} 
                                        allTtsPartsCached={allTtsPartsCached} 
                                        hasAnyCachedAudio={hasAnyCachedAudio} 
                                        isSelectionModeActive={isSelectionModeActive} 
                                    />
                                    {hasAnyCachedAudio && !isAnyAudioOperationActiveForMessage && (
                                        <ResetAudioCacheButton onClick={handleResetCacheClick} disabled={isAnyAudioOperationActiveForMessage || isSelectionModeActive} title={t.resetAudioCache} className="hover:bg-bg-hover" />
                                    )}
                                </>
                            )}
                            {/* Hide Actions menu for errors to simplify UI as requested */}
                            {!isError && (
                                <MessageActions 
                                    message={message} 
                                    isSelectionModeActive={isSelectionModeActive} 
                                    canRegenerateFollowingAI={!!canRegenerateFollowingAI} 
                                    onEnterReadMode={onEnterReadMode}
                                    displayContent={displayContent}
                                    allTtsPartsCached={allTtsPartsCached}
                                    textSegmentsForTts={textSegmentsForTts}
                                />
                            )}
                        </div>
                    </div>

                    {!isError && (
                        <Button
                            onClick={() => toggleFavoriteMessage(message.id)}
                            title={message.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                            aria-label={message.isFavorited ? 'Remove message from favorites' : 'Add message to favorites'}
                            variant="ghost"
                            size="none"
                            className={`absolute top-0 ltr:-right-3 rtl:-left-3 p-2 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 rounded-full hover:bg-bg-hover ${isSelectionModeActive ? 'hidden' : ''} pointer-events-auto`}
                        >
                            <StarIcon filled={!!message.isFavorited} className={`w-3.5 h-3.5 ${message.isFavorited ? 'text-tint-amber-text' : 'text-current opacity-50 hover:opacity-100'}`} />
                        </Button>
                    )}
                </div>

                <>{isModel && message.characterName && (<div className="flex items-center mb-2 pb-1 border-b border-border-light"><UsersIcon className="w-3.5 h-3.5 mr-1.5 text-tint-purple-text" /><p className="text-xs font-bold text-tint-purple-text uppercase tracking-wide">{message.characterName}</p></div>)}
                
                {message.toolInvocations && message.toolInvocations.length > 0 && (
                    <div className="mb-2">
                        {message.toolInvocations.map((invocation, idx) => (
                            invocation.toolName === 'execute_python' ? (
                                <PythonExecutionBlock key={idx} invocation={invocation} />
                            ) : null
                        ))}
                    </div>
                )}

                {message.isGithubContextMessage ? (
                    <div className="flex items-center space-x-2 text-sm py-2">
                        <GitHubIcon className="w-5 h-5 flex-shrink-0 opacity-80" />
                        <span className="font-medium">{t.githubContextAdded}</span>
                    </div>
                ) : (
                    <MessageContent 
                        message={message}
                        displayContent={displayContent} 
                        highlightTerm={highlightTerm} 
                        isContentExpanded={!!isContentExpanded} 
                        onToggleExpansion={onToggleExpansion} 
                        isStreaming={message.isStreaming}
                    />
                )}
                {/* Interactive Choices Rendering */}
                {isInteractiveChoicesEnabled && choices.length > 0 && (
                    <InteractiveChoices choices={choices} />
                )}

                {/* Specific Error Actions: Refresh Link */}
                {shouldShowRefreshButton && (
                    <div className="mt-3 bg-tint-red-bg/10 border border-tint-red-border/30 rounded-lg p-3">
                        <Button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                const currentChatSession = useActiveChatStore.getState().currentChatSession;
                                currentChatSession && openChatAttachmentsModal(currentChatSession, { autoHighlightRefresh: true }); 
                            }}
                            variant="danger"
                            className="flex items-center px-4 py-2 text-xs font-bold rounded-md transition-colors w-full sm:w-auto justify-center"
                        >
                            <ArrowPathIcon className="w-3.5 h-3.5 ltr:mr-2 rtl:ml-2 rtl:mr-0 animate-pulse" />
                            Refresh Attachments (Fix Link)
                        </Button>
                    </div>
                )}

                <MessageAttachments 
                    messageId={message.id} 
                    attachments={message.attachments || []} 
                    isSelectionModeActive={isSelectionModeActive} 
                />
                
                <MessageSources groundingMetadata={message.groundingMetadata} toolInvocations={message.toolInvocations} /></>
                <><div className="text-[10px] mt-2 opacity-60 flex items-center space-x-2 font-medium">
                    <span>{new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    {message.modelName && (
                        <>
                            <span>&bull;</span>
                            <span className="flex items-center text-tint-purple-text font-bold" title="Model used for this response">
                                <SparklesIcon className="w-3 h-3 mr-1" />
                                {message.modelName}
                            </span>
                        </>
                    )}
                    {displayContent.trim() && !isError && (
                        <>
                            <span>&bull;</span>
                            <span>{displayContent.trim().split(/\s+/).filter(Boolean).length} words</span>
                        </>
                    )}
                {message.hasMemoryUpdate && (
                    <>
                        <span>&bull;</span>
                        <span 
                            className={`flex items-center font-bold ${isLatestMemoryUpdate ? 'text-tint-cyan-text animate-pulse' : 'text-text-muted'}`} 
                            title={isLatestMemoryUpdate ? "User Profile Update (Current)" : "User Profile Snapshot (Historical)"}
                        >
                            <BrainIcon className="w-3 h-3 mr-1" />
                            {isLatestMemoryUpdate ? "Profile Updated" : "Profile Snapshot"}
                        </span>
                    </>
                )}
                {/* Seed Display */}
                {message.seedUsed !== undefined && (
                    <>
                        <span>&bull;</span>
                        <div className="flex items-center gap-1 group/seed">
                            <span 
                                className="flex items-center cursor-help text-tint-teal-text/70 hover:text-tint-teal-text transition-colors"
                                title={`Seed: ${message.seedUsed}`}
                            >
                                <KeyIcon className="w-3 h-3 mr-0.5" />
                                {message.seedUsed}
                            </span>
                            <Button
                                onClick={handleLockSeed}
                                variant="ghost"
                                size="none"
                                className="opacity-0 group-hover/seed:opacity-100 text-tint-teal-text hover:text-tint-teal-text/80 p-0.5 rounded hover:bg-tint-teal-bg/30 transition"
                                title={t.lockSeed}
                            >
                                <ArrowPathIcon className="w-3 h-3" />
                            </Button>
                        </div>
                    </>
                )}
                </div>{isModel && generationTime !== undefined && (<p className="text-[10px] mt-0.5 text-tint-emerald-text">Generated in {generationTime.toFixed(1)}s</p>)}{hasErrorOverall && (<p className="text-xs mt-1 text-tint-red-text bg-tint-red-bg/10 px-2 py-1 rounded border border-tint-red-border/20" title={overallAudioErrorMessage || undefined}>{t.audioError}: {overallAudioErrorMessage?.substring(0,50) || "Playback failed."}{overallAudioErrorMessage && overallAudioErrorMessage.length > 50 ? "..." : ""}</p>)}
                </>
            </div>
        )}
      </div>
       {isUser && isSelectionModeActive && (
           <div className="flex-shrink-0 self-center px-2 flex items-center space-x-2">
               {selectionOrder > 0 && (
                   <span className="text-xs font-bold text-tint-emerald-text bg-tint-emerald-bg/10 rounded-full w-5 h-5 flex items-center justify-center shadow">
                       {selectionOrder}
                   </span>
               )}
               <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={() => {}} /* Handled by parent div onClick for shift support */
                className="w-4 h-4 text-tint-emerald-text bg-bg-app border-border-base rounded focus:ring-ring-focus cursor-pointer pointer-events-none" 
                aria-label={`Select message from ${message.role}`} 
               />
           </div>
       )}
    </div>
  );
};

export default memo(MessageItemComponent);
