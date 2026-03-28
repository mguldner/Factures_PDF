import { dropZone, fileInput } from './dom.js';
import { processFile } from './extract.js';

// ─── Gestion de l'upload et du drag-and-drop ──────────────────────────────────
export function initUpload() {
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('border-blue-400', 'bg-blue-50/50');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-blue-400', 'bg-blue-50/50');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50/50');
    const file = Array.from(e.dataTransfer.files).find(f => f.type === 'application/pdf');
    if (file) processFile(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processFile(fileInput.files[0]);
    fileInput.value = '';
  });
}
