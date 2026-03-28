import { initAuth } from './auth.js';
import { btnNewInvoice, btnCloseBanner, trialBanner } from './dom.js';
import { showScreen, updateCreditsUI } from './ui.js';
import { initUpload } from './upload.js';
import { initGenerate } from './generate.js';
import { initPayment, handleStripeReturn } from './payment.js';
import { initFeedback } from './feedback.js';
import { initReport, openReportModal } from './report.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Init auth
  try {
    await initAuth();
    updateCreditsUI();
  } catch (err) {
    console.warn('Auth init:', err.message);
  }

  // Retour Stripe (success / cancelled)
  await handleStripeReturn();

  // Modules
  initUpload();
  initGenerate();
  initPayment();
  initFeedback();
  initReport();

  // Bouton "Données incorrectes ?" sur l'écran de révision
  document.getElementById('btn-report-review').addEventListener('click', openReportModal);

  // Bouton "Nouvelle facture"
  btnNewInvoice.addEventListener('click', () => showScreen('upload'));

  // Fermeture du bandeau essai gratuit
  btnCloseBanner.addEventListener('click', () => trialBanner.classList.add('hidden'));
});
