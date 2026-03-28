import { getStoredAuth, updateFreeTrialAuth, hasCredits } from './auth.js';
import { extractFromPDF } from './pdf-extractor.js';
import { state } from './state.js';
import { showScreen, showToast, updateCreditsUI } from './ui.js';
import { startProgressCycle, setProgressMsg, stopProgressCycle } from './progress.js';
import { renderReviewScreen } from './review.js';
import { setupFieldEditing } from './editor.js';
import { showExtractionError, hideExtractionError } from './report.js';

// ─── Traitement d'un fichier PDF ──────────────────────────────────────────────
export async function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Seuls les fichiers PDF sont acceptés.', 'error');
    return;
  }

  const auth = getStoredAuth();
  if (!auth || !hasCredits()) {
    showScreen('noCredits');
    return;
  }

  hideExtractionError();
  showScreen('processing');
  startProgressCycle('Lecture du PDF…');

  try {
    const extracted = await extractFromPDF(file, msg => setProgressMsg(msg));

    if (extracted.type === 'images') {
      stopProgressCycle();
      startProgressCycle('OCR en cours (IA)…');
    } else {
      stopProgressCycle();
      startProgressCycle('Extraction des données…');
    }

    const payload = {
      ...(extracted.type === 'text'
        ? { text: extracted.text }
        : { images: extracted.images }),
    };

    const authHeaders = auth.type === 'free_trial'
      ? { 'X-Free-Trial-Token': auth.token }
      : { 'X-Stripe-Session-Id': auth.token };

    const res = await fetch('/api/extract-json', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body:    JSON.stringify(payload),
    });

    stopProgressCycle();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) { showScreen('noCredits'); return; }
      throw new Error(err.error ?? `Erreur serveur ${res.status}`);
    }

    const { data, newToken, newCredits } = await res.json();

    if (newToken) updateFreeTrialAuth(newToken, newCredits);
    updateCreditsUI();

    state.invoices.push({
      ...data,
      _filename: file.name,
      _mode:     extracted.type === 'images' ? 'vision' : 'heuristic',
    });

    renderReviewScreen();
    setupFieldEditing();
    showScreen('review');

  } catch (err) {
    stopProgressCycle();
    console.error(err);
    showScreen('upload');
    showExtractionError(file, err.message);
  }
}
