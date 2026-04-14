
const WORKER_CODE = `
try {
    importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
} catch (e) {
    console.error('Failed to load lamejs in worker:', e);
    self.postMessage({ error: 'Failed to load encoder library' });
}

self.onmessage = (e) => {
    const { id, pcmData, sampleRate } = e.data;

    try {
        if (typeof lamejs === 'undefined') {
            throw new Error("lamejs not loaded");
        }

        const channels = 1;
        const kbps = 256; // High fidelity 256kbps
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);

        // Access the raw PCM data
        const originalSamples = new Int16Array(pcmData);
        const processedSamples = new Int16Array(originalSamples.length);

        // --- DSP SETTINGS (Smart Gate & Filters) ---
        
        // 1. Filter Settings
        // 150Hz removes engine rumble/AC noise.
        const HP_CUTOFF = 150; 
        // 3400Hz is the standard "Telephony" cutoff. It keeps voice intelligible but cuts high-freq hiss.
        const LP_CUTOFF = 3400;

        // 2. Smart Gate Settings
        // Threshold: Signal below this is considered noise. 
        // 200 is roughly -45dB. Adjust if voice is getting cut.
        const GATE_THRESHOLD = 200; 
        
        // Hold Time: 400ms (Requested)
        // Keeps gate open for 400ms AFTER signal drops below threshold to catch ends of words.
        const HOLD_SAMPLES = 0.200 * sampleRate; 

        // Envelope Smoothing (Attack/Release)
        // Prevents "Clicking" by fading volume in/out instead of cutting instantly.
        const ATTACK_RATE = 0.1;   // Fast fade-in (10ms approx)
        const RELEASE_RATE = 0.0005; // Slow fade-out for smooth finish

        const dt = 1.0 / sampleRate;

        // Calculate Alpha for High-Pass (RC Filter)
        const rc_hp = 1.0 / (HP_CUTOFF * 2 * Math.PI);
        const alpha_hp = rc_hp / (rc_hp + dt);

        // Calculate Alpha for Low-Pass (RC Filter)
        const rc_lp = 1.0 / (LP_CUTOFF * 2 * Math.PI);
        const alpha_lp = dt / (rc_lp + dt);

        // State variables
        let lastVal_hp = 0; 
        let lastSample_hp = 0; 
        let lastVal_lp = 0; 
        
        // Gate State
        let holdCounter = 0;
        let currentGain = 0; // 0.0 (Silence) to 1.0 (Full Volume)

        for (let i = 0; i < originalSamples.length; i++) {
            const raw = originalSamples[i];

            // --- STAGE 1: High-Pass Filter ---
            let afterHp = alpha_hp * (lastVal_hp + raw - lastSample_hp);
            lastVal_hp = afterHp;
            lastSample_hp = raw;

            // --- STAGE 2: Low-Pass Filter ---
            let afterLp = lastVal_lp + alpha_lp * (afterHp - lastVal_lp);
            lastVal_lp = afterLp;

            // --- STAGE 3: Smart Noise Gate (Hold & Envelope) ---
            const inputAbs = Math.abs(afterLp);
            let targetGain = 0;

            if (inputAbs > GATE_THRESHOLD) {
                // Signal detected: Open gate immediately & reset hold timer
                targetGain = 1.0;
                holdCounter = HOLD_SAMPLES; 
            } else {
                // No signal
                if (holdCounter > 0) {
                    // Holding: Keep gate open
                    targetGain = 1.0;
                    holdCounter--;
                } else {
                    // Release: Close gate
                    targetGain = 0.0;
                }
            }

            // Apply Envelope (Smooth transitions to avoid clicks)
            if (currentGain < targetGain) {
                // Attack (Opening)
                currentGain += ATTACK_RATE;
                if (currentGain > 1.0) currentGain = 1.0;
            } else if (currentGain > targetGain) {
                // Release (Closing)
                currentGain -= RELEASE_RATE;
                if (currentGain < 0.0) currentGain = 0.0;
            }

            // Apply Gain to Signal
            let gated = afterLp * currentGain;

            // Soft Limiter (Safety clipping)
            if (gated > 32767) gated = 32767;
            if (gated < -32768) gated = -32768;

            processedSamples[i] = gated;
        }
        // ----------------------------------

        const sampleBlockSize = 1152;
        const mp3Data = [];

        for (let i = 0; i < processedSamples.length; i += sampleBlockSize) {
            const sampleChunk = processedSamples.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

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

        self.postMessage({ id, mp3Data: result.buffer }, [result.buffer]);

    } catch (error) {
        self.postMessage({ id, error: error.message || "Unknown encoding error" });
    }
};
`;

export class AudioWorkerService {
    private worker: Worker | null = null;
    private pendingRequests = new Map<string, { resolve: (data: ArrayBuffer) => void; reject: (err: any) => void }>();

    private getWorker(): Worker {
        if (!this.worker) {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            this.worker = new Worker(workerUrl);
            
            this.worker.onmessage = (e) => {
                const { id, mp3Data, error } = e.data;
                const request = this.pendingRequests.get(id);
                if (request) {
                    if (error) {
                        request.reject(new Error(error));
                    } else {
                        request.resolve(mp3Data);
                    }
                    this.pendingRequests.delete(id);
                }
            };

            this.worker.onerror = (e) => {
                console.error('Audio Worker Error:', e);
            };
        }
        return this.worker;
    }

    public encodeMp3(pcmData: ArrayBuffer, sampleRate: number): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            try {
                const worker = this.getWorker();
                const id = Math.random().toString(36).substring(2, 15);
                
                this.pendingRequests.set(id, { resolve, reject });
                
                worker.postMessage({ id, pcmData, sampleRate });
            } catch (err) {
                reject(err);
            }
        });
    }
}

export const audioWorkerService = new AudioWorkerService();
