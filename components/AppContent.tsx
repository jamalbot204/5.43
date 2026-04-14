
import React, { useRef, useCallback, useState, memo, useEffect, useMemo, Suspense } from 'react';
import { useAudioStore } from '../store/useAudioStore.ts';
import { useGlobalUiStore } from '../store/useGlobalUiStore.ts';
import { useChatListStore } from '../store/useChatListStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { splitTextForTts, parseInteractiveChoices } from '../services/utils.ts';
import { DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { useTranslation } from '../hooks/useTranslation.ts';
import { useShallow } from 'zustand/react/shallow';
import { ChatMessageRole } from '../types.ts';
import { useStreamingStore } from '../store/useStreamingStore.ts';

import Sidebar from './panels/Sidebar.tsx';
import ChatView from './chat/ChatView.tsx';
import ToastNotification from './common/ToastNotification.tsx';
import ProgressNotification from './common/ProgressNotification.tsx';
import ModalManager from './managers/ModalManager.tsx';

const ReadModeView = React.lazy(() => import('./panels/ReadModeView.tsx'));
const AdvancedAudioPlayer = React.lazy(() => import('./audio/AdvancedAudioPlayer.tsx'));

const AppContent: React.FC = memo(() => {
  const { isLoadingData } = useChatListStore();
  
  const {
      audioId,
      audioIsLoading,
      audioIsPlaying,
      audioText
  } = useAudioStore(useShallow(state => ({
      audioId: state.audioPlayerState.currentMessageId,
      audioIsLoading: state.audioPlayerState.isLoading,
      audioIsPlaying: state.audioPlayerState.isPlaying,
      audioText: state.audioPlayerState.currentPlayingText
  })));

  const { 
      handleClosePlayerViewOnly, 
      seekRelative, 
      seekToAbsolute, 
      togglePlayPause, 
      increaseSpeed, 
      decreaseSpeed, 
      playNextPart, 
      playPreviousPart 
  } = useAudioStore(useShallow(state => ({
      handleClosePlayerViewOnly: state.handleClosePlayerViewOnly,
      seekRelative: state.seekRelative,
      seekToAbsolute: state.seekToAbsolute,
      togglePlayPause: state.togglePlayPause,
      increaseSpeed: state.increaseSpeed,
      decreaseSpeed: state.decreaseSpeed,
      playNextPart: state.playNextPart,
      playPreviousPart: state.playPreviousPart
  })));

  const { isStreaming, streamingMessageId } = useStreamingStore(useShallow(state => ({
      isStreaming: state.isStreaming,
      streamingMessageId: state.streamingMessageId
  })));

  const { isSidebarOpen, closeSidebar } = useGlobalUiStore();
  const chatViewRef = useRef<any>(null);
  const { t } = useTranslation();

  const [isReadModeOpen, setIsReadModeOpen] = useState(false);
  const [readModeMessageId, setReadModeMessageId] = useState<string | null>(null);

  const handleEnterReadMode = useCallback((messageId: string) => {
    setReadModeMessageId(messageId);
    setIsReadModeOpen(true);
  }, []);

  const handleCloseReadMode = useCallback(() => {
    setIsReadModeOpen(false);
    setReadModeMessageId(null);
  }, []);

  // ----------------------------------

  const handleScrollToMessage = useCallback((messageId: string) => {
    if (chatViewRef.current) {
      chatViewRef.current.scrollToMessage(messageId);
    }
  }, []);

  const handleGoToMessageFromAudio = useCallback(() => {
    if (audioId) {
      const baseMessageId = audioId.split('_part_')[0];
      handleScrollToMessage(baseMessageId);
    }
  }, [audioId, handleScrollToMessage]);

  const handleEnterReadModeFromPlayer = useCallback(() => {
    // Determine the base message ID from the playing audio ID
    if (audioId) {
        const baseId = audioId.split('_part_')[0];
        handleEnterReadMode(baseId);
    }
  }, [audioId, handleEnterReadMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !audioId) {
        return;
      }
      
      const activeElement = document.activeElement;
      const isTyping = activeElement instanceof HTMLElement && (
                       activeElement.tagName === 'INPUT' || 
                       activeElement.tagName === 'TEXTAREA' || 
                       activeElement.isContentEditable);

      if (isTyping) {
        return;
      }

      event.preventDefault();
      togglePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [audioId, togglePlayPause]);

  const isAudioBarVisible = !!(audioId || audioIsLoading || audioIsPlaying || audioText) && !isReadModeOpen;
  
  return (
    <div className="flex h-[100dvh] antialiased bg-bg-app text-text-primary overflow-hidden w-screen">
      
        <div className={`fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-[85vw] sm:w-72`}>
          <Sidebar />
        </div>

        <div 
          className={`fixed inset-0 z-20 bg-bg-overlay/50 transition-opacity duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
          onClick={closeSidebar} 
          aria-hidden="true" 
        />
        
        <main className={`relative z-10 flex-1 flex flex-col overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform translate-x-0 ${isSidebarOpen ? 'md:translate-x-72' : ''} ${isAudioBarVisible ? 'pt-[76px]' : ''}`}>
          <ChatView ref={chatViewRef} onEnterReadMode={handleEnterReadMode} />
        </main>
        
        <div className='absolute'>
            <Suspense fallback={null}>
                {isAudioBarVisible && (
                    <div className={`fixed top-0 left-0 right-0 z-30 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform translate-x-0 ${isSidebarOpen ? 'md:translate-x-72' : ''}`}>
                      <AdvancedAudioPlayer
                        onCloseView={handleClosePlayerViewOnly} 
                        onSeekRelative={seekRelative}
                        onSeekToAbsolute={seekToAbsolute}
                        onTogglePlayPause={togglePlayPause}
                        onGoToMessage={handleGoToMessageFromAudio}
                        onIncreaseSpeed={increaseSpeed} 
                        onDecreaseSpeed={decreaseSpeed}
                        onEnterReadMode={handleEnterReadModeFromPlayer}
                        onPlayNext={playNextPart}
                        onPlayPrevious={playPreviousPart}
                      />
                    </div>
                )}

                {isReadModeOpen && (
                    <ReadModeView 
                        isOpen={isReadModeOpen} 
                        messageId={readModeMessageId}
                        onClose={handleCloseReadMode}
                        onGoToMessage={() => {
                            if (readModeMessageId) handleScrollToMessage(readModeMessageId);
                        }}
                        onPlayNext={playNextPart}
                        onPlayPrevious={playPreviousPart}
                        isStreaming={isStreaming && streamingMessageId === readModeMessageId}
                    />
                )}
                
                <ModalManager onScrollToMessage={handleScrollToMessage} />
            </Suspense>
          
          <ToastNotification />
          <ProgressNotification />
        </div>
    </div>
  );
});

export default AppContent;