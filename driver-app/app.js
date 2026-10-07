const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const form = document.querySelector('#login-form');
const content = document.querySelector('#content');
const feedback = document.querySelector('#feedback');
let mode = localStorage.getItem('krokly-mode') === 'owner' ? 'owner' : 'driver';
let token = localStorage.getItem('krokly-token') || '';
let profile = null;
let currentState = null;
let lastOrders = '';
let busy = false;
let serviceWorkerReady = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function message(value, error = false) {
  feedback.textContent = value;
  feedback.className = `feedback${error ? ' error' : ''}`;
}

function loginView() {
  login.hidden = false;
  workspace.hidden = true;
  document.querySelector('#username-label').hidden = mode === 'owner';
  document.querySelector('#username').required = mode !== 'owner';
  for (const button of document.querySelectorAll('[data-mode]')) button.classList.toggle('selected', button.dataset.mode === mode);
}

function hidePassword() {
  const toggle = document.querySelector('#show-password');
  if (toggle) toggle.checked = false;
  document.querySelector('#password').type = 'password';
}

document.querySelector('#show-password')?.addEventListener('change', event => {
  document.querySelector('#password').type = event.target.checked ? 'text' : 'password';
});

function workspaceView() {
  login.hidden = true;
  workspace.hidden = false;
  document.querySelector('#role-label').textContent = mode === 'owner' ? 'Répartition Bibou' : 'Mon espace livreur';
  document.querySelector('#welcome').textContent = mode === 'owner' ? 'Organiser les livraisons' : `Bonjour ${profile?.name || ''}`;
}

async function api(route, options = {}) {
  const response = await fetch(`/api/${route}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !route.endsWith('/login')) signOut(false);
    throw new Error(data.error || 'Connexion impossible.');
  }
  return data;
}

function signOut(showMessage = true) {
  token = '';
  profile = null;
  currentState = null;
  localStorage.removeItem('krokly-token');
  lastOrders = '';
  loginView();
  if (showMessage) message('Tu es déconnecté.');
}

function statusLabel(status) {
  return ({ offered: 'À accepter', accepted: 'Acceptée', picked_up: 'En livraison', delivered: 'Livrée', ready: 'Prête', out_for_delivery: 'En livraison', issue: 'Incident' })[status] || status;
}

function addressText(address) {
  return [address?.address, [address?.postalCode, address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function driverCard(order) {
  const accepted = order.status !== 'offered';
  const action = order.status === 'offered'
    ? `<div class="timer" data-expiry="${escapeHtml(order.expiresAt)}">Proposition en attente</div><div class="actions"><button class="primary" data-action="accept" data-order="${escapeHtml(order.id)}">Accepter</button><button class="danger" data-action="decline" data-order="${escapeHtml(order.id)}">Refuser</button></div>`
    : order.status === 'accepted'
      ? `<div class="actions"><button class="primary" data-action="pickup" data-order="${escapeHtml(order.id)}">J'ai récupéré le repas</button></div>`
      : order.status === 'picked_up'
        ? `<div class="actions"><button class="primary" data-action="deliver" data-order="${escapeHtml(order.id)}">Livraison effectuée</button></div>`
        : '';
  return `<article class="order ${order.status === 'offered' ? 'offer' : ''}"><div class="order-head"><div><span class="order-number">COMMANDE #${Number(order.number)}</span><h3>${escapeHtml(order.restaurant)}</h3></div><span class="status ${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span></div>
    <div class="route"><div><small>DÉPART</small><strong>${escapeHtml(order.pickupAddress)}</strong></div><div><small>DESTINATION</small><strong>${accepted ? escapeHtml(addressText(order.deliveryAddress)) : escapeHtml(order.deliveryCity || 'Adresse complète après acceptation')}</strong></div></div>
    <div class="info">${order.distanceKm ? `${escapeHtml(order.distanceKm)} km · ` : ''}Créneau ${escapeHtml(order.serviceDate || '')} ${escapeHtml(order.slot || '')}
      ${accepted ? `<br><strong>${escapeHtml(order.customerName || 'Client')}</strong>${order.customerPhone ? ` · <a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)}</a>` : ''}${order.comment ? `<br>Instruction : ${escapeHtml(order.comment)}` : ''}` : ''}</div>${action}</article>`;
}

function renderDriver() {
  const orders = currentState.orders || [];
  const push = currentState.push || {};
  const notificationPanel = push.enabled
    ? `<div class="card push-card"><h3>Alertes de courses</h3><p>Sur iPhone, ajoute d’abord Krokly Driver à l’écran d’accueil, puis ouvre-le depuis son icône. Appuie ensuite sur « Activer les alertes ». Accepte la demande de l’iPhone.</p><div class="actions"><button class="primary" data-push-enable>Activer les alertes</button><button class="secondary" data-push-test>Tester dans 15 secondes</button></div><p class="muted">Après le test, verrouille le téléphone : l’alerte doit apparaître. Tant que cet essai n’est pas réussi sur ton iPhone, surveille aussi les courses à l’écran.</p></div>`
    : `<div class="hint"><strong>Alertes écran verrouillé non activées.</strong> Le restaurant peut voir les courses dans le back-office. Garde cet écran ouvert pendant le service tant que les alertes ne sont pas vérifiées.</div>`;
  content.innerHTML = `${notificationPanel}
    <div class="metrics"><div class="metric"><strong>${orders.filter(o => o.status === 'offered').length}</strong><span>à accepter</span></div><div class="metric"><strong>${orders.filter(o => o.status === 'accepted').length}</strong><span>à récupérer</span></div><div class="metric"><strong>${orders.filter(o => o.status === 'picked_up').length}</strong><span>en livraison</span></div></div>
    <h3 class="section-title">Mes courses</h3>${orders.length ? `<div class="grid">${orders.map(driverCard).join('')}</div>` : '<div class="empty"><strong>Aucune course attribuée</strong>La prochaine course apparaîtra ici si le restaurant te la propose.</div>'}
    <p class="muted">Une proposition non acceptée revient à la répartition après cinq minutes. Une commande annulée disparaît de cet écran ; appelle le restaurant si tu l’avais déjà récupérée.</p>`;
  updateTimers();
}

function ownerOrder(order) {
  const assigned = currentState.drivers.find(driver => driver.id === order.assignment?.driverId);
  const choices = currentState.drivers.filter(driver => driver.active).map(driver => `<option value="${escapeHtml(driver.id)}">${escapeHtml(driver.name)} · ${escapeHtml(driver.username)}</option>`).join('');
  return `<article class="order"><div class="order-head"><div><span class="order-number">COMMANDE #${Number(order.number)}</span><h3>Livraison Bibou</h3></div><span class="status ${escapeHtml(order.assignment?.status || order.status)}">${escapeHtml(statusLabel(order.assignment?.status || order.status))}</span></div>
    <p class="muted">${escapeHtml(order.serviceDate || '')} · ${escapeHtml(order.slot || '')}</p>
    <div class="info">${assigned ? `Attribuée à <strong>${escapeHtml(assigned.name)}</strong>.` : 'Aucun livreur attribué.'}</div>
    ${order.eligible && choices ? `<div class="assign"><select aria-label="Livreur pour la commande ${Number(order.number)}" data-select-order="${escapeHtml(order.id)}">${choices}</select><button class="primary" data-assign="${escapeHtml(order.id)}">Proposer</button></div>` : ''}</article>`;
}

function ownerDriver(driver) {
  return `<div class="driver"><div><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(driver.username)} · ${driver.active ? 'compte actif' : 'compte désactivé'} · ${Number(driver.pushDevices || 0)} téléphone(s) inscrits aux alertes</small></div>
    <div class="driver-actions"><button class="secondary" data-reset="${escapeHtml(driver.id)}">Nouveau mot de passe</button><button class="${driver.active ? 'danger' : 'secondary'}" data-active="${escapeHtml(driver.id)}" data-next="${driver.active ? 'false' : 'true'}">${driver.active ? 'Désactiver' : 'Réactiver'}</button></div></div>`;
}

function renderOwner() {
  const ready = currentState.orders.filter(o => o.status === 'ready' && o.eligible);
  const assigned = currentState.orders.filter(o => o.assignment && ['offered', 'accepted', 'picked_up', 'issue'].includes(o.assignment.status));
  content.innerHTML = `<div class="hint">Une course doit être <strong>payée et marquée prête</strong> avant attribution. Une commande confiée à Uber ne peut pas être attribuée en parallèle à Krokly.</div>
    <div class="metrics"><div class="metric"><strong>${ready.length}</strong><span>à attribuer</span></div><div class="metric"><strong>${assigned.length}</strong><span>attribuée(s)</span></div><div class="metric"><strong>${currentState.drivers.filter(d => d.active).length}</strong><span>livreur(s) actifs</span></div></div>
    <h3 class="section-title">Commandes en livraison</h3>${currentState.orders.length ? `<div class="grid">${currentState.orders.map(ownerOrder).join('')}</div>` : '<div class="empty"><strong>Aucune livraison à répartir</strong>Les commandes payées et prêtes apparaîtront ici.</div>'}
    <h3 class="section-title">Comptes livreurs</h3><div class="card"><form id="create-form" class="create"><label>Nom du livreur<input name="name" required maxlength="60" placeholder="Ex. : Lina"></label><label>Identifiant<input name="username" required maxlength="32" placeholder="Ex. : lina"></label><button class="primary" type="submit">Créer le compte</button></form>
      <div id="secret"></div><div class="drivers">${currentState.drivers.map(ownerDriver).join('') || '<p class="muted">Aucun livreur créé pour le moment.</p>'}</div>
      <p class="muted">Le mot de passe généré n’apparaît qu’une fois. Transmets-le toi-même au livreur par un canal privé ; il ne donne pas accès au back-office.</p></div>`;
}

function showSecret(data) {
  const box = document.querySelector('#secret');
  if (!box) return;
  box.innerHTML = `<div class="secret"><strong>Identifiants à transmettre à ${escapeHtml(data.driver.name)}</strong>Identifiant : <code>${escapeHtml(data.driver.username)}</code><br>Mot de passe : <code>${escapeHtml(data.password)}</code><p>Copie ce mot de passe maintenant : il ne sera plus affiché ensuite.</p></div>`;
}

function applicationServerKey(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function enableNotifications() {
  if (!currentState?.push?.enabled || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Les alertes ne sont pas disponibles sur ce téléphone ou ce navigateur.');
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) throw new Error('Sur iPhone, ouvre Krokly depuis son icône ajoutée à l’écran d’accueil, puis active les alertes ici.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées sur ce téléphone. Active-les dans les réglages de l’iPhone puis réessaie.');
  const registration = await (serviceWorkerReady || navigator.serviceWorker.ready);
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(currentState.push.publicKey) });
  await api('krokly-driver/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  message('Alertes activées sur ce téléphone. Lance maintenant le test et verrouille-le.');
}

async function testNotifications() {
  const result = await api('krokly-driver/push/test', { method: 'POST', body: '{}' });
  message(`Alerte de test programmée dans ${result.delaySeconds} secondes. Verrouille ton téléphone maintenant.`);
}

async function unregisterNotifications() {
  if (!token || mode !== 'driver' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await (serviceWorkerReady || navigator.serviceWorker.ready);
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await api('krokly-driver/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  } catch { /* Password reset or lost connectivity also revokes server-side access. */ }
}

async function refresh(force = false) {
  if (!token || busy) return;
  try {
    const data = await api(mode === 'owner' ? 'dashboard/krokly-drivers' : 'krokly-driver/state');
    currentState = data;
    if (mode === 'driver') profile = data.driver;
    const digest = JSON.stringify(data);
    if (force || digest !== lastOrders) {
      const oldOffers = new Set(JSON.parse(lastOrders || '{}').orders?.filter(o => o.status === 'offered').map(o => o.id) || []);
      if (mode === 'driver' && lastOrders && data.orders.some(o => o.status === 'offered' && !oldOffers.has(o.id))) message('Nouvelle course proposée !');
      lastOrders = digest;
      workspaceView();
      if (mode === 'owner') renderOwner(); else renderDriver();
    }
  } catch (error) { message(error.message, true); }
}

function updateTimers() {
  for (const element of document.querySelectorAll('[data-expiry]')) {
    const seconds = Math.max(0, Math.ceil((Date.parse(element.dataset.expiry) - Date.now()) / 1000));
    element.textContent = seconds ? `Répondre sous ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s` : 'Offre expirée · actualisation en cours';
  }
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', async () => {
  if (token) { await unregisterNotifications(); signOut(false); }
  mode = button.dataset.mode;
  localStorage.setItem('krokly-mode', mode);
  document.querySelector('#password').value = '';
  hidePassword();
  message('');
  loginView();
}));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  try {
    const username = document.querySelector('#username').value;
    const rawPassword = document.querySelector('#password').value;
    const password = mode === 'driver' ? rawPassword.trim() : rawPassword;
    const data = await api(mode === 'owner' ? 'dashboard/auth/login' : 'krokly-driver/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = data.token;
    profile = data.driver || null;
    localStorage.setItem('krokly-token', token);
    document.querySelector('#password').value = '';
    hidePassword();
    message('Connexion réussie.');
    busy = false;
    await refresh(true);
  } catch (error) { message(error.message, true); }
  finally { busy = false; }
});

document.querySelector('#logout').addEventListener('click', async () => { await unregisterNotifications(); signOut(); });

document.addEventListener('submit', async event => {
  if (event.target.id !== 'create-form') return;
  event.preventDefault();
  if (busy) return;
  const data = Object.fromEntries(new FormData(event.target));
  busy = true;
  try {
    const created = await api('dashboard/krokly-drivers', { method: 'POST', body: JSON.stringify(data) });
    busy = false;
    await refresh(true);
    showSecret(created);
    message(`Compte ${created.driver.name} créé.`);
  } catch (error) { message(error.message, true); }
  finally { busy = false; }
});

document.addEventListener('click', async event => {
  if (event.target.closest('[data-push-enable],[data-push-test]')) {
    if (busy) return;
    busy = true;
    try { if (event.target.closest('[data-push-enable]')) await enableNotifications(); else await testNotifications(); }
    catch (error) { message(error.message, true); }
    finally { busy = false; }
    return;
  }
  const button = event.target.closest('[data-action],[data-assign],[data-reset],[data-active]');
  if (!button || busy) return;
  busy = true;
  try {
    let route, payload = {};
    if (button.dataset.action) route = `krokly-driver/orders/${encodeURIComponent(button.dataset.order)}/${button.dataset.action}`;
    else if (button.dataset.assign) {
      route = `dashboard/krokly-drivers/orders/${encodeURIComponent(button.dataset.assign)}/assign`;
      payload = { driverId: document.querySelector(`[data-select-order="${button.dataset.assign}"]`).value };
    } else if (button.dataset.reset) {
      if (!window.confirm('Remplacer le mot de passe de ce livreur ? Son ancienne session sera coupée.')) return;
      route = `dashboard/krokly-drivers/${encodeURIComponent(button.dataset.reset)}/reset`;
    } else {
      if (!window.confirm(button.dataset.next === 'false' ? 'Désactiver ce compte livreur ?' : 'Réactiver ce compte livreur ?')) return;
      route = `dashboard/krokly-drivers/${encodeURIComponent(button.dataset.active)}/active`;
      payload = { active: button.dataset.next === 'true' };
    }
    const changed = await api(route, { method: button.dataset.active ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    busy = false;
    await refresh(true);
    if (changed.password) showSecret(changed);
    message(button.dataset.assign ? 'Course proposée au livreur.' : 'Modification enregistrée.');
  } catch (error) { message(error.message, true); }
  finally { busy = false; }
});

loginView();
if (token) refresh(true);
if ('serviceWorker' in navigator) serviceWorkerReady = navigator.serviceWorker.register('/driver/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null);
setInterval(() => refresh(), 7000);
setInterval(updateTimers, 1000);
