// ─── Module Feedback ──────────────────────────────────────────────────────────

export function initFeedback() {
  const overlay    = document.getElementById('feedback-overlay');
  const openBtn    = document.getElementById('feedback-btn');
  const closeBtn   = document.getElementById('feedback-close');
  const submitBtn  = document.getElementById('feedback-submit');
  const textarea   = document.getElementById('feedback-text');
  const thanks     = document.getElementById('feedback-thanks');
  const starBtns   = document.querySelectorAll('.star-btn');

  let selectedRating = 0;

  // ── Ouverture / fermeture ────────────────────────────────────────────────
  function openModal() {
    overlay.classList.remove('hidden');
    textarea.focus();
  }

  function closeModal() {
    overlay.classList.add('hidden');
    reset();
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  // Fermeture en cliquant en dehors du modal
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // ── Étoiles ─────────────────────────────────────────────────────────────
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRating = parseInt(btn.dataset.value, 10);
      renderStars(selectedRating);
    });

    // Survol : prévisualisation
    btn.addEventListener('mouseenter', () => renderStars(parseInt(btn.dataset.value, 10), true));
    btn.addEventListener('mouseleave', () => renderStars(selectedRating));
  });

  function renderStars(upTo, preview = false) {
    starBtns.forEach(btn => {
      const val = parseInt(btn.dataset.value, 10);
      const filled = val <= upTo;
      btn.classList.toggle('active', filled && !preview);
      btn.style.color = filled ? '#f59e0b' : '';
    });
  }

  // ── Envoi ────────────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    const message = textarea.value.trim();

    if (!selectedRating && !message) {
      textarea.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedRating || null, message: message || null }),
      });
    } catch (_) {
      // Silencieux côté utilisateur — le feedback est best-effort
    }

    thanks.classList.remove('hidden');
    submitBtn.classList.add('hidden');
    setTimeout(closeModal, 1800);
  });

  // ── Remise à zéro ───────────────────────────────────────────────────────
  function reset() {
    selectedRating = 0;
    renderStars(0);
    textarea.value = '';
    thanks.classList.add('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Envoyer';
  }
}
