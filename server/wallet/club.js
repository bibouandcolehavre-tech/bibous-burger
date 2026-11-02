(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let phone, proof, pendingToken, pendingCustomerId;
  const message = (text = '', error = false) => { $('message').textContent = text; $('message').classList.toggle('error', error); };
  const show = name => {
    for (const id of ['phone', 'code', 'identity', 'card']) $(id + '-panel').hidden = id !== name;
    document.body.classList.toggle('has-card', name === 'card');
    document.querySelector('h1').textContent = name === 'card' ? 'Ta carte Club Bibou' : 'Ta fidélité, toujours avec toi.';
  };
  async function api(route, { method = 'GET', body, token } = {}) {
    const response = await fetch(route, { method, cache: 'no-store', credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Réessaie dans un instant.'), { status: response.status });
    return data;
  }
  function run(form, fn) {
    form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
      try { message(); await fn(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } });
  }
  async function card() {
    const data = await api('/api/wallet/member');
    $('points').textContent = data.member.points.toLocaleString('fr-FR'); $('member-name').textContent = data.member.firstName;
    $('member-qr').src = '/api/wallet/qr.png?t=' + Date.now();
    $('apple').hidden = !data.apple; $('google').hidden = !data.google;
    $('provider-note').textContent = data.apple && data.google ? 'Choisis le portefeuille de ton téléphone.' : data.apple ? 'Apple Wallet est disponible. Google Wallet est encore en préparation.' : data.google ? 'Google Wallet est disponible. Apple Wallet est encore en préparation.' : 'L’ajout à Wallet est encore en préparation.';
    show('card'); message();
  }
  async function finish(token) {
    await api('/api/wallet/session', { method: 'POST', token }); pendingToken = null; proof = null; pendingCustomerId = null;
    await card();
  }
  run($('phone-form'), async () => {
    const data = await api('/api/auth/sms/start', { method: 'POST', body: { phone: $('phone').value } }); phone = data.phone;
    $('code-destination').textContent = 'Le code a été envoyé au ' + $('phone').value + '.'; $('code').value = ''; show('code'); $('code').focus();
  });
  run($('code-form'), async () => {
    const data = await api('/api/auth/sms/check', { method: 'POST', body: { phone, code: $('code').value, registrationVersion: 2 } });
    $('code').value = '';
    if (data.registrationRequired) { proof = data.registrationToken; show('identity'); return; }
    if (!data.customer.firstName || !data.customer.lastName) { pendingToken = data.token; pendingCustomerId = data.customer.id; show('identity'); return; }
    await finish(data.token);
  });
  run($('identity-form'), async () => {
    const names = { firstName: $('first-name').value, lastName: $('last-name').value };
    if (proof) { const data = await api('/api/auth/sms/register', { method: 'POST', body: { ...names, registrationToken: proof } }); await finish(data.token); }
    else { await api('/api/customers/' + encodeURIComponent(pendingCustomerId), { method: 'PATCH', token: pendingToken, body: names }); await finish(pendingToken); }
  });
  $('change-phone').addEventListener('click', () => { proof = null; pendingToken = null; pendingCustomerId = null; show('phone'); message(); });
  $('refresh').addEventListener('click', () => card().catch(error => message(error.message, true)));
  $('logout').addEventListener('click', async () => { try { await api('/api/wallet/session', { method: 'DELETE' }); $('member-qr').removeAttribute('src'); show('phone'); message(); } catch (error) { message(error.message, true); } });
  $('google').addEventListener('click', async () => { $('google').disabled = true; try { const data = await api('/api/wallet/google', { method: 'POST' }); location.assign(data.url); } catch (error) { message(error.message, true); } finally { $('google').disabled = false; } });
  (async () => {
    try {
      const status = await api('/api/wallet/status');
      if (!status.apple && !status.google) { show(null); message('Ta carte Wallet arrive bientôt. Ton compte et tes points Bibou restent disponibles dans l’application.'); return; }
      try { await card(); } catch (error) { if (error.status === 401) { show('phone'); message(); } else throw error; }
    } catch (error) { show(null); message(error.message, true); }
  })();
})();
