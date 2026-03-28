import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = req.headers['x-stripe-session-id'];
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId requis' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe non configuré' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      paid: session.payment_status === 'paid',
      sessionId: session.id,
      credits: parseInt(session.metadata?.credits ?? session.amount_total / 299, 10) || 1,
    });
  } catch (err) {
    console.error('verify-session error:', err.message);
    res.status(500).json({ error: 'Impossible de vérifier la session' });
  }
}
