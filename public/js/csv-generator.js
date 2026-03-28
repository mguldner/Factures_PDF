const BOM = '\uFEFF';

// Format Pennylane / Freebe (point-virgule, colonnes standard)
const HEADERS = 'Date;Fournisseur;SIRET;Libelle;Numero;Taux TVA;Base HT;Montant TVA;TVA Totale;Montant TTC;Devise';

// ── Ancien format (virgule, ordre différent) — conservé en backup ──────────
// const HEADERS_LEGACY = 'date,fournisseur,numero_facture,siret,libelle,devise,taux_tva,base_ht,montant_tva,tva_totale,montant_ttc';
// function generateCSV_legacy(invoices) {
//   const rows = [];
//   for (const inv of invoices) {
//     const lignes = inv.lignes_tva ?? [];
//     const tva_totale = inv.tva_totale ?? 0;
//     const base = [
//       escape(inv.date ?? ''), escape(inv.fournisseur ?? ''),
//       escape(inv.numero_facture ?? ''), escape(inv.siret ?? ''),
//       escape(inv.libelle ?? ''), escape(inv.devise ?? 'EUR'),
//     ];
//     if (lignes.length === 0) {
//       rows.push([...base, '', '', '', '', fmtAmount(inv.montant_ttc)].join(','));
//     } else {
//       for (const l of lignes) {
//         rows.push([...base,
//           fmtAmount(l.taux), fmtAmount(l.base_ht), fmtAmount(l.montant_tva),
//           fmtAmount(tva_totale), fmtAmount(inv.montant_ttc),
//         ].join(','));
//       }
//     }
//   }
//   return BOM + HEADERS_LEGACY + '\n' + rows.join('\n');
// }
// ──────────────────────────────────────────────────────────────────────────

/** Formate un montant numérique en décimale avec virgule (format FR comptable). */
function fmtAmount(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

/** Convertit une date YYYY-MM-DD en DD/MM/YYYY. Retourne la valeur inchangée si autre format. */
function fmtDate(val) {
  if (!val) return '';
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(val);
}

/** Échappe un champ CSV (guillemets si le champ contient le délimiteur ou des guillemets). */
function escape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * Génère le contenu CSV compatible Pennylane / Freebe.
 * Format : UTF-8 BOM, séparateur point-virgule, décimales avec virgule.
 * Une ligne par taux TVA (format multi-taux), TVA Totale répétée sur chaque ligne.
 * Colonnes : Date;Fournisseur;SIRET;Libelle;Numero;Taux TVA;Base HT;Montant TVA;TVA Totale;Montant TTC;Devise
 */
export function generateCSV(invoices) {
  const rows = [];

  for (const inv of invoices) {
    const lignes = inv.lignes_tva ?? [];
    const tva_totale = inv.tva_totale ?? 0;
    const base = [
      escape(fmtDate(inv.date ?? '')),
      escape(inv.fournisseur ?? ''),
      escape(inv.siret ?? ''),
      escape(inv.libelle ?? ''),
      escape(inv.numero_facture ?? ''),
    ];

    if (lignes.length === 0) {
      rows.push([...base, '', '', '', fmtAmount(tva_totale), fmtAmount(inv.montant_ttc), escape(inv.devise ?? 'EUR')].join(';'));
    } else {
      for (const l of lignes) {
        rows.push([
          ...base,
          fmtAmount(l.taux),
          fmtAmount(l.base_ht),
          fmtAmount(l.montant_tva),
          fmtAmount(tva_totale),
          fmtAmount(inv.montant_ttc),
          escape(inv.devise ?? 'EUR'),
        ].join(';'));
      }
    }
  }

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
