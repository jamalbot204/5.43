export enum ChatMessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system', // For system instructions, not directly a message role in Gemini chat history
  ERROR = 'error' // For displaying error messages in chat
}

// As defined by the Google AI SDK for Harm Categories
export enum HarmCategory {
  HARM_CATEGORY_UNSPECIFIED = "HARM_CATEGORY_UNSPECIFIED",
  HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
  HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
  HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
}

// As defined by the Google AI SDK for Harm Block Thresholds
export enum HarmBlockThreshold {
  HARM_BLOCK_THRESHOLD_UNSPECIFIED = "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE", 
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE", 
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH", 
  BLOCK_NONE = "BLOCK_NONE", 
}

export enum AppMode {
  NORMAL_CHAT = 'normal_chat',
  CHARACTER_CHAT = 'character_chat',
}
