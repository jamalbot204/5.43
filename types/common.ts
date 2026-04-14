
export type AttachmentUploadState =
  | 'idle'                    // Initial state
  | 'reading_client'          // Client-side FileReader is active
  | 'uploading_to_cloud'      // SDK's ai.files.uploadFile is in progress
  | 'processing_on_server'    // File API status is PROCESSING, polling getFile
  | 'completed_cloud_upload'  // File API status is ACTIVE, fileUri is available
  | 'completed'               // Client-side read complete (e.g. base64 ready, no cloud upload attempted/failed)
  | 'error_client_read'       // FileReader failed
  | 'error_cloud_upload';     // Cloud upload or processing failed

export interface Attachment {
  id: string; 
  type: 'image' | 'video' | 'file'; // Expanded to support generic files
  mimeType: string; // Original MIME type of the file
  name: string;
  base64Data?: string; // Pure base64 encoded content, for re-upload or fallback
  dataUrl?: string;    // Full Data URL for client-side preview (images/videos)
  size: number;       // File size in bytes
  
  fileUri?: string;           // URI from Gemini File API
  fileApiName?: string;       // Resource name from Gemini File API (e.g., files/your-id)
  uploadState?: AttachmentUploadState; 
  statusMessage?: string;     
  progress?: number;          // Client read: 0-100. Cloud upload: 0-100 (if available) or undefined for spinner.

  error?: string;     
  isLoading?: boolean;

  // For re-upload feature
  isReUploading?: boolean;
  reUploadError?: string;

  // For ZIP export
  filePath?: string;
}

export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}

export interface ApiKey {
  id: string;
  name: string;
  value: string;
}

export interface ReasoningStep {
  id: string;
  title: string; 
  instruction: string; 
}

export interface ToolInvocation {
  toolName: string;
  args: any;
  result: any;
  isError?: boolean;
}

export interface PromptButton {
  id: string;
  label: string;
  content: string;
  action: 'insert' | 'send';
  order: number;
  modelId?: string;
}
