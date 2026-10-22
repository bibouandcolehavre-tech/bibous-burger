/* Private owner actions. Client tokens and invoice PDFs never appear in URLs. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const euro = cents => (cents / 100).toFixed(2).replace('.', ',') + ' €';
  let closeCurrent = () => {};
  window.BibouInvoices = {
    clear() { closeCurrent(); },
    async open(order, context) {
      closeCurrent();
      const element = document.createElement('dialog');
      element.style.cssText = 'width:min(600px,calc(100vw - 36px));max-height:90vh;box-sizing:border-box;border:1px solid #d9e0d2;border-radius:22px;padding:23px;background:#fbf3e6;color:#315b4b;font:16px/1.5 system-ui';
      let current = true, busy = false;
      const alive = () => current && context.current();
      const close = () => { current = false; element.close(); element.remove(); };
      closeCurrent = close;
      const shell = content => `<button type="button" data-close style="float:right;padding:10px;border:0;border-radius:10px">Fermer</button><h2>Facture · commande #${esc(order.number)}</h2><p>${esc(order.customerName)} · ${euro(Math.round((order.paidTotal ?? order.total) * 100))}</p>${content}<p data-message role="status" aria-live="polite"></p>`;
      const request = async (route, body) => {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(context.api + route, { method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal,
            headers: context.headers, ...(body ? { body: JSON.stringify(body) } : {}) });
          if (!alive()) throw Error('Session changée. Rouvrez la facture.');
          if ((response.headers.get('content-type') || '').startsWith('application/pdf') && response.ok) return response;
          const result = await response.json(); if (!response.ok) throw Error(result.error || 'Facture indisponible.'); return result;
        } finally { clearTimeout(timeout); }
      };
      const message = value => { const target = element.querySelector('[data-message]'); if (target && alive()) target.textContent = value; };
      const bind = () => { element.querySelector('[data-close]').onclick = close; };
      const importForm = () => `<details style="margin:20px 0"><summary>Associer le PDF déjà émis dans L’Addition</summary><form data-import><p>Aucun nouveau numéro : le PDF existant est conservé sans modification. Ce rattachement manuel sert à retrouver un ancien document ; ce n’est pas une synchronisation automatique de caisse.</p><label>Numéro exact de la facture<input name="number" required maxlength="70"></label><label>Date figurant sur le document<input name="documentDate" type="date" required></label><label>PDF de cette seule facture<input name="pdf" type="file" accept="application/pdf,.pdf" required></label><label><input name="sameSale" type="checkbox" required> J’ai vérifié les articles, remises, livraison et montant : il s’agit bien de cette vente, même si sa saisie en caisse a eu lieu plus tard.</label><button type="submit">Associer ce PDF à cette commande</button></form></details>`;
      const bindImport = () => {
        const target = element.querySelector('[data-import]'); if (!target) return;
        target.querySelectorAll('label').forEach(label => label.style.cssText = 'display:block;margin:12px 0');
        target.querySelectorAll('input:not([type=checkbox])').forEach(input => input.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:10px;font:inherit');
        target.onsubmit = event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform(async () => {
          const file = form.get('pdf'); if (!file || file.size < 100 || file.size > 600000) throw Error('Choisissez le PDF de cette seule facture, inférieur à 600 Ko.');
          const pdfBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error('Lecture du PDF impossible.')); reader.readAsDataURL(file); });
          if (!alive()) return;
          await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/import`, { confirm: true, source: 'laddition', number: String(form.get('number') || '').trim(), documentDate: String(form.get('documentDate') || ''), totalCents: Math.round((order.paidTotal ?? order.total) * 100), sameSaleConfirmed: form.get('sameSale') === 'on', pdfBase64 });
          await render();
        }); };
      };
      const perform = async fn => { if (busy || !alive()) return; busy = true; try { await fn(); } catch (error) { message(error.message); } finally { busy = false; } };
      const download = async () => {
        const response = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/pdf`), blob = await response.blob();
        if (!alive()) return;
        const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `facture-commande-${order.number}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
      async function render() {
        const config = await request('/dashboard/invoices/settings');
        const status = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/status`);
        if (!config.configured && status.status !== 'issued') {
          element.innerHTML = shell(`<h3>Activer les factures de l’application</h3><p>Série distincte WEB-année-numéro. Une seule facture conservée par commande, sans nouveau paiement et sans modification des commandes.</p>
          <form data-settings><label>Dénomination<input name="name" value="BIBOU &amp; CO" required></label><label>Enseigne<input name="tradeName" value="Bibou's Burgers" required></label><label>Adresse<input name="address" value="153 Quai Georges V, 76600 Le Havre" required></label><label>SIRET<input name="siret" inputmode="numeric" value="93882354900010" pattern="[0-9]{14}" required></label><label>Numéro de TVA<input name="vatNumber" value="FR96938823549" required></label><label>Forme juridique<input name="legalForm" value="SAS" required></label><label>RCS<input name="rcs" value="RCS Le Havre 938 823 549" required></label><label>Capital en euros<input name="capital" type="number" min="0" step="0.01" value="1000" required></label>
          <p>Menus sans alcool : traitement global à 10 %. Canettes vendues séparément à emporter : 5,5 %. Les desserts dont le taux reste à confirmer nécessitent une validation avant émission.</p>
          <label><input name="sameSale" type="checkbox" required> Ces factures correspondent aux commandes Bibou déjà payées. Elles seront rapprochées de la caisse et des ventes pour ne pas comptabiliser une seconde recette ou TVA.</label><button type="submit">Activer les factures web avec ces informations</button></form>${importForm()}`);
          element.querySelectorAll('form label').forEach(label => label.style.cssText = 'display:block;margin:12px 0');
          element.querySelectorAll('input:not([type=checkbox])').forEach(input => input.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:11px;font:inherit;border:1px solid #bccdbc;border-radius:9px');
          element.querySelector('[data-settings]').onsubmit = event => { event.preventDefault(); void perform(async () => {
            const form = new FormData(event.currentTarget), seller = Object.fromEntries(['name','tradeName','address','siret','vatNumber','legalForm','rcs'].map(k => [k, String(form.get(k) || '')]));
            seller.capitalCents = Math.round(Number(form.get('capital')) * 100);
            await request('/dashboard/invoices/settings', { confirm: 'ACTIVER LES FACTURES WEB', sameSaleReconciliation: form.get('sameSale') === 'on', menuPolicy: 'whole-menu-10', seller });
            await render();
          }); }; bind(); bindImport(); return;
        }
        const issued = status.status === 'issued';
        element.innerHTML = shell(issued ? `<h3>Facture ${esc(status.number)}</h3><p>Document enregistré. Un nouveau téléchargement ne crée pas de deuxième facture.</p><button type="button" data-pdf>Télécharger le PDF</button><p>Envoyer uniquement à ce client : ${esc(String(order.customerPhone || '').replace(/.(?=.{4})/g, '•'))}</p><button type="button" data-show-sms>Préparer l’envoi par SMS</button><div data-sms-confirm hidden><p>Le lien personnel donnera accès à cette facture pendant 7 jours. Aucun message publicitaire et aucun nouveau paiement.</p><button type="button" data-sms>Confirmer l’envoi de la facture à ${esc(order.customerName)}</button></div>`
          : `<p>La facture sera créée à partir du montant réellement payé. Les cas avec une TVA non validée, un remboursement ou une modification nécessitent une vérification.</p><button type="button" data-issue>Émettre la facture acquittée</button>${importForm()}`);
        bind(); bindImport();
        if (!issued) element.querySelector('[data-issue]').onclick = () => { void perform(async () => { await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/issue`, { confirm: true }); await render(); }); };
        else {
          element.querySelector('[data-pdf]').onclick = () => { void perform(download); };
          element.querySelector('[data-show-sms]').onclick = () => { element.querySelector('[data-sms-confirm]').hidden = false; };
          element.querySelector('[data-sms]').onclick = () => { void perform(async () => {
            const result = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/sms`, { confirm: true, expectedPhone: order.customerPhone });
            element.querySelector('[data-sms]').disabled = true;
            message(result.status === 'accepted' ? 'SMS accepté par le prestataire. La réception sur le téléphone n’est pas encore confirmée.' : 'Envoi à vérifier. Aucun renvoi automatique.');
          }); };
        }
      }
      element.innerHTML = shell('<p>Chargement…</p>'); document.body.appendChild(element); element.showModal(); bind();
      element.addEventListener('close', () => { current = false; element.remove(); });
      try { await render(); } catch (error) { message(error.message); }
    }
  };
})();
