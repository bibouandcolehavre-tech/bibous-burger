/* Private owner actions. Client tokens and invoice PDFs never appear in URLs. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const euro = cents => (cents / 100).toFixed(2).replace('.', ',') + ' €';
  const activePrints = new Set();
  const uncertainPrints = new Set();
  const printKey = order => `bibou-invoice-print-${order.id}`;
  const uncertain = order => { try { return uncertainPrints.has(order.id) || sessionStorage.getItem(printKey(order)) === 'uncertain'; } catch { return uncertainPrints.has(order.id); } };
  const markUncertain = (order, value) => {
    if (value) uncertainPrints.add(order.id); else uncertainPrints.delete(order.id);
    try { if (value) sessionStorage.setItem(printKey(order), 'uncertain'); else sessionStorage.removeItem(printKey(order)); } catch { /* In-memory protection remains active. */ }
  };
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
      const bind = () => {
        element.querySelector('[data-close]').onclick = close;
        element.querySelectorAll('button').forEach(button => {
          if (button.hasAttribute('data-close')) return;
          button.style.cssText = 'width:100%;min-height:46px;padding:13px 15px;margin:12px 0;border:1px solid #315b4b;border-radius:12px;background:#315b4b;color:#fff;font:700 16px/1.4 system-ui;cursor:pointer';
          if (button.hasAttribute('data-print-check')) button.style.cssText += ';background:#fff5d9;color:#62491e;border-color:#cbbf96';
        });
      };
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
      const perform = async fn => {
        if (busy || !alive()) return; busy = true;
        element.querySelectorAll('button:not([data-close])').forEach(button => button.disabled = true);
        try { await fn(); } catch (error) { message(error.message); }
        finally { busy = false; if (alive()) element.querySelectorAll('button:not([data-close])').forEach(button => button.disabled = button.dataset.sent === 'true'); }
      };
      const print = async () => {
        if (activePrints.has(order.id)) throw Error('Une impression de cette facture est déjà en cours.');
        if (uncertain(order)) throw Error('Impression précédente à vérifier sur le papier. Aucun nouvel envoi automatique : utilisez le bouton de vérification ci-dessous.');
        const printer = window.BibouEpsonPrint;
        if (!printer?.invoiceEnvelope) throw Error('Actualisez Krokli Pro pour charger le format facture.');
        activePrints.add(order.id);
        let sent = false;
        try {
          message('Préparation de la facture enregistrée…');
          const { invoice } = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/print`);
          const xml = printer.invoiceEnvelope(invoice);
          message('Connexion à l’imprimante du restaurant…');
          const ready = await printer.probe('192.168.192.50');
          if (!ready.success) throw Error(`Imprimante non disponible (${ready.code || 'état à vérifier'}). Aucun document envoyé.`);
          if (!alive()) throw Error('Session changée. Aucune impression envoyée.');
          markUncertain(order, true); sent = true;
          const result = await printer.send('192.168.192.50', xml);
          if (!result.success) throw Error(`Réponse Epson ${result.code || 'à vérifier'}.`);
          markUncertain(order, false);
          message(`Impression confirmée par l’Epson · facture ${invoice.number}. Aucun nouveau numéro ni paiement.`);
        } catch (error) {
          if (sent) throw Error(`${error.message} Vérifiez le papier avant de réimprimer : le document a peut-être déjà été imprimé. Aucun renvoi automatique.`);
          throw error;
        } finally {
          activePrints.delete(order.id);
          if (alive()) { const check = element.querySelector('[data-print-check]'); if (check) check.hidden = !uncertain(order); }
        }
      };
      const printOriginal = () => {
        // Keep the imported original intact; never guess its item/tax allocation.
        const tab = window.open('about:blank', '_blank');
        if (!tab) { message('Autorisez l’ouverture du PDF original pour l’imprimer.'); return; }
        tab.opener = null;
        void perform(async () => {
          try {
            const response = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/pdf`), blob = await response.blob();
            if (!alive()) { tab.close(); return; }
            const url = URL.createObjectURL(blob); tab.location.replace(url); setTimeout(() => URL.revokeObjectURL(url), 60000);
            message('PDF original ouvert : utilisez sa commande d’impression. Son format de caisse est conservé.');
          } catch (error) { tab.close(); throw error; }
        });
      };
      async function render() {
        const config = await request('/dashboard/invoices/settings');
        const status = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/status`);
        if (!config.configured && status.status !== 'issued') {
          element.innerHTML = shell(`<h3>Activer les factures de l’application</h3><p>Série distincte WEB-année-numéro. Une seule facture conservée par commande, sans nouveau paiement et sans modification des commandes.</p>
          <form data-settings><label>Dénomination<input name="name" value="BIBOU &amp; CO" required></label><label>Enseigne<input name="tradeName" value="Bibou's Burgers" required></label><label>Adresse<input name="address" value="153 Quai Georges V, 76600 Le Havre" required></label><label>SIRET<input name="siret" inputmode="numeric" value="93882354900010" pattern="[0-9]{14}" required></label><label>Numéro de TVA<input name="vatNumber" value="FR96938823549" required></label><label>Forme juridique<input name="legalForm" value="SAS" required></label><label>RCS<input name="rcs" value="RCS Le Havre 938 823 549" required></label><label>Capital en euros<input name="capital" type="number" min="0" step="0.01" value="1000" required></label>
          <p>Menus sans alcool : traitement global à 10 %. Canettes vendues séparément à emporter : 5,5 %. Sur place : 10 %.</p>
          <label><input name="closedDesserts" type="checkbox"> Les tiramisus Oreo, cookie et spéculoos à emporter sont vendus en pots fermés permettant leur conservation au réfrigérateur : appliquer 5,5 % lorsqu’ils sont achetés séparément (10 % sur place ou inclus dans un menu traité globalement à 10 %). Sans cette confirmation, ces desserts restent à vérifier avant émission.</label>
          <label><input name="sameSale" type="checkbox" required> Ces factures correspondent aux commandes Bibou déjà payées. Elles seront rapprochées de la caisse et des ventes pour ne pas comptabiliser une seconde recette ou TVA.</label><button type="submit">Activer les factures web avec ces informations</button></form>${importForm()}`);
          element.querySelectorAll('form label').forEach(label => label.style.cssText = 'display:block;margin:12px 0');
          element.querySelectorAll('input:not([type=checkbox])').forEach(input => input.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:11px;font:inherit;border:1px solid #bccdbc;border-radius:9px');
          element.querySelector('[data-settings]').onsubmit = event => { event.preventDefault(); void perform(async () => {
            const form = new FormData(event.currentTarget), seller = Object.fromEntries(['name','tradeName','address','siret','vatNumber','legalForm','rcs'].map(k => [k, String(form.get(k) || '')]));
            seller.capitalCents = Math.round(Number(form.get('capital')) * 100);
            const productRates = form.get('closedDesserts') === 'on' ? Object.fromEntries(['dessert-oreo', 'dessert-cookie', 'dessert-speculoos'].map(id => [id, { dineIn: 1000, takeaway: 550 }])) : {};
            await request('/dashboard/invoices/settings', { confirm: 'ACTIVER LES FACTURES WEB', sameSaleReconciliation: form.get('sameSale') === 'on', menuPolicy: 'whole-menu-10', seller, productRates });
            await render();
          }); }; bind(); bindImport(); return;
        }
        const issued = status.status === 'issued';
        const imported = status.source === 'laddition';
        const billingForm = `<form data-billing><p>Vérifiez avec le client les coordonnées à faire figurer sur sa facture. Aucun nouveau paiement.</p><label>Nom complet du client<input name="name" value="${esc(status.billing?.name || '')}" required minlength="2" maxlength="180" autocomplete="name"></label><label>Adresse de facturation<textarea name="address" maxlength="240" rows="3" autocomplete="street-address">${esc(status.billing?.address || '')}</textarea></label><label><input name="omitAddress" type="checkbox"> Le client particulier demande de ne pas faire figurer son adresse.</label><button type="submit" data-issue>Émettre et imprimer la facture</button></form>`;
        element.innerHTML = shell(issued ? `<h3>Facture ${esc(status.number)}</h3><p>Copie du document enregistré : même numéro, même montant, même TVA. Pas de deuxième facture.</p>${imported
          ? '<p>Facture de caisse importée : le PDF original garde sa mise en page. Ses taux de TVA ne sont pas reconstruits.</p><button type="button" data-original>Ouvrir l’original à imprimer</button>'
          : `<p>Format ticket · Epson du restaurant · sans téléchargement.</p><button type="button" data-print>🖨 Imprimer la facture</button><button type="button" data-print-check ${uncertain(order) ? '' : 'hidden'}>J’ai vérifié le papier : autoriser une réimpression</button>`}
          ${order.customerPhone ? `<p>Envoyer uniquement à ce client : ${esc(String(order.customerPhone).replace(/.(?=.{4})/g, '•'))}</p><button type="button" data-show-sms>Préparer l’envoi par SMS</button><div data-sms-confirm hidden><p>Le lien personnel donnera accès à cette facture pendant 7 jours. Aucun message publicitaire et aucun nouveau paiement.</p><button type="button" data-sms>Confirmer l’envoi de la facture à ${esc(order.customerName)}</button></div>` : ''}`
          : `<p>La facture reprend le montant réellement payé. Une TVA non validée, un remboursement ou une modification nécessite une vérification.</p>${billingForm}${order.kioskGuest ? '' : importForm()}`);
        bind(); bindImport();
        if (!issued) {
          const form = element.querySelector('[data-billing]');
          form.querySelectorAll('label').forEach(label => label.style.cssText = 'display:block;margin:12px 0');
          form.querySelectorAll('input:not([type=checkbox]),textarea').forEach(input => input.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:10px;font:inherit');
          form.onsubmit = event => { event.preventDefault(); const data = new FormData(form); void perform(async () => {
            const billing = { name: String(data.get('name') || '').trim(), address: String(data.get('address') || '').trim(), omitAddress: data.get('omitAddress') === 'on' };
            if (!billing.address && !billing.omitAddress) throw Error('Renseignez l’adresse, ou confirmez que le client particulier demande de ne pas la faire figurer.');
            await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/issue`, { confirm: true, billing });
            await render(); await print();
          }); };
        }
        else {
          if (imported) element.querySelector('[data-original]').onclick = printOriginal;
          else {
            element.querySelector('[data-print]').onclick = () => { void perform(print); };
            element.querySelector('[data-print-check]').onclick = () => {
              markUncertain(order, false); element.querySelector('[data-print-check]').hidden = true;
              message('Vous pouvez réimprimer la même facture si nécessaire. Aucun envoi n’a été déclenché.');
            };
          }
          const showSms = element.querySelector('[data-show-sms]');
          if (showSms) showSms.onclick = () => { element.querySelector('[data-sms-confirm]').hidden = false; };
          const smsButton = element.querySelector('[data-sms]');
          if (smsButton) smsButton.onclick = () => { void perform(async () => {
            const result = await request(`/dashboard/invoices/${encodeURIComponent(order.id)}/sms`, { confirm: true, expectedPhone: order.customerPhone });
            element.querySelector('[data-sms]').dataset.sent = 'true';
            message(result.status === 'accepted' ? 'SMS accepté par le prestataire. La réception sur le téléphone n’est pas encore confirmée.' : 'Envoi à vérifier. Aucun renvoi automatique.');
          }); };
        }
      }
      element.innerHTML = shell('<p>Chargement…</p>'); document.body.appendChild(element); element.showModal(); bind();
      element.addEventListener('close', () => { current = false; element.remove(); });
      try {
        await render();
        // The order's explicit print button can print an already-issued invoice
        // directly. Merely opening a PDF, refreshing or fetching status never prints.
        if (context.printOnOpen && element.querySelector('[data-print]')) await perform(print);
      } catch (error) { message(error.message); }
    }
  };
})();
