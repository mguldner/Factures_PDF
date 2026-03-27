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

function snapTvaRate(rate) {
  if (rate === null || rate === undefined) return null;
  const std = [20, 10, 5.5, 2.1, 0];
  return std.reduce((best, r) => Math.abs(r - rate) < Math.abs(best - rate) ? r : best);
}

function parseInvoiceText(text) {
  const result = {
    numero_facture: null,
    date: null,
    fournisseur: null,
    siret: null,
    montant_ht: null,
    taux_tva: null,
    montant_tva: null,
    montant_ttc: null,
  };

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

  // ── Montants — pattern: keyword followed by amount
  const amountRe = /([0-9\s\u00a0]+[,.]?[0-9]{0,2})\s*\u20ac?/;

  const htM = text.match(
    /(?:(?:total|sous-total|montant)\s+)?(?:HT|hors[\s-]taxe?s?)\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (htM) result.montant_ht = parseAmount(htM[1]);

  const ttcM = text.match(
    /(?:(?:total|net)\s+)?(?:TTC|toutes?\s+taxes?\s+comprises?|net\s+[a\u00e0]\s+payer|montant\s+pay[e\xe9])\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (ttcM) result.montant_ttc = parseAmount(ttcM[1]);

  const tvaRateAmtM = text.match(
    /TVA\s*(?:[a\u00e0@]\s*)?(\d+[,.]?\d*)\s*%\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
  );
  if (tvaRateAmtM) {
    result.taux_tva = snapTvaRate(parseAmount(tvaRateAmtM[1]));
    result.montant_tva = parseAmount(tvaRateAmtM[2]);
  } else {
    const tvaAmtM = text.match(
      /(?:TVA|T\.V\.A\.)\s*[:\s]+([0-9\s\u00a0]+[,.][0-9]{2})\s*\u20ac?/i
    );
    if (tvaAmtM) result.montant_tva = parseAmount(tvaAmtM[1]);

    const tvaRateM = text.match(/TVA\s*(?:[a\u00e0@]\s*)?(\d+[,.]?\d*)\s*%/i);
    if (tvaRateM) result.taux_tva = snapTvaRate(parseAmount(tvaRateM[1]));
  }

  // Infer missing TVA rate
  if (result.taux_tva === null && result.montant_ht && result.montant_tva) {
    result.taux_tva = snapTvaRate((result.montant_tva / result.montant_ht) * 100);
  }

  // Compute missing amount
  if (result.montant_ht && result.montant_tva && !result.montant_ttc)
    result.montant_ttc = Math.round((result.montant_ht + result.montant_tva) * 100) / 100;
  if (result.montant_ttc && result.montant_tva && !result.montant_ht)
    result.montant_ht = Math.round((result.montant_ttc - result.montant_tva) * 100) / 100;
  if (result.montant_ht && result.montant_ttc && !result.montant_tva)
    result.montant_tva = Math.round((result.montant_ttc - result.montant_ht) * 100) / 100;

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
            text: `Analyse cette facture française. Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour :
{
  "numero_facture": "string ou null",
  "date": "DD/MM/YYYY ou null",
  "fournisseur": "nom de l'entreprise émettrice ou null",
  "siret": "numéro SIRET/SIREN sans espaces ou null",
  "montant_ht": number ou null,
  "taux_tva": 20 | 10 | 5.5 | 2.1 | 0 | null,
  "montant_tva": number ou null,
  "montant_ttc": number ou null
}
Les montants sont des nombres décimaux avec point (ex: 1234.56). Le taux TVA doit être l'un des taux français standards.`,
          },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 600,
  });

  const content = choices[0].message.content.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Réponse IA invalide');
  const data = JSON.parse(jsonMatch[0]);

  // Normalize
  if (data.taux_tva !== null && data.taux_tva !== undefined) {
    data.taux_tva = snapTvaRate(data.taux_tva);
  }
  // Infer missing amount
  if (data.montant_ht && data.montant_tva && !data.montant_ttc)
    data.montant_ttc = Math.round((data.montant_ht + data.montant_tva) * 100) / 100;
  if (data.montant_ttc && data.montant_tva && !data.montant_ht)
    data.montant_ht = Math.round((data.montant_ttc - data.montant_tva) * 100) / 100;

  return data;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, images, authToken, authType } = req.body || {};
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
