// services/audioUtils.ts

export function concatenateAudioBuffers(buffers: (ArrayBuffer | null)[]): ArrayBuffer {
    const validBuffers = buffers.filter(buffer => buffer !== null) as ArrayBuffer[];
    if (validBuffers.length === 0) {
        return new ArrayBuffer(0);
    }
    if (validBuffers.length === 1) {
        return validBuffers[0];
    }

    let totalLength = 0;
    validBuffers.forEach(buffer => {
        totalLength += buffer.byteLength;
    });

    const result = new Uint8Array(totalLength);
    let offset = 0;
    validBuffers.forEach(buffer => {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    });

    return result.buffer;
}

/**
 * Creates an audio file Blob from raw PCM data or MP3 data.
 *
 * @param audioData The audio data (PCM or MP3).
 * @param desiredMimeType The desired MIME type (e.g., 'audio/mpeg' for MP3, 'audio/wav' for WAV).
 * @param sampleRate The sample rate of the PCM data (used only for WAV generation).
 * @returns A Blob representing the audio file.
 */
export function createAudioFileFromPcm(
    audioData: ArrayBuffer,
    desiredMimeType: 'audio/mpeg' | 'audio/wav' = 'audio/wav',
    sampleRate: number = 24000
): Blob {
    if (desiredMimeType === 'audio/mpeg') {
        // Assume audioData is already MP3 encoded if this mimeType is passed
        // This relies on the caller ensuring the data is MP3.
        return new Blob([audioData], { type: 'audio/mpeg' });
    }

    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;

    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioData.byteLength;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    const pcmArray = new Uint8Array(audioData);
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, pcmArray[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

export function encodeMp3(arrayBuffer: ArrayBuffer, sampleRate: number = 24000): ArrayBuffer {
    // @ts-ignore
    if (typeof window === 'undefined' || !window.lamejs) {
        console.error("lamejs not found. Cannot encode MP3.");
        return arrayBuffer;
    }
    
    const channels = 1;
    const kbps = 128; // Requested quality
    // @ts-ignore
    const mp3encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, kbps);
    
    const samples = new Int16Array(arrayBuffer);
    const sampleBlockSize = 1152; 
    
    const mp3Data: Int8Array[] = [];
    
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }
    
    // Concatenate
    let totalLength = 0;
    for (const buf of mp3Data) {
        totalLength += buf.length;
    }
    
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of mp3Data) {
        result.set(buf, offset);
        offset += buf.length;
    }
    
    return result.buffer;
}

/**
 * Checks if an ArrayBuffer likely starts with an MP3 sync frame (0xFF 0xF...).
 * This is a basic heuristic check.
 */
export function isMp3Buffer(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 2) return false;
    const view = new Uint8Array(buffer);
    // Frame sync: 11 bits set to 1. 
    // Byte 0: 0xFF (11111111)
    // Byte 1: 0xE0 mask (11100000) -> high 3 bits must be 1.
    return view[0] === 0xFF && (view[1] & 0xE0) === 0xE0;
}