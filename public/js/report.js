// ─── Module Signalement de facture problématique ──────────────────────────────
// Limite au-delà de laquelle on n'envoie pas le fichier brut (3 Mo)
const PDF_SEND_LIMIT = 3 * 1024 * 1024;

let _currentFile  = null; // fichier en cours (succès ou échec)
let _pendingFile  = null; // fichier du dernier échec (pour la bannière)
let _pendingError = '';

// ─── Fichier courant (appelé à chaque extraction, même réussie) ──────────────
export function setCurrentFile(file) {
  _currentFile = file;
}

// ─── Ouvrir la modal de signalement (sans erreur associée) ───────────────────
export function openReportModal() {
  if (_currentFile) _openModal(_currentFile, '');
}

// ─── Affichage de la bannière d'erreur ───────────────────────────────────────
export function showExtractionError(file, errorMsg) {
  _currentFile  = file;
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
let _activeFile  = null;
let _activeError = '';

function _openModal(file, errorMsg) {
  const overlay  = document.getElementById('report-overlay');
  const filename = document.getElementById('report-filename');
  const filesize = document.getElementById('report-filesize');
  const sizeWarn = document.getElementById('report-size-warn');
  const thanks   = document.getElementById('report-thanks');
  const submitBtn = document.getElementById('report-submit');
  const comment  = document.getElementById('report-comment');

  _activeFile  = file;
  _activeError = errorMsg;

  filename.textContent = file.name;
  filesize.textContent = formatSize(file.size);
  sizeWarn.classList.toggle('hidden', file.size <= PDF_SEND_LIMIT);
  thanks.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Envoyer le signalement';
  comment.value = '';
  overlay.classList.remove('hidden');
  comment.focus();
}

export function initReport() {
  const overlay   = document.getElementById('report-overlay');
  const openBtn   = document.getElementById('btn-report-issue');
  const closeBtn  = document.getElementById('report-close');
  const submitBtn = document.getElementById('report-submit');
  const comment   = document.getElementById('report-comment');
  const thanks    = document.getElementById('report-thanks');

  function closeModal() {
    overlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', () => {
    if (_pendingFile) _openModal(_pendingFile, _pendingError);
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  submitBtn.addEventListener('click', async () => {
    if (!_activeFile) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    try {
      const body = await buildPayload(_activeFile, _activeError, comment.value.trim());
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
