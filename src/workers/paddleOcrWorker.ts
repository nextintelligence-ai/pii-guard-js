export const PADDLE_OCR_WORKER_URL = '/paddleocr/worker-entry.js';

export function createPaddleOcrWorker(): Worker {
  return new Worker(PADDLE_OCR_WORKER_URL, { type: 'module' });
}
