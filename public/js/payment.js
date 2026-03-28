import { btnBuy } from './dom.js';
import { showToast, updateCreditsUI } from './ui.js';
import { setPaidAuth } from './auth.js';

// ─── Retour Stripe (success / cancelled) ─────────────────────────────────────
export async function handleStripeReturn() {
  const params    = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');
  const qty       = parseInt(params.get('qty') ?? '1', 10);
  const status    = params.get('status');

  if (sessionId && status === 'success') {
    history.replaceState({}, '', '/');
    try {
      const r = await fetch('/api/verify-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Stripe-Session-Id': sessionId },
      });
      const { paid, credits } = await r.json();
      if (paid) {
        setPaidAuth(sessionId, credits ?? qty);
        updateCreditsUI();
        showToast(`Paiement confirmé ! ${credits ?? qty} crédit(s) ajouté(s).`);
      }
    } catch {
      showToast('Impossible de vérifier le paiement.', 'error');
    }
  } else if (status === 'cancelled') {
    history.replaceState({}, '', '/');
    showToast('Paiement annulé.');
  }
}

// ─── Achat de crédits ────────────────────────────────────────────────────────
export function initPayment() {
  btnBuy.addEventListener('click', async () => {
    btnBuy.disabled = true;
    btnBuy.textContent = 'Redirection…';
    try {
      const r = await fetch('/api/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const { url } = await r.json();
      location.href = url;
    } catch {
      showToast('Impossible d\'initialiser le paiement.', 'error');
      btnBuy.disabled = false;
      btnBuy.textContent = 'Acheter des crédits';
    }
  });
}
