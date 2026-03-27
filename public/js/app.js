import { initAuth, getStoredAuth, updateFreeTrialAuth, setPaidAuth, hasCredits, getCredits } from './auth.js';
import { extractFromPDF } from './pdf-extractor.js';
import { generateCSV, downloadCSV } from './csv-generator.js';

// ─── État ─────────────────────────────────────────────────────────────────────
let invoices = [];         // Données extraites, éditables
let selectedQty = 5;       // Quantité sélectionnée pour l'achat

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  upload:     $('screen-upload'),
  processing: $('screen-processing'),
  review:     $('screen-review'),
  noCredits:  $('screen-no-credits'),
};

// ─── Navigation ───────────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info', duration = 4000) {
  clearTimeout(toastTimer);
  const toast = $('toast');
  $('toast-message').textContent = msg;
  toast.className = [
    'fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm shadow-xl z-50 max-w-xs transition-all',
    type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white',
  ].join(' ');
  toast.classList.remove('opacity-0', 'pointer-events-none');
  toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'pointer-events-none'), duration);
}

// ─── Progression ──────────────────────────────────────────────────────────────
const progressMessages = [
  'Analyse de la structure du document…',
  'Reconnaissance des champs comptables…',
  'Extraction des montants…',
  'Vérification des données TVA…',
  'Finalisation…',
];
let progressIdx = 0;
let progressTimer;

function startProgressCycle(title) {
  $('processing-title').textContent = title;
  progressIdx = 0;
  function step() {
    $('processing-msg').textContent = progressMessages[progressIdx % progressMessages.length];
    progressIdx++;
    progressTimer = setTimeout(step, 1800);
  }
  step();
}

function setProgressMsg(msg) {
  $('processing-msg').textContent = msg;
}

function stopProgressCycle() {
  clearTimeout(progressTimer);
}

// ─── Crédits UI ───────────────────────────────────────────────────────────────
function updateCreditsUI() {
  const auth = getStoredAuth();
  if (!auth) return;

  const badge = $('credits-badge');
  const text  = $('credits-text');
  badge.classList.remove('hidden');
  badge.classList.add('flex');

  if (auth.type === 'paid') {
    const n = auth.credits;
    text.textContent = `${n} crédit${n !== 1 ? 's' : ''} payant${n !== 1 ? 's' : ''}`;
    badge.className = badge.className
      .replace(/bg-\w+-50 text-\w+-700/g, '')
      .trimEnd() + ' bg-green-50 text-green-700';
  } else {
    const n = auth.credits ?? 0;
    text.textContent = `${n} extraction${n !== 1 ? 's' : ''} gratuite${n !== 1 ? 's' : ''}`;
    const color = n === 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700';
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ' + color;
  }

  // Bandeau
  const banner = $('trial-banner');
  if (auth.type === 'free_trial' && auth.credits > 0) {
    $('banner-credits').textContent = auth.credits;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ─── Rendu des cartes ─────────────────────────────────────────────────────────
const FIELDS = [
  { key: 'numero_facture', label: 'N° Facture',       type: 'text',   span: false },
  { key: 'date',           label: 'Date',              type: 'text',   span: false, placeholder: 'JJ/MM/AAAA' },
  { key: 'fournisseur',    label: 'Fournisseur',       type: 'text',   span: true  },
  { key: 'siret',          label: 'SIRET / SIREN',     type: 'text',   span: false },
  { key: 'montant_ht',     label: 'Montant HT (€)',    type: 'number', span: false },
  { key: 'taux_tva',       label: 'Taux TVA (%)',      type: 'number', span: false },
  { key: 'montant_tva',    label: 'Montant TVA (€)',   type: 'number', span: false },
  { key: 'montant_ttc',    label: 'Montant TTC (€)',   type: 'number', span: false },
];

function fmtDisplay(key, val) {
  if (val === null || val === undefined || val === '') return null;
  if (['montant_ht', 'montant_tva', 'montant_ttc'].includes(key))
    return parseFloat(val).toFixed(2).replace('.', ',') + '\u00a0€';
  if (key === 'taux_tva')
    return parseFloat(val).toFixed(1).replace('.', ',') + '\u00a0%';
  return String(val);
}

function buildFieldEl(key, label, type, span, placeholder, value, index) {
  const empty = value === null || value === undefined || value === '';
  const displayVal = fmtDisplay(key, value);

  const wrap = document.createElement('div');
  if (span) wrap.className = 'col-span-2';

  wrap.innerHTML = `
    <label class="block text-xs font-medium text-gray-400 mb-1.5 select-none">${label}</label>
    <div class="relative group">
      <div class="editable-display flex items-center justify-between w-full px-3 py-2.5 rounded-lg border
          ${empty ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100 bg-gray-50'}
          hover:border-blue-300 cursor-pointer transition-colors duration-150"
        data-key="${key}" data-index="${index}">
        <span class="text-sm ${empty ? 'text-amber-400 italic' : 'text-gray-800 font-medium'}">
          ${empty ? 'Non détecté' : displayVal}
        </span>
        <svg class="w-3.5 h-3.5 flex-shrink-0 ml-2 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
      </div>
      <input
        type="${type}" step="${type === 'number' ? '0.01' : ''}"
        placeholder="${placeholder ?? ''}"
        value="${empty ? '' : (value ?? '')}"
        class="editable-input hidden w-full px-3 py-2.5 rounded-lg border border-blue-400 bg-white
               text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        data-key="${key}" data-index="${index}">
    </div>`;
  return wrap;
}

function renderInvoiceCard(invoice, index) {
  const lowConf = ['numero_facture', 'date', 'fournisseur', 'montant_ht', 'montant_ttc']
    .filter(k => invoice[k] === null || invoice[k] === undefined).length >= 2;

  const card = document.createElement('div');
  card.className = 'bg-white border border-gray-100 rounded-2xl p-6 shadow-sm';
  card.innerHTML = `
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg class="w-4.5 h-4.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <p class="font-semibold text-gray-800 text-sm leading-tight">${invoice._filename ?? `Facture ${index + 1}`}</p>
          <p class="text-xs text-gray-400 mt-0.5">${invoice._mode === 'vision' ? 'OCR par IA (PDF scanné)' : 'Extraction directe'}</p>
        </div>
      </div>
      ${lowConf ? `
        <span class="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-medium">
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          Vérification recommandée
        </span>` : ''}
    </div>
    <div class="grid grid-cols-2 gap-3" id="card-fields-${index}"></div>`;

  const fieldsGrid = card.querySelector(`#card-fields-${index}`);
  FIELDS.forEach(({ key, label, type, span, placeholder }) => {
    fieldsGrid.appendChild(buildFieldEl(key, label, type, span, placeholder, invoice[key], index));
  });

  return card;
}

function renderReviewScreen() {
  const container = $('invoices-container');
  container.innerHTML = '';
  invoices.forEach((inv, i) => container.appendChild(renderInvoiceCard(inv, i)));
  // Reset checkbox and download button
  $('confirm-check').checked = false;
  $('btn-download').disabled = true;
}

// ─── Édition inline ───────────────────────────────────────────────────────────
function activateField(displayEl) {
  const input = displayEl.parentElement.querySelector('.editable-input');
  displayEl.classList.add('hidden');
  input.classList.remove('hidden');
  input.focus();
  if (input.type !== 'number') input.select();
}

function commitField(input) {
  const key   = input.dataset.key;
  const index = parseInt(input.dataset.index, 10);
  const rawVal = input.type === 'number'
    ? (input.value.trim() === '' ? null : parseFloat(input.value))
    : (input.value.trim() || null);

  invoices[index][key] = rawVal;

  const display = input.parentElement.querySelector('.editable-display');
  const empty   = rawVal === null;
  const fmtVal  = fmtDisplay(key, rawVal);

  display.querySelector('span').textContent = empty ? 'Non détecté' : fmtVal;
  display.querySelector('span').className   =
    `text-sm ${empty ? 'text-amber-400 italic' : 'text-gray-800 font-medium'}`;

  // Update border color
  display.classList.remove('border-amber-200', 'bg-amber-50/60', 'border-gray-100', 'bg-gray-50');
  display.classList.add(...(empty
    ? ['border-amber-200', 'bg-amber-50/60']
    : ['border-gray-100', 'bg-gray-50']));

  display.classList.remove('hidden');
  input.classList.add('hidden');
}

function cancelField(input) {
  const display = input.parentElement.querySelector('.editable-display');
  display.classList.remove('hidden');
  input.classList.add('hidden');
}

// Délégation d'événements sur le conteneur des cartes
function setupFieldEditing() {
  const container = $('invoices-container');

  container.addEventListener('click', e => {
    const display = e.target.closest('.editable-display');
    if (display) activateField(display);
  });

  container.addEventListener('focusout', e => {
    if (e.target.classList.contains('editable-input')) commitField(e.target);
  }, true);

  container.addEventListener('keydown', e => {
    if (!e.target.classList.contains('editable-input')) return;
    if (e.key === 'Enter')  { e.preventDefault(); commitField(e.target); }
    if (e.key === 'Escape') { e.preventDefault(); cancelField(e.target); }
  });
}

// ─── Traitement d'un fichier PDF ──────────────────────────────────────────────
async function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Seuls les fichiers PDF sont acceptés.', 'error');
    return;
  }

  const auth = getStoredAuth();
  if (!auth || !hasCredits()) {
    showScreen('noCredits');
    return;
  }

  showScreen('processing');
  startProgressCycle('Lecture du PDF…');

  try {
    const extracted = await extractFromPDF(file, msg => setProgressMsg(msg));

    if (extracted.type === 'images') {
      stopProgressCycle();
      startProgressCycle('OCR en cours (IA)…');
    } else {
      stopProgressCycle();
      startProgressCycle('Extraction des données…');
    }

    const payload = {
      authToken: auth.token,
      authType:  auth.type,
      ...(extracted.type === 'text'
        ? { text: extracted.text }
        : { images: extracted.images }),
    };

    const res = await fetch('/api/extract-json', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    stopProgressCycle();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) { showScreen('noCredits'); return; }
      throw new Error(err.error ?? `Erreur serveur ${res.status}`);
    }

    const { data, newToken, newCredits } = await res.json();

    if (newToken) updateFreeTrialAuth(newToken, newCredits);
    updateCreditsUI();

    invoices.push({
      ...data,
      _filename: file.name,
      _mode:     extracted.type === 'images' ? 'vision' : 'heuristic',
    });

    renderReviewScreen();
    setupFieldEditing();
    showScreen('review');

  } catch (err) {
    stopProgressCycle();
    console.error(err);
    showToast(err.message, 'error');
    showScreen('upload');
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Init auth
  try {
    await initAuth();
    updateCreditsUI();
  } catch (err) {
    console.warn('Auth init:', err.message);
  }

  // Retour Stripe (success / cancelled)
  const params    = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');
  const qty       = parseInt(params.get('qty') ?? '1', 10);
  const status    = params.get('status');

  if (sessionId && status === 'success') {
    history.replaceState({}, '', '/');
    try {
      const r = await fetch('/api/verify-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      });
      const { paid, credits } = await r.json();
      if (paid) {
        setPaidAuth(sessionId, credits ?? qty);
        updateCreditsUI();
        showToast(`Paiement confirmé ! ${credits ?? qty} crédit(s) ajouté(s).`);
      }
    } catch {
      showToast('Impossible de vérifier le paiement.', 'error');
    }
  } else if (status === 'cancelled') {
    history.replaceState({}, '', '/');
    showToast('Paiement annulé.');
  }

  // ── Drop zone ────────────────────────────────────────────────────────────
  const dropZone  = $('drop-zone');
  const fileInput = $('file-input');

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

  // ── Bouton "Nouvelle facture"
  $('btn-new-invoice').addEventListener('click', () => showScreen('upload'));

  // ── Bandeau fermeture
  $('btn-close-banner').addEventListener('click', () => $('trial-banner').classList.add('hidden'));

  // ── Confirmation + téléchargement
  $('confirm-check').addEventListener('change', e => {
    $('btn-download').disabled = !e.target.checked;
  });

  $('btn-download').addEventListener('click', () => {
    const csv  = generateCSV(invoices);
    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    downloadCSV(csv, `factures_${date}.csv`);
    showToast('CSV téléchargé avec succès !');
  });

  // ── Sélection quantité crédits
  document.querySelectorAll('.credit-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.credit-option').forEach(o => {
        o.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
        o.classList.add('border-gray-200');
      });
      el.classList.remove('border-gray-200');
      el.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
      selectedQty = parseInt(el.dataset.qty, 10);
    });
  });

  // ── Achat crédits
  $('btn-buy').addEventListener('click', async () => {
    $('btn-buy').disabled = true;
    $('btn-buy').textContent = 'Redirection…';
    try {
      const r = await fetch('/api/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ quantity: selectedQty }),
      });
      const { url } = await r.json();
      location.href = url;
    } catch {
      showToast('Impossible d\'initialiser le paiement.', 'error');
      $('btn-buy').disabled = false;
      $('btn-buy').textContent = 'Acheter des crédits';
    }
  });
});
