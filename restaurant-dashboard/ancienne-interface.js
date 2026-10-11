const API_BASE_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) ? "http://localhost:3001/api" : "https://bibous-burger.onrender.com/api";
const statusLabel = { awaiting_customer: "Accord client attendu", confirmed: "Nouvelle", preparing: "Acceptée", ready: "Prête", out_for_delivery: "En livraison", delivered: "Terminée", cancelled: "Refusée" };
const statusForLabel = Object.fromEntries(Object.entries(statusLabel).map(([key, value]) => [value, key]));
const reservationStatusLabel = { pending: "À confirmer", confirmed: "Confirmée", cancelled: "Annulée" };
const rewardStatusLabel = { active: "À remettre", used: "Utilisée", cancelled: "Annulée" };
let orders = [];
let revenue = { today: 0, week: 0, month: 0 };
let reservations = [];
let rewardClaims = [];
let menuProducts = [];
let menuLoaded = false;
let menuSaving = false;
let menuRequest = 0;
let customerData = null;
let customerOffset = 0;
let selectedCustomerId = null;
let customerRequest = 0;
let customerDetailRequest = 0;
let customerSearchTimer = null;
let customerLastUpdate = 0;
let filter = "all";
let archiveSearch = "";
let selectedOrderId = null;
const pendingOrderChanges = new Set();
const pendingPrints = new Set();
const uncertainPrints = new Set();
const printFeedback = new Map();
let autoPrintBusy = false;
let reservationFilter = "upcoming";
let rewardFilter = "active";
const arrivalTracker = BibouAlerts.createArrivalTracker();
const feedRequests = new Map();
const feedHealth = Object.fromEntries(["orders", "reservations", "rewards"].map((kind) => [kind, { lastSuccess: 0, error: false }]));
const queuedArrivals = new Map();
let arrivalTimer = null;
// Alerts are mandatory: retired mute and volume preferences cannot quiet them.
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let orderAlarm = null;
const soundPlayer = BibouAlerts.createSoundPlayer({ createContext: AudioContextClass ? () => new AudioContextClass() : null, volume: 1, onChange: () => { updateSoundControls(); orderAlarm?.refresh(); } });
orderAlarm = BibouAlerts.createOrderAlarm({ player: soundPlayer, onChange: updateOrderAlarm });
let soundActivationPending = null;
let lastSoundAttemptAt = 0;
function ensureServiceSound({ staffGesture = false } = {}) {
  if (!dashboardToken || soundPlayer.state().ready || !soundPlayer.state().supported) return Promise.resolve(soundPlayer.state().ready);
  if (soundActivationPending && !staffGesture) return soundActivationPending;
  if (!staffGesture && Date.now() - lastSoundAttemptAt < 30000) return Promise.resolve(false);
  lastSoundAttemptAt = Date.now();
  const attempt = soundPlayer.activate().finally(() => {
    if (soundActivationPending === attempt) soundActivationPending = null;
    updateSoundControls();
  });
  soundActivationPending = attempt;
  return soundActivationPending;
}
let currentView = "home";
const dashboardTokenKey = 'bibous-dashboard-token';
const savedDashboardToken = () => {
  let legacyToken = '';
  try { legacyToken = sessionStorage.getItem(dashboardTokenKey) || ''; } catch {}
  if (legacyToken) {
    // Pages opened before persistent login saved the token only for the current tab.
    saveDashboardToken(legacyToken);
    return legacyToken;
  }
  try { return localStorage.getItem(dashboardTokenKey) || ''; } catch { return ''; }
};
const saveDashboardToken = token => {
  try { localStorage.setItem(dashboardTokenKey, token); sessionStorage.removeItem(dashboardTokenKey); }
  catch { try { sessionStorage.setItem(dashboardTokenKey, token); } catch {} }
};
const removeDashboardToken = () => {
  try { localStorage.removeItem(dashboardTokenKey); } catch {}
  try { sessionStorage.removeItem(dashboardTokenKey); } catch {}
};
let dashboardToken = savedDashboardToken();
let marketingPanel = null;
let promotionsPanel = null;
let notificationsPanel = null;
let smsPanel = null;
let crmPanel = null;
let schedulePanel = null;
let dispatchPanel = null;
const euro = (number) => `${Number(number).toFixed(2).replace(".", ",")} €`;
const serviceDateLabel = (value) => value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "Date non précisée";
const receivedTimeLabel = (value) => value ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const todayDateKey = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayHeading = () => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const active = () => orders.filter((order) => order.refund?.status === "due" || !["Terminée", "Refusée"].includes(order.status));
const showToast = (message) => { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2600); };
const dashboardHeaders = (extra = {}) => ({ ...extra, Authorization: `Bearer ${dashboardToken}` });
const showLogin = (message = "") => { window.BibouAmendments?.clear(); window.BibouUber?.clear(); dashboardToken = ""; archiveSearch = ""; document.querySelector('#archive-search').value = ''; clearCustomerView(); marketingPanel?.clear(); promotionsPanel?.clear(); notificationsPanel?.clear(); smsPanel?.clear(); crmPanel?.clear(); schedulePanel?.clear(); dispatchPanel?.clear(); removeDashboardToken(); orderAlarm.reset(); soundPlayer.stop(); clearTimeout(arrivalTimer); queuedArrivals.clear(); document.title = "Bibou's Burgers — Espace restaurant"; document.querySelector("#dashboard-app").hidden = true; document.querySelector("#login-screen").hidden = false; document.querySelector("#login-error").textContent = message; };
const logoutDashboard = () => {
  const token = dashboardToken;
  showLogin('Vous êtes déconnecté de cet appareil.');
  if (token) void fetch(`${API_BASE_URL}/dashboard/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
};
const showDashboard = () => { document.querySelector("#login-screen").hidden = true; document.querySelector("#dashboard-app").hidden = false; };

const cashDue = order => order?.kioskCash === true && order.status === 'awaiting_payment' && order.payment?.provider === 'cash' && order.payment.status === 'CASH_DUE';
const cashChanges = new Set();

function orderFromApi(order) {
  const created = new Date(order.createdAt);
  const minutes = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
  return { raw: order, amendment: order.amendment, refund: order.refund, paidTotal: order.paidTotal, id: order.number, apiId: order.id, customer: order.customerName, phone: order.customerPhone || "", deliveryAddress: order.deliveryAddress, comment: order.comment || "", age: minutes < 1 ? "À l’instant" : `Il y a ${minutes} min`, type: order.dineIn ? `À table · ${Number(order.tableGuests) || '?'} pers.` : order.method === "delivery" ? "Livraison" : "Retrait", slot: `${serviceDateLabel(order.serviceDate)} · ${order.slot}`, subtotal: order.subtotal, discount: order.discount, discountLabel: order.discountLabel, discountRate: order.discountRate, welcomeRewardApplied: order.welcomeRewardApplied, bibouPlusApplied: order.bibouPlusApplied, standardDeliveryFee: order.standardDeliveryFee, deliveryFee: order.deliveryFee, total: order.total, items: order.items, status: statusLabel[order.status] || "Nouvelle" };
}

function reservationFromApi(reservation) {
  return { id: reservation.number, apiId: reservation.id, orderNumber: reservation.orderNumber, customer: reservation.customerName, phone: reservation.phone, guests: reservation.guests, serviceDate: reservation.serviceDate, date: serviceDateLabel(reservation.serviceDate), slot: reservation.slot, note: reservation.note || "", status: reservation.status, receivedAt: receivedTimeLabel(reservation.createdAt), deposit: reservation.deposit || null, depositPaymentStatus: reservation.payment?.status || null, depositReference: reservation.payment?.checkoutReference || null };
}

function rewardClaimFromApi(claim) {
  return { id: claim.number, apiId: claim.id, code: claim.code, customer: claim.customerName || "Client Bibou", title: claim.rewardTitle, points: claim.requiredPoints, status: claim.status, receivedAt: receivedTimeLabel(claim.createdAt) };
}

function actionMarkup(order) {
  if (cashDue(order.raw)) return `<div class="order-comment"><strong>Espèces à encaisser · ${euro(order.total)}</strong><p>Présenter le numéro #${Number(order.id)} au comptoir. Ne préparer qu’après encaissement. Demande valable 15 minutes.</p><div class="actions"><button class="reject" data-cash-action="cancel" data-cash-order="${escapeHtml(order.apiId)}" ${cashChanges.has(order.apiId) ? 'disabled' : ''}>Annuler sans encaissement</button><button class="accept" data-cash-action="confirm" data-cash-order="${escapeHtml(order.apiId)}" ${cashChanges.has(order.apiId) ? 'disabled' : ''}>Espèces reçues · ${euro(order.total)}</button></div></div>`;
  if (window.BibouDispatch?.activeStatuses.includes(order.raw?.kroklyDriver?.status) && ['Prête', 'En livraison'].includes(order.status)) return '<p>Le livreur confirme la récupération et la livraison depuis Krokly Driver.</p>';
  const u = order.raw?.uberDirect;
  if (u && ["sending", "uncertain", "created"].includes(u.phase) && !["canceled", "returned"].includes(u.status) && ["Prête", "En livraison"].includes(order.status)) return `<p>Le suivi de remise est synchronisé avec Uber Direct.</p>`;
  if (order.status === "Accord client attendu") return `<div class="actions"><button data-edit-order="${order.id}">Réviser la proposition</button><button class="reject" data-action="Refusée" data-id="${order.id}">Annuler la commande</button></div>`;
  if (order.status === "Nouvelle") return `<div class="actions">${order.amendment?.status !== "accepted" ? `<button data-edit-order="${order.id}">Modifier le panier</button>` : ""}<button class="reject" data-action="Refusée" data-id="${order.id}">Annuler</button><button class="accept" data-action="Acceptée" data-id="${order.id}">Accepter</button></div>`;
  if (order.status === "Acceptée") return `<div class="actions"><button class="advance" data-action="Prête" data-id="${order.id}">Marquer prête</button></div>`;
  if (order.status === "Prête") return `<div class="actions"><button class="advance ready" data-action="${order.type === "Livraison" ? "En livraison" : "Terminée"}" data-id="${order.id}">${order.type === "Livraison" ? "Confier au livreur" : "Remettre au client"}</button></div>`;
  if (order.status === "En livraison") return `<div class="actions"><button class="advance delivery" data-action="Terminée" data-id="${order.id}">Terminer la commande</button></div>`;
  return "";
}

function orderItemMarkup(item) {
  const categories = [
    ["protein", "Protéine"], ["meat-type", "Choix de viande"], ["salad", "Crudités"], ["sauces", "Sauces"],
    ["extras", "Suppléments"], ["menu-fries", "Frites du menu"], ["solo-fries", "Frites du Menu Solo"],
    ["duo-fries-one", "Frites · personne 1"], ["duo-fries-two", "Frites · personne 2"],
    ["sides", "Accompagnements"], ["drink", "Boisson"],
    ["duo-drink-one", "Boisson 1"], ["duo-drink-two", "Boisson 2"], ["desserts", "Desserts"],
    ["other", "Autres choix"]
  ];
  const grouped = new Map();
  for (const option of item.options || []) {
    const key = categories.some(([id]) => id === option.groupId) ? option.groupId : "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(option);
  }
  const isBurgerMenu = item.productId === "taurus" || item.productId?.endsWith("-menu");
  const name = isBurgerMenu && !/^menu\b/i.test(item.name) ? `Menu · ${item.name}` : item.name;
  const composition = categories.filter(([id]) => grouped.has(id)).map(([id, title]) =>
    `<div class="order-option-group"><div class="order-option-title">${title}</div><ul class="order-options">${grouped.get(id).map(option => `<li>${id === 'meat-type' ? `<strong>${escapeHtml(option.label)}</strong>` : `<span>${escapeHtml(option.label)}</span>`}${Number(option.price) > 0 ? `<strong>+ ${euro(option.price)}</strong>` : ""}</li>`).join("")}</ul></div>`
  ).join("");
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitPrice = Number(item.price) || 0;
  return `<div class="order-line"><div class="order-product-heading"><strong class="order-product-name">${quantity > 1 ? `${quantity} × ` : ""}${escapeHtml(name)}</strong><strong>${euro(unitPrice * quantity)}</strong></div>${quantity > 1 ? `<div class="order-unit-price">${euro(unitPrice)} l’unité</div>` : ""}${composition}</div>`;
}

function orderPricingMarkup(order) {
  const promotion = order.raw?.promotion || order.promotion;
  const itemSubtotal = (order.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const subtotal = Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : itemSubtotal;
  const discount = Math.max(0, Number(order.discount) || 0);
  const deliveryFee = Math.max(0, Number(order.deliveryFee) || 0);
  const standardDeliveryFee = Math.max(deliveryFee, Number(order.standardDeliveryFee) || 0);
  const discountLabel = order.discountLabel || (order.welcomeRewardApplied ? "Cadeau de bienvenue" : order.bibouPlusApplied ? "Remise Bibou +" : "Réduction");
  const rate = Number(order.discountRate) > 0 ? ` · −${Math.round(Number(order.discountRate) * 100)} %` : "";
  const rows = [`<div><span>Sous-total des articles</span><strong>${euro(subtotal)}</strong></div>`];
  if (promotion?.id) {
    if (Number(order.raw?.promotionDiscount) > 0) rows.push(`<div class="order-pricing-saving"><span>Code promo ${escapeHtml(promotion.code)}</span><strong>− ${euro(order.raw.promotionDiscount)}</strong></div>`);
    if (Number(order.raw?.baseDiscount) > 0) rows.push(`<div class="order-pricing-saving"><span>${order.welcomeRewardApplied ? 'Bienvenue · −10 % après promotion' : 'Remise Bibou +'}</span><strong>− ${euro(order.raw.baseDiscount)}</strong></div>`);
  } else if (discount > 0) rows.push(`<div class="order-pricing-saving"><span>${escapeHtml(discountLabel)}${rate}</span><strong>− ${euro(discount)}</strong></div>`);
  if (order.type === "Livraison" || order.method === "delivery") {
    if (standardDeliveryFee > deliveryFee) rows.push(`<div><span>Livraison avant avantage</span><strong>${euro(standardDeliveryFee)}</strong></div><div class="order-pricing-saving"><span>${promotion?.type === 'free_delivery' || (promotion && !promotion.id) ? 'Livraison offerte par code promo' : 'Économie livraison Bibou +'}</span><strong>− ${euro(standardDeliveryFee - deliveryFee)}</strong></div>`);
    rows.push(`<div><span>Livraison facturée</span><strong>${deliveryFee ? euro(deliveryFee) : "Offerte"}</strong></div>`);
  } else rows.push(`<div><span>${order.raw?.dineIn ? 'Sur place' : 'Retrait'}</span><strong>Gratuit</strong></div>`);
  rows.push(`<div class="order-pricing-total"><span>${order.raw?.payment?.provider === 'cash' ? (cashDue(order.raw) ? 'Espèces à encaisser au comptoir' : 'Espèces encaissées au comptoir') : promotion && !promotion.id ? 'Commande offerte · aucun débit bancaire' : 'Total débité par SumUp'}</span><strong>${euro(order.paidTotal ?? order.total)}</strong></div>`);
  if (order.paidTotal !== undefined) rows.push(`<div><span>Total après modification</span><strong>${euro(order.total)}</strong></div>`);
  return `<div class="order-pricing">${rows.join("")}</div>`;
}

function amendmentMarkup(order) {
  const a = order.amendment, r = order.refund;
  if (!a) return "";
  const names = {pending:"Accord du client attendu",accepted:"Panier revalidé par le client",refused:"Proposition refusée : commande annulée",expired:"Sans réponse : commande annulée",cancelled:"Proposition annulée"};
  return `<div class="amendment-notice"><strong>${names[a.status] || "Panier modifié"}</strong><p>${escapeHtml(a.proposal.reason)}</p>${a.status === 'pending' ? `<p>Réponse avant ${new Date(a.expiresAt).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}. Préparation bloquée.</p><p>${a.proposal.items.map(i=>`${i.quantity} × ${escapeHtml(i.name)} (${i.options.map(o=>escapeHtml(o.label)).join(', ')})`).join('<br>')}</p><p>Total proposé : ${euro(a.proposal.total)} · Remboursement si accord : ${euro(a.proposal.refundAmount)}</p><p>${a.notification?.devices ? 'Notification mobile mise en file d’envoi.' : 'Pas de notification mobile disponible : prévenez le client par téléphone.'}</p>` : ''}${r ? `<p><strong>${r.status === 'due' ? 'À rembourser dans SumUp' : 'Remboursement déclaré effectué par le restaurant'} : ${euro(r.amount)}</strong></p>${r.status === 'due' ? `<button data-refund-order="${order.id}">Enregistrer un remboursement déjà effectué</button>` : ''}` : ''}</div>`;
}

function customerOrderHistoryMarkup(order, historyStatuses) {
  const type = order.dineIn ? 'Sur place' : order.method === "delivery" ? "Livraison" : "Retrait";
  const status = historyStatuses[order.status] || order.status;
  const service = [serviceDateLabel(order.serviceDate), order.slot].filter(Boolean).join(" · ");
  const points = Number(order.pointsAdded) > 0 ? `<div class="customer-order-points">+ ${customerNumber(order.pointsAdded)} points de fidélité</div>` : "";
  return `<details class="customer-history-order"><summary><span><strong>#${Number(order.number)} · ${customerDate(order.paidAt)}</strong><small>${escapeHtml(status)} · ${type}</small></span><span><strong>${euro(order.total)}</strong><small>Voir le détail</small></span></summary><div class="customer-history-order-body">${service ? `<p class="customer-order-service">🕒 ${escapeHtml(service)}</p>` : ""}${order.comment ? `<div class="order-comment"><strong>Commentaire client</strong><p>${escapeHtml(order.comment)}</p></div>` : ""}<div class="order-items">${(order.items || []).map(orderItemMarkup).join("") || '<p class="menu-note">Le détail des articles n’a pas été enregistré pour cette ancienne commande.</p>'}</div>${orderPricingMarkup(order)}${points}</div></details>`;
}

async function printOrder(button) {
  const orderId = button.dataset.printOrder;
  const feedback = button.closest('.order-card')?.querySelector('[data-print-feedback]');
  const report = message => { printFeedback.set(orderId, message); if (feedback) feedback.textContent = message; };
  if (pendingPrints.has(orderId) || uncertainPrints.has(orderId)) return;
  const token = dashboardToken;
  if (!token) return report('Reconnectez-vous à l’espace restaurant pour imprimer.');
  if (!window.BibouEpsonPrint) return report('Le module d’impression n’est pas chargé. Actualisez la page.');
  pendingPrints.add(orderId);
  button.disabled = true;
  button.textContent = 'Impression…';
  report('Vérification de la commande puis envoi à l’Epson…');
  let sending = false;
  let claimed = null;
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/print-jobs/${encodeURIComponent(orderId)}/manual`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (token !== dashboardToken) throw new Error('La connexion a changé. Aucun ticket envoyé.');
    if (!response.ok) throw new Error(response.status === 401 ? 'Reconnectez-vous à l’espace restaurant. Aucun ticket envoyé.' : response.status === 409 ? 'Une impression est déjà en cours. Vérifiez le papier avant de réessayer.' : 'La commande ne peut pas être vérifiée. Aucun ticket envoyé.');
    const payload = await response.json();
    claimed = payload.job;
    const documentXml = window.BibouEpsonPrint.orderReceiptEnvelope(claimed.order);
    sending = true;
    const printed = await window.BibouEpsonPrint.send('192.168.192.50', documentXml);
    sending = false;
    if (!printed.success) throw new Error(`L’Epson a refusé le ticket (${printed.code || 'code inconnu'}). Vérifiez le papier.`);
    await completePrintJob(orderId, claimed.claimId, 'printed', token);
    report('Ticket envoyé à l’Epson. Vérifiez qu’un papier est bien sorti.');
  } catch (error) {
    if (sending) uncertainPrints.add(orderId);
    if (claimed?.claimId) void completePrintJob(orderId, claimed.claimId, sending ? 'uncertain' : 'failed', token).catch(() => {});
    report(`${error.message || 'Impression non confirmée.'}${sending ? ' Vérifiez le papier avant de réessayer ou de recharger la page.' : ''}`);
  } finally {
    pendingPrints.delete(orderId);
    button.disabled = uncertainPrints.has(orderId);
    button.textContent = '🖨 Imprimer';
  }
}

async function completePrintJob(orderId, claimId, status, token) {
  const response = await fetch(`${API_BASE_URL}/dashboard/print-jobs/${encodeURIComponent(orderId)}/result`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimId, status })
  });
  if (!response.ok) throw new Error('Le résultat de l’impression n’a pas été enregistré. Vérifiez le papier.');
}

async function dispatchAutoPrint() {
  if (autoPrintBusy || !dashboardToken) return;
  if (!window.BibouEpsonPrint) {
    updateText('#printer-status', '⚠️ Impression automatique indisponible · module Epson non chargé. Rechargez le back-office.');
    return;
  }
  autoPrintBusy = true;
  const token = dashboardToken;
  try {
    const probe = await window.BibouEpsonPrint.probe('192.168.192.50');
    if (!probe.success) throw new Error(`L’Epson refuse le test de liaison (${probe.code || probe.status || 'état inconnu'}).`);
    if (token !== dashboardToken) return;
    const response = await fetch(`${API_BASE_URL}/dashboard/print-jobs/claim`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (token !== dashboardToken) return;
    if (!response.ok) throw new Error(`File d’impression indisponible (réponse ${response.status}).`);
    const { job } = await response.json();
    if (!job) { updateText('#printer-status', '🖨 Imprimante prête · tickets automatiques activés'); return; }
    const id = job.order.id;
    let sending = false;
    try {
      const documentXml = window.BibouEpsonPrint.orderReceiptEnvelope(job.order);
      sending = true;
      const result = await window.BibouEpsonPrint.send('192.168.192.50', documentXml);
      sending = false;
      if (!result.success) throw new Error(`Imprimante : ${result.code || 'ticket refusé'}`);
      await completePrintJob(id, job.claimId, 'printed', token);
      printFeedback.set(id, 'Ticket imprimé automatiquement.');
      updateText('#printer-status', `🖨 Commande #${job.order.number} envoyée à l’imprimante`);
    } catch (error) {
      void completePrintJob(id, job.claimId, sending ? 'uncertain' : 'failed', token).catch(() => {});
      printFeedback.set(id, `Impression automatique non confirmée : ${error.message || 'vérifiez le papier'}.`);
      updateText('#printer-status', `⚠️ Ticket #${job.order.number} non confirmé · vérifiez le papier`);
    }
    renderOrders();
  } catch (error) {
    updateText('#printer-status', `⚠️ Impression automatique indisponible · ${error.message || 'cause inconnue'}. Commandes visibles à l’écran.`);
  } finally { autoPrintBusy = false; }
}

function renderOrders() {
  const completedView = filter === "Terminée";
  const historyView = filter === "Historique";
  const archiveQuery = archiveSearch.trim().toLocaleLowerCase('fr-FR');
  const visible = historyView
    ? orders.filter((order) => {
      if (!archiveQuery) return true;
      const date = order.raw?.serviceDate || '';
      return [order.id, order.customer, order.phone, date, date.split('-').reverse().join('/'), order.raw?.payment?.paidAt?.slice(0, 10), order.raw?.createdAt?.slice(0, 10)]
        .some(value => String(value || '').toLocaleLowerCase('fr-FR').includes(archiveQuery));
    })
      .sort((left, right) => Date.parse(right.raw?.payment?.paidAt || right.raw?.createdAt || 0) - Date.parse(left.raw?.payment?.paidAt || left.raw?.createdAt || 0))
      .slice(0, archiveQuery ? undefined : 100)
    : completedView ? orders.filter((order) => order.status === "Terminée") : active().filter((order) => filter === "all" || order.status === filter);
  document.querySelector('#archive-search-wrap').hidden = !historyView;
  if (!visible.some(order => order.apiId === selectedOrderId)) selectedOrderId = visible[0]?.apiId || null;
  document.querySelector('#order-queue').hidden = completedView || historyView || !visible.length;
  document.querySelector('#order-queue').innerHTML = completedView || historyView ? '' : visible.map(order => `<button class="queue-order ${order.apiId === selectedOrderId ? 'selected' : ''}" data-select-order="${escapeHtml(order.apiId)}" aria-pressed="${order.apiId === selectedOrderId}"><span><strong>#${Number(order.id)} · ${escapeHtml(order.customer || 'Client')}</strong><b>${euro(order.total)}</b></span><small>${escapeHtml(order.type)} · ${escapeHtml(order.slot)}</small><span class="status ${escapeHtml(order.status.replace(' ', '-'))}">${escapeHtml(order.status)}</span></button>`).join('');
  document.querySelectorAll('[data-select-order]').forEach(button => button.onclick = () => { selectedOrderId = button.dataset.selectOrder; renderOrders(); });
  const shown = completedView || historyView ? visible : visible.filter(order => order.apiId === selectedOrderId);
  document.querySelector("#orders-list").innerHTML = shown.length ? shown.map((order) => {
    const lines = order.items.map(orderItemMarkup).join("");
    const address = order.deliveryAddress;
    const contact = `<div class="order-contact"><div>Téléphone : ${escapeHtml(order.phone || "Non enregistré sur cette commande")}</div>${order.type === "Livraison" ? `<div><strong>Adresse de livraison</strong>${address?.address ? `<div>${escapeHtml(address.address)}</div><div>${escapeHtml([address.postalCode, address.city].filter(Boolean).join(" "))}</div>` : `<div>Adresse non enregistrée sur cette commande</div>`}</div>` : ""}</div>`;
    const comment = order.comment ? `<div class="order-comment"><strong>Commentaire client</strong><p>${escapeHtml(order.comment)}</p></div>` : "";
    const stages = ['Nouvelle', 'Acceptée', 'Prête', ...(order.type === 'Livraison' ? ['En livraison'] : []), 'Terminée'];
    const step = stages.indexOf(order.status);
    const progress = step < 0 ? '' : `<ol class="order-progress" aria-label="Progression de la commande">${stages.map((stage, index) => `<li class="${index < step ? 'done' : index === step ? 'current' : ''}" ${index === step ? 'aria-current="step"' : ''}><b>${index < step ? '✓' : index + 1}</b><span>${stage === 'Acceptée' ? 'En cuisine' : stage === 'Nouvelle' ? 'À accepter' : stage}</span></li>`).join('')}</ol>`;
    const printControls = cashDue(order.raw) ? '': `<div class="order-print"><button type="button" class="secondary-button print-order-button" data-print-order="${escapeHtml(order.apiId)}" ${pendingPrints.has(order.apiId) || uncertainPrints.has(order.apiId) ? 'disabled' : ''}>🖨 Imprimer</button><span data-print-feedback role="status" aria-live="polite">${escapeHtml(printFeedback.get(order.apiId) || 'Récapitulatif de commande, sans détail de TVA.')}</span></div>`;
    const body = `${progress}<div class="order-appointment"><span>${escapeHtml(order.type)} prévu${order.type === 'Livraison' ? 'e' : ''}</span><strong>${escapeHtml(order.slot)}</strong></div>${contact}${comment}<div class="order-items">${lines}</div><details class="pricing-details"><summary>Détail du paiement · ${euro(order.paidTotal ?? order.total)}</summary>${orderPricingMarkup(order)}</details>${amendmentMarkup(order)}${window.BibouDispatch?.markup(order.raw) || ""}${window.BibouUber?.markup(order.raw) || ""}<div class="order-bottom"><div class="order-details">${order.raw?.payment?.provider === 'cash' ? (cashDue(order.raw) ? 'Paiement en espèces attendu' : 'Espèces encaissées') : order.raw?.promotion && !order.raw.promotion.id ? 'Commande offerte par code promo' : 'Paiement confirmé'} · ${euro(order.total)}</div>${actionMarkup(order)}</div>${printControls}`;
    if (completedView || historyView) return `<details class="order-card completed-order"><summary><span><strong class="order-id">#${Number(order.id)} · ${escapeHtml(order.customer)}</strong><small>${escapeHtml(order.type)} · ${escapeHtml(order.slot)} · ${escapeHtml(order.status)}</small></span><span><strong>${euro(order.total)}</strong><small>Ouvrir la commande</small></span></summary><div class="completed-order-body"><div class="order-head"><span class="status ${escapeHtml(order.status.replace(' ', '-'))}">${escapeHtml(order.status)}</span></div>${body}</div></details>`;
    return `<article class="order-card ${order.status === "Nouvelle" ? "new" : ""}"><div class="order-head"><div><div class="order-id">#${Number(order.id)} · ${escapeHtml(order.customer)}</div><div class="order-meta">${escapeHtml(order.age)} · ${escapeHtml(order.type)}</div></div><span class="status ${escapeHtml(order.status.replace(" ", "-"))}">${escapeHtml(order.status)}</span></div>${body}</article>`;
  }).join("") : `<div class="empty">🍔<strong>${historyView ? "Aucune commande trouvée" : completedView ? "Aucune commande terminée" : "Aucune commande ici"}</strong>${historyView ? "Essayez un autre numéro, nom ou date." : completedView ? "Les commandes terminées resteront accessibles ici." : "Les nouvelles commandes apparaîtront dès leur réception."}</div>`;
  document.querySelectorAll('[data-uber-order]').forEach(button => button.onclick = () => {
    const order = orders.find(o => o.id === Number(button.dataset.uberOrder)), token = dashboardToken;
    if (order) window.BibouUber.open(order.raw, {api:API_BASE_URL,headers:dashboardHeaders({'Content-Type':'application/json'}),current:()=>dashboardToken===token,refresh:()=>loadOrders()});
  });
  document.querySelectorAll('[data-edit-order]').forEach(button => button.onclick = () => {
    const order = orders.find(o => o.id === Number(button.dataset.editOrder)), token = dashboardToken;
    if (order) BibouAmendments.open(order.raw, { api: API_BASE_URL, headers: dashboardHeaders({'Content-Type':'application/json'}), current: () => dashboardToken === token, refresh: () => loadOrders() });
  });
  document.querySelectorAll('[data-refund-order]').forEach(button => button.onclick = async () => {
    const order = orders.find(o => o.id === Number(button.dataset.refundOrder));
    const reference = window.prompt(`Après avoir effectué le remboursement de ${euro(order.refund.amount)} dans SumUp, indiquez sa référence. Ce bouton ne déclenche aucun remboursement.`);
    if (!reference?.trim()) return;
    button.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/orders/${order.apiId}/refund`, {method:'POST',headers:dashboardHeaders({'Content-Type':'application/json'}),body:JSON.stringify({amount:order.refund.amount,reference})});
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      await loadOrders(); showToast('Remboursement déclaré effectué.');
    } catch (e) { showToast(e.message || 'Enregistrement impossible.'); button.disabled=false; }
  });
  document.querySelectorAll('#orders-list [data-print-order]').forEach(button => button.onclick = () => printOrder(button));
  document.querySelectorAll('[data-cash-order]').forEach(button => button.onclick = async () => {
    const id=button.dataset.cashOrder, action=button.dataset.cashAction, token=dashboardToken;
    const order=orders.find(o=>o.apiId===id);
    if (!order || cashChanges.has(id) || !cashDue(order.raw)) return;
    const message=action==='confirm' ? `Confirmer avoir réellement reçu ${euro(order.total)} en espèces pour la commande #${Number(order.id)} ?` : `Annuler la commande #${Number(order.id)} sans encaissement ?`;
    if (!window.confirm(message)) return;
    cashChanges.add(id); renderOrders();
    try {
      const response=await fetch(`${API_BASE_URL}/dashboard/orders/${encodeURIComponent(id)}/cash`, {method:'POST',headers:dashboardHeaders({'Content-Type':'application/json'}),body:JSON.stringify({action,amount:order.total})});
      const payload=await response.json(); if(!response.ok) throw Error(payload.error || 'Encaissement non confirmé.');
      if(token===dashboardToken) { await loadOrders(); showToast(action==='confirm' ? 'Espèces enregistrées. Commande prête à accepter.' : 'Commande espèces annulée.'); }
    } catch(error) { if(token===dashboardToken) { await loadOrders(); showToast(error.message || 'Vérifiez la commande avant de réessayer.'); } }
    finally { cashChanges.delete(id); if(token===dashboardToken) renderOrders(); }
  });
  document.querySelectorAll("#orders-list [data-action]").forEach((button) => button.addEventListener("click", () => changeOrder(Number(button.dataset.id), button.dataset.action)));
  document.querySelectorAll('#orders-list [data-action], #orders-list [data-edit-order], #orders-list [data-refund-order], #orders-list [data-uber-order]').forEach(button => { button.disabled = pendingOrderChanges.has(Number(button.dataset.id || button.dataset.editOrder || button.dataset.refundOrder || button.dataset.uberOrder)); });
}

function refreshMetrics() {
  const current = active();
  const newOrders = current.filter((order) => order.status === "Nouvelle");
  const ready = current.filter((order) => order.status === "Prête");
  document.querySelector("#active-count").textContent = current.length;
  document.querySelector("#new-count").textContent = newOrders.length;
  document.querySelector("#ready-count").textContent = ready.length;
  document.querySelector("#turnover-today").textContent = euro(revenue.today);
  document.querySelector("#turnover-week").textContent = euro(revenue.week);
  document.querySelector("#turnover-month").textContent = euro(revenue.month);
  document.querySelector("#new-order-count").textContent = newOrders.length;
  document.querySelector("#all-filter-count").textContent = current.length;
  document.querySelector("#new-filter-count").textContent = newOrders.length;
  document.querySelector("#completed-filter-count").textContent = orders.filter((order) => order.status === "Terminée").length;
  const pendingReservations = reservations.filter((reservation) => reservation.status === "pending").length;
  document.querySelector("#new-reservation-count").textContent = pendingReservations;
  document.querySelector("#new-reservation-count-mobile").textContent = pendingReservations;
  document.querySelector("#pending-reservation-count").textContent = pendingReservations;
  const activeRewards = rewardClaims.filter((claim) => claim.status === "active").length;
  document.querySelector("#new-reward-count").textContent = activeRewards;
  document.querySelector("#new-reward-count-mobile").textContent = activeRewards;
  document.querySelector("#active-reward-count").textContent = activeRewards;
  updateAttention(newOrders.length, pendingReservations, activeRewards);
  renderHome();
}

function renderHome() {
  const pending = orders.filter(order => order.status === 'Nouvelle');
  const pendingTables = reservations.filter(table => table.status === 'pending');
  const loaded = Boolean(feedHealth.orders.lastSuccess && feedHealth.reservations.lastSuccess);
  updateText('#home-priority-title', !loaded ? 'Connexion à votre restaurant…' : pending.length ? `${pending.length} commande${pending.length > 1 ? 's' : ''} vous attend${pending.length > 1 ? 'ent' : ''} !` : pendingTables.length ? `${pendingTables.length} table${pendingTables.length > 1 ? 's' : ''} à confirmer` : 'Tout est à jour pour le service.');
  updateText('#home-priority-detail', !loaded ? 'Les données arrivent. Le statut de connexion est affiché juste au-dessus.' : pending.length ? 'Les clients ont validé leur commande. À vous de lancer la préparation.' : pendingTables.length ? 'Un petit coup d’œil aux réservations avant d’accueillir vos clients.' : 'Les nouvelles demandes apparaîtront ici automatiquement.');
  updateText('#home-priority', pending.length ? 'Accepter les commandes →' : pendingTables.length ? 'Voir les réservations →' : 'Voir les commandes →');
  updateText('#home-active', feedHealth.orders.lastSuccess ? String(active().length) : '—');
  updateText('#home-tables', feedHealth.reservations.lastSuccess ? String(reservations.filter(table => table.serviceDate === todayDateKey() && table.status !== 'cancelled').length) : '—');
  const period = document.querySelector('#home-period').value || 'today';
  updateText('#home-revenue', feedHealth.orders.lastSuccess ? euro(revenue[period]) : '—');
  document.querySelector('#home-orders').innerHTML = active().slice(0, 4).map(order => `<button class="home-row" data-home-order="${escapeHtml(order.apiId)}"><span><strong>#${Number(order.id)} · ${escapeHtml(order.customer || 'Client')}</strong><small>${escapeHtml(order.type)} · ${escapeHtml(order.slot)}</small></span><span><strong>${euro(order.total)}</strong><small>${escapeHtml(order.status)}</small></span></button>`).join('') || `<p class="workspace-empty">${feedHealth.orders.lastSuccess ? 'Aucune commande en cours. Prêts pour la prochaine !' : 'Chargement des commandes…'}</p>`;
  document.querySelector('#home-reservations').innerHTML = reservations.filter(table => table.serviceDate >= todayDateKey() && table.status !== 'cancelled').sort((a,b) => `${a.serviceDate} ${a.slot}`.localeCompare(`${b.serviceDate} ${b.slot}`)).slice(0,4).map(table => `<button class="home-row" data-home-table><span><strong>${escapeHtml(table.customer)}</strong><small>${escapeHtml(table.date)} · ${escapeHtml(table.slot)}</small></span><span><strong>${Number(table.guests)} pers.</strong><small>${reservationStatusLabel[table.status]}</small></span></button>`).join('') || `<p class="workspace-empty">${feedHealth.reservations.lastSuccess ? 'Aucune table à venir pour le moment.' : 'Chargement des réservations…'}</p>`;
  document.querySelectorAll('[data-home-order]').forEach(button => button.onclick = () => { selectedOrderId = button.dataset.homeOrder; setOrderFilter('all'); showView('orders'); });
  document.querySelectorAll('[data-home-table]').forEach(button => button.onclick = () => showView('reservations'));
}

function setOrderFilter(value) {
  filter = value;
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item.dataset.filter === value));
  renderOrders();
}

function updateText(selector, value) {
  const element = document.querySelector(selector);
  if (element.textContent !== value) element.textContent = value;
}

function updateAttention(orderCount, reservationCount, rewardCount) {
  const counters = { orders: [orderCount, "commande à accepter", "commandes à accepter"], reservations: [reservationCount, "réservation à confirmer", "réservations à confirmer"], rewards: [rewardCount, "récompense à remettre", "récompenses à remettre"] };
  for (const [kind, [count, singular, plural]] of Object.entries(counters)) {
    const selector = `#attention-${kind}`;
    updateText(selector, `${count} ${count > 1 ? plural : singular}`);
    document.querySelector(selector).classList.toggle("needs-attention", count > 0);
  }
  const total = orderCount + reservationCount + rewardCount;
  document.title = `${total ? `(${total}) ` : ""}Bibou's Burgers — Espace restaurant`;
}

function updateSoundControls() {
  const state = soundPlayer.state();
  document.querySelector('#audio-warning').hidden = Boolean(state.ready);
  document.querySelector('#enable-alerts-button').disabled = !state.supported;
  updateText('#audio-warning-text', !state.supported ? 'Ce navigateur ne peut pas sonner. Ouvrez le tableau dans Safari ou Chrome.' : 'Le navigateur a suspendu le son. Touchez « Activer les alertes sonores » pour recevoir les commandes.');
  updateText('#sound-status', !state.supported ? 'Son indisponible sur cet appareil.' : state.ready ? '🔔 Son autorisé par le navigateur · vérifiez le volume de l’appareil' : '🔕 Sonnerie bloquée par le navigateur');
}

function updateOrderAlarm(state) {
  document.querySelector('#order-alarm').hidden = !state.count;
  updateText('#order-alarm-title', state.count > 1 ? `${state.count} nouvelles commandes !` : 'Nouvelle commande !');
  const first = orders.find(order => state.numbers.includes(order.id));
  const detail = first ? `${first.type} · ${first.slot} · ${euro(first.total)}` : 'Commandes validées à accepter';
  updateText('#order-alarm-detail', `${state.numbers.slice(0, 6).map(n => '#' + n).join(' · ')}${state.numbers.length > 6 ? '…' : ''} — ${detail}. ${state.ringing ? 'La sonnerie reste active jusqu’à votre réponse.' : 'Activez le son pour entendre la sonnerie.'}`);
}

function updateConnectionStatus() {
  const status = BibouAlerts.connectionStatus(Object.values(feedHealth), navigator.onLine);
  updateText("#connection-status", status.text);
  document.querySelector("#connection-status").classList.toggle("connection-warning", status.warning);
}

function announceArrivals(kind, count) {
  if (!count) return;
  queuedArrivals.set(kind, (queuedArrivals.get(kind) || 0) + count);
  clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => {
    if (!dashboardToken) return queuedArrivals.clear();
    const labels = { orders: ["nouvelle commande payée", "nouvelles commandes payées"], reservations: ["nouvelle réservation", "nouvelles réservations"], rewards: ["nouvelle récompense réclamée", "nouvelles récompenses réclamées"] };
    const message = [...queuedArrivals].map(([type, amount]) => `${amount} ${labels[type][amount > 1 ? 1 : 0]}`).join(" · ");
    updateText("#arrival-message", `${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — ${message}`);
    showToast(message);
    // Orders have a continuous alarm, including the first successful snapshot.
    for (const type of queuedArrivals.keys()) if (type !== 'orders' && !soundPlayer.state().ringing) soundPlayer.play(type);
    queuedArrivals.clear();
  }, 250);
}

function reservationActions(reservation) {
  if (reservation.orderNumber) return `<p class="reservation-note">Repas payé · commande #${Number(reservation.orderNumber)}. Toute annulation doit passer par la commande et son remboursement.</p>`;
  if (reservation.status === "pending") return `<div class="actions"><button class="cancel-reservation" data-reservation-action="cancelled" data-id="${escapeHtml(reservation.apiId)}">Refuser la table</button>${reservation.deposit ? `<button class="cancel-reservation" data-reservation-action="cancelled" data-cancelled-by="customer" data-id="${escapeHtml(reservation.apiId)}">Annulation du client</button>` : ''}<button class="confirm-reservation" data-reservation-action="confirmed" data-id="${escapeHtml(reservation.apiId)}">Accepter la table</button></div>`;
  if (reservation.status === "confirmed") return `<div class="actions"><button class="cancel-reservation" data-reservation-action="cancelled" data-id="${escapeHtml(reservation.apiId)}">Restaurant : annuler</button>${reservation.deposit ? `<button class="cancel-reservation" data-reservation-action="cancelled" data-cancelled-by="customer" data-id="${escapeHtml(reservation.apiId)}">Annulation du client</button>` : ''}</div>`;
  return "";
}

function reservationDepositInfo(reservation) {
  if (!reservation.deposit || reservation.depositPaymentStatus !== 'PAID') return '';
  const paid = `<p class="reservation-note">Paiement SumUp encaissé : <strong>${euro(reservation.deposit.amount)}</strong> · Référence ${escapeHtml(reservation.depositReference || 'à retrouver dans SumUp')}. Ce n’est pas une empreinte bancaire.</p>`;
  if (reservation.deposit.refundStatus === 'recorded') return `${paid}<p class="reservation-note">Remboursement manuel signalé comme effectué.</p>`;
  if (reservation.status === 'cancelled') return reservation.deposit.cancellation?.refundable
    ? `${paid}<p class="reservation-note">Annulation ouvrant droit au remboursement : remboursez ${euro(reservation.deposit.amount)} dans SumUp, puis confirmez ici. Rien n’est remboursé automatiquement.</p><div class="actions"><button class="confirm-reservation" data-deposit-refund-id="${escapeHtml(reservation.apiId)}">J’ai remboursé dans SumUp</button></div>`
    : `${paid}<p class="reservation-note">${reservation.deposit.cancellation ? 'Annulation du client moins d’une heure avant : somme conservée.' : 'Annulation antérieure : vérifiez manuellement les conditions et le paiement dans SumUp.'}</p>`;
  if (reservation.status === 'pending') return `${paid}<p class="reservation-note">Confirmez d’abord la table. Vous pourrez ensuite indiquer si le client est venu ou absent.</p>`;
  if (reservation.deposit.attendanceStatus === 'no_show') return `${paid}<p class="reservation-note">Client absent : la somme est conservée selon la règle annoncée avant paiement.</p><div class="actions"><button class="confirm-reservation" data-deposit-attendance-id="${escapeHtml(reservation.apiId)}" data-deposit-attendance-status="present">Corriger : client venu</button></div>`;
  if (reservation.deposit.attendanceStatus === 'present') return `${paid}<p class="reservation-note">Client venu : remboursez ${euro(reservation.deposit.amount)} sur la carte d’origine dans SumUp, puis confirmez ici.</p><div class="actions"><button class="confirm-reservation" data-deposit-refund-id="${escapeHtml(reservation.apiId)}">J’ai remboursé dans SumUp</button></div>`;
  return `${paid}<p class="reservation-note">Après le créneau, indiquez si le client est venu. Venu : remboursement manuel. Absent : somme conservée.</p><div class="actions"><button class="confirm-reservation" data-deposit-attendance-id="${escapeHtml(reservation.apiId)}" data-deposit-attendance-status="present">Client venu</button><button class="cancel-reservation" data-deposit-attendance-id="${escapeHtml(reservation.apiId)}" data-deposit-attendance-status="no_show">Client absent</button></div>`;
}

function renderReservations() {
  const today = todayDateKey();
  const visible = reservations.filter((reservation) => {
    if (reservationFilter === 'all') return true;
    if (reservationFilter === 'today') return reservation.serviceDate === today;
    const depositNeedsAction = reservation.deposit && reservation.depositPaymentStatus === 'PAID' && reservation.deposit.refundStatus !== 'recorded' && (reservation.status === 'cancelled' ? reservation.deposit.cancellation?.refundable : reservation.deposit.attendanceStatus !== 'no_show');
    return (reservation.serviceDate >= today && reservation.status !== 'cancelled') || depositNeedsAction;
  });
  const sorted = [...visible].sort((a, b) => ((a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1)) || `${a.serviceDate} ${a.slot}`.localeCompare(`${b.serviceDate} ${b.slot}`));
  document.querySelector("#reservations-list").innerHTML = sorted.length ? sorted.map((reservation) => `<article class="reservation-card ${escapeHtml(reservation.status)}"><div class="reservation-grid"><div><div class="reservation-name">Réservation #${reservation.id} · ${escapeHtml(reservation.customer)}</div><div class="reservation-phone">☎ ${escapeHtml(reservation.phone)}${reservation.receivedAt ? ` · Reçue à ${escapeHtml(reservation.receivedAt)}` : ""}</div></div><div><div class="reservation-when">${escapeHtml(reservation.date)} · ${escapeHtml(reservation.slot)}</div><div class="reservation-guests">${reservation.guests} personne${reservation.guests > 1 ? "s" : ""}</div></div><div><span class="status ${escapeHtml(reservation.status)}">${reservationStatusLabel[reservation.status] || "À confirmer"}</span></div></div>${reservation.note ? `<p class="reservation-note">Note : ${escapeHtml(reservation.note)}</p>` : ""}${reservationDepositInfo(reservation)}${reservationActions(reservation)}</article>`).join("") : `<div class="empty">🍽<strong>Aucune réservation</strong>Les demandes de table apparaîtront ici.</div>`;
  document.querySelectorAll("[data-reservation-action]").forEach((button) => button.addEventListener("click", () => changeReservation(button.dataset.id, button.dataset.reservationAction, button.dataset.cancelledBy)));
  document.querySelectorAll('[data-deposit-refund-id]').forEach(button => button.addEventListener('click', () => recordDepositRefund(button.dataset.depositRefundId)));
  document.querySelectorAll('[data-deposit-attendance-id]').forEach(button => button.addEventListener('click', () => recordDepositAttendance(button.dataset.depositAttendanceId, button.dataset.depositAttendanceStatus)));
}

function renderRewardClaims() {
  const visible = rewardClaims.filter((claim) => rewardFilter === "all" || claim.status === "active");
  const sorted = [...visible].sort((left, right) => (left.status === "active" ? -1 : 1) - (right.status === "active" ? -1 : 1));
  document.querySelector("#rewards-list").innerHTML = sorted.length ? sorted.map((claim) => `<article class="reservation-card ${escapeHtml(claim.status)}"><div class="reservation-grid"><div><div class="reservation-name">${escapeHtml(claim.customer)}</div><div class="reservation-phone">Code client · <strong>${escapeHtml(claim.code)}</strong>${claim.receivedAt ? ` · Réclamée à ${escapeHtml(claim.receivedAt)}` : ""}</div></div><div><div class="reservation-when">${escapeHtml(claim.title)}</div><div class="reservation-guests">Palier ${Number(claim.points)} points</div></div><div><span class="status ${escapeHtml(claim.status)}">${rewardStatusLabel[claim.status] || "À remettre"}</span></div></div>${claim.status === "active" ? `<div class="actions"><button class="confirm-reservation" data-reward-action="used" data-id="${escapeHtml(claim.apiId)}">Marquer comme utilisée</button></div>` : ""}</article>`).join("") : `<div class="empty">🎁<strong>Aucune récompense à remettre</strong>Les récompenses réclamées par les clients apparaîtront ici.</div>`;
  document.querySelectorAll("[data-reward-action]").forEach((button) => button.addEventListener("click", () => changeRewardClaim(button.dataset.id, button.dataset.rewardAction)));
}

function loadFeed(kind, { notify = true } = {}) {
  if (!dashboardToken) return Promise.resolve(false);
  const token = dashboardToken;
  const running = feedRequests.get(kind);
  if (running?.token === token) return running.promise;
  const request = { token };
  request.promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const endpoint = kind === "rewards" ? "reward-claims" : kind;
      const response = await fetch(`${API_BASE_URL}/dashboard/${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      if (token !== dashboardToken) return false;
      if (response.status === 401) { showLogin("Votre session a expiré. Reconnectez-vous pour recevoir les nouvelles demandes."); return false; }
      if (!response.ok) throw new Error("Chargement impossible");
      const payload = await response.json();
      if (token !== dashboardToken) return false;
      const items = payload[kind === "rewards" ? "claims" : kind];
      if (!Array.isArray(items)) throw new Error("Réponse invalide");
      const fresh = arrivalTracker.update(kind, items);
      if (kind === "orders") {
        orders = items.filter((item) => (item.payment?.status === "PAID" && Object.hasOwn(statusLabel, item.status)) || cashDue(item)).map(orderFromApi);
        orderAlarm.sync(items);
        if (orderAlarm.state().count && !soundPlayer.state().ready) void ensureServiceSound();
        revenue = payload.revenue && ["today", "week", "month"].every((key) => Number.isFinite(Number(payload.revenue[key]))) ? payload.revenue : { today: 0, week: 0, month: 0 };
        renderOrders();
        void dispatchAutoPrint();
      }
      else if (kind === "reservations") { reservations = items.map(reservationFromApi); renderReservations(); }
      else { rewardClaims = items.map(rewardClaimFromApi); renderRewardClaims(); }
      feedHealth[kind] = { lastSuccess: Date.now(), error: false };
      refreshMetrics();
      if (notify) announceArrivals(kind, fresh.length);
      return true;
    } catch {
      if (token === dashboardToken) feedHealth[kind].error = true;
      return false;
    } finally {
      clearTimeout(timeout);
      if (feedRequests.get(kind) === request) feedRequests.delete(kind);
      updateConnectionStatus();
    }
  })();
  feedRequests.set(kind, request);
  return request.promise;
}

const loadOrders = (options) => loadFeed("orders", options);
const loadReservations = (options) => loadFeed("reservations", options);
const loadRewardClaims = (options) => loadFeed("rewards", options);
const refreshFeeds = (options) => Promise.all([loadOrders(options), loadReservations(options), loadRewardClaims(options)]);

async function changeOrder(id, status) {
  const order = orders.find((item) => item.id === id);
  if (!order || pendingOrderChanges.has(id)) return;
  if (status === "Refusée" && !window.confirm(`La commande #${id} a déjà été réglée. Confirmez son annulation uniquement après avoir organisé le remboursement dans SumUp.`)) return;
  const token = dashboardToken;
  pendingOrderChanges.add(id);
  renderOrders();
  try {
    if (!API_BASE_URL || !order.apiId) throw new Error("API indisponible");
    const response = await fetch(`${API_BASE_URL}/dashboard/orders/${order.apiId}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: statusForLabel[status] }), signal: AbortSignal.timeout(15000) });
    if (token !== dashboardToken) return;
    if (response.status === 401) return showLogin('Session expirée. Reconnectez-vous pour vérifier la commande.');
    if (!response.ok) throw new Error("Mise à jour impossible");
    // Never silence on an optimistic click: wait for the server's confirmation.
    orderAlarm.resolve(order.apiId);
    const current = orders.find(item => item.apiId === order.apiId);
    if (current) { current.status = status; current.raw = {...current.raw, status:statusForLabel[status]}; }
    if (filter !== 'all' && !['Terminée','Refusée'].includes(status)) filter = 'all';
    setOrderFilter(filter);
    refreshMetrics();
    const messages = { Acceptée: `Commande #${id} acceptée.`, Refusée: `Commande #${id} annulée. Pensez à effectuer le remboursement dans SumUp.`, Prête: `Commande #${id} est prête.`, "En livraison": `Commande #${id} confiée au livreur.`, Terminée: `Commande #${id} terminée.` };
    showToast(messages[status]);
  } catch {
    if (token === dashboardToken) showToast("Mise à jour non confirmée. Actualisez pour vérifier avant de réessayer.");
  } finally { pendingOrderChanges.delete(id); if (token === dashboardToken) renderOrders(); }
}

async function changeReservation(id, status, cancelledBy = 'restaurant') {
  const reservation = reservations.find((item) => item.apiId === id);
  if (!reservation) return;
  if (status === "cancelled" && !window.confirm(reservation.deposit && reservation.depositPaymentStatus === 'PAID'
    ? cancelledBy === 'customer' ? 'Le client demande-t-il bien l’annulation maintenant ? Au moins une heure avant le créneau : remboursement manuel ; sinon : somme conservée. Enregistrez sa demande immédiatement.' : 'Le restaurant annule-t-il cette table ? Le client devra être remboursé manuellement dans SumUp.'
    : "Confirmez-vous le refus ou l’annulation de cette réservation ?")) return;
  const previousStatus = reservation.status;
  reservation.status = status;
  refreshMetrics();
  renderReservations();
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reservations/${encodeURIComponent(id)}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status, ...(status === 'cancelled' ? { cancelledBy } : {}) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Mise à jour impossible");
    Object.assign(reservation, reservationFromApi(payload.reservation));
    renderReservations();
    showToast(status === "confirmed" ? `Réservation #${reservation.id} confirmée.` : reservation.deposit?.cancellation?.refundable ? `Réservation #${reservation.id} annulée. Remboursement à faire dans SumUp.` : `Réservation #${reservation.id} annulée.`);
  } catch {
    reservation.status = previousStatus;
    refreshMetrics();
    renderReservations();
    showToast("La mise à jour n’a pas été enregistrée.");
  }
}

async function recordDepositAttendance(id, status) {
  const reservation = reservations.find(item => item.apiId === id);
  if (!reservation?.deposit || !['present', 'no_show'].includes(status)) return;
  const message = status === 'present'
    ? 'Confirmez-vous que le client est venu ? Vous devrez ensuite effectuer son remboursement dans SumUp.'
    : 'Confirmez-vous que le client ne s’est pas présenté ? La somme restera encaissée. Cette décision peut être corrigée si nécessaire.';
  if (!window.confirm(message)) return;
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reservations/${encodeURIComponent(id)}/attendance`, { method: 'POST', headers: dashboardHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Présence non enregistrée.');
    reservation.deposit = payload.reservation.deposit;
    renderReservations();
    showToast(status === 'present' ? 'Présence enregistrée. Remboursement à faire dans SumUp.' : 'Absence enregistrée. Paiement conservé.');
  } catch { showToast('Présence non enregistrée. Actualisez puis réessayez.'); }
}

async function recordDepositRefund(id) {
  const reservation = reservations.find(item => item.apiId === id);
  if (!reservation?.deposit || reservation.deposit.refundStatus === 'recorded') return;
  if (!window.confirm(`As-tu déjà remboursé ${euro(reservation.deposit.amount)} dans SumUp ? Ce bouton l’enregistre seulement dans le back-office ; il ne déclenche pas le remboursement.`)) return;
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reservations/${encodeURIComponent(id)}/deposit-refund-record`, { method: 'POST', headers: dashboardHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ confirmedInSumUp: true }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Enregistrement impossible.');
    reservation.deposit = payload.reservation.deposit;
    renderReservations();
    showToast('Remboursement manuel enregistré.');
  } catch { showToast('Enregistrement impossible. Vérifiez dans SumUp avant de réessayer.'); }
}

async function changeRewardClaim(id, status) {
  const claim = rewardClaims.find((item) => item.apiId === id);
  if (!claim) return;
  if (status === "used" && !window.confirm(`Confirmez-vous avoir remis « ${claim.title} » à ${claim.customer} ?`)) return;
  const previousStatus = claim.status;
  claim.status = status;
  refreshMetrics();
  renderRewardClaims();
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reward-claims/${encodeURIComponent(id)}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Mise à jour impossible");
    showToast(`Récompense ${claim.code} marquée comme utilisée.`);
  } catch {
    claim.status = previousStatus;
    refreshMetrics();
    renderRewardClaims();
    showToast("La récompense n’a pas été mise à jour.");
  }
}

function renderMenu() {
  const query = document.querySelector("#menu-search").value.trim().toLocaleLowerCase("fr");
  const category = document.querySelector("#menu-filter").value;
  const visible = menuProducts.filter((product) => product.name.toLocaleLowerCase("fr").includes(query) && (category === "all" || (category === "unavailable" ? !product.available : product.category === category)));
  const categories = { menus: "Nos menus", burgers: "Nos burgers", supplements: "Suppléments des burgers", desserts: "Desserts", snacks: "Petites faims", drinks: "Boissons" };
  document.querySelector("#menu-list").innerHTML = !menuLoaded ? '<p class="empty">Chargement de la carte…</p>' : !visible.length ? '<p class="empty">Aucun produit ne correspond à cette recherche.</p>' : Object.entries(categories).map(([key, title]) => {
    const products = visible.filter((product) => product.category === key);
    if (!products.length) return "";
    return `<section class="menu-group"><h3>${title}<span>${products.length}</span></h3><div class="menu-grid">${products.map((product) => `<article class="menu-product ${product.available ? "" : "is-unavailable"}"><div class="menu-product-copy"><h4>${escapeHtml(product.name)}</h4><p class="menu-product-price">${euro(product.price)}</p><span class="stock-label ${product.available ? "available" : "unavailable"}">${product.available ? "● Disponible" : "● En rupture"}</span>${product.enabled && !product.available ? `<p class="stock-reason">${escapeHtml(product.reason)}</p>` : ""}</div><button type="button" class="stock-toggle ${product.enabled ? "" : "restore"}" data-stock-id="${escapeHtml(product.id)}" ${menuSaving ? "disabled" : ""} aria-label="${product.enabled ? "Mettre en rupture" : "Remettre disponible"} : ${escapeHtml(product.name)}">${product.enabled ? "Mettre en rupture" : "Remettre disponible"}</button></article>`).join("")}</div></section>`;
  }).join("");
  document.querySelectorAll("[data-stock-id]").forEach((button) => button.addEventListener("click", () => changeProductStock(button.dataset.stockId)));
}

async function loadMenu() {
  if (menuSaving) return;
  const requestId = ++menuRequest;
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/catalog`, { headers: dashboardHeaders(), cache: "no-store" });
    if (requestId !== menuRequest) return;
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error("Impossible de charger la carte. Réessayez avec Actualiser.");
    const payload = await response.json();
    if (requestId !== menuRequest) return;
    menuProducts = payload.products;
    menuLoaded = true;
    renderMenu();
    document.querySelector("#menu-feedback").textContent = `${menuProducts.filter((product) => product.available).length} produits disponibles · ${menuProducts.filter((product) => !product.available).length} en rupture`;
  } catch (error) {
    if (requestId === menuRequest) document.querySelector("#menu-feedback").textContent = error.message;
  }
}

async function changeProductStock(id) {
  const product = menuProducts.find((item) => item.id === id);
  if (!product || menuSaving) return;
  menuSaving = true;
  ++menuRequest; // Ignore any catalogue read that started before this update.
  renderMenu();
  document.querySelector("#menu-feedback").textContent = "Enregistrement…";
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/catalog/${encodeURIComponent(id)}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ available: !product.enabled }) });
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Modification non enregistrée. Réessayez.");
    menuProducts = payload.products;
    const updated = menuProducts.find((item) => item.id === id);
    document.querySelector("#menu-feedback").textContent = `${updated.name} : ${updated.available ? "disponible" : "en rupture"}. Modification enregistrée.${updated.enabled && !updated.available ? ` ${updated.reason}` : ""}`;
  } catch (error) {
    document.querySelector("#menu-feedback").textContent = error.message || "Modification non enregistrée. Vérifiez votre connexion puis actualisez.";
  } finally {
    menuSaving = false;
    renderMenu();
    document.querySelector(`[data-stock-id="${id}"]`)?.focus();
  }
}

document.querySelector("#menu-search").addEventListener("input", renderMenu);
document.querySelector("#menu-filter").addEventListener("change", renderMenu);

function clearCustomerView() {
  customerData = null;
  selectedCustomerId = null;
  customerOffset = 0;
  ++customerRequest;
  ++customerDetailRequest;
  clearTimeout(customerSearchTimer);
  document.querySelector("#customer-list").innerHTML = "";
  document.querySelector("#customer-detail").innerHTML = '<p class="empty">Sélectionnez un client pour consulter sa fiche.</p>';
  for (const id of ["total", "plus", "referrals", "points"]) document.querySelector(`#customer-${id}`).textContent = "—";
  document.querySelector("#customer-search").value = "";
  document.querySelector("#customer-page").textContent = "";
  document.querySelector("#customer-previous").disabled = true;
  document.querySelector("#customer-next").disabled = true;
}
const customerDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium" }).format(new Date(value)) : "Non renseigné";
const customerNumber = (value) => Number(value || 0).toLocaleString("fr-FR");
const customerPrestige = (customer) => customer.prestige ? `Prestige ${customer.prestige.level} · ${customer.prestige.name}` : "En route vers le Prestige 1";

function renderCustomers() {
  if (!customerData) return;
  const { customers, summary, total, offset, limit } = customerData;
  for (const [key, value] of Object.entries({ total: summary.customers, plus: summary.bibouPlus, referrals: summary.validatedReferrals, points: summary.points })) document.querySelector(`#customer-${key}`).textContent = customerNumber(value);
  document.querySelector("#customer-list").innerHTML = customers.length ? customers.map((customer) => `<article class="customer-card ${customer.id === selectedCustomerId ? "selected" : ""}"><div class="customer-card-heading"><div><h3>${escapeHtml(customer.name)}</h3><p>${escapeHtml(customer.phone || "Téléphone non renseigné")}</p></div><strong class="customer-balance">${customerNumber(customer.points)}<small>points</small></strong></div><p class="customer-prestige">${escapeHtml(customerPrestige(customer))}${customer.bibouPlus.active ? '<span class="plus-label">Bibou +</span>' : ""}</p><p class="customer-card-meta">${customerNumber(customer.orders.count)} commande(s) payée(s) · ${customerNumber(customer.referrals.validated)} parrainage(s) validé(s)</p><button type="button" class="secondary-button" data-customer-id="${escapeHtml(customer.id)}" aria-label="Voir la fiche de ${escapeHtml(customer.name)}" aria-pressed="${customer.id === selectedCustomerId}">Voir la fiche →</button></article>`).join("") : '<p class="empty">Aucun client ne correspond à votre recherche.</p>';
  document.querySelector("#customer-page").textContent = total ? `${offset + 1}–${Math.min(offset + limit, total)} sur ${total}` : "0 résultat";
  document.querySelector("#customer-previous").disabled = offset <= 0;
  document.querySelector("#customer-next").disabled = offset + limit >= total;
  document.querySelectorAll("[data-customer-id]").forEach((button) => button.addEventListener("click", () => loadCustomerDetail(button.dataset.customerId, true)));
}

async function loadCustomers() {
  if (!dashboardToken || currentView !== "customers") return;
  const token = dashboardToken;
  const requestId = ++customerRequest;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const query = encodeURIComponent(document.querySelector("#customer-search").value.trim());
  const filter = encodeURIComponent(document.querySelector("#customer-filter").value || "all");
  document.querySelector("#customer-feedback").textContent = "Actualisation des clients…";
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/customers?q=${query}&filter=${filter}&offset=${customerOffset}&limit=10`, { headers: dashboardHeaders(), cache: "no-store", signal: controller.signal });
    if (requestId !== customerRequest || token !== dashboardToken || currentView !== "customers") return;
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error("Impossible de charger les clients. Cliquez sur Actualiser pour réessayer.");
    const payload = await response.json();
    if (requestId !== customerRequest || token !== dashboardToken || currentView !== "customers") return;
    customerData = payload;
    customerOffset = payload.offset;
    customerLastUpdate = Date.now();
    renderCustomers();
    document.querySelector("#customer-feedback").textContent = `À jour à ${new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })} · clients classés par points décroissants.`;
    if (selectedCustomerId) void loadCustomerDetail(selectedCustomerId);
  } catch (error) {
    if (requestId === customerRequest && token === dashboardToken && currentView === "customers") document.querySelector("#customer-feedback").textContent = `${error.name === "AbortError" ? "Le serveur ne répond pas. Réessayez avec Actualiser." : error.message} Les données précédentes peuvent être anciennes.`;
  } finally { clearTimeout(timeout); }
}

function renderCustomerDetail(payload, focus) {
  const { customer, rewards, recentOrders, favoriteProducts = [] } = payload;
  const next = customer.nextPrestige;
  const rewardLabels = { available: "À réclamer par le client", locked: "Palier non atteint", active: "À remettre", used: "Déjà utilisée", cancelled: "Annulée" };
  const historyStatuses = { ...statusLabel, delivered: "Terminée", cancelled: "Annulée" };
  const favorites = favoriteProducts.length ? `<div class="customer-favorites">${favoriteProducts.map((product, index) => `<div><span>${index === 0 ? "Préférence principale" : `Préférence ${index + 1}`}</span><strong>${escapeHtml(product.name)}</strong><small>${customerNumber(product.quantity)} article(s) dans ${customerNumber(product.orders)} commande(s)</small></div>`).join("")}</div>` : '<p class="menu-note">Pas encore assez de commandes détaillées pour identifier ses produits préférés.</p>';
  document.querySelector("#customer-detail").innerHTML = `<div class="customer-detail-header"><p class="eyebrow">FICHE CLIENT · CONSULTATION</p><h2 id="customer-detail-title" tabindex="-1">${escapeHtml(customer.name)}</h2><p>${escapeHtml(customer.phone || "Téléphone non renseigné")} · Inscription : ${customerDate(customer.createdAt)}</p></div><div class="customer-loyalty-panel"><strong>${customerNumber(customer.points)} points</strong><p>${escapeHtml(customerPrestige(customer))}${customer.prestige ? ` · ${escapeHtml(customer.prestige.metal)}` : ""}</p><small>${next ? `Encore ${customerNumber(next.points - customer.points)} points pour le Prestige ${next.level} · ${escapeHtml(next.name)}.` : "Le plus haut prestige est atteint."}</small></div><dl class="customer-facts"><div><dt>Bibou +</dt><dd>${customer.bibouPlus.active ? `Actif jusqu’au ${customerDate(customer.bibouPlus.expiresAt)}` : customer.bibouPlus.expiresAt ? `Expiré le ${customerDate(customer.bibouPlus.expiresAt)}` : "Pas d’abonnement actif"}</dd></div><div><dt>Cette semaine</dt><dd>${customerNumber(customer.weekly.orders)} commande(s) · multiplicateur ×${customer.weekly.multiplier}</dd></div><div><dt>Commandes payées non annulées</dt><dd>${customerNumber(customer.orders.count)} · ${euro(customer.orders.amount)}</dd></div></dl><h3>Produits préférés</h3>${favorites}<h3>Parrainages</h3><p class="customer-referral-code">Code personnel : <strong>${escapeHtml(customer.referralCode || "Pas encore attribué")}</strong></p><div class="customer-referral-counts"><div><strong>${customerNumber(customer.referrals.invited)}</strong><small>filleuls inscrits</small></div><div><strong>${customerNumber(customer.referrals.validated)}</strong><small>validés</small></div><div><strong>${customerNumber(customer.referrals.pending)}</strong><small>en attente</small></div></div><h3>Récompenses de palier</h3><div class="customer-rewards">${rewards.map((reward) => `<div class="customer-reward"><div><strong>${escapeHtml(reward.title)}</strong><small>${customerNumber(reward.points)} points${reward.status === "locked" ? ` · encore ${customerNumber(reward.remainingPoints)}` : ""}</small></div><span class="customer-reward-status ${["active", "available", "used", "cancelled", "locked"].includes(reward.status) ? reward.status : "locked"}">${rewardLabels[reward.status] || "À vérifier"}${reward.code ? `<strong>${escapeHtml(reward.code)}</strong>` : ""}</span></div>`).join("")}</div><p class="menu-note">Pour remettre une récompense déjà réclamée, utilisez la rubrique Récompenses et vérifiez son code. Les paliers ne consomment pas les points.</p><h3>Historique des commandes payées</h3><div class="customer-history">${recentOrders.length ? recentOrders.map((order) => customerOrderHistoryMarkup(order, historyStatuses)).join("") : '<p class="menu-note">Aucune commande payée pour ce client.</p>'}</div><p class="menu-note">Toutes les commandes payées restent consultables, y compris celles annulées ensuite.</p>`;
  if (focus) document.querySelector("#customer-detail-title")?.focus();
}

async function loadCustomerDetail(id, focus = false) {
  if (!dashboardToken || currentView !== "customers") return;
  const token = dashboardToken;
  const requestId = ++customerDetailRequest;
  selectedCustomerId = id;
  if (focus) { renderCustomers(); document.querySelector("#customer-detail").innerHTML = '<p class="empty">Chargement de la fiche…</p>'; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/customers/${encodeURIComponent(id)}`, { headers: dashboardHeaders(), cache: "no-store", signal: controller.signal });
    if (requestId !== customerDetailRequest || token !== dashboardToken || currentView !== "customers") return;
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error(response.status === 404 ? "Ce compte n’existe plus ou est introuvable." : "La fiche n’a pas pu être chargée. Réessayez avec Actualiser.");
    const payload = await response.json();
    if (requestId !== customerDetailRequest || token !== dashboardToken || currentView !== "customers") return;
    renderCustomerDetail(payload, focus);
  } catch (error) {
    if (requestId === customerDetailRequest && token === dashboardToken && currentView === "customers") document.querySelector("#customer-detail").innerHTML = `<p class="empty" role="status">${escapeHtml(error.name === "AbortError" ? "La fiche met trop de temps à arriver. Réessayez avec Actualiser." : error.message)}</p>`;
  } finally { clearTimeout(timeout); }
}
function searchCustomers() {
  ++customerRequest;
  ++customerDetailRequest;
  selectedCustomerId = null;
  customerOffset = 0;
  document.querySelector("#customer-detail").innerHTML = '<p class="empty">Sélectionnez un client pour consulter sa fiche.</p>';
  clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => { void loadCustomers(); }, 250);
}
document.querySelector("#customer-search").addEventListener("input", searchCustomers);
document.querySelector("#customer-filter").addEventListener("change", searchCustomers);
document.querySelector("#customer-previous").addEventListener("click", () => { customerOffset = Math.max(0, customerOffset - (customerData?.limit || 25)); void loadCustomers(); });
document.querySelector("#customer-next").addEventListener("click", () => { customerOffset += customerData?.limit || 25; void loadCustomers(); });

let backupBusy = false;
const backupDate = (value) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
async function loadBackups(create = false) {
  if (!dashboardToken || backupBusy) return;
  const token = dashboardToken;
  backupBusy = true;
  document.querySelector("#backup-create").disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/backups`, { method: create ? "POST" : "GET", headers: dashboardHeaders(), signal: controller.signal });
    if (token !== dashboardToken) return;
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Impossible de vérifier les sauvegardes.");
    document.querySelector("#backup-latest").textContent = payload.copies.length ? backupDate(payload.copies[0].createdAt) : "Aucune copie disponible";
    document.querySelector("#backup-health").textContent = payload.lastError || (payload.stale ? "Attention : aucune copie récente. Faites vérifier la sauvegarde." : "Copie récente disponible · sauvegarde automatique toutes les heures.");
    document.querySelector("#backup-health").classList.toggle("backup-warning", Boolean(payload.lastError || payload.stale));
    document.querySelector("#backup-list").innerHTML = payload.copies.length ? payload.copies.map((copy) => `<article class="backup-row"><div><strong>${escapeHtml(backupDate(copy.createdAt))}</strong><small>${Math.max(1, Math.ceil(copy.bytes / 1024))} Ko · fichier privé compressé</small></div><button type="button" class="secondary-button" data-backup-id="${escapeHtml(copy.id)}">Télécharger</button></article>`).join("") : '<p class="empty">Aucune copie enregistrée pour le moment.</p>';
    document.querySelectorAll("[data-backup-id]").forEach((button) => button.addEventListener("click", () => downloadBackup(button)));
    document.querySelector("#backup-feedback").textContent = create ? "Copie enregistrée et contrôle d’intégrité réussi." : "";
  } catch (error) {
    if (token === dashboardToken) {
      document.querySelector("#backup-health").textContent = "Vérification impossible : ne vous fiez pas au statut précédent.";
      document.querySelector("#backup-health").classList.add("backup-warning");
      document.querySelector("#backup-feedback").textContent = error.name === "AbortError" ? "Le serveur met trop de temps à répondre. Actualisez pour vérifier si la copie a été créée." : error.message;
    }
  } finally { clearTimeout(timeout); backupBusy = false; document.querySelector("#backup-create").disabled = false; }
}

async function downloadBackup(button) {
  const token = dashboardToken;
  button.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/backups/${encodeURIComponent(button.dataset.backupId)}`, { headers: dashboardHeaders(), signal: controller.signal });
    if (token !== dashboardToken) return;
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error((await response.json()).error || "Téléchargement impossible.");
    const blob = await response.blob();
    if (token !== dashboardToken) return;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = button.dataset.backupId;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    document.querySelector("#backup-feedback").textContent = "Téléchargement lancé. Vérifiez le fichier dans vos téléchargements et conservez-le dans un espace privé.";
  } catch (error) { document.querySelector("#backup-feedback").textContent = error.name === "AbortError" ? "Téléchargement trop lent. Réessayez." : error.message; }
  finally { clearTimeout(timeout); button.disabled = false; }
}
document.querySelector("#backup-create").addEventListener("click", () => loadBackups(true));

function showView(view) {
  if (!["home", "orders", "dispatch", "reservations", "rewards", "menu", "backups", "customers", "marketing", "promotions", "notifications", "marketing-sms", "crm", "settings", "schedule"].includes(view)) return showToast("Cette rubrique sera disponible prochainement.");
  currentView = view;
  document.querySelector('#home-view').hidden = view !== 'home';
  document.querySelector('#clients-subnav').hidden = !['customers','rewards'].includes(view);
  document.querySelector('#marketing-subnav').hidden = !['marketing','promotions','crm','notifications','marketing-sms'].includes(view);
  document.querySelector('#settings-subnav').hidden = !['settings','backups'].includes(view);
  document.querySelector("#schedule-view").hidden = view !== "schedule";
  document.querySelector("#dispatch-view").hidden = view !== "dispatch";
  document.querySelector("#orders-view").hidden = view !== "orders";
  document.querySelector("#orders-metrics").hidden = view !== "orders";
  document.querySelector("#reservations-view").hidden = view !== "reservations";
  document.querySelector("#rewards-view").hidden = view !== "rewards";
  document.querySelector("#menu-view").hidden = view !== "menu";
  document.querySelector("#backups-view").hidden = view !== "backups";
  document.querySelector("#customers-view").hidden = view !== "customers";
  document.querySelector("#marketing-view").hidden = view !== "marketing";
  document.querySelector("#promotions-view").hidden = view !== "promotions";
  document.querySelector("#notifications-view").hidden = view !== "notifications";
  document.querySelector("#marketing-sms-view").hidden = view !== "marketing-sms";
  document.querySelector("#crm-view").hidden = view !== "crm";
  document.querySelector("#settings-view").hidden = view !== "settings";
  document.querySelector("#dashboard-title").textContent = { home: 'Bonjour, l’équipe !', dispatch: 'Répartir les courses', schedule: "Ouvrir ou fermer mes créneaux", orders: "Chaque commande, étape par étape", reservations: "Vos tables, en un coup d’œil", rewards: "Les récompenses à remettre", menu: "Votre carte, simplement", backups: "Sauvegardes & sécurité", customers: "Vos clients & leur fidélité", marketing: "Donner envie de revenir", promotions: "Créer mes promotions", notifications: "Écrire à vos clients", crm: "Offres & statistiques", settings: "Votre restaurant, vos réglages" }[view];
  updateText('#view-description', {home:'Tout ce qui compte pour votre service, au même endroit.',dispatch:'Choisissez votre livreur et suivez chaque livraison ici.',orders:'Choisissez une commande. Sa prochaine étape est toujours visible.',reservations:'Une heure d’arrivée et une confirmation claire.',schedule:'Une date, un service, une heure. Vous gardez la main.',menu:'Un produit épuisé ? Rendez-le indisponible en un geste.',customers:'Retrouvez vos habitués, leurs points et leurs commandes.',rewards:'Le code du client vous permet de vérifier son avantage.',marketing:'Actualités, offres et messages : tout est réuni ici.',promotions:'Choisissez une idée, fixez ses règles et activez-la quand vous le souhaitez.',crm:'Des offres ciblées, avec un aperçu avant activation.',notifications:'Préparez votre message, puis vérifiez-le avant tout envoi.',settings:'Vos automatismes et vos connexions, au même endroit.',backups:'Gardez une copie privée des données de votre restaurant.'}[view]);
  document.querySelector("#refresh-orders").textContent = "↻ Actualiser";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const group = {rewards:'customers',promotions:'marketing',crm:'marketing',notifications:'marketing','marketing-sms':'marketing',backups:'settings'}[view] || view;
  document.querySelectorAll('.sidebar nav .nav-item, .mobile-view-switch .nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === group));
  if (view === "schedule") void schedulePanel?.load();
  if (view === "dispatch") void dispatchPanel?.load();
  if (view === "menu") { renderMenu(); void loadMenu(); }
  if (view === "backups") void loadBackups();
  if (view === "customers") void loadCustomers();
  if (view === "marketing") void marketingPanel?.load();
  if (view === "promotions") void promotionsPanel?.load();
  if (view === "notifications") void notificationsPanel?.load();
  if (view === 'marketing-sms') { document.querySelector('#dashboard-title').textContent = 'Écrire par SMS'; updateText('#view-description', 'Préparez votre message et confirmez sa facturation avant tout envoi.'); void smsPanel?.load(); }
  if (["crm", "settings"].includes(view)) void crmPanel?.load();
}

document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => showView(button.dataset.jump)));
document.addEventListener('click', event => { if (event.target.closest('[data-open-dispatch]')) showView('dispatch'); });
document.querySelector('#home-period').addEventListener('change', renderHome);
document.querySelector('#home-priority').addEventListener('click', () => {
  if (orders.some(order => order.status === 'Nouvelle')) document.querySelector('#attention-orders').click();
  else showView(reservations.some(table => table.status === 'pending') ? 'reservations' : 'orders');
});

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderOrders();
}));
document.querySelector('#archive-search').addEventListener('input', event => { archiveSearch = event.target.value; renderOrders(); });

document.querySelectorAll(".reservation-filter").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.rewardFilter) return;
  reservationFilter = button.dataset.reservationFilter;
  document.querySelectorAll(".reservation-filter").forEach((item) => item.classList.toggle("active", item === button));
  renderReservations();
}));

document.querySelectorAll(".reward-filter").forEach((button) => button.addEventListener("click", () => {
  rewardFilter = button.dataset.rewardFilter;
  document.querySelectorAll(".reward-filter").forEach((item) => item.classList.toggle("active", item === button));
  renderRewardClaims();
}));

async function activateServiceSound() {
  const ready = await ensureServiceSound({ staffGesture: true });
  updateSoundControls();
  if (!ready) updateText("#sound-status", "🔕 Son bloqué : vérifiez le volume de l'appareil et l'autorisation audio du navigateur.");
}
document.querySelector('#enable-alerts-button').addEventListener('click', activateServiceSound);
document.querySelector('#view-alarm-orders').addEventListener('click', () => { selectedOrderId = orders.find(order => order.status === 'Nouvelle')?.apiId || null; document.querySelector('#attention-orders').click(); document.querySelector('#orders-view').scrollIntoView?.({block:'start'}); });
// The browser may require a genuine gesture after loading or suspending the page.
function unlockServiceSound(event) {
  if (!dashboardToken || soundPlayer.state().ready) return;
  if (event.target?.closest?.('#enable-alerts-button')) return;
  void ensureServiceSound({ staffGesture: true });
}
// A normal click unlocks audio after its target has been activated, so hiding
// the warning cannot move the target before the tap completes on an iPad.
// Keep the fallback button for browsers that insist on a dedicated gesture.
document.addEventListener('click', unlockServiceSound);
document.addEventListener('keydown', unlockServiceSound);
document.querySelectorAll(".attention-links button").forEach((button) => button.addEventListener("click", () => {
  const view = button.id.replace("attention-", "");
  if (view === "orders") {
    filter = "Nouvelle";
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === filter));
    renderOrders();
  } else if (view === "reservations") {
    reservationFilter = "upcoming";
    document.querySelectorAll("[data-reservation-filter]").forEach((item) => item.classList.toggle("active", item.dataset.reservationFilter === reservationFilter));
    renderReservations();
  } else {
    rewardFilter = "active";
    document.querySelectorAll(".reward-filter").forEach((item) => item.classList.toggle("active", item.dataset.rewardFilter === rewardFilter));
    renderRewardClaims();
  }
  showView(view);
}));

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelector("#refresh-orders").addEventListener("click", async () => {
  if (["crm", "settings"].includes(currentView)) return crmPanel?.load();
  if (currentView === "schedule") return schedulePanel?.load();
  if (currentView === "dispatch") return dispatchPanel?.load();
  if (currentView === "marketing") return marketingPanel?.load();
  if (currentView === "notifications") return notificationsPanel?.load();
  if (currentView === 'marketing-sms') return smsPanel?.load();
  if (currentView === "customers") return loadCustomers();
  if (currentView === "backups") return loadBackups();
  if (currentView === "menu") return loadMenu();
  const results = await refreshFeeds();
  if (dashboardToken) showToast(results.every(Boolean) ? "Demandes actualisées." : "Actualisation incomplète. Vérifiez la connexion.");
});
document.querySelector("#dashboard-login").addEventListener("click", async () => {
  void soundPlayer.activate();
  const button = document.querySelector("#dashboard-login");
  const password = document.querySelector("#dashboard-password").value;
  document.querySelector("#login-error").textContent = "";
  button.disabled = true;
  button.textContent = "Connexion…";
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Connexion impossible.");
    dashboardToken = payload.token;
    saveDashboardToken(dashboardToken);
    showDashboard();
    void refreshFeeds({ notify: false });
    if (currentView === "menu") loadMenu();
    if (currentView === "backups") loadBackups();
    if (currentView === "customers") loadCustomers();
    if (currentView === "schedule") return schedulePanel?.load();
  if (currentView === "marketing") marketingPanel?.load();
    if (currentView === "promotions") promotionsPanel?.load();
    if (currentView === "dispatch") dispatchPanel?.load();
    if (currentView === "notifications") notificationsPanel?.load();
    if (currentView === 'marketing-sms') smsPanel?.load();
    if (["crm", "settings"].includes(currentView)) crmPanel?.load();
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Accéder aux commandes"; }
});
document.querySelector("#dashboard-password").addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#dashboard-login").click(); });

if (typeof window.BibouMarketing === 'function') marketingPanel = window.BibouMarketing({ root: document.querySelector('#marketing-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouPromotions === 'function') promotionsPanel = window.BibouPromotions({ root: document.querySelector('#promotions-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouNotifications === 'function') notificationsPanel = window.BibouNotifications({ root: document.querySelector('#notifications-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouMarketingSms === 'function') smsPanel = window.BibouMarketingSms({ root: document.querySelector('#marketing-sms-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouSchedule === 'function') schedulePanel = window.BibouSchedule({root:document.querySelector('#schedule-view'),api:API_BASE_URL,token:()=>dashboardToken,onUnauthorized:showLogin});
if (window.BibouDispatch?.create) dispatchPanel = window.BibouDispatch.create({root:document.querySelector('#dispatch-view'),api:API_BASE_URL,token:()=>dashboardToken,onUnauthorized:()=>showLogin('Session expirée. Reconnectez-vous.'),onOrdersChanged:()=>loadOrders(),getOrder:id=>orders.find(order=>order.apiId===id)});
if (typeof window.BibouCrm === 'function') crmPanel = window.BibouCrm({ root: document.querySelector('#crm-view'), settingsRoot: document.querySelector('#settings-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.'), onLogout: logoutDashboard });
refreshMetrics();
updateSoundControls();
updateConnectionStatus();
document.querySelector("#service-date-heading").textContent = todayHeading();
renderOrders();
renderReservations();
renderRewardClaims();
showView('home');
if (dashboardToken) { showDashboard(); void ensureServiceSound(); void refreshFeeds({ notify: false }); } else { showLogin(); }
const resumeUpdates = () => {
  if (!dashboardToken) return;
  updateConnectionStatus();
  updateSoundControls();
  if (!soundPlayer.state().ready && !document.hidden) void ensureServiceSound();
  orderAlarm.refresh();
  void refreshFeeds();
  if (currentView === "menu") void loadMenu();
  if (currentView === "backups" && !document.hidden) void loadBackups();
  if (currentView === "customers" && !document.hidden && Date.now() - customerLastUpdate >= 30000) void loadCustomers();
  if (currentView === "dispatch" && !document.hidden) void dispatchPanel?.load();
};
window.setInterval(resumeUpdates, 10000);
window.addEventListener("online", resumeUpdates);
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("focus", resumeUpdates);
document.addEventListener("visibilitychange", () => { if (!document.hidden) resumeUpdates(); });
