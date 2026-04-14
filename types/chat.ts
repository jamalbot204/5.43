
import { ChatMessageRole } from './enums';
import { Attachment, GroundingChunk, ToolInvocation } from './common';
import { GeminiSettings, MemorySnapshot } from './settings';
import { ApiRequestLog } from './api';

export type MessageErrorType = 'link_expired' | 'network' | 'policy' | 'quota' | 'generic';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  thoughts?: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: Attachment[]; 
  groundingMetadata?: { 
    groundingChunks?: GroundingChunk[];
  };
  characterName?: string; 
  cachedAudioBuffers?: (ArrayBuffer | null)[] | null; // RETAINED for runtime UI state, but not persisted in session store
  cachedAudioSegmentCount?: number; // ADDED: Persisted metadata indicating audio exists in the audioCache DB store
  ttsWordsPerSegmentCache?: number; // Stores the maxWordsPerSegment value used when this message's audio was cached.
  audioFilePaths?: string[]; // For ZIP export
  isGithubContextMessage?: boolean; // ADDED: Flag for special rendering of GitHub context messages
  isFavorited?: boolean;
  isSystemReminder?: boolean; // ADDED: Flag for periodic system instruction reminders
  isEmbedded?: boolean; // ADDED: Flag to track if message has been indexed for Agentic Memory
  hasMemoryUpdate?: boolean; // ADDED: Flag to track if this message triggered an active memory update
  isTimeMarker?: boolean; // ADDED: Flag for temporal injection messages (Time Dividers)
  toolInvocations?: ToolInvocation[]; // ADDED: List of tools called during the generation of this message
  seedUsed?: number; // ADDED: The seed used for generating this specific message
  enhancedDrafts?: string[]; // ADDED: Raw text of Enhanced Thinking drafts
  modelName?: string; // ADDED: Name of the model that generated this message
  generatedMedia?: { mimeType: string; data: string }[]; // ADDED: AI generated media
  
  // ERROR HANDLING
  errorType?: MessageErrorType; // ADDED: To distinguish between link errors, network errors, etc.
}

export interface AICharacter {
  id: string;
  name: string;
  systemInstruction: string; 
  contextualInfo?: string; 
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  model: string; 
  settings: GeminiSettings; 
  lastUpdatedAt: Date;
  isCharacterModeActive?: boolean; 
  aiCharacters?: AICharacter[];    
  apiRequestLogs?: ApiRequestLog[];
  memoryHistory?: MemorySnapshot[]; // ADDED: History of Active Memory updates
  githubRepoContext?: {
    url: string;
    contextText: string;
  } | null;
  partnerRole?: string; // ADDED: Classification of the other party (e.g., "Father", "Client")
  cacheInfo?: { id: string; expireTime: number; fingerprint: string; };
  manualCacheInfo?: { id: string; expireTime: number; cachedMessageCount: number; fingerprint: string; };
}
