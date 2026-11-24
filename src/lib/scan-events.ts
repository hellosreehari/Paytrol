/**
 * Lets the Scan button in the bottom bar start a scan on Home, whether Home
 * is already open or is about to open.
 */
const EVENT = 'paytrol:scan';
let pending = false;

/** Ask Home to start scanning now, or as soon as it opens. */
export function requestScan(): void {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

/** True once if a scan was asked for and not yet started. */
export function takeScanRequest(): boolean {
  const asked = pending;
  pending = false;
  return asked;
}

/** Call `handler` whenever a scan is asked for while Home is open. */
export function onScanRequest(handler: () => void): () => void {
  const listener = () => {
    if (takeScanRequest()) handler();
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
