const UID_KEY = 'fcsv_uid';
const AUTH_KEY = 'fcsv_auth';

function getOrCreateUserId() {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

/** Initialise l'auth : crée un essai gratuit si aucun token stocké. */
export async function initAuth() {
  const stored = getStoredAuth();
  if (stored) return stored;

  const userId = getOrCreateUserId();
  const res = await fetch('/api/create-free-trial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!res.ok) throw new Error('Impossible d\'initialiser l\'essai gratuit');

  const { token, credits } = await res.json();
  const auth = { type: 'free_trial', token, credits };
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  return auth;
}

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Après chaque extraction gratuite, met à jour le token décrémenté. */
export function updateFreeTrialAuth(newToken, newCredits) {
  const auth = { type: 'free_trial', token: newToken, credits: newCredits };
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  return auth;
}

/** Après paiement Stripe confirmé. */
export function setPaidAuth(sessionId, credits) {
  const auth = { type: 'paid', token: sessionId, credits };
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  return auth;
}

export function getCredits() {
  const auth = getStoredAuth();
  if (!auth) return 0;
  if (auth.type === 'paid') return auth.credits ?? Infinity;
  return auth.credits ?? 0;
}

export function hasCredits() {
  return getCredits() > 0;
}
