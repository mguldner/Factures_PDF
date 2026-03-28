// ─── Sécurité XSS ────────────────────────────────────────────────────────────
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Formatage des valeurs affichées ─────────────────────────────────────────
export function fmtDisplay(key, val) {
  if (val === null || val === undefined || val === '') return null;
  if (key === 'montant_ttc')
    return parseFloat(val).toFixed(2).replace('.', ',') + '\u00a0€';
  return String(val);
}
