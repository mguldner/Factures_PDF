import { getStoredAuth } from './auth.js';
import {
  screenUpload, screenProcessing, screenReview, screenNoCredits,
  creditsBadge, creditsText, trialBanner, bannerCredits,
  toast, toastMessage,
} from './dom.js';

// ─── Navigation entre écrans ──────────────────────────────────────────────────
const screens = {
  upload:     screenUpload,
  processing: screenProcessing,
  review:     screenReview,
  noCredits:  screenNoCredits,
};

export function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
export function showToast(msg, type = 'info', duration = 4000) {
  clearTimeout(toastTimer);
  toastMessage.textContent = msg;
  toast.className = [
    'fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm shadow-xl z-50 max-w-xs transition-all',
    type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white',
  ].join(' ');
  toast.classList.remove('opacity-0', 'pointer-events-none');
  toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'pointer-events-none'), duration);
}

// ─── Crédits UI ───────────────────────────────────────────────────────────────
export function updateCreditsUI() {
  const auth = getStoredAuth();
  if (!auth) return;

  creditsBadge.classList.remove('hidden');
  creditsBadge.classList.add('flex');

  if (auth.type === 'paid') {
    const n = auth.credits;
    creditsText.textContent = `${n} crédit${n !== 1 ? 's' : ''} payant${n !== 1 ? 's' : ''}`;
    creditsBadge.className = creditsBadge.className
      .replace(/bg-\w+-50 text-\w+-700/g, '')
      .trimEnd() + ' bg-green-50 text-green-700';
  } else {
    const n = auth.credits ?? 0;
    creditsText.textContent = `${n} extraction${n !== 1 ? 's' : ''} gratuite${n !== 1 ? 's' : ''}`;
    const color = n === 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700';
    creditsBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ' + color;
  }

  // Bandeau
  if (auth.type === 'free_trial' && auth.credits > 0) {
    bannerCredits.textContent = auth.credits;
    trialBanner.classList.remove('hidden');
  } else {
    trialBanner.classList.add('hidden');
  }
}
