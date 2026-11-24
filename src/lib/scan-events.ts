/**
 * Connects the centre button of the bottom bar to the camera card on Home.
 * Off Home the button reads "Scan": it opens Home and turns the camera on.
 * On Home it is the shutter: it takes the photo that gets read.
 */
import { useSyncExternalStore } from 'react';

const START = 'paytrol:camera-start';
const CAPTURE = 'paytrol:capture';
const STATE = 'paytrol:camera-state';

/** What the camera card is doing, so the shutter can show it. */
export type CameraState = 'off' | 'starting' | 'live' | 'reading';

let pendingStart = false;
let cameraState: CameraState = 'off';

/** Turn the camera on now if Home is open, or as soon as it opens. */
export function requestCameraStart(): void {
  pendingStart = true;
  window.dispatchEvent(new Event(START));
}

/** True once if a camera start was asked for and not yet handled. */
export function takeCameraStartRequest(): boolean {
  const asked = pendingStart;
  pendingStart = false;
  return asked;
}

/** Ask the camera card on Home to take a photo now. */
export function requestCapture(): void {
  window.dispatchEvent(new Event(CAPTURE));
}

/** Listen for the bottom bar while Home is open. Returns the unsubscribe. */
export function onCameraRequests(handlers: { start: () => void; capture: () => void }): () => void {
  const start = () => {
    if (takeCameraStartRequest()) handlers.start();
  };
  const capture = () => handlers.capture();
  window.addEventListener(START, start);
  window.addEventListener(CAPTURE, capture);
  return () => {
    window.removeEventListener(START, start);
    window.removeEventListener(CAPTURE, capture);
  };
}

/** Called by the camera card whenever its state changes. */
export function setCameraState(next: CameraState): void {
  if (next === cameraState) return;
  cameraState = next;
  window.dispatchEvent(new Event(STATE));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(STATE, callback);
  return () => window.removeEventListener(STATE, callback);
}

/** The camera card's current state, for the shutter button. */
export function useCameraState(): CameraState {
  return useSyncExternalStore(
    subscribe,
    () => cameraState,
    () => 'off'
  );
}
