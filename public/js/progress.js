import { processingTitle, processingMsg } from './dom.js';

// ─── Messages de progression ──────────────────────────────────────────────────
const progressMessages = [
  'Analyse de la structure du document…',
  'Reconnaissance des champs comptables…',
  'Extraction des montants…',
  'Vérification des données TVA…',
  'Finalisation…',
];
let progressIdx = 0;
let progressTimer;

export function startProgressCycle(title) {
  processingTitle.textContent = title;
  progressIdx = 0;

  function step() {
    processingMsg.classList.add('msg-fade');
    setTimeout(() => {
      processingMsg.textContent = progressMessages[progressIdx % progressMessages.length];
      processingMsg.classList.remove('msg-fade');
      progressIdx++;
      progressTimer = setTimeout(step, 2500);
    }, 250);
  }

  // Affiche le premier message immédiatement
  processingMsg.textContent = progressMessages[0];
  progressIdx = 1;
  progressTimer = setTimeout(step, 2500);
}

export function setProgressMsg(msg) {
  processingMsg.textContent = msg;
}

export function stopProgressCycle() {
  clearTimeout(progressTimer);
}
