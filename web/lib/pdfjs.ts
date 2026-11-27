'use client';
// Loads PDF.js only in the browser (it can't run on the server).
export async function loadPdfTools() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const render = await import('./pdfRender');
  return { pdfjs, ...render };
}
