// ─── Module Signalement de facture problématique ──────────────────────────────
// Limite au-delà de laquelle on n'envoie pas le fichier brut (3 Mo)
const PDF_SEND_LIMIT = 3 * 1024 * 1024;

let _pendingFile = null;
let _pendingError = '';

// ─── Affichage de la bannière d'erreur ───────────────────────────────────────
export function showExtractionError(file, errorMsg) {
  _pendingFile  = file;
  _pendingError = errorMsg;

  const banner = document.getElementById('error-banner');
  const detail = document.getElementById('error-detail');
  detail.textContent = errorMsg;
  banner.classList.remove('hidden');
}

export function hideExtractionError() {
  _pendingFile  = null;
  _pendingError = '';
  document.getElementById('error-banner').classList.add('hidden');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initReport() {
  const overlay    = document.getElementById('report-overlay');
  const openBtn    = document.getElementById('btn-report-issue');
  const closeBtn   = document.getElementById('report-close');
  const submitBtn  = document.getElementById('report-submit');
  const comment    = document.getElementById('report-comment');
  const thanks     = document.getElementById('report-thanks');
  const filename   = document.getElementById('report-filename');
  const filesize   = document.getElementById('report-filesize');
  const sizeWarn   = document.getElementById('report-size-warn');

  function openModal() {
    if (!_pendingFile) return;
    filename.textContent = _pendingFile.name;
    filesize.textContent = formatSize(_pendingFile.size);
    sizeWarn.classList.toggle('hidden', _pendingFile.size <= PDF_SEND_LIMIT);
    thanks.classList.add('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Envoyer le signalement';
    comment.value = '';
    overlay.classList.remove('hidden');
    comment.focus();
  }

  function closeModal() {
    overlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  submitBtn.addEventListener('click', async () => {
    if (!_pendingFile) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    try {
      const body = await buildPayload(_pendingFile, _pendingError, comment.value.trim());
      await fetch('/api/report-issue', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
    } catch (_) {
      // Best-effort — pas d'erreur visible pour l'utilisateur
    }

    thanks.classList.remove('hidden');
    submitBtn.classList.add('hidden');
    setTimeout(closeModal, 2000);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildPayload(file, errorMsg, comment) {
  const base = {
    filename: file.name,
    fileSize: file.size,
    errorMsg,
    comment: comment || null,
  };

  if (file.size <= PDF_SEND_LIMIT) {
    base.pdfBase64 = await toBase64(file);
  }

  return base;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]); // retire le préfixe data:...;base64,
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
