import { confirmCheck, btnDownload, exportSection } from './dom.js';
import { state } from './state.js';
import { showToast } from './ui.js';
import { generateCSV, downloadCSV } from './csv-generator.js';
import { highlightMissingFields, clearMissingHighlights } from './review.js';

const REQUIRED_FIELDS = ['date', 'fournisseur', 'montant_ttc'];

function validateRequiredFieldsForExport() {
  clearMissingHighlights();
  const missing = [];
  state.invoices.forEach((inv, i) => {
    REQUIRED_FIELDS.forEach(key => {
      const val = inv[key];
      if (val === null || val === undefined || val === '') {
        missing.push({ index: i, key });
      }
    });
  });
  if (missing.length > 0) {
    highlightMissingFields(missing);
    let warn = exportSection.querySelector('.export-warning');
    if (!warn) {
      warn = document.createElement('div');
      warn.className = 'export-warning mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600';
      exportSection.prepend(warn);
    }
    warn.textContent = `${missing.length} champ(s) requis manquant(s). Veuillez compléter les champs surlignés en rouge avant de télécharger.`;
    return false;
  }
  exportSection.querySelector('.export-warning')?.remove();
  return true;
}

// ─── Confirmation et téléchargement CSV ──────────────────────────────────────
export function initGenerate() {
  confirmCheck.addEventListener('change', e => {
    if (e.target.checked) {
      const valid = validateRequiredFieldsForExport();
      if (!valid) {
        e.target.checked = false;
        btnDownload.disabled = true;
        return;
      }
      exportSection.classList.remove('needs-reconfirm');
    } else {
      clearMissingHighlights();
      exportSection.querySelector('.export-warning')?.remove();
    }
    btnDownload.disabled = !e.target.checked;
  });

  btnDownload.addEventListener('click', () => {
    const csv  = generateCSV(state.invoices);
    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    downloadCSV(csv, `factures_${date}.csv`);
    showToast('CSV téléchargé avec succès !');
  });
}
