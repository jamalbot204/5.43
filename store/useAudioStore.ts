
import { create } from 'zustand';
import { AudioPlayerState, ChatMessage } from '../types.ts';
import { generateSpeech, decodePcmToAudioBuffer } from '../services/ttsService.ts';
import { strictAbort } from '../services/cancellationService.ts';
import * as audioUtils from '../services/audioUtils.ts';
import { audioWorkerService } from '../services/audioWorkerService.ts';
import * as dbService from '../services/dbService.ts';
import { splitTextForTts, sanitizeFilename, triggerDownload } from '../services/utils.ts';
import { MAX_WORDS_PER_TTS_SEGMENT, APP_TITLE, DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { useSelectionStore } from './useSelectionStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useConfirmationUI } from './ui/useConfirmationUI.ts'; // NEW
import { useEditorUI } from './ui/useEditorUI.ts'; // NEW
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useDummyAudioStore } from './useDummyAudioStore.ts';
import { useProgressStore } from './useProgressStore.ts';
import { audioPlayerService } from '../services/audioPlayerService.ts';
import JSZip from 'jszip';

interface AudioState {
  audioPlayerState: AudioPlayerState;
  fetchingSegmentIds: Set<string>;
  segmentFetchErrors: Map<string, string>;
  activeMultiPartFetches: Set<string>;
}

interface AudioActions {
  init: () => void;
  cleanup: () => void;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number, shouldPlayAfterFetch?: boolean) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (messageId: string, userProvidedName?: string) => void;
  handleBatchDownloadAudios: () => Promise<void>;
  handleResetAudioCache: (messageId: string) => void;
  handleResetAudioCacheForMultipleMessages: (messageIds: string[]) => Promise<void>;
  isMainButtonMultiFetchingApi: (baseId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification?: boolean) => void;
  handleCancelMultiPartFetch: (baseMessageId: string) => void;
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  setPlaybackSpeed: (speed: number) => void;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;
  playNextPart: () => void;
  playPreviousPart: () => void;
  setGrainSize: (size: number) => void;
  setOverlap: (overlap: number) => void;
}

export const useAudioStore = create<AudioState & AudioActions>((set, get) => {
  let currentAudioBuffer: AudioBuffer | null = null;
  
  const activeFetchControllers = new Map<string, AbortController>();
  const multiPartFetchControllers = new Map<string, AbortController>();
  const processedNewMessagesForAutoplay = new Set<string>();
  let autoPlayTimeout: number | null = null;

  const stopCurrentPlayback = (clearFullState = false) => {
    audioPlayerService.stop();
    
    if (clearFullState) {
      currentAudioBuffer = null;
      set(state => ({
        audioPlayerState: {
          ...state.audioPlayerState,
          isLoading: false, isPlaying: false, currentMessageId: null, currentPlayingText: null,
          currentTime: 0, duration: 0, error: null,
        }
      }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    } else {
      set(state => ({ audioPlayerState: { ...state.audioPlayerState, isPlaying: false } }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
    useDummyAudioStore.getState().pauseDummyAudio();
  };

  const handlePlaybackEnded = () => {
      stopCurrentPlayback(false);
      const { duration, currentMessageId } = get().audioPlayerState;
      set(s => ({ audioPlayerState: { ...s.audioPlayerState, currentTime: duration, isPlaying: false } }));
      
      if (currentMessageId) {
          const parts = currentMessageId.split('_part_');
          if (parts.length === 2) {
              const baseMessageId = parts[0];
              const playedPartIndex = parseInt(parts[1], 10);
              if (!isNaN(playedPartIndex)) {
                  const currentChatSession = useActiveChatStore.getState().currentChatSession;
                  const message = currentChatSession?.messages.find(m => m.id === baseMessageId);
                  if(message) {
                      const ttsSettings = currentChatSession?.settings.ttsSettings || DEFAULT_TTS_SETTINGS;
                      const maxWords = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment ?? 999999;
                      const allTextSegments = splitTextForTts(message.content, maxWords);
                      if (playedPartIndex + 1 < allTextSegments.length) {
                          get().handlePlayTextForMessage(message.content, baseMessageId, playedPartIndex + 1, true);
                      }
                  }
              }
          }
      }
  };

  const startPlaybackInternal = async (audioBuffer: AudioBuffer, startTimeOffset: number, textSegment: string, uniqueSegmentId: string) => {
    stopCurrentPlayback(false);
    currentAudioBuffer = audioBuffer;
    const duration = audioBuffer.duration;
    const safeStartTimeOffset = Math.max(0, Math.min(startTimeOffset, duration));
    const { playbackRate, grainSize, overlap } = get().audioPlayerState;

    set(state => ({
      audioPlayerState: {
        ...state.audioPlayerState, isLoading: false, isPlaying: true, currentMessageId: uniqueSegmentId,
        error: null, currentTime: safeStartTimeOffset, duration: duration, currentPlayingText: textSegment,
      },
      segmentFetchErrors: new Map(state.segmentFetchErrors).set(uniqueSegmentId, undefined as any)
    }));

    useDummyAudioStore.getState().playDummyAudio();

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: textSegment, artist: APP_TITLE });
      navigator.mediaSession.playbackState = 'playing';
    }

    await audioPlayerService.play(audioBuffer, safeStartTimeOffset, {
      playbackRate: playbackRate,
      grainSize: grainSize,
      overlap: overlap,
      onTimeUpdate: (currentTime) => {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, currentTime } }));
      },
      onEnded: handlePlaybackEnded
    });
  };

  const resumePlayback = async () => {
    const { isPlaying, currentMessageId, currentTime, currentPlayingText } = get().audioPlayerState;
    if (!isPlaying && currentMessageId && currentAudioBuffer) {
      try {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: true, error: null } }));
        await startPlaybackInternal(currentAudioBuffer, currentTime || 0, currentPlayingText || "", currentMessageId);
      } catch (e: any) {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: false, isPlaying: false, error: e.message || "Failed to resume." } }));
      }
    }
  };

  return {
    audioPlayerState: { 
      isLoading: false, 
      isPlaying: false, 
      currentMessageId: null, 
      error: null, 
      currentTime: 0, 
      duration: 0, 
      currentPlayingText: null, 
      playbackRate: 1.0,
      grainSize: 0.08, // Optimized for Speech (prev: 0.2)
      overlap: 0.04    // Optimized for Speech (prev: 0.1)
    },
    fetchingSegmentIds: new Set(),
    segmentFetchErrors: new Map(),
    activeMultiPartFetches: new Set(),

    init: () => {
      if (typeof window !== 'undefined') {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('pause', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('seekbackward', (details) => { get().seekRelative(-(details.seekOffset || 10)); });
          navigator.mediaSession.setActionHandler('seekforward', (details) => { get().seekRelative(details.seekOffset || 10); });
        }
      }
    },
    cleanup: () => {
      stopCurrentPlayback(true);
      activeFetchControllers.forEach(c => strictAbort(c));
      activeFetchControllers.clear();
      multiPartFetchControllers.forEach(c => strictAbort(c));
      multiPartFetchControllers.clear();
      if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
    },

    handlePlayTextForMessage: async (originalFullText, baseMessageId, partIndexToPlay, shouldPlayAfterFetch = false) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { logApiRequest } = useGeminiApiStore.getState();
        const { updateMessages } = useDataStore.getState();
    
        if (!currentChatSession || !currentChatSession.settings?.ttsSettings || !originalFullText.trim()) {
            useToastStore.getState().showToast("TTS settings or message not available.", "error");
            return;
        }
        
        // 1. Capture Session Context (Freeze) to handle race conditions if user switches chat
        const targetSessionId = currentChatSession.id;
        const ttsSettings = currentChatSession.settings.ttsSettings;
        const message = currentChatSession.messages.find(m => m.id === baseMessageId);
        if (!message) return;

        const resolvedMaxWords = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment ?? 999999;
        const textSegments = splitTextForTts(originalFullText, resolvedMaxWords);
    
        const fetchAndPlaySegment = async (partIndex: number) => {
          const uniqueSegmentId = `${baseMessageId}_part_${partIndex}`;
          const textSegment = textSegments[partIndex];
          await useApiKeyStore.getState().rotateActiveKey();
          const apiKey = useApiKeyStore.getState().activeApiKey?.value;
          if (!apiKey) {
            useToastStore.getState().showToast("API key not available for TTS.", "error");
            return;
          }

          const controller = new AbortController();
          activeFetchControllers.set(uniqueSegmentId, controller);
          set(s => ({
            fetchingSegmentIds: new Set(s.fetchingSegmentIds).add(uniqueSegmentId),
            audioPlayerState: { ...s.audioPlayerState, isLoading: true, currentMessageId: uniqueSegmentId, currentPlayingText: textSegment }
          }));

          try {
            const pcmData = await generateSpeech(apiKey, textSegment, ttsSettings, logApiRequest, controller.signal);
            if (controller.signal.aborted) throw new DOMException('Aborted');

            const mp3Data = await audioWorkerService.encodeMp3(pcmData, 24000);

            await dbService.setAudioBuffer(uniqueSegmentId, mp3Data);

            // 2. Targeted Update Logic (DB First)
            const dbSession = await dbService.getChatSession(targetSessionId);
            if (dbSession) {
                const msgIndex = dbSession.messages.findIndex(m => m.id === baseMessageId);
                if (msgIndex !== -1) {
                    const newMsgs = [...dbSession.messages];
                    const oldMsg = newMsgs[msgIndex];
                    newMsgs[msgIndex] = {
                        ...oldMsg,
                        cachedAudioSegmentCount: textSegments.length,
                        ttsWordsPerSegmentCache: resolvedMaxWords, 
                    };
                    await updateMessages(targetSessionId, newMsgs);
                }
            }

            // 3. Conditional UI Update (Only if user is still on this chat)
            if (useActiveChatStore.getState().currentChatId === targetSessionId) {
                await updateCurrentChatSession(s => {
                    if (!s) return null;
                    const msgIndex = s.messages.findIndex(m => m.id === baseMessageId);
                    if (msgIndex === -1) return s;
                    const newMsgs = [...s.messages];
                    const oldMsg = newMsgs[msgIndex];
                    const newBuffers = [...(oldMsg.cachedAudioBuffers || [])];
                    newBuffers[partIndex] = mp3Data;
                    newMsgs[msgIndex] = {
                      ...oldMsg,
                      cachedAudioBuffers: newBuffers,
                      cachedAudioSegmentCount: textSegments.length,
                      ttsWordsPerSegmentCache: resolvedMaxWords, 
                    };
                    return { ...s, messages: newMsgs };
                });
            }
            
            set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)) }));
            
            if (shouldPlayAfterFetch) {
                // Only play if we are still in the correct context
                if (useActiveChatStore.getState().currentChatId === targetSessionId) {
                    if (get().audioPlayerState.currentMessageId !== uniqueSegmentId) return; // Abort, another message selected
                    try {
                        const audioBuffer = await audioPlayerService.decodeAudioData(mp3Data.slice(0));
                        if (get().audioPlayerState.currentMessageId !== uniqueSegmentId) return;
                        await startPlaybackInternal(audioBuffer, 0, textSegment, uniqueSegmentId);
                    } catch (decodeError) {
                        console.error("Failed to decode new MP3 audio:", decodeError);
                        throw new Error("Failed to decode audio.");
                    }
                } else {
                     // Cleanup player state if we aren't playing (context switched)
                     if (get().audioPlayerState.currentMessageId === uniqueSegmentId) {
                         set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: false, isPlaying: false, currentMessageId: null, currentPlayingText: null } }));
                     }
                }
            } else {
                set(s => ({
                    audioPlayerState: {
                        ...s.audioPlayerState,
                        isLoading: false,
                        isPlaying: false,
                        currentMessageId: null,
                        currentPlayingText: null
                    }
                }));
            }

          } catch (e: any) {
            if (e.name !== 'AbortError') {
              set(s => ({
                fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)),
                audioPlayerState: { ...s.audioPlayerState, isLoading: false, error: e.message },
                segmentFetchErrors: new Map(s.segmentFetchErrors).set(uniqueSegmentId, e.message)
              }));
            }
          } finally {
            activeFetchControllers.delete(uniqueSegmentId);
          }
        };

        const playSinglePart = async (partIndex: number) => {
            const uniqueSegmentId = `${baseMessageId}_part_${partIndex}`;
            const textSegment = textSegments[partIndex];
            
            if (shouldPlayAfterFetch) {
                set(s => ({
                    audioPlayerState: { ...s.audioPlayerState, isLoading: true, currentMessageId: uniqueSegmentId, currentPlayingText: textSegment }
                }));
            }

            // Check active session cache first (only if matches target)
            let buffer: ArrayBuffer | null = null;
            const currentActive = useActiveChatStore.getState().currentChatSession;
            if (currentActive && currentActive.id === targetSessionId) {
                buffer = currentActive.messages.find(m => m.id === baseMessageId)?.cachedAudioBuffers?.[partIndex] ?? null;
            }

            if (!buffer) {
                buffer = await dbService.getAudioBuffer(uniqueSegmentId) || null;
                // If found in DB, inject into active session cache if applicable
                if (buffer && useActiveChatStore.getState().currentChatId === targetSessionId) {
                    await updateCurrentChatSession(s => {
                        if (!s) return null;
                        const msgIndex = s.messages.findIndex(m => m.id === baseMessageId);
                        if (msgIndex === -1) return s;
                        const newMsgs = [...s.messages];
                        const oldMsg = newMsgs[msgIndex];
                        const newBuffers = [...(oldMsg.cachedAudioBuffers || [])];
                        newBuffers[partIndex] = buffer;
                        newMsgs[msgIndex] = { ...oldMsg, cachedAudioBuffers: newBuffers };
                        return { ...s, messages: newMsgs };
                    });
                }
            }

            if (buffer) {
                if (buffer.byteLength === 0) {
                    console.error("Cached audio buffer is empty.");
                    await fetchAndPlaySegment(partIndex);
                    return;
                }

                // Only play if context matches
                if (useActiveChatStore.getState().currentChatId === targetSessionId) {
                    if (shouldPlayAfterFetch && get().audioPlayerState.currentMessageId !== uniqueSegmentId) {
                        return; // Abort playback, another message was selected
                    }
                    try {
                        const audioBuffer = await audioPlayerService.decodeAudioData(buffer.slice(0));
                        if (shouldPlayAfterFetch && get().audioPlayerState.currentMessageId !== uniqueSegmentId) return;
                        await startPlaybackInternal(audioBuffer, 0, textSegment, uniqueSegmentId);
                    } catch (e) {
                        console.warn("Standard audio decode failed, trying legacy PCM fallback...", e);
                        try {
                            const audioBuffer = await decodePcmToAudioBuffer(audioPlayerService.getRawContext(), buffer);
                            if (shouldPlayAfterFetch && get().audioPlayerState.currentMessageId !== uniqueSegmentId) return;
                            await startPlaybackInternal(audioBuffer, 0, textSegment, uniqueSegmentId);
                        } catch (legacyError) {
                            console.error("Both decoding methods failed. Re-fetching.", legacyError);
                            await fetchAndPlaySegment(partIndex);
                        }
                    }
                }
            } else {
                await fetchAndPlaySegment(partIndex);
            }
        };

        const playAllParts = async () => {
            if (shouldPlayAfterFetch) {
                set(s => ({
                    audioPlayerState: { ...s.audioPlayerState, isLoading: true, currentMessageId: `${baseMessageId}_part_0`, currentPlayingText: textSegments[0] }
                }));
            }

            const allBuffers: (ArrayBuffer | null)[] = [];
            for (let i = 0; i < textSegments.length; i++) {
                // Try active cache if context matches
                let buffer: ArrayBuffer | null = null;
                const currentActive = useActiveChatStore.getState().currentChatSession;
                if (currentActive && currentActive.id === targetSessionId) {
                    buffer = currentActive.messages.find(m => m.id === baseMessageId)?.cachedAudioBuffers?.[i] ?? null;
                }
                
                if (!buffer) {
                    buffer = await dbService.getAudioBuffer(`${baseMessageId}_part_${i}`) || null;
                }
                allBuffers.push(buffer);
            }

            if (allBuffers.every(b => b)) {
                await playSinglePart(0);
            } else {
               const totalParts = textSegments.length;
                const partsToFetchCount = allBuffers.filter(b => !b).length;
                if (partsToFetchCount > 0) {
                    if (totalParts > 1) {
                        useToastStore.getState().showToast(`Fetching audio for ${totalParts} parts. Please wait until ready.`, "success", 3000);
                    } else {
                        useToastStore.getState().showToast(`Fetching audio, please wait...`, "success", 2000);
                    }
                }
                const controller = new AbortController();
                multiPartFetchControllers.set(baseMessageId, controller);
                set(s => ({ activeMultiPartFetches: new Set(s.activeMultiPartFetches).add(baseMessageId) }));

                await useApiKeyStore.getState().rotateActiveKey();
                const apiKey = useApiKeyStore.getState().activeApiKey?.value;
                if (!apiKey) {
                  useToastStore.getState().showToast("API key not available for TTS.", "error");
                  set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
                  return;
                }

                try {
                  const fetchPromises = textSegments.map(async (segment, i) => {
                    if (allBuffers[i]) return allBuffers[i];
                    const pcm = await generateSpeech(apiKey, segment, ttsSettings, logApiRequest, controller.signal);
                    return await audioWorkerService.encodeMp3(pcm, 24000);
                  });
                  
                  const fetchedBuffers = await Promise.all(fetchPromises);
                  if (controller.signal.aborted) return;
                  
                  const dbSavePromises: Promise<void>[] = [];
                  for(let i=0; i<fetchedBuffers.length; i++) {
                      if(fetchedBuffers[i] && !allBuffers[i]) {
                          dbSavePromises.push(dbService.setAudioBuffer(`${baseMessageId}_part_${i}`, fetchedBuffers[i]!));
                      }
                  }
                  await Promise.all(dbSavePromises);

                  // Update DB Session
                  const dbSession = await dbService.getChatSession(targetSessionId);
                  if (dbSession) {
                      const msgIndex = dbSession.messages.findIndex(m => m.id === baseMessageId);
                      if (msgIndex !== -1) {
                          const newMsgs = [...dbSession.messages];
                          newMsgs[msgIndex] = {
                              ...newMsgs[msgIndex],
                              cachedAudioSegmentCount: textSegments.length,
                              ttsWordsPerSegmentCache: resolvedMaxWords
                          };
                          await updateMessages(targetSessionId, newMsgs);
                      }
                  }

                  // Update Active Session (Conditional)
                  if (useActiveChatStore.getState().currentChatId === targetSessionId) {
                    await updateCurrentChatSession(s => {
                        if (!s) return null;
                        const msgIndex = s.messages.findIndex(m => m.id === baseMessageId);
                        if (msgIndex === -1) return s;
                        const newMsgs = [...s.messages];
                        newMsgs[msgIndex] = {
                            ...newMsgs[msgIndex],
                            cachedAudioBuffers: fetchedBuffers,
                            cachedAudioSegmentCount: textSegments.length,
                            ttsWordsPerSegmentCache: resolvedMaxWords 
                        };
                        return { ...s, messages: newMsgs };
                    });
                  }
                  
                  useToastStore.getState().showToast("All audio parts ready. Click play.", "success");
                  
                  if (shouldPlayAfterFetch) {
                      // Check context again before playing
                      if (useActiveChatStore.getState().currentChatId === targetSessionId) {
                          if (get().audioPlayerState.currentMessageId === `${baseMessageId}_part_0`) {
                              await playSinglePart(0);
                          }
                      }
                  }

                } catch(e: any) {
                  if (e.name !== 'AbortError') {
                    useToastStore.getState().showToast(`Audio fetch failed: ${e.message}`, "error");
                  }
                } finally {
                  multiPartFetchControllers.delete(baseMessageId);
                  set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
                }
            }
        };

        if (partIndexToPlay !== undefined) {
            await playSinglePart(partIndexToPlay);
        } else {
            await playAllParts();
        }
    },
    handleStopAndCancelAllForCurrentAudio: () => {
      const { currentMessageId } = get().audioPlayerState;
      if (currentMessageId) {
        get().handleCancelMultiPartFetch(currentMessageId.split('_part_')[0]);
        get().onCancelApiFetchThisSegment(currentMessageId, false);
      }
      stopCurrentPlayback(true);
    },
    handleClosePlayerViewOnly: () => stopCurrentPlayback(true),
    handleDownloadAudio: async (messageId, userProvidedName) => {
        const chat = useActiveChatStore.getState().currentChatSession;
        const message = chat?.messages.find(m => m.id === messageId);
        if (!chat || !message || !message.cachedAudioSegmentCount) {
            useToastStore.getState().showToast("Audio not fully ready for download.", "error");
            return;
        }

        const buffers: ArrayBuffer[] = [];
        for(let i = 0; i < message.cachedAudioSegmentCount; i++) {
            const buffer = await dbService.getAudioBuffer(`${messageId}_part_${i}`);
            if (buffer) {
                buffers.push(buffer);
            } else {
                useToastStore.getState().showToast(`Could not retrieve audio part ${i+1} for download.`, "error");
                return;
            }
        }

        let baseFilename = sanitizeFilename(userProvidedName || 'audio', 100);
        if (baseFilename.toLowerCase().endsWith('.mp3')) {
            baseFilename = baseFilename.slice(0, -3);
        }
        const finalFilename = `${baseFilename}.mp3`;

        const mp3BuffersPromises = buffers.map(async b => {
            if (audioUtils.isMp3Buffer(b)) return b;
            return await audioWorkerService.encodeMp3(b, 24000);
        });
        
        const mp3Buffers = await Promise.all(mp3BuffersPromises);

        const combinedAudio = audioUtils.concatenateAudioBuffers(mp3Buffers);
        if (combinedAudio.byteLength === 0) return;
        
        const audioBlob = audioUtils.createAudioFileFromPcm(combinedAudio, 'audio/mpeg');
        triggerDownload(audioBlob, finalFilename);
        useToastStore.getState().showToast(`Download started as "${finalFilename}".`, "success");
    },
    handleBatchDownloadAudios: async () => {
       const { selectedMessageIds, toggleSelectionMode } = useSelectionStore.getState();
        const { currentChatSession } = useActiveChatStore.getState();
        const { openFilenameInputModal } = useEditorUI.getState(); // UPDATED
        const { startProgress, updateProgress, finishProgress, removeProgress } = useProgressStore.getState();

        if (selectedMessageIds.length === 0 || !currentChatSession) {
            useToastStore.getState().showToast("No messages selected for audio download.", "error");
            return;
        }

        const defaultFilenameWithoutExt = `${sanitizeFilename(currentChatSession.title, 50) || 'audio-download'}_${new Date().toISOString().split('T')[0]}`;

        openFilenameInputModal({
            title: "Name Audio Archive",
            defaultFilename: defaultFilenameWithoutExt,
            promptMessage: "Enter a filename for the ZIP archive. The .zip extension will be added automatically.",
            onSubmit: async (userProvidedName) => {
                let baseFilename = userProvidedName.trim() || defaultFilenameWithoutExt;
                if (baseFilename.toLowerCase().endsWith('.zip')) {
                    baseFilename = baseFilename.slice(0, -4);
                }
                const finalFilename = `${baseFilename}.zip`;

                const taskId = `zip-${Date.now()}`;
                let isCancelled = false;
                
                startProgress(taskId, 'Zipping Audio', 'Preparing files...', () => {
                    isCancelled = true;
                });

                try {
                    const zip = new JSZip();
                    let fileCounter = 1;
                    const allMessages = currentChatSession.messages;
                    const messagesToZip = allMessages.filter(m => selectedMessageIds.includes(m.id) && m.cachedAudioSegmentCount && m.cachedAudioSegmentCount > 0);

                    if (messagesToZip.length === 0) {
                        finishProgress(taskId, "No cached audio found for selected messages.", false);
                        toggleSelectionMode();
                        return;
                    }

                    for (const message of messagesToZip) {
                        if (isCancelled) throw new Error("Operation cancelled by user.");
                        
                        const buffers: ArrayBuffer[] = [];
                        for (let i = 0; i < message.cachedAudioSegmentCount!; i++) {
                            const buffer = await dbService.getAudioBuffer(`${message.id}_part_${i}`);
                            if (buffer) buffers.push(buffer);
                            else throw new Error(`Missing audio part ${i+1} for message`);
                        }

                        if (buffers.length > 0) {
                            const mp3BuffersPromises = buffers.map(async b => {
                                if (audioUtils.isMp3Buffer(b)) return b;
                                return await audioWorkerService.encodeMp3(b, 24000);
                            });
                            const mp3Buffers = await Promise.all(mp3BuffersPromises);
                            
                            const combinedAudio = audioUtils.concatenateAudioBuffers(mp3Buffers);
                            
                            if (combinedAudio.byteLength > 0) {
                                const audioBlob = audioUtils.createAudioFileFromPcm(combinedAudio, 'audio/mpeg');
                                zip.file(`${fileCounter}.mp3`, audioBlob);
                                fileCounter++;
                            }
                        }
                    }

                    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                        if (isCancelled) throw new Error("Operation cancelled by user.");
                        updateProgress(taskId, metadata.percent, `Zipping files... (${metadata.percent.toFixed(0)}%)`);
                    });
                    
                    finishProgress(taskId, "Zipping complete!", true);
                    triggerDownload(zipBlob, finalFilename);

                } catch (error: any) {
                    if (isCancelled || error.message.includes("cancelled")) {
                        removeProgress(taskId);
                        useToastStore.getState().showToast("Zipping cancelled.", "success");
                    } else {
                        console.error("Failed to generate ZIP file:", error);
                        finishProgress(taskId, `Error: ${error.message || 'Failed to create ZIP'}`, false);
                    }
                } finally {
                    toggleSelectionMode();
                }
            }
        });
    },
    handleResetAudioCache: (messageId) => {
      const chat = useActiveChatStore.getState().currentChatSession;
      if (!chat) return;
      useConfirmationUI.getState().requestResetAudioCacheConfirmation(chat.id, messageId); // UPDATED
    },
    handleResetAudioCacheForMultipleMessages: async (messageIds) => {
      const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
      const { updateMessages } = useDataStore.getState();
      if (!currentChatSession) return;

      const idSet = new Set(messageIds);
      const messagesToReset = currentChatSession.messages.filter(m => idSet.has(m.id));

      const anyPlaying = messagesToReset.some(m => get().audioPlayerState.currentMessageId?.startsWith(m.id));
      if (anyPlaying) get().handleStopAndCancelAllForCurrentAudio();

      const deletePromises: Promise<void>[] = [];
      messagesToReset.forEach(msg => {
        if(msg.cachedAudioSegmentCount) {
            for(let i=0; i<msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
      });
      await Promise.all(deletePromises);

      await updateCurrentChatSession(session => {
          if (!session) return null;
          const newMessages = session.messages.map(m => {
            if (idSet.has(m.id)) {
                const { cachedAudioBuffers, cachedAudioSegmentCount, ttsWordsPerSegmentCache, ...rest } = m;
                return rest;
            }
            return m;
          });
          return { ...session, messages: newMessages as ChatMessage[] };
      });

      const updatedSession = useActiveChatStore.getState().currentChatSession;
      if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
      }

      useToastStore.getState().showToast(`Audio cache reset for ${messageIds.length} message(s).`, "success");
      useSelectionStore.getState().toggleSelectionMode();
    },
    isMainButtonMultiFetchingApi: (baseId) => get().activeMultiPartFetches.has(baseId),
    getSegmentFetchError: (id) => get().segmentFetchErrors.get(id),
    isApiFetchingThisSegment: (id) => get().fetchingSegmentIds.has(id),
    onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification = true) => {
      set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)) }));
      activeFetchControllers.get(uniqueSegmentId)?.abort();
      if(showToastNotification) {
        useToastStore.getState().showToast("Audio fetch for segment canceled.", "success");
      }
  },

  handleCancelMultiPartFetch: (baseMessageId: string) => {
      set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
      multiPartFetchControllers.get(baseMessageId)?.abort();
      useToastStore.getState().showToast("Audio fetch for all parts canceled.", "success");
  },
    seekRelative: async (offset) => {
      const { duration, currentTime } = get().audioPlayerState;
      if (duration === undefined || currentTime === undefined || !currentAudioBuffer || !get().audioPlayerState.currentMessageId) return;
      
      const newTime = Math.max(0, Math.min(duration, currentTime + offset));
      await startPlaybackInternal(currentAudioBuffer, newTime, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    seekToAbsolute: async (time) => {
      if (!currentAudioBuffer || !get().audioPlayerState.currentMessageId) return;
      await startPlaybackInternal(currentAudioBuffer, time, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    togglePlayPause: async () => {
      if (get().audioPlayerState.isPlaying) {
          // Precise Sync Fix (Option C)
          const preciseTime = audioPlayerService.getCurrentTime();
          set(s => ({ audioPlayerState: { ...s.audioPlayerState, currentTime: preciseTime } }));
          stopCurrentPlayback(false);
      }
      else await resumePlayback();
    },
    setPlaybackSpeed: (speed: number) => {
        audioPlayerService.setPlaybackRate(speed);
        set(s => ({ audioPlayerState: {...s.audioPlayerState, playbackRate: speed} }));
    },
    increaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const newRate = Math.min(playbackRate + 0.25, 3.0);
        get().setPlaybackSpeed(newRate);
    },
    decreaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const newRate = Math.max(playbackRate - 0.25, 0.25);
        get().setPlaybackSpeed(newRate);
    },
    triggerAutoPlayForNewMessage: async (newAiMessage) => {
        const autoPlayIsEnabled = useActiveChatStore.getState().currentChatSession?.settings?.ttsSettings?.autoPlayNewMessages ?? false;
        if (!autoPlayIsEnabled || newAiMessage.isStreaming || processedNewMessagesForAutoplay.has(newAiMessage.id)) return;
        processedNewMessagesForAutoplay.add(newAiMessage.id);
        if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
        autoPlayTimeout = window.setTimeout(() => {
            get().handlePlayTextForMessage(newAiMessage.content, newAiMessage.id, undefined, false);
        }, 750);
    },
    playNextPart: () => {
      const { audioPlayerState, handlePlayTextForMessage } = get();
      const { currentChatSession } = useActiveChatStore.getState();
      if (!audioPlayerState.currentMessageId || !currentChatSession) return;
  
      const parts = audioPlayerState.currentMessageId.split('_part_');
      if (parts.length !== 2) return;
  
      const baseMessageId = parts[0];
      const currentPartIndex = parseInt(parts[1], 10);
      
      const message = currentChatSession.messages.find(m => m.id === baseMessageId);
      if (!message) return;
  
      const ttsSettings = currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS;
      const maxWords = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment ?? 999999;
      const textSegments = splitTextForTts(message.content, maxWords);
      const totalParts = textSegments.length;
  
      if (!isNaN(currentPartIndex) && currentPartIndex < totalParts - 1) {
          handlePlayTextForMessage(message.content, baseMessageId, currentPartIndex + 1, true);
      }
    },
    playPreviousPart: () => {
        const { audioPlayerState, handlePlayTextForMessage } = get();
        const { currentChatSession } = useActiveChatStore.getState();
        if (!audioPlayerState.currentMessageId || !currentChatSession) return;

        const parts = audioPlayerState.currentMessageId.split('_part_');
        if (parts.length !== 2) return;

        const baseMessageId = parts[0];
        const currentPartIndex = parseInt(parts[1], 10);
        
        const message = currentChatSession.messages.find(m => m.id === baseMessageId);
        if (!message) return;
        
        const ttsSettings = currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS;
        const maxWords = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment ?? 999999;
        splitTextForTts(message.content, maxWords);

        if (!isNaN(currentPartIndex) && currentPartIndex > 0) {
            handlePlayTextForMessage(message.content, baseMessageId, currentPartIndex - 1, true);
        }
    },
    setGrainSize: (size: number) => {
        audioPlayerService.setGrainSize(size);
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, grainSize: size } }));
    },
    setOverlap: (overlap: number) => {
        audioPlayerService.setOverlap(overlap);
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, overlap: overlap } }));
    },
  };
});

if (typeof window !== 'undefined') {
    useAudioStore.getState().init();
    window.addEventListener('beforeunload', () => {
        useAudioStore.getState().cleanup();
    });
}
