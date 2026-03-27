import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body || {};
  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    return res.status(400).json({ error: 'userId requis' });
  }

  const secret = process.env.FREE_TRIAL_SECRET;
  if (!secret) return res.status(500).json({ error: 'Configuration manquante' });

  const credits = 3;
  const timestamp = Date.now();
  const data = `${userId}:${credits}:${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');

  const token = Buffer.from(JSON.stringify({ userId, credits, timestamp, sig })).toString('base64url');

  res.json({ token, credits });
}
