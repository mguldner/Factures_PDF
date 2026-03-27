const BOM = '\uFEFF';
const HEADERS = 'date,fournisseur,numero_facture,montant_ht,taux_tva,montant_tva,montant_ttc';

/** Formate un montant numérique en décimale avec virgule (format FR comptable). */
function fmtAmount(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

/** Échappe un champ CSV (guillemets si nécessaire). */
function escape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * Génère le contenu CSV à partir d'un tableau de factures.
 * Format : UTF-8 BOM, séparateur virgule, décimales avec virgule.
 */
export function generateCSV(invoices) {
  const rows = invoices.map(inv => [
    escape(inv.date ?? ''),
    escape(inv.fournisseur ?? ''),
    escape(inv.numero_facture ?? ''),
    fmtAmount(inv.montant_ht),
    fmtAmount(inv.taux_tva),
    fmtAmount(inv.montant_tva),
    fmtAmount(inv.montant_ttc),
  ].join(','));

  return BOM + HEADERS + '\n' + rows.join('\n');
}

/** Déclenche le téléchargement d'un fichier CSV dans le navigateur. */
export function downloadCSV(content, filename = 'factures.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
