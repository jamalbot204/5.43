
const WORKER_CODE = `
// Load JSZip from CDN inside the worker
importScripts('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');

self.onmessage = async (e) => {
    const { files } = e.data;
    const zip = new JSZip();

    // 1. Add files to ZIP
    // We iterate through the list provided by the main thread and add them to the JSZip instance.
    for (const file of files) {
        // Smart Compression Strategy:
        // If the file is already compressed (images, audio, video, packages), store it without compression (STORE).
        // This avoids wasting CPU cycles trying to compress incompressible data.
        // For text files (JSON, TXT, etc.), use DEFLATE.
        const isAlreadyCompressed = /\\.(mp3|png|jpg|jpeg|zip|mp4|webm|ogg|mov|gz|whl|pdf)$/i.test(file.path);
        
        // JSZip uses 'STORE' for no compression, 'DEFLATE' for compression.
        // Note: When using 'STORE', we don't set compressionOptions level.
        const compression = isAlreadyCompressed ? 'STORE' : 'DEFLATE';
        
        zip.file(file.path, file.content, {
            compression: compression
        });
    }

    // 2. Generate ZIP Blob
    try {
        const content = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE', // Default container compression
            compressionOptions: {
                level: 6 // Balanced compression level for text files
            }
        }, (metadata) => {
            // Report progress back to main thread
            self.postMessage({ type: 'progress', percent: metadata.percent });
        });
        
        // 3. Send finished Blob back
        self.postMessage({ type: 'complete', blob: content });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
    }
};
`;

export interface ExportFile {
    path: string;
    content: string | ArrayBuffer | Blob;
}

export class ExportWorkerService {
    private worker: Worker | null = null;

    private getWorker(): Worker {
        if (!this.worker) {
            // Create the worker from the string constant (Blob pattern)
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            this.worker = new Worker(workerUrl);
        }
        return this.worker;
    }

    /**
     * Offloads the ZIP creation process to a background worker.
     * @param files List of files to include in the ZIP.
     * @param onProgress Callback for progress updates (0-100).
     * @returns Promise resolving to the final ZIP Blob.
     */
    public createZip(files: ExportFile[], onProgress: (percent: number) => void): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const worker = this.getWorker();
            
            const handleMessage = (e: MessageEvent) => {
                const { type, percent, blob, error } = e.data;
                
                if (type === 'progress') {
                    onProgress(percent);
                } else if (type === 'complete') {
                    cleanup();
                    resolve(blob);
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(error));
                }
            };

            const cleanup = () => {
                worker.removeEventListener('message', handleMessage);
                // Terminate worker after task to free up memory (exporting large files uses significant RAM)
                this.terminate(); 
            };

            worker.addEventListener('message', handleMessage);
            worker.postMessage({ files });
        });
    }

    public terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

export const exportWorkerService = new ExportWorkerService();
