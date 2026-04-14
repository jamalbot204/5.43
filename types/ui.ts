
import React from 'react';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/panels/EditMessagePanel.tsx';
import { ChatSession, ChatMessage, AICharacter } from './chat';
import { Attachment, AttachmentUploadState } from './common';
import { TTSSettings, ExportConfiguration } from './settings';
import { LogApiRequestCallback } from './api';
import { ChatMessageRole } from './enums';

export interface AudioPlayerState {
  isLoading: boolean; 
  isPlaying: boolean;
  currentMessageId: string | null; 
  error: string | null; 
  currentTime?: number; 
  duration?: number;    
  currentPlayingText?: string | null; 
  playbackRate: number;
  grainSize: number;
  overlap: number;
}

export interface UseGeminiReturn {
  isLoading: boolean;
  currentGenerationTimeDisplay: string;
  lastMessageHadAttachments: boolean;
  logApiRequest: LogApiRequestCallback;
  handleSendMessage: (
    promptContent: string,
    attachments?: Attachment[],
    historyContextOverride?: ChatMessage[],
    characterIdForAPICall?: string,
    isTemporaryContext?: boolean
  ) => Promise<void>;
  handleContinueFlow: () => Promise<void>;
  handleCancelGeneration: () => Promise<void>;
  handleRegenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
  handleRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
  handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments?: Attachment[], keptAttachments?: Attachment[]) => Promise<void>;
}

export type UseAudioPlayerCacheCallback = (uniqueSegmentId: string, audioBuffer: ArrayBuffer, totalSegments: number) => Promise<void>;

export interface MessageItemProps {
  message: ChatMessage;
  canRegenerateFollowingAI?: boolean;
  chatScrollContainerRef?: React.RefObject<HTMLDivElement>;
  highlightTerm?: string;
  onEnterReadMode: (messageId: string) => void;
  isContentExpanded?: boolean;
  isThoughtsExpanded?: boolean;
  onToggleExpansion: (messageId: string, type: 'content' | 'thoughts') => void;
}

export interface UseAudioPlayerOptions {
  apiKey: string;
  logApiRequest?: LogApiRequestCallback;
  onCacheAudio?: UseAudioPlayerCacheCallback;
  onAutoplayNextSegment?: (baseMessageId: string, justFinishedPartIndex: number) => void;
  onFetchStart?: (uniqueSegmentId: string) => void;
  onFetchEnd?: (uniqueSegmentId: string, error?: Error) => void;
}

export interface UseAudioPlayerReturn {
  audioPlayerState: AudioPlayerState;
  playText: (
    textSegment: string,
    uniqueSegmentId: string,
    ttsSettings: TTSSettings,
    cachedBufferForSegment?: ArrayBuffer | null
  ) => Promise<void>;
  stopPlayback: () => void; 
  clearPlayerViewAndStopAudio: () => void; 
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  pausePlayback: () => void;
  resumePlayback: () => Promise<void>;
  cancelCurrentSegmentAudioLoad: (uniqueSegmentId: string) => void;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined; 
  increaseSpeed: () => void; 
  decreaseSpeed: () => void; 
}

export interface UseAutoPlayOptions {
    currentChatSession: ChatSession | null;
    playFunction: (originalFullText: string, baseMessageId: string, partIndexToPlay?: number) => Promise<void>;
}

export interface ExportConfigurationModalProps {
  isOpen: boolean;
  currentConfig: ExportConfiguration;
  allChatSessions: ChatSession[]; 
  onClose: () => void;
  onSaveConfig: (newConfig: ExportConfiguration) => void; 
  onExportSelected: (config: ExportConfiguration, selectedChatIds: string[]) => void; 
}

export interface AttachmentWithContext {
  attachment: Attachment;
  messageId: string;
  messageTimestamp: Date;
  messageRole: ChatMessageRole;
  messageContentSnippet?: string;
}

export interface UseAutoSendReturn {
  isAutoSendingActive: boolean;
  autoSendText: string;
  setAutoSendText: React.Dispatch<React.SetStateAction<string>>;
  autoSendRepetitionsInput: string;
  setAutoSendRepetitionsInput: React.Dispatch<React.SetStateAction<string>>;
  autoSendRemaining: number;
  startAutoSend: (text: string, repetitions: number, targetCharacterId?: string) => void;
  stopAutoSend: () => Promise<void>;
  canStartAutoSend: (text: string, repetitionsInput: string) => boolean;
  isPreparingAutoSend: boolean;
  isWaitingForErrorRetry: boolean; 
  errorRetryCountdown: number;
}

export interface ChatStateContextType {
  chatHistory: ChatSession[];
  isLoadingData: boolean;
  currentExportConfig: ExportConfiguration;
  messageGenerationTimes: Record<string, number>;
}

export interface ChatActionsContextType {
  setChatHistory: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  logApiRequest: LogApiRequestCallback;
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  handleImportAll: () => Promise<void>;
  handleStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
  handleSaveChatTitle: () => Promise<void>;
  handleCancelEditChatTitle: () => void;
  handleEditTitleInputChange: (newTitle: string) => void;
  handleDuplicateChat: (sessionId: string) => Promise<void>;
  triggerAutoPlayForNewMessage: (callback: (newAiMessage: ChatMessage) => Promise<void>) => void;
  performActualAudioCacheReset: (sessionId: string, messageId: string) => Promise<void>;
}

export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

export interface FilenameInputModalTriggerProps {
  title: string;
  defaultFilename: string;
  promptMessage: string;
  onSubmit: (filename: string) => void;
}

export interface UIContextType {
  showToast: (message: string, type?: 'success' | 'error', duration?: number) => void;
  isSettingsPanelOpen: boolean;
  openSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  isTtsSettingsModalOpen: boolean;
  openTtsSettingsModal: () => void;
  closeTtsSettingsModal: () => void;
  isEditPanelOpen: boolean;
  editingMessageDetail: EditMessagePanelDetails | null;
  openEditPanel: (details: EditMessagePanelDetails) => void;
  closeEditPanel: () => void;
  isCharacterManagementModalOpen: boolean;
  openCharacterManagementModal: () => void;
  closeCharacterManagementModal: () => void;
  isContextualInfoModalOpen: boolean;
  editingCharacterForContextualInfo: AICharacter | null;
  openCharacterContextualInfoModal: (character: AICharacter) => void;
  closeCharacterContextualInfoModal: () => void;
  isDebugTerminalOpen: boolean;
  openDebugTerminal: () => void;
  closeDebugTerminal: () => void;
  isExportConfigModalOpen: boolean;
  openExportConfigurationModal: () => void;
  closeExportConfigurationModal: () => void;
  isDeleteConfirmationOpen: boolean;
  deleteTarget: { sessionId: string; messageId: string } | null;
  requestDeleteConfirmation: (target: { sessionId: string; messageId: string }) => void;
  cancelDeleteConfirmation: () => void;
  setIsDeleteConfirmationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isResetAudioConfirmationOpen: boolean;
  resetAudioTarget: { sessionId: string; messageId: string } | null;
  requestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => void;
  cancelResetAudioCacheConfirmation: () => void;
  setIsResetAudioConfirmationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isFilenameInputModalOpen: boolean;
  filenameInputModalProps: FilenameInputModalTriggerProps | null;
  openFilenameInputModal: (props: FilenameInputModalTriggerProps) => void;
  closeFilenameInputModal: () => void;
  submitFilenameInputModal: (filename: string) => void;
  isChatAttachmentsModalOpen: boolean;
  attachmentsForModal: AttachmentWithContext[];
  openChatAttachmentsModal: (session: ChatSession | null) => void;
  closeChatAttachmentsModal: () => void;
  isApiKeyModalOpen: boolean;
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  isGitHubImportModalOpen: boolean;
  openGitHubImportModal: () => void;
  closeGitHubImportModal: () => void;
}

export interface ProgressItem {
  id: string;
  title: string;
  message: string;
  progress: number; // 0-100
  status: 'running' | 'success' | 'error';
  onCancel?: () => void;
}
