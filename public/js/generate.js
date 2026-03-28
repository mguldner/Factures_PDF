import { confirmCheck, btnDownload, exportSection } from './dom.js';
import { state } from './state.js';
import { showToast } from './ui.js';
import { generateCSV, downloadCSV } from './csv-generator.js';

// ─── Confirmation et téléchargement CSV ──────────────────────────────────────
export function initGenerate() {
  confirmCheck.addEventListener('change', e => {
    btnDownload.disabled = !e.target.checked;
    if (e.target.checked) {
      exportSection.classList.remove('needs-reconfirm');
    }
  });

  btnDownload.addEventListener('click', () => {
    const csv  = generateCSV(state.invoices);
    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    downloadCSV(csv, `factures_${date}.csv`);
    showToast('CSV téléchargé avec succès !');
  });
}
