'use strict';
(() => {
  const token = window.location.hash.slice(1), button = document.querySelector('#download'), message = document.querySelector('#message'), save = document.querySelector('#save');
  window.history.replaceState(null, '', '/facture'); // bearer stays out of server access logs, history and referrers
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) { button.disabled = true; message.textContent = 'Ouvre le lien personnel reçu par SMS.'; return; }
  let pdfUrl;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true; message.textContent = 'Préparation du téléchargement…';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/invoices/access', { method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw Error(error.error || 'Lien indisponible ou expiré.'); }
      if (!(response.headers.get('content-type') || '').startsWith('application/pdf')) throw Error('Document indisponible.');
      const blob = await response.blob();
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(blob); save.href = pdfUrl; save.download = 'facture-bibou.pdf'; save.hidden = false; save.click();
      message.textContent = 'Ton PDF est prêt. Si nécessaire, touche « Télécharger le PDF », puis enregistre-le dans tes fichiers.';
    } catch (error) { message.textContent = error.name === 'AbortError' ? 'Le serveur met trop de temps à répondre. Réessaie.' : error.message; }
    finally { clearTimeout(timeout); button.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); });
})();
