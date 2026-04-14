
const WORKER_CODE = `
  let intervalId = null;
  self.onmessage = function(e) {
    if (e.data === 'start') {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        self.postMessage('ping');
      }, 1000); // Ping every second
    } else if (e.data === 'stop') {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    }
  };
`;

class KeepAliveService {
  private worker: Worker | null = null;

  start() {
    if (this.worker) return;

    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      
      this.worker.onmessage = () => {
        // Receiving the ping forces the main thread to wake up slightly
        // We don't need to do anything complex here, the event dispatch is enough
        // console.debug('Heartbeat received'); 
      };

      this.worker.postMessage('start');
    } catch (e) {
      console.error("Failed to start KeepAlive worker:", e);
    }
  }

  stop() {
    if (this.worker) {
      this.worker.postMessage('stop');
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const keepAliveService = new KeepAliveService();
