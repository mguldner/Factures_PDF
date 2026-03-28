import { invoicesContainer, confirmCheck, btnDownload, exportSection } from './dom.js';
import { state } from './state.js';
import { escHtml, fmtDisplay } from './utils.js';

// ─── Définition des champs éditables ─────────────────────────────────────────
const FIELDS = [
  { key: 'numero_facture', label: 'N° Facture',        type: 'text',   span: false },
  { key: 'date',           label: 'Date',               type: 'text',   span: false, placeholder: 'JJ/MM/AAAA' },
  { key: 'fournisseur',    label: 'Fournisseur',        type: 'text',   span: true  },
  { key: 'libelle',        label: 'N° Commande',        type: 'text',   span: true  },
  { key: 'siret',          label: 'SIRET / SIREN',      type: 'text',   span: false },
  { key: 'devise',         label: 'Devise',             type: 'text',   span: false },
  { key: 'montant_ttc',    label: 'Montant TTC (€)',    type: 'number', span: false },
];

function buildTvaSection(invoice) {
  const lignes    = invoice.lignes_tva ?? [];
  const tva_totale = invoice.tva_totale ?? 0;

  const section = document.createElement('div');
  section.className = 'col-span-2 mt-1';

  if (lignes.length === 0) {
    section.innerHTML = `
      <label class="block text-xs font-medium text-gray-400 mb-1.5 select-none">Détail TVA</label>
      <div class="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-400 italic">
        TVA non détectée
      </div>`;
    return section;
  }

  const rows = lignes.map(l => {
    const taux = l.taux != null
      ? l.taux.toFixed(1).replace('.', ',') + '\u00a0%'
      : '—';
    const base = l.base_ht != null
      ? l.base_ht.toFixed(2).replace('.', ',') + '\u00a0€\u00a0HT'
      : '—';
    const tva = l.montant_tva != null
      ? l.montant_tva.toFixed(2).replace('.', ',') + '\u00a0€\u00a0TVA'
      : '—';
    return `<div class="flex justify-between text-xs text-gray-600 py-1">
      <span class="text-gray-500">TVA ${taux}</span>
      <span>${base}&nbsp;→&nbsp;${tva}</span>
    </div>`;
  }).join('');

  const total_ht = Math.round(
    lignes.reduce((s, l) => s + (l.base_ht ?? 0), 0) * 100
  ) / 100;

  section.innerHTML = `
    <label class="block text-xs font-medium text-gray-400 mb-1.5 select-none">Détail TVA</label>
    <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      ${rows}
      <div class="border-t border-gray-200 mt-1.5 pt-1.5 flex justify-between text-xs font-medium text-gray-700">
        <span>Total HT&nbsp;: ${total_ht.toFixed(2).replace('.', ',')}\u00a0€</span>
        <span>TVA totale&nbsp;: ${tva_totale.toFixed(2).replace('.', ',')}\u00a0€</span>
      </div>
    </div>`;
  return section;
}

function buildFieldEl(key, label, type, span, placeholder, value, index) {
  const empty      = value === null || value === undefined || value === '';
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
          ${empty ? 'Non détecté' : escHtml(displayVal)}
        </span>
        <svg class="w-3.5 h-3.5 flex-shrink-0 ml-2 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
      </div>
      <input
        type="${type}" step="${type === 'number' ? '0.01' : ''}"
        placeholder="${placeholder ?? ''}"
        value="${empty ? '' : escHtml(value ?? '')}"
        class="editable-input hidden w-full px-3 py-2.5 rounded-lg border border-blue-400 bg-white
               text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        data-key="${key}" data-index="${index}">
    </div>`;
  return wrap;
}

function renderInvoiceCard(invoice, index) {
  const lowConf = ['numero_facture', 'date', 'fournisseur', 'montant_ttc']
    .filter(k => invoice[k] === null || invoice[k] === undefined).length >= 2
    || (invoice.lignes_tva ?? []).length === 0;

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
          <p class="font-semibold text-gray-800 text-sm leading-tight">${escHtml(invoice._filename ?? `Facture ${index + 1}`)}</p>
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
  fieldsGrid.appendChild(buildTvaSection(invoice));

  return card;
}

// ─── Rendu de l'écran de révision ─────────────────────────────────────────────
export function renderReviewScreen() {
  invoicesContainer.innerHTML = '';
  state.invoices.forEach((inv, i) => invoicesContainer.appendChild(renderInvoiceCard(inv, i)));
  // Reset checkbox, download button et indicateur de reconfirmation
  confirmCheck.checked = false;
  btnDownload.disabled = true;
  exportSection.classList.remove('needs-reconfirm');
}

// ─── Mise en évidence des champs requis manquants ────────────────────────────
export function highlightMissingFields(missingList) {
  for (const { index, key } of missingList) {
    const el = invoicesContainer.querySelector(`.editable-display[data-key="${key}"][data-index="${index}"]`);
    if (el) {
      el.classList.remove('border-amber-200', 'border-gray-100', 'bg-amber-50/60', 'bg-gray-50');
      el.classList.add('border-red-300', 'bg-red-50/60', 'missing-required');
    }
  }
}

export function clearMissingHighlights() {
  invoicesContainer.querySelectorAll('.editable-display.missing-required').forEach(el => {
    el.classList.remove('missing-required', 'border-red-300', 'bg-red-50/60');
    // Rétablir la couleur selon que la valeur est vide ou non
    const span = el.querySelector('span');
    const isEmpty = span?.classList.contains('text-amber-400');
    el.classList.add(isEmpty ? 'border-amber-200' : 'border-gray-100', isEmpty ? 'bg-amber-50/60' : 'bg-gray-50');
  });
}
