const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const MIN_WORDS_FOR_TEXT = 50;

/** Charge pdf.js depuis le CDN si ce n'est pas déjà fait. */
async function ensurePdfjsLoaded() {
  if (window.pdfjsLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${PDFJS_CDN}/pdf.min.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Impossible de charger pdf.js'));
    document.head.appendChild(s);
  });
}

/**
 * Extrait le contenu d'un PDF.
 * @returns {{ type: 'text', text: string, wordCount: number }
 *          | { type: 'images', images: string[], wordCount: number }}
 */
export async function extractFromPDF(file, onProgress) {
  await ensurePdfjsLoaded();

  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;

  onProgress?.('Chargement du PDF…');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  // ── Extraction texte
  let fullText = '';
  for (let i = 1; i <= numPages; i++) {
    onProgress?.(`Lecture de la page ${i}/${numPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount >= MIN_WORDS_FOR_TEXT) {
    return { type: 'text', text: fullText, wordCount };
  }

  // ── PDF scanné → rendu en images PNG
  onProgress?.('PDF scanné détecté, rendu en images…');
  const images = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(`Rendu de la page ${i}/${numPages}…`);
    const page = await pdf.getPage(i);

    // Scale 2× pour meilleure qualité OCR
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Base64 PNG (sans le préfixe data:image/png;base64,)
    images.push(canvas.toDataURL('image/png').split(',')[1]);
  }

  return { type: 'images', images, wordCount };
}
