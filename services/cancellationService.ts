// services/cancellationService.ts

/**
 * Represents a handle to an AbortController's signal and abort method.
 */
export interface CancellationHandle {
  abort: () => void;
  readonly signal: AbortSignal;
}

/**
 * Creates a new CancellationHandle.
 * @returns A CancellationHandle object.
 */
export function createCancellationHandle(): CancellationHandle {
  const controller = new AbortController();
  return {
    abort: () => controller.abort(),
    signal: controller.signal,
  };
}

/**
 * Strictly aborts a given AbortController or a CancellationHandle.
 * This function emphasizes the immediate nature of the abort call.
 * It's designed to be called when an operation needs to be cancelled
 * without delay from the client-side perspective.
 *
 * @param handle The AbortController or CancellationHandle to abort.
 */
export function strictAbort(handle?: AbortController | CancellationHandle | null): void {
  if (handle) {
    handle.abort();
  }
}
