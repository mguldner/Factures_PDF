import { dropZone, fileInput } from './dom.js';
import { processFile } from './extract.js';
import { showToast } from './ui.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo

function checkAndProcess(file) {
  if (file.size > MAX_FILE_SIZE) {
    showToast('Ce fichier est trop volumineux (max 20 Mo)', 'error');
    return;
  }
  processFile(file);
}

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
    if (file) checkAndProcess(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) checkAndProcess(fileInput.files[0]);
    fileInput.value = '';
  });
}
