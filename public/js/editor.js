import { invoicesContainer, confirmCheck, btnDownload, exportSection } from './dom.js';
import { state } from './state.js';
import { fmtDisplay } from './utils.js';

// ─── Validation des champs ───────────────────────────────────────────────────
function validateField(key, value) {
  if (key === 'siret' && value !== null) {
    if (!/^\d{9}$|^\d{14}$/.test(value)) return 'Format invalide (9 ou 14 chiffres uniquement)';
  }
  if (key === 'date' && value !== null) {
    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 'Format invalide (JJ/MM/AAAA requis)';
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12) return 'Date invalide (jour 1-31, mois 1-12)';
  }
  return null;
}

function showFieldError(input, msg) {
  const wrap = input.parentElement;
  let errEl = wrap.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'field-error text-xs text-red-500 mt-1';
    wrap.appendChild(errEl);
  }
  errEl.textContent = msg;
  input.classList.add('border-red-400');
  input.classList.remove('border-blue-400');
}

function clearFieldError(input) {
  const wrap = input.parentElement;
  const errEl = wrap.querySelector('.field-error');
  if (errEl) errEl.remove();
  input.classList.remove('border-red-400');
  input.classList.add('border-blue-400');
}

// ─── Édition inline des champs ────────────────────────────────────────────────
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

  // Validation
  clearFieldError(input);
  const error = validateField(key, rawVal);
  if (error) {
    showFieldError(input, error);
    return;
  }

  state.invoices[index][key] = rawVal;

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

  // Déconfirmation automatique si le champ est modifié
  if (confirmCheck.checked) {
    confirmCheck.checked = false;
    btnDownload.disabled = true;
    exportSection.classList.add('needs-reconfirm');
  }
}

function cancelField(input) {
  clearFieldError(input);
  const display = input.parentElement.querySelector('.editable-display');
  display.classList.remove('hidden');
  input.classList.add('hidden');
}

// Délégation d'événements sur le conteneur des cartes
export function setupFieldEditing() {
  const container = invoicesContainer;

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
