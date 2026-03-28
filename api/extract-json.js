import crypto from 'crypto';
import OpenAI from 'openai';

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

// ─── Auth helpers ────────────────────────────────────────────────────────────

function decodeToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function verifyFreeTrialToken(token, secret) {
  const decoded = decodeToken(token);
  if (!decoded) return null;
  const { userId, credits, timestamp, sig } = decoded;
  if (typeof credits !== 'number' || credits <= 0) return null;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${userId}:${credits}:${timestamp}`).digest('hex');
  if (sig !== expected) return null;
  return { userId, credits, timestamp };
}

function makeToken(userId, credits, timestamp, secret) {
  const data = `${userId}:${credits}:${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ userId, credits, timestamp, sig })).toString('base64url');
}

// ─── Heuristic parser ────────────────────────────────────────────────────────

const FR_MONTHS = {
  janvier: '01', janv: '01',
  'f\u00e9vrier': '02', 'f\u00e9v': '02', fev: '02',
  mars: '03',
  avril: '04', avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07', juil: '07',
  'ao\u00fbt': '08', aout: '08',
  septembre: '09', sept: '09',
  octobre: '10', oct: '10',
  novembre: '11', nov: '11',
  'd\u00e9cembre': '12', dec: '12',
};

function parseAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/[\s\u00a0']/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

const FR_TVA_RATES = [20, 10, 5.5, 2.1, 0];

function snapTvaRate(rate) {
  if (rate === null || rate === undefined) return null;
  return FR_TVA_RATES.reduce((best, r) => Math.abs(r - rate) < Math.abs(best - rate) ? r : best);
}

/**
 * Normalise un tableau de lignes TVA :
 * - snap de chaque taux au taux standard le plus proche (tolérance ±0.5 %)
 * - recalcul de montant_tva si manquant
 * - calcul de tva_totale comme somme des montant_tva
 */
function normalizeLignesTva(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) return { lignes_tva: [], tva_totale: 0 };

  const normalized = lignes
    .map(l => {
      const rawTaux = typeof l.taux === 'number' ? l.taux : parseFloat(l.taux);
      const taux = isNaN(rawTaux) ? null : snapTvaRate(rawTaux);
      const base_ht = typeof l.base_ht === 'number' ? l.base_ht : parseFloat(l.base_ht) || null;
      let montant_tva = typeof l.montant_tva === 'number' ? l.montant_tva : parseFloat(l.montant_tva) || null;

      // Inférer montant_tva si manquant mais base_ht et taux connus
      if (montant_tva === null && base_ht !== null && taux !== null) {
        montant_tva = Math.round(base_ht * taux / 100 * 100) / 100;
      }

      return { taux, base_ht, montant_tva };
    })
    .filter(l => l.taux !== null || l.base_ht !== null);

  const tva_totale = Math.round(
    normalized.reduce((sum, l) => sum + (l.montant_tva ?? 0), 0) * 100
  ) / 100;

  return { lignes_tva: normalized, tva_totale };
}

function parseInvoiceText(text) {
  const result = {
    numero_facture: null,
    date: null,
    fournisseur: null,
    siret: null,
    libelle: null,
    devise: 'EUR',
    lignes_tva: [],
    tva_totale: 0,
    montant_ttc: null,
  };

  // Variables internes pour l'extraction TVA (fusionnées en lignes_tva à la fin)
  let _montant_ht = null;
  let _taux_tva = null;
  let _montant_tva = null;

  // ── Numéro de facture
  const numPatterns = [
    /(?:facture|invoice|fact\.?)\s*[n°n\xb0]\s*[:#]?\s*([A-Z0-9][-A-Z0-9\/_. ]{1,25})/i,
    /(?:n[°\xb0]|num[e\xe9]ro|r[e\xe9]f\.?)\s*[:#]?\s*([A-Z0-9][-A-Z0-9\/_. ]{1,20})/i,
    /\b(FA[-\s]?\d{3,12})\b/i,
    /\b(INV[-\s]?\d{3,12})\b/i,
    /\b(F-\d{4,12})\b/i,
  ];
  for (const re of numPatterns) {
    const m = text.match(re);
    if (m) { result.numero_facture = m[1].trim().replace(/\s+$/, ''); break; }
  }

  // ── Date
  const datePatterns = [
    {
      re: /(\d{1,2})\s+(janvier|janv\.?|f[e\xe9]vrier|f[e\xe9]v\.?|fev\.?|mars|avril|avr\.?|mai|juin|juillet|juil\.?|ao[u\xfb]t|septembre|sept\.?|octobre|oct\.?|novembre|nov\.?|d[e\xe9]cembre|d[e\xe9]c\.?)\s+(\d{4})/i,
      fmt: (m) => {
        const day = m[1].padStart(2, '0');
        const month = FR_MONTHS[m[2].toLowerCase().replace('.', '')] || '01';
        return `${day}/${month}/${m[3]}`;
      },
    },
    {
      re: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
      fmt: (m) => `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`,
    },
    {
      re: /(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/,
      fmt: (m) => `${m[3]}/${m[2]}/${m[1]}`,
    },
  ];
  for (const { re, fmt } of datePatterns) {
    const m = text.match(re);
    if (m) { result.date = fmt(m); break; }
  }

  // ── SIRET / SIREN
  const siretM = text.match(/(?:SIRET|SIREN)\s*[:#]?\s*(\d[\d\s]{8,14}\d)/i);
  if (siretM) result.siret = siretM[1].replace(/\s/g, '');

  // ── Fournisseur
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const supplierPatterns = [
    /(?:(?:de\s+)?chez|fournisseur|vendeur|[e\xe9]metteur|prestataire)\s*[:#]?\s*(.+)/i,
    /(?:soci[e\xe9]t[e\xe9]|entreprise|raison\s+sociale)\s*[:#]?\s*(.+)/i,
  ];
  for (const re of supplierPatterns) {
    const m = text.match(re);
    if (m) { result.fournisseur = m[1].trim().slice(0, 80); break; }
  }
  if (!result.fournisseur && result.siret) {
    const idx = lines.findIndex(l => l.includes(result.siret));
    for (let i = idx - 1; i >= Math.max(0, idx - 4); i--) {
      if (lines[i].length > 3 && lines[i].length < 80 && !/^\d/.test(lines[i]) && !/^\d{2}\//.test(lines[i])) {
        result.fournisseur = lines[i]; break;
      }
    }
  }
  if (!result.fournisseur && lines.length > 0) {
    const candidate = lines.find(l => l.length > 3 && l.length < 80 && !/^\d/.test(l));
    if (candidate) result.fournisseur = candidate;
  }

  // ── Libellé
  const libelleM = text.match(
    /(?:objet|prestation|d[eé]signation|description|pour|service|libell[eé])\s*[:#]?\s*(.+)/i
  );
  if (libelleM) result.libelle = libelleM[1].trim().slice(0, 150);

  // ── Devise
  if (/\b(USD|US\$)\b/.test(text)) result.devise = 'USD';
  else if (/\bGBP\b|£/.test(text)) result.devise = 'GBP';
  else if (/\bCHF\b/.test(text)) result.devise = 'CHF';
  else result.devise = 'EUR';

  // ── Montants — pattern: keyword followed by amount
  const htM = text.match(
    /(?:(?:total|sous-total|montant)\s+)?(?:HT|hors[\s-]taxe?s?)\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (htM) _montant_ht = parseAmount(htM[1]);

  const ttcM = text.match(
    /(?:(?:total|net)\s+)?(?:TTC|toutes?\s+taxes?\s+comprises?|net\s+[a\u00e0]\s+payer|montant\s+pay[e\xe9])\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (ttcM) result.montant_ttc = parseAmount(ttcM[1]);

  const tvaRateAmtM = text.match(
    /TVA\s*(?:[a\u00e0@]\s*)?(\d+[,.]?\d*)\s*%\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (tvaRateAmtM) {
    _taux_tva = snapTvaRate(parseAmount(tvaRateAmtM[1]));
    _montant_tva = parseAmount(tvaRateAmtM[2]);
  } else {
    const tvaAmtM = text.match(
      /(?:TVA|T\.V\.A\.)\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
    );
    if (tvaAmtM) _montant_tva = parseAmount(tvaAmtM[1]);

    const tvaRateM = text.match(/TVA\s*(?:[a\u00e0@]\s*)?(\d+[,.]?\d*)\s*%/i);
    if (tvaRateM) _taux_tva = snapTvaRate(parseAmount(tvaRateM[1]));
  }

  // Inférer le taux TVA manquant depuis le ratio HT/TVA
  if (_taux_tva === null && _montant_ht && _montant_tva) {
    _taux_tva = snapTvaRate((_montant_tva / _montant_ht) * 100);
  }

  // Compléter les montants manquants
  if (_montant_ht && _montant_tva && !result.montant_ttc)
    result.montant_ttc = Math.round((_montant_ht + _montant_tva) * 100) / 100;
  if (result.montant_ttc && _montant_tva && !_montant_ht)
    _montant_ht = Math.round((result.montant_ttc - _montant_tva) * 100) / 100;
  if (_montant_ht && result.montant_ttc && !_montant_tva)
    _montant_tva = Math.round((result.montant_ttc - _montant_ht) * 100) / 100;

  // Construire lignes_tva à partir des données extraites
  if (_montant_ht !== null || _montant_tva !== null) {
    const { lignes_tva, tva_totale } = normalizeLignesTva([
      { taux: _taux_tva, base_ht: _montant_ht, montant_tva: _montant_tva },
    ]);
    result.lignes_tva = lignes_tva;
    result.tva_totale = tva_totale;
  }

  return result;
}

// ─── OpenAI Vision ───────────────────────────────────────────────────────────

async function extractWithVision(images) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const imageContent = images.map(b64 => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' },
  }));

  const { choices } = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyse cette facture. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour :
{
  "numero_facture": "string ou null",
  "date": "DD/MM/YYYY ou null",
  "fournisseur": "nom de l'entreprise émettrice ou null",
  "siret": "numéro SIRET/SIREN sans espaces ou null",
  "libelle": "description courte du service ou produit facturé ou null",
  "devise": "code ISO de la devise (ex: EUR, USD, GBP) ou EUR par défaut",
  "lignes_tva": [
    { "taux": 20.0, "base_ht": 1000.00, "montant_tva": 200.00 }
  ],
  "montant_ttc": number ou null
}
Pour lignes_tva, liste chaque taux TVA distinct présent sur la facture (une entrée par taux). Taux autorisés : 20, 10, 5.5, 2.1, 0. Si la facture n'a pas de TVA, retourne un tableau vide [].
Les montants sont des nombres décimaux avec point (ex: 1234.56). La devise est un code ISO 4217 sur 3 lettres.`,
          },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 800,
  });

  const content = choices[0].message.content.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Réponse IA invalide');
  const data = JSON.parse(jsonMatch[0]);

  // Fallback : si GPT retourne l'ancien format plat, convertir en lignes_tva
  if (!Array.isArray(data.lignes_tva)) {
    const flat_ht  = data.montant_ht  ?? null;
    const flat_tva = data.montant_tva ?? null;
    const flat_taux = data.taux_tva   ?? null;
    data.lignes_tva = (flat_ht !== null || flat_tva !== null)
      ? [{ taux: flat_taux, base_ht: flat_ht, montant_tva: flat_tva }]
      : [];
  }

  // Normaliser les taux et calculer tva_totale
  const { lignes_tva, tva_totale } = normalizeLignesTva(data.lignes_tva);
  data.lignes_tva = lignes_tva;
  data.tva_totale = tva_totale;

  // Inférer montant_ttc si manquant
  if (!data.montant_ttc && lignes_tva.length > 0) {
    const total_ht = Math.round(lignes_tva.reduce((s, l) => s + (l.base_ht ?? 0), 0) * 100) / 100;
    if (total_ht > 0) data.montant_ttc = Math.round((total_ht + tva_totale) * 100) / 100;
  }

  // Supprimer les champs plats résiduels
  delete data.montant_ht;
  delete data.taux_tva;
  delete data.montant_tva;

  return data;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, images } = req.body || {};
  const authToken = req.headers['x-free-trial-token'] || req.headers['x-stripe-session-id'];
  const authType  = req.headers['x-free-trial-token'] ? 'free_trial'
                  : req.headers['x-stripe-session-id'] ? 'paid'
                  : null;
  const secret = process.env.FREE_TRIAL_SECRET;

  // ── Vérification auth
  let tokenData = null;
  let newToken = null;

  if (authType === 'free_trial') {
    tokenData = verifyFreeTrialToken(authToken, secret);
    if (!tokenData) {
      return res.status(401).json({ error: 'Token invalide ou expiré', code: 'INVALID_TOKEN' });
    }
    newToken = makeToken(tokenData.userId, tokenData.credits - 1, tokenData.timestamp, secret);

  } else if (authType === 'paid') {
    // Vérification Stripe (pas de cache cross-instances en serverless)
    if (!authToken) return res.status(401).json({ error: 'Session ID manquant' });
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(authToken);
      if (session.payment_status !== 'paid') {
        return res.status(401).json({ error: 'Paiement non confirmé', code: 'UNPAID' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'Impossible de vérifier le paiement', code: 'VERIFY_FAILED' });
    }

  } else {
    return res.status(401).json({ error: 'Authentification requise', code: 'NO_AUTH' });
  }

  // ── Extraction
  try {
    let data;
    const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

    if (wordCount > 50) {
      data = parseInvoiceText(text);
    } else if (Array.isArray(images) && images.length > 0) {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: 'OCR non configuré (OPENAI_API_KEY manquant)' });
      }
      data = await extractWithVision(images);
    } else if (wordCount > 0) {
      data = parseInvoiceText(text);
    } else {
      return res.status(400).json({ error: 'Aucun contenu à traiter' });
    }

    res.json({
      data,
      newToken,
      newCredits: tokenData ? tokenData.credits - 1 : undefined,
    });

  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).json({ error: 'Extraction échouée', details: err.message });
  }
}
