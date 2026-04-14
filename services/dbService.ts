
/**
 * DB SERVICE FACADE
 * 
 * This file acts as a bridge to the new modular database services.
 * It ensures backward compatibility with existing imports.
 */

export * from './db/metadataDb.ts';
export * from './db/audioDb.ts';
export * from './db/vectorDb.ts';
export * from './db/sessionDb.ts';
