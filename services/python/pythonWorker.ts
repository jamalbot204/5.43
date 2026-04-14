
// This worker code is executed in a separate thread.
// It loads Pyodide from CDN and executes Python code.

const WORKER_CODE = `
let pyodide = null;

// Capture standard output
const stdoutBuffer = [];
function stdout(msg) {
  stdoutBuffer.push(msg);
}

self.onmessage = async (event) => {
  const { type, payload, id } = event.data;

  try {
    if (type === 'LOAD') {
      if (!pyodide) {
        // Upgrade to v0.26.1
        importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
        pyodide = await loadPyodide({
          stdout: stdout,
          stderr: stdout // Redirect stderr to stdout for simplicity in chat context
        });
        // Pre-load common scientific packages just in case, or leave light for now
        await pyodide.loadPackage("micropip"); 
      }
      self.postMessage({ type: 'LOADED', id });
    } else if (type === 'RUN') {
      if (!pyodide) throw new Error("Pyodide not loaded");
      
      const code = payload.code;
      stdoutBuffer.length = 0; // Clear buffer

      // Run the code
      let result = await pyodide.runPythonAsync(code);
      
      // If result is a PyProxy (e.g. a Python object), convert it to JS if possible or stringify
      if (result && result.toJs) {
          /* map, set, etc can be tricky, simple toString often safest for generic output */
          result = result.toString();
      }

      const output = stdoutBuffer.join('\\n');
      
      self.postMessage({ 
        type: 'RESULT', 
        id, 
        payload: { 
          output: output, 
          result: result !== undefined ? String(result) : null 
        } 
      });
    } else if (type === 'GET_ENVIRONMENT_STATE') {
      if (!pyodide) throw new Error("Pyodide not loaded");
      
      // Get installed packages using micropip
      await pyodide.loadPackage("micropip");
      const freeze = await pyodide.runPythonAsync(\`
        import micropip
        micropip.freeze()
      \`);
      
      self.postMessage({
        type: 'ENVIRONMENT_STATE',
        id,
        payload: { packages: freeze }
      });
    }
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      id, 
      payload: { message: error.message } 
    });
  }
};
`;

export class PythonWorkerService {
    private worker: Worker | null = null;
    private pendingRequests = new Map<string, { resolve: (data: any) => void; reject: (err: any) => void }>();

    public createWorker(): void {
        if (this.worker) return;
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(workerUrl);

        this.worker.onmessage = (e) => {
            const { type, id, payload } = e.data;
            const request = this.pendingRequests.get(id);
            
            if (type === 'LOADED') {
                if (request) request.resolve(true);
            } else if (type === 'RESULT') {
                if (request) request.resolve(payload);
            } else if (type === 'ENVIRONMENT_STATE') {
                if (request) request.resolve(payload);
            } else if (type === 'ERROR') {
                if (request) request.reject(new Error(payload.message));
            }
            
            if (request) this.pendingRequests.delete(id);
        };

        this.worker.onerror = (err) => {
            console.error("Python Worker Error:", err);
        };
    }

    public async load(): Promise<void> {
        if (!this.worker) this.createWorker();
        return this.send('LOAD', {});
    }

    public async run(code: string): Promise<{ output: string, result: string }> {
        if (!this.worker) throw new Error("Worker not initialized");
        return this.send('RUN', { code });
    }

    public async getEnvironmentState(): Promise<{ packages: string }> {
        if (!this.worker) throw new Error("Worker not initialized");
        return this.send('GET_ENVIRONMENT_STATE', {});
    }

    public terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.pendingRequests.clear();
        }
    }

    private send(type: string, payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) return reject(new Error("Worker is dead"));
            const id = Math.random().toString(36).substring(7);
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ type, payload, id });
        });
    }
}

export const pythonWorkerService = new PythonWorkerService();
