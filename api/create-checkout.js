import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const quantity = Math.min(Math.max(parseInt(req.body?.quantity ?? 1, 10), 1), 100);

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Stripe non configuré' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity }],
      mode: 'payment',
      success_url: `${appUrl}?session_id={CHECKOUT_SESSION_ID}&qty=${quantity}&status=success`,
      cancel_url: `${appUrl}?status=cancelled`,
      locale: 'fr',
      metadata: { credits: String(quantity) },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Impossible de créer la session de paiement' });
  }
}
