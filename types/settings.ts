
import { HarmCategory, HarmBlockThreshold } from './enums';
import { ReasoningStep } from './common';

export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

export interface ExternalModelItem {
  id: string;
  displayName: string;
  modelId: string;
}

export interface ExternalProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ExternalModelItem[];
}

export interface CustomMemoryStrategy {
  id: string;
  label: string;
  description: string;
  systemMandate: string;
}

export interface ArchiverConfig {
  userName: string;
  characterName: string;
}

export interface LorebookEntry {
  id: string;
  keys: string[];
  context: string;
}

export interface ArchivedChapter {
  chapterNumber?: number;
  title: string;
  time_range: string;
  narrative: string;
  key_quotes: string[];
  isError?: boolean;
}

export type TTSModelId = 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts'; // Example model IDs
export type TTSVoiceId = string; // Represents one of the 30 voice names like 'Kore', 'Puck'

export interface TTSSettings {
  model: TTSModelId;
  voice: TTSVoiceId;
  autoPlayNewMessages?: boolean; // Renamed from autoFetchAudioEnabled
  systemInstruction?: string; 
  maxWordsPerSegment?: number; // New: Max words per TTS segment
  temperature?: number; // Controls speech variance/expressiveness
}

export interface MemorySnapshot {
  id: string;
  timestamp: Date;
  content: string; // The JSON string
  source: 'ai' | 'manual_trigger' | 'direct_edit' | 'restore';
  triggerText?: string; // The instruction/prompt that caused this change
  relatedMessageId?: string; // ID of the message active when this update happened
}

export interface ModelPreference {
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  thinkingBudget?: number;
}

export interface GeminiSettings {
  modelPreferences?: Record<string, ModelPreference>;
  systemInstruction?: string;
  userPersonaInstruction?: string; 
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number; // ADDED: Seed for deterministic generation
  safetySettings?: SafetySetting[];
  contextWindowMessages?: number; 
  useGoogleSearch?: boolean; 
  urlContext?: string[]; 
  debugApiRequests?: boolean; 
  ttsSettings: TTSSettings; 
  showAutoSendControls?: boolean; 
  showReadModeButton?: boolean; 
  showExportPdfButton?: boolean; // Added for PDF export
  showContinueFlowButton?: boolean; // Added for Continue Flow button toggle
  showAdvancedDataTools?: boolean; // Added: Toggle for Telegram Import and Batch TXT export buttons
  showPromptButtonsBar?: boolean; // ADDED: Default Disabled
  enableInteractiveChoices?: boolean; // ADDED: Interactive Choices Parsing
  enableWebReader?: boolean; // ADDED: Web Reader Tool
  thinkingBudget?: number; // Added thinkingBudget
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'; // Added thinkingLevel for Gemini 3
  showThinkingProcess?: boolean; // Added showThinkingProcess
  includeThoughtsInHistory?: boolean; // Added includeThoughtsInHistory
  enhancedThinkingMode?: 'off' | 'judge' | 'fusion' | 'auto_refine'; // ADDED: Enhanced Thinking Mode
  autoRefineMaxIterations?: number;
  autoRefineCriticInstruction?: string;
  enhancedThinkingJudgeInstruction?: string; // ADDED: Custom instructions for the Judge
  
  // Custom Thought Parsing
  enableCustomThoughtParsing?: boolean; // ADDED
  customThoughtTagName?: string; // ADDED

  forceToolAlways?: boolean; // ADDED: Force ANY mode for tool calling
  includePythonHistory?: boolean; // ADDED: Context injection for python execution history
  pythonExecutionMode?: 'local' | 'cloud' | 'disabled'; // ADDED: Execution environment for Python code
  systemReminderFrequency?: number; // Added: Frequency for periodic system instruction injection (0 = disabled)
  customReminderMessage?: string; // ADDED: Custom message to inject instead of the system instruction
  enableLongTermMemory?: boolean; // ADDED: Toggle for Agentic RAG
  memorySourceChatIds?: string[]; // ADDED: List of chat IDs to include in memory search. If undefined, include all.
  memoryMaxResults?: number; // ADDED: Max number of memory chunks to retrieve
  memoryMinRelevance?: number; // ADDED: Minimum cosine similarity threshold
  memoryQueryStrategy?: string; // ADDED: Strategy key for steering the RAG behavior (e.g., 'companion', 'facts')
  enableReasoningWorkflow?: boolean; // ADDED: Multi-step agent workflow
  agentModel?: string; // ADDED: Optional model ID to use specifically for agentic reasoning steps
  reasoningSteps?: ReasoningStep[]; // ADDED: Steps for the workflow
  agentSystemInstruction?: string; // ADDED: Customizable system instruction for the agent
  contextUserName?: string; // ADDED: Name of the user in the context transcript (Narrative Framing)
  enableShadowMode?: boolean; // ADDED: Toggle for Shadow Mode (Direct Generation)
  shadowPersona?: string; // ADDED: Persona for Shadow Mode
  shadowTaskInstruction?: string; // ADDED: Task instruction for Shadow Mode
  shadowTranscriptUserName?: string; // ADDED: Custom User Name in Transcript
  shadowTranscriptAiName?: string; // ADDED: Custom AI Name in Transcript
  auditorBaseSystemInstruction?: string; // ADDED: Base persona for Auditor
  auditorSystemInstruction?: string; // ADDED: Request instruction for Auditor
  
  // Active Memory Box
  isMemoryBoxEnabled?: boolean;
  isMemoryReadOnly?: boolean; // ADDED: Read-only mode for Active Memory
  memoryBoxContent?: string;
  memoryToolDescription?: string;
  activeMemoryModel?: string; // ADDED: Model used for background memory updates
  activeMemoryAnchorId?: string; // ADDED: Pointer to the message ID that represents the CURRENT active memory state
  memorySchemaKeys?: string[]; // ADDED: List of strict keys for JSON schema enforcement

  // Strategy Protocol Tool (Forced Execution)
  isStrategyToolEnabled?: boolean;
  strategyContent?: string;
  strategyGhostResponse?: string; // ADDED: Custom response for the ghost injection

  // Time Bridge
  enableTimeBridge?: boolean; // ADDED: Toggle for temporal injection
  timeBridgeThreshold?: number; // ADDED: Threshold in minutes (Default 15)

  // Lorebook (Dynamic Context)
  isLorebookEnabled?: boolean;
  lorebookEntries?: LorebookEntry[];

  // Novel Archiver (Auto Mode)
  autoArchivingEnabled?: boolean; // ADDED: Toggle for auto-archiver
  lastArchivedMessageId?: string; // ADDED: Pointer to the last message included in the archive
  lastArchivedTimestamp?: number; // ADDED: Timestamp pointer for robust archiving (replaces ID dependency)
  archiveChapterCount?: number; // ADDED: Counter for chapters
  archiverConfig?: ArchiverConfig; // ADDED: Persisted names for the archiver
  archivedChapters?: ArchivedChapter[]; // ADDED: Structured storage for chapters (Decoupled from systemInstruction)

  _characterIdForCacheKey?: string; 
  _characterIdForAPICall?: string;  
  _characterNameForLog?: string; 
}

export interface UserDefinedDefaults {
    model: string;
    settings: GeminiSettings; 
}

export interface ExportConfiguration {
  // Core Chat Data
  includeChatSessionsAndMessages: boolean;
  includeMessageContent: boolean;
  includeMessageTimestamps: boolean;
  includeMessageRoleAndCharacterNames: boolean;
  includeMessageAttachmentsMetadata: boolean; 
  includeFullAttachmentFileData: boolean;    
  includeCachedMessageAudio: boolean;       
  includeGroundingMetadata: boolean;
  includeThoughts: boolean; // Added includeThoughts

  // Chat-Specific Settings
  includeChatSpecificSettings: true; 

  // AI Characters
  includeAiCharacterDefinitions: boolean; 

  // API Request Logs
  includeApiLogs: boolean;

  // Global Application State
  includeLastActiveChatId: boolean;
  includeMessageGenerationTimes: boolean;
  includeUiConfiguration: boolean; 
  includeUserDefinedGlobalDefaults: boolean;
  includeApiKeys: boolean;
  includeExternalModels?: boolean;
  
  // Advanced Portable Environment
  includeOfflinePythonEnv?: boolean; // ADDED
}
