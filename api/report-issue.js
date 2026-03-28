// ─── POST /api/report-issue ───────────────────────────────────────────────────
// Reçoit { filename, fileSize, errorMsg, comment?, pdfBase64? }
// Transfère sur Discord/Slack (FEEDBACK_WEBHOOK_URL) ou logue en console.

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { filename, fileSize, errorMsg, comment, pdfBase64 } = body ?? {};

  if (!filename || !errorMsg) {
    return res.status(400).json({ error: 'filename and errorMsg are required' });
  }

  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

  if (webhookUrl) {
    await sendToWebhook(webhookUrl, { filename, fileSize, errorMsg, comment, pdfBase64 });
  } else {
    console.log('[report-issue]', JSON.stringify({
      filename, fileSize, errorMsg, comment: comment ?? null,
      hasPdf: !!pdfBase64,
      ts: new Date().toISOString(),
    }));
  }

  return res.status(200).json({ ok: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendToWebhook(url, { filename, fileSize, errorMsg, comment, pdfBase64 }) {
  const fileSizeStr = fileSize ? formatSize(fileSize) : 'inconnu';
  const lines = [
    `**Fichier :** ${filename} (${fileSizeStr})`,
    `**Erreur :** ${errorMsg}`,
  ];
  if (comment) lines.push(`**Commentaire :** ${comment}`);

  const isDiscord = url.includes('discord');
  const msgText   = `🐛 **Facture non analysée — FactureCSV**\n${lines.join('\n')}`;

  if (pdfBase64) {
    // Envoi du PDF en pièce jointe (Discord/Slack acceptent les fichiers en multipart)
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const formData  = new FormData();

    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('files[0]', pdfBlob, filename);

    const payload = isDiscord ? { content: msgText } : { text: msgText };
    formData.append('payload_json', JSON.stringify(payload));

    await fetch(url, { method: 'POST', body: formData });
  } else {
    // Pas de fichier (trop volumineux) — message texte uniquement
    const suffix  = '\n_PDF non joint (fichier trop volumineux)_';
    const payload = isDiscord
      ? { content: msgText + suffix }
      : { text:    msgText + suffix };

    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  }
}

function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
