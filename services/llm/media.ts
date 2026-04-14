
import { LogApiRequestCallback, AttachmentUploadState, GeminiFileResource, FileUploadResult } from '../../types.ts';
import { createAiInstance } from './config.ts';
import { formatGeminiError } from './utils.ts';

export async function pollFileStateUntilActive(
    apiKey: string,
    fileName: string,
    logApiRequest?: LogApiRequestCallback,
    signal?: AbortSignal
): Promise<GeminiFileResource> {
    const ai = createAiInstance(apiKey);
    const maxRetries = 60; 
    let retries = 0;

    while (retries < maxRetries) {
        if (signal?.aborted) throw new Error("Polling aborted");

        if (logApiRequest) {
            logApiRequest({ 
                requestType: 'files.getFile', 
                payload: { fileName } 
            });
        }
        
        try {
            const file = await ai.files.get({ name: fileName });

            if (file.state === 'ACTIVE') return file as GeminiFileResource;
            if (file.state === 'FAILED') throw new Error("File processing failed on server.");
        } catch (e: any) {
            console.warn(`Error polling file ${fileName}:`, e);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
    }
    throw new Error("File processing timed out.");
}

export async function uploadFileViaApi(
    apiKey: string,
    file: File,
    logApiRequestCallback?: LogApiRequestCallback,
    onProgress?: (state: AttachmentUploadState, fileApiName: string | undefined, message: string | undefined, progress: number | undefined) => void,
    signal?: AbortSignal
): Promise<FileUploadResult> {
    const ai = createAiInstance(apiKey);

    if (onProgress) onProgress('uploading_to_cloud', undefined, 'Starting upload...', 0);

    try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        
        // 1. NATIVE SUPPORT (Whitelisted) - Send as is (Images, Video, Audio, PDF)
        const nativeMimeTypes: Record<string, string> = {
             // Images
             'png': 'image/png',
             'jpeg': 'image/jpeg',
             'jpg': 'image/jpeg',
             'webp': 'image/webp',
             'heic': 'image/heic',
             'heif': 'image/heif',
             // Audio (Native Support)
             'wav': 'audio/wav',
             'mp3': 'audio/mpeg',
             'aiff': 'audio/aiff',
             'aac': 'audio/aac',
             'ogg': 'audio/ogg',
             'flac': 'audio/flac',
             'm4a': 'audio/x-m4a',
             'opus': 'audio/opus',
             'wma': 'audio/x-ms-wma',
             'amr': 'audio/amr',
             // Video
             'mp4': 'video/mp4',
             'mpeg': 'video/mpeg',
             'mov': 'video/mov',
             'avi': 'video/avi',
             'flv': 'video/x-flv',
             'mpg': 'video/mpg',
             'webm': 'video/webm',
             'wmv': 'video/wmv',
             '3gpp': 'video/3gpp',
             // Docs
             'pdf': 'application/pdf'
        };

        // 2. TEXT/CODE FALLBACK - Force text/plain for guaranteed ingestion
        // This list covers common dev/data formats that Gemini can read as text.
        const textExtensions = new Set([
            'txt', 'md', 'csv', 'xml', 'rtf', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 
            'json', 'py', 'ipynb', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 
            'php', 'sql', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bat', 
            'ps1', 'dockerfile', 'env', 'log', 'gradle', 'properties', 'gitignore',
            'dart', 'swift', 'rs', 'lua', 'pl', 'r', 'vb', 'scala', 'kt', 'kts'
        ]);

        let mimeType = file.type;

        // Determination Logic:
        if (nativeMimeTypes[ext]) {
            // Case A: It's a supported media file (Audio/Video/Image/PDF)
            mimeType = nativeMimeTypes[ext];
        } else if (textExtensions.has(ext)) {
            // Case B: It's a known text/code file -> FORCE text/plain
            mimeType = 'text/plain';
        } else {
            // Case C: Unknown extension. 
            // If browser detected generic binary/unknown, assume text/plain if it's likely code/text,
            // otherwise keep original or fallback to octet-stream.
            if (!mimeType) mimeType = 'application/octet-stream';
            
            // Fix: Some browsers detect .json as application/json, but the API can be picky.
            // We strictly force text/plain for JSON/Code MIME types to be safe.
            if (
                mimeType.includes('json') || 
                mimeType.includes('javascript') || 
                mimeType.includes('python') ||
                mimeType.includes('xml')
            ) {
                mimeType = 'text/plain';
            }
        }

        const blobForUpload = (file.type !== mimeType) 
            ? new File([file], file.name, { type: mimeType }) 
            : file;

        const sanitizedDisplayName = file.name.replace(/[^a-zA-Z0-9 \-._]/g, '_').substring(0, 63);

        if (logApiRequestCallback) {
            logApiRequestCallback({ 
                requestType: 'files.uploadFile', 
                payload: { file: { name: file.name, type: mimeType, size: file.size } } 
            });
        }

        const response = await ai.files.upload({
            file: blobForUpload,
            config: { displayName: sanitizedDisplayName, mimeType: mimeType }
        });

        if (signal?.aborted) throw new Error("Upload aborted");

        let fileResource: any = response;
        if ((response as any).file) {
            fileResource = (response as any).file;
        }
        
        if (!fileResource && (response as any).uri && (response as any).name) {
            fileResource = response as any;
        }

        if (!fileResource) {
             console.error("Upload response missing file resource. Raw Response:", JSON.stringify(response));
             throw new Error("Upload failed: No file resource returned from API.");
        }

        if (onProgress) onProgress('processing_on_server', fileResource.name, 'Processing on Google servers...', undefined);

        const activeFile = await pollFileStateUntilActive(apiKey, fileResource.name, logApiRequestCallback, signal);

        return {
            fileUri: activeFile.uri,
            fileApiName: activeFile.name,
            mimeType: activeFile.mimeType || mimeType,
            originalFileName: activeFile.displayName || file.name,
            size: parseInt(activeFile.sizeBytes || String(file.size)),
        };

    } catch (error: any) {
        console.error("Upload failed", error);
        return {
            mimeType: file.type || 'application/octet-stream',
            originalFileName: file.name,
            size: file.size,
            error: formatGeminiError(error)
        };
    }
}

export async function deleteFileViaApi(
    apiKey: string,
    fileApiName: string,
    logApiRequestCallback?: LogApiRequestCallback
): Promise<void> {
    const ai = createAiInstance(apiKey);
    if (logApiRequestCallback) {
        logApiRequestCallback({ 
            requestType: 'files.delete', 
            payload: { fileName: fileApiName } 
        });
    }
    await ai.files.delete({ name: fileApiName });
}
