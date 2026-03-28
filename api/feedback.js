// ─── POST /api/feedback ───────────────────────────────────────────────────────
// Reçoit { rating: 1-5|null, message: string|null }
// Envoie vers FEEDBACK_WEBHOOK_URL (Discord/Slack) si configuré, sinon logue.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const rating  = Number.isInteger(body?.rating)  ? Math.min(5, Math.max(1, body.rating)) : null;
  const message = typeof body?.message === 'string' ? body.message.slice(0, 1000).trim() : null;

  if (!rating && !message) {
    return res.status(400).json({ error: 'rating or message required' });
  }

  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

  if (webhookUrl) {
    await sendToWebhook(webhookUrl, rating, message);
  } else {
    console.log('[feedback]', JSON.stringify({ rating, message, ts: new Date().toISOString() }));
  }

  return res.status(200).json({ ok: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendToWebhook(url, rating, message) {
  const stars   = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : null;
  const lines   = [];
  if (stars)   lines.push(`**Note :** ${stars} (${rating}/5)`);
  if (message) lines.push(`**Message :** ${message}`);

  // Format Discord (content) — compatible Slack (text) via même champ
  const payload = url.includes('discord')
    ? { content: `📣 **Nouveau retour FactureCSV**\n${lines.join('\n')}` }
    : { text: `📣 *Nouveau retour FactureCSV*\n${lines.join('\n')}` };

  const discordRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!discordRes.ok) {
    console.error('[feedback] webhook error', discordRes.status, await discordRes.text());
  }
}
