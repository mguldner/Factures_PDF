import { buffer } from 'micro';
import Stripe from 'stripe';

// Disable Vercel's automatic body parsing so we get the raw bytes for
// Stripe's signature verification.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    const rawBody = await buffer(req);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        // In a production app, persist session.id → credits in Vercel KV / Redis.
        // Here we log it; session validity is checked in real-time via Stripe API
        // in extract-json.js.
        console.log('Payment confirmed:', session.id, 'credits:', session.metadata?.credits);
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      console.log('Async payment succeeded:', session.id);
      break;
    }
    default:
      // Unhandled event type — ignore
      break;
  }

  res.json({ received: true });
}
