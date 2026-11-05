/* Club Bibou: local camera decoding. Only the card identifier reaches the staff API. */
(function (global) {
  'use strict';
  const isCard = value => typeof value === 'string' && /^BIBOU:1:[a-f0-9]{32}$/.test(value);
  function create({ dialog, button, api, token, onUnauthorized, onCustomer }) {
    const find = name => dialog.querySelector(`[data-wallet-${name}]`);
    const video = find('video'), status = find('status'), start = find('start');
    const result = find('result'), name = find('name'), points = find('points'), profile = find('profile');
    const pickups = document.createElement('div');
    profile.after(pickups);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let generation = 0, stream = null, timer = null, controller = null, customerId = null;
    const stop = () => {
      ++generation; pickups.replaceChildren();
      clearTimeout(timer); timer = null;
      controller?.abort(); controller = null;
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null; video.srcObject = null; video.hidden = true;
      start.disabled = false;
    };
    const clear = () => {
      stop(); customerId = null; result.hidden = true;
      name.textContent = ''; points.textContent = '';
      if (dialog.open) dialog.close();
    };
    const message = text => { status.textContent = text; };
    const inPro = () => /\bKrokliPro\/\d/.test(navigator.userAgent || '');
    const identify = async barcode => {
      // Unrelated QR codes are never followed or sent to any service.
      if (!isCard(barcode)) return false;
      stop();
      const run = generation, session = token();
      if (!session) { clear(); onUnauthorized(); return true; }
      start.disabled = true; result.hidden = true; message('Carte reconnue. Recherche du compte…');
      const request = new AbortController(); controller = request;
      const timeout = setTimeout(() => request.abort(), 12000);
      try {
        const response = await fetch(`${api}/dashboard/wallet/identify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
          body: JSON.stringify({ barcode }), signal: request.signal, cache: 'no-store', credentials: 'omit'
        });
        if (run !== generation || session !== token() || !dialog.open) return true;
        if (response.status === 401) { clear(); onUnauthorized(); return true; }
        const payload = await response.json();
        if (run !== generation || session !== token() || !dialog.open) return true;
        if (!response.ok) throw new Error(payload.error || 'Compte momentanément introuvable. Réessayez.');
        const member = payload.member;
        if (!member || typeof member.firstName !== 'string' || !Number.isFinite(member.points)) throw new Error('La fiche n’a pas pu être lue. Réessayez.');
        name.textContent = member.firstName || 'Membre Club Bibou';
        points.textContent = `${member.points.toLocaleString('fr-FR')} points fidélité`;
        customerId = typeof member.customerId === 'string' || typeof member.customerId === 'number' ? member.customerId : null;
        profile.hidden = customerId === null; result.hidden = false;
        message('Client retrouvé. Aucun point ni cadeau n’a été modifié.');
        let gifts = { ballot: member.ambassadorBallot, fries: member.ambassadorFries };
        try {
          const giftResponse = await fetch(api + '/dashboard/ambassador-pickup', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session },
            body: JSON.stringify({ barcode }), signal: request.signal, cache: 'no-store', credentials: 'omit',
          });
          if (run !== generation || session !== token() || !dialog.open) return true;
          if (giftResponse.status === 401) { clear(); onUnauthorized(); return true; }
          if (giftResponse.status !== 404) {
            if (!giftResponse.ok) throw new Error('Cadeaux non vérifiés.');
            gifts = await giftResponse.json();
            if (run !== generation || session !== token() || !dialog.open) return true;
          }
        } catch (_) {
          if (run === generation && session === token() && dialog.open) message('Client retrouvé. Les cadeaux n’ont pas pu être vérifiés : rescanner avant leur remise.');
          return true;
        }
        const ballot = gifts.ballot;
        const rewards = [
          gifts.fries && { ...gifts.fries, label: 'frite de bienvenue' },
          ballot?.reward && { ...ballot.reward, id: ballot.id, label: ballot.reward.shared ? 'plateau de 15 tenders XL' : '3 tenders XL' },
        ].filter(Boolean);
        for (const reward of rewards) {
          const { label } = reward;
          const pickup = document.createElement('button');
          pickup.type = 'button'; pickup.className = profile.className;
          pickup.disabled = Boolean(reward.redeemedAt);
          pickup.textContent = (reward.redeemedAt ? 'Déjà retiré · ' : 'Confirmer la remise · ') + label;
          pickups.append(pickup);
          pickup.onclick = async () => {
            if (controller || pickup.disabled) return;
            pickup.disabled = true;
            const redeem = new AbortController(); controller = redeem;
            const deadline = setTimeout(() => redeem.abort(), 12000);
            try {
              const reply = await fetch(api + '/dashboard/ambassador-pickup', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session },
                body: JSON.stringify({ barcode, ballotId: reward.id }), signal: redeem.signal, credentials: 'omit',
              });
              if (run !== generation || session !== token() || !dialog.open) return;
              if (reply.status === 401) { clear(); onUnauthorized(); return; }
              const data = await reply.json();
              if (run !== generation || session !== token() || !dialog.open) return;
              if (!reply.ok) throw new Error(data.error || 'Remise non confirmée.');
              pickup.textContent = 'Déjà retiré · ' + label;
              message(data.reward.alreadyRedeemed ? 'Ce cadeau a déjà été retiré.' : 'Remise enregistrée · ' + label + '.');
            } catch (error) {
              if (run !== generation || session !== token() || !dialog.open) return;
              pickup.disabled = false;
              message(error.name === 'AbortError' ? 'Résultat à vérifier. Scannez à nouveau avant de remettre le cadeau.' : error.message);
            } finally {
              clearTimeout(deadline);
              if (run === generation) controller = null;
            }
          };
        }
      } catch (error) {
        if (run === generation && session === token() && dialog.open) message(error.name === 'AbortError' ? 'La recherche a pris trop de temps. Réessayez le scan.' : error.message);
      } finally {
        clearTimeout(timeout);
        if (run === generation) { controller = null; start.disabled = false; start.textContent = 'Scanner une autre carte'; }
      }
      return true;
    };
    const scan = async run => {
      if (run !== generation || !dialog.open || !stream) return;
      try {
        if (video.readyState >= 2 && video.videoWidth > 0 && context) {
          const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = global.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
          if (code) {
            if (isCard(code.data)) { await identify(code.data); return; }
            message('Présentez le QR code de la carte Club Bibou, affiché dans Wallet.');
          }
        }
      } catch (_) { stop(); message('La caméra ne peut plus être lue. Relancez le scan.'); return; }
      if (run === generation) timer = setTimeout(() => { void scan(run); }, 180);
    };
    const begin = async () => {
      stop(); result.hidden = true; customerId = null;
      if (!token()) { clear(); onUnauthorized(); return; }
      if (!navigator.mediaDevices?.getUserMedia || !context || typeof global.jsQR !== 'function') {
        message(inPro()
          ? 'Le lecteur de carte est indisponible. Fermez puis rouvrez cette rubrique. Si nécessaire, mettez Krokli Pro à jour.'
          : 'Le lecteur de carte est indisponible. Utilisez un navigateur à jour autorisant la caméra pour ce back-office.'); return;
      }
      const run = generation;
      start.disabled = true; message('Autorisez la caméra, puis cadrez le QR code de la carte.');
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (run !== generation || !dialog.open || !token()) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired; video.srcObject = acquired; video.hidden = false;
        await video.play();
        if (run !== generation || !dialog.open) return;
        message('Cadrez le QR code. Éloignez légèrement le téléphone si l’image est floue.');
        void scan(run);
      } catch (error) {
        if (run !== generation) return;
        stop(); start.textContent = 'Réessayer la caméra';
        message(['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
          ? inPro()
            ? 'Caméra refusée. Autorisez l’appareil photo dans les réglages de Krokli Pro, puis revenez et touchez Réessayer la caméra.'
            : 'Caméra refusée. Autorisez-la dans les réglages de votre navigateur pour ce site, puis réessayez.'
          : 'Caméra indisponible. Fermez les autres applications qui l’utilisent, puis réessayez.');
      }
    };
    button.addEventListener('click', () => {
      if (!token()) { onUnauthorized(); return; }
      result.hidden = true; start.textContent = 'Activer la caméra'; message('Le client affiche sa carte Club Bibou et son QR code dans Wallet.');
      dialog.showModal();
    });
    start.addEventListener('click', () => { void begin(); });
    find('close').addEventListener('click', clear);
    dialog.addEventListener('cancel', clear);
    dialog.addEventListener('close', stop);
    profile.addEventListener('click', () => { const id = customerId; clear(); if (id !== null) onCustomer(id); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    global.addEventListener('pagehide', clear);
    global.addEventListener('hashchange', clear);
    global.addEventListener('krokli-pro-camera-stop', clear);
    return { clear };
  }
  global.BibouWalletScanner = { create, isCard };
})(window);
