/**
 * Bridge between plain code (the tool executor) and the one React component
 * that can render a page: the hidden WebView.
 *
 * The executor is not a component, so it cannot mount a WebView. Instead it
 * queues a request here, <WebReader/> picks it up, renders the page offscreen,
 * extracts innerText and hands it back.
 */

export interface ReadRequest {
  id: string;
  url: string;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

let queue: ReadRequest[] = [];
let wake: (() => void) | null = null;

let seq = 0;

export function onReaderNeeded(fn: () => void): () => void {
  wake = fn;
  fn();
  return () => {
    if (wake === fn) wake = null;
  };
}

export function pendingRead(): ReadRequest | null {
  return queue[0] ?? null;
}

export function completeRead(id: string, text: string) {
  const req = queue.find(r => r.id === id);
  if (!req) return;
  queue = queue.filter(r => r.id !== id);
  req.resolve(text);
  wake?.();
}

export function failRead(id: string, message: string) {
  const req = queue.find(r => r.id === id);
  if (!req) return;
  queue = queue.filter(r => r.id !== id);
  req.reject(new Error(message));
  wake?.();
}

/** Render `url` in the hidden browser and return the visible text. */
export function requestRenderedRead(url: string, timeoutMs = 20000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const req: ReadRequest = { id: `r${Date.now()}${seq++}`, url, resolve, reject };
    queue.push(req);
    wake?.();

    setTimeout(() => {
      if (queue.some(r => r.id === req.id)) {
        failRead(req.id, 'Page took too long to render');
      }
    }, timeoutMs);
  });
}
