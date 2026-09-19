const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3001/api" : "https://bibous-burger.onrender.com/api";
const statusLabel = { confirmed: "Nouvelle", preparing: "Acceptée", ready: "Prête", out_for_delivery: "En livraison", delivered: "Terminée", cancelled: "Refusée" };
const statusForLabel = Object.fromEntries(Object.entries(statusLabel).map(([key, value]) => [value, key]));
const reservationStatusLabel = { pending: "À confirmer", confirmed: "Confirmée", cancelled: "Refusée" };
const rewardStatusLabel = { active: "À remettre", used: "Utilisée", cancelled: "Annulée" };
let orders = [];
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
let reservationFilter = "upcoming";
let rewardFilter = "active";
const arrivalTracker = BibouAlerts.createArrivalTracker();
const feedRequests = new Map();
const feedHealth = Object.fromEntries(["orders", "reservations", "rewards"].map((kind) => [kind, { lastSuccess: 0, error: false }]));
const queuedArrivals = new Map();
let arrivalTimer = null;
const savedSoundPreference = () => { try { return localStorage.getItem("bibous-restaurant-sound") !== "off"; } catch { return true; } };
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const soundPlayer = BibouAlerts.createSoundPlayer({ createContext: AudioContextClass ? () => new AudioContextClass() : null, enabled: savedSoundPreference(), onChange: updateSoundControls });
let currentView = "orders";
let dashboardToken = sessionStorage.getItem("bibous-dashboard-token") || "";
let marketingPanel = null;
let notificationsPanel = null;
let crmPanel = null;
const euro = (number) => `${Number(number).toFixed(2).replace(".", ",")} €`;
const serviceDateLabel = (value) => value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "Date non précisée";
const receivedTimeLabel = (value) => value ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const todayDateKey = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayHeading = () => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const active = () => orders.filter((order) => !["Terminée", "Refusée"].includes(order.status));
const showToast = (message) => { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2600); };
const dashboardHeaders = (extra = {}) => ({ ...extra, Authorization: `Bearer ${dashboardToken}` });
const showLogin = (message = "") => { dashboardToken = ""; clearCustomerView(); marketingPanel?.clear(); notificationsPanel?.clear(); crmPanel?.clear(); sessionStorage.removeItem("bibous-dashboard-token"); soundPlayer.stop(); clearTimeout(arrivalTimer); queuedArrivals.clear(); document.title = "Bibou's Burgers — Espace restaurant"; document.querySelector("#dashboard-app").hidden = true; document.querySelector("#login-screen").hidden = false; document.querySelector("#login-error").textContent = message; };
const showDashboard = () => { document.querySelector("#login-screen").hidden = true; document.querySelector("#dashboard-app").hidden = false; };

function orderFromApi(order) {
  const created = new Date(order.createdAt);
  const minutes = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
  return { id: order.number, apiId: order.id, customer: order.customerName, age: minutes < 1 ? "À l’instant" : `Il y a ${minutes} min`, type: order.method === "delivery" ? "Livraison" : "Retrait", slot: `${serviceDateLabel(order.serviceDate)} · ${order.slot}`, total: order.total, items: order.items, status: statusLabel[order.status] || "Nouvelle" };
}

function reservationFromApi(reservation) {
  return { id: reservation.number, apiId: reservation.id, customer: reservation.customerName, phone: reservation.phone, guests: reservation.guests, serviceDate: reservation.serviceDate, date: serviceDateLabel(reservation.serviceDate), slot: reservation.slot, note: reservation.note || "", status: reservation.status, receivedAt: receivedTimeLabel(reservation.createdAt) };
}

function rewardClaimFromApi(claim) {
  return { id: claim.number, apiId: claim.id, code: claim.code, customer: claim.customerName || "Client Bibou", title: claim.rewardTitle, points: claim.requiredPoints, status: claim.status, receivedAt: receivedTimeLabel(claim.createdAt) };
}

function actionMarkup(order) {
  if (order.status === "Nouvelle") return `<div class="actions"><button class="reject" data-action="Refusée" data-id="${order.id}">Annuler</button><button class="accept" data-action="Acceptée" data-id="${order.id}">Accepter</button></div>`;
  if (order.status === "Acceptée") return `<div class="actions"><button class="advance" data-action="Prête" data-id="${order.id}">Marquer prête</button></div>`;
  if (order.status === "Prête") return `<div class="actions"><button class="advance ready" data-action="En livraison" data-id="${order.id}">${order.type === "Livraison" ? "Confier au livreur" : "Remettre au client"}</button></div>`;
  return `<div class="actions"><button class="advance delivery" data-action="Terminée" data-id="${order.id}">Terminer la commande</button></div>`;
}

function renderOrders() {
  const visible = active().filter((order) => filter === "all" || order.status === filter);
  document.querySelector("#orders-list").innerHTML = visible.length ? visible.map((order) => {
    const lines = order.items.map((item) => `<div class="order-line"><strong>${item.quantity > 1 ? `${Number(item.quantity)} × ` : ""}${escapeHtml(item.name)}</strong>${item.options?.length ? `<small>${item.options.map((option) => escapeHtml(option.label)).join(" · ")}</small>` : ""}</div>`).join("");
    return `<article class="order-card ${order.status === "Nouvelle" ? "new" : ""}"><div class="order-head"><div><div class="order-id">#${Number(order.id)} · ${escapeHtml(order.customer)}</div><div class="order-meta">${escapeHtml(order.age)} · ${escapeHtml(order.type)}</div></div><span class="status ${escapeHtml(order.status.replace(" ", "-"))}">${escapeHtml(order.status)}</span></div><div class="order-items">${lines}</div><div class="order-bottom"><div class="order-details">🕒 ${escapeHtml(order.slot)}<span class="order-total">${euro(order.total)}</span></div>${actionMarkup(order)}</div></article>`;
  }).join("") : `<div class="empty">🍔<strong>Aucune commande ici</strong>Les nouvelles commandes apparaîtront dès leur réception.</div>`;
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => changeOrder(Number(button.dataset.id), button.dataset.action)));
}

function refreshMetrics() {
  const current = active();
  const newOrders = current.filter((order) => order.status === "Nouvelle");
  const ready = current.filter((order) => order.status === "Prête");
  const revenue = orders.filter((order) => order.status !== "Refusée").reduce((total, order) => total + order.total, 0);
  document.querySelector("#active-count").textContent = current.length;
  document.querySelector("#new-count").textContent = newOrders.length;
  document.querySelector("#ready-count").textContent = ready.length;
  document.querySelector("#turnover").textContent = euro(revenue);
  document.querySelector("#new-order-count").textContent = newOrders.length;
  document.querySelector("#all-filter-count").textContent = current.length;
  document.querySelector("#new-filter-count").textContent = newOrders.length;
  const pendingReservations = reservations.filter((reservation) => reservation.status === "pending").length;
  document.querySelector("#new-reservation-count").textContent = pendingReservations;
  document.querySelector("#new-reservation-count-mobile").textContent = pendingReservations;
  document.querySelector("#pending-reservation-count").textContent = pendingReservations;
  const activeRewards = rewardClaims.filter((claim) => claim.status === "active").length;
  document.querySelector("#new-reward-count").textContent = activeRewards;
  document.querySelector("#new-reward-count-mobile").textContent = activeRewards;
  document.querySelector("#active-reward-count").textContent = activeRewards;
  updateAttention(newOrders.length, pendingReservations, activeRewards);
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
  updateText("#sound-button", !state.supported ? "Son non disponible" : state.ready ? "Couper le son" : state.enabled ? "Activer le son" : "Son coupé · Activer");
  document.querySelector("#sound-button").disabled = !state.supported;
  document.querySelector("#sound-button").setAttribute("aria-pressed", String(state.ready));
  document.querySelector("#sound-button").classList.toggle("sound-ready", Boolean(state.ready));
  document.querySelector("#test-sound-button").disabled = !state.ready;
  updateText("#sound-status", !state.supported ? "Ce navigateur ne permet pas le son. Les alertes visuelles restent actives." : state.ready ? "Son activé · commandes, réservations et récompenses." : !state.enabled ? "Son coupé. Les alertes visuelles restent actives." : "Cliquez sur Activer le son pour autoriser les alertes dans cet onglet.");
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
    for (const type of queuedArrivals.keys()) soundPlayer.play(type);
    queuedArrivals.clear();
  }, 250);
}

function reservationActions(reservation) {
  if (reservation.status === "pending") return `<div class="actions"><button class="cancel-reservation" data-reservation-action="cancelled" data-id="${escapeHtml(reservation.apiId)}">Refuser</button><button class="confirm-reservation" data-reservation-action="confirmed" data-id="${escapeHtml(reservation.apiId)}">Accepter la table</button></div>`;
  if (reservation.status === "confirmed") return `<div class="actions"><button class="cancel-reservation" data-reservation-action="cancelled" data-id="${escapeHtml(reservation.apiId)}">Annuler la réservation</button></div>`;
  return "";
}

function renderReservations() {
  const today = todayDateKey();
  const visible = reservations.filter((reservation) => reservationFilter === "all" || (reservationFilter === "today" ? reservation.serviceDate === today : reservation.serviceDate >= today && reservation.status !== "cancelled"));
  const sorted = [...visible].sort((a, b) => ((a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1)) || `${a.serviceDate} ${a.slot}`.localeCompare(`${b.serviceDate} ${b.slot}`));
  document.querySelector("#reservations-list").innerHTML = sorted.length ? sorted.map((reservation) => `<article class="reservation-card ${escapeHtml(reservation.status)}"><div class="reservation-grid"><div><div class="reservation-name">Réservation #${reservation.id} · ${escapeHtml(reservation.customer)}</div><div class="reservation-phone">☎ ${escapeHtml(reservation.phone)}${reservation.receivedAt ? ` · Reçue à ${escapeHtml(reservation.receivedAt)}` : ""}</div></div><div><div class="reservation-when">${escapeHtml(reservation.date)} · ${escapeHtml(reservation.slot)}</div><div class="reservation-guests">${reservation.guests} personne${reservation.guests > 1 ? "s" : ""}</div></div><div><span class="status ${escapeHtml(reservation.status)}">${reservationStatusLabel[reservation.status] || "À confirmer"}</span></div></div>${reservation.note ? `<p class="reservation-note">Note : ${escapeHtml(reservation.note)}</p>` : ""}${reservationActions(reservation)}</article>`).join("") : `<div class="empty">🍽<strong>Aucune réservation</strong>Les demandes de table apparaîtront ici.</div>`;
  document.querySelectorAll("[data-reservation-action]").forEach((button) => button.addEventListener("click", () => changeReservation(button.dataset.id, button.dataset.reservationAction)));
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
      if (kind === "orders") { orders = items.filter((item) => item.payment?.status === "PAID" && Object.hasOwn(statusLabel, item.status)).map(orderFromApi); renderOrders(); }
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
  if (!order) return;
  if (status === "Refusée" && !window.confirm(`La commande #${id} a déjà été réglée. Confirmez son annulation uniquement après avoir organisé le remboursement dans SumUp.`)) return;
  const previousStatus = order.status;
  order.status = status;
  refreshMetrics();
  renderOrders();
  try {
    if (!API_BASE_URL || !order.apiId) throw new Error("API indisponible");
    const response = await fetch(`${API_BASE_URL}/dashboard/orders/${order.apiId}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: statusForLabel[status] }) });
    if (!response.ok) throw new Error("Mise à jour impossible");
    const messages = { Acceptée: `Commande #${id} acceptée.`, Refusée: `Commande #${id} annulée. Pensez à effectuer le remboursement dans SumUp.`, Prête: `Commande #${id} est prête.`, "En livraison": `Commande #${id} confiée au livreur.`, Terminée: `Commande #${id} terminée.` };
    showToast(messages[status]);
  } catch {
    order.status = previousStatus;
    refreshMetrics();
    renderOrders();
    showToast("La mise à jour n’a pas été enregistrée.");
  }
}

async function changeReservation(id, status) {
  const reservation = reservations.find((item) => item.apiId === id);
  if (!reservation) return;
  if (status === "cancelled" && !window.confirm("Confirmez-vous le refus ou l’annulation de cette réservation ?")) return;
  const previousStatus = reservation.status;
  reservation.status = status;
  refreshMetrics();
  renderReservations();
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reservations/${encodeURIComponent(id)}`, { method: "PATCH", headers: dashboardHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Mise à jour impossible");
    showToast(status === "confirmed" ? `Réservation #${reservation.id} confirmée.` : `Réservation #${reservation.id} annulée.`);
  } catch {
    reservation.status = previousStatus;
    refreshMetrics();
    renderReservations();
    showToast("La mise à jour n’a pas été enregistrée.");
  }
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
  const categories = { menus: "Nos menus", burgers: "Nos burgers", snacks: "Petites faims", drinks: "Boissons" };
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
  const { customer, rewards, recentOrders } = payload;
  const next = customer.nextPrestige;
  const rewardLabels = { available: "À réclamer par le client", locked: "Palier non atteint", active: "À remettre", used: "Déjà utilisée", cancelled: "Annulée" };
  const historyStatuses = { ...statusLabel, delivered: "Terminée", cancelled: "Annulée" };
  document.querySelector("#customer-detail").innerHTML = `<div class="customer-detail-header"><p class="eyebrow">FICHE CLIENT · CONSULTATION</p><h2 id="customer-detail-title" tabindex="-1">${escapeHtml(customer.name)}</h2><p>${escapeHtml(customer.phone || "Téléphone non renseigné")} · Inscription : ${customerDate(customer.createdAt)}</p></div><div class="customer-loyalty-panel"><strong>${customerNumber(customer.points)} points</strong><p>${escapeHtml(customerPrestige(customer))}${customer.prestige ? ` · ${escapeHtml(customer.prestige.metal)}` : ""}</p><small>${next ? `Encore ${customerNumber(next.points - customer.points)} points pour le Prestige ${next.level} · ${escapeHtml(next.name)}.` : "Le plus haut prestige est atteint."}</small></div><dl class="customer-facts"><div><dt>Bibou +</dt><dd>${customer.bibouPlus.active ? `Actif jusqu’au ${customerDate(customer.bibouPlus.expiresAt)}` : customer.bibouPlus.expiresAt ? `Expiré le ${customerDate(customer.bibouPlus.expiresAt)}` : "Pas d’abonnement actif"}</dd></div><div><dt>Cette semaine</dt><dd>${customerNumber(customer.weekly.orders)} commande(s) · multiplicateur ×${customer.weekly.multiplier}</dd></div><div><dt>Commandes payées non annulées</dt><dd>${customerNumber(customer.orders.count)} · ${euro(customer.orders.amount)}</dd></div></dl><h3>Parrainages</h3><p class="customer-referral-code">Code personnel : <strong>${escapeHtml(customer.referralCode || "Pas encore attribué")}</strong></p><div class="customer-referral-counts"><div><strong>${customerNumber(customer.referrals.invited)}</strong><small>filleuls inscrits</small></div><div><strong>${customerNumber(customer.referrals.validated)}</strong><small>validés</small></div><div><strong>${customerNumber(customer.referrals.pending)}</strong><small>en attente</small></div></div><h3>Récompenses de palier</h3><div class="customer-rewards">${rewards.map((reward) => `<div class="customer-reward"><div><strong>${escapeHtml(reward.title)}</strong><small>${customerNumber(reward.points)} points${reward.status === "locked" ? ` · encore ${customerNumber(reward.remainingPoints)}` : ""}</small></div><span class="customer-reward-status ${["active", "available", "used", "cancelled", "locked"].includes(reward.status) ? reward.status : "locked"}">${rewardLabels[reward.status] || "À vérifier"}${reward.code ? `<strong>${escapeHtml(reward.code)}</strong>` : ""}</span></div>`).join("")}</div><p class="menu-note">Pour remettre une récompense déjà réclamée, utilisez la rubrique Récompenses et vérifiez son code. Les paliers ne consomment pas les points.</p><h3>Dernières commandes payées</h3><div class="customer-history">${recentOrders.length ? recentOrders.map((order) => `<div><span><strong>#${Number(order.number)} · ${customerDate(order.paidAt)}</strong><small>${escapeHtml(historyStatuses[order.status] || order.status)} · ${order.method === "delivery" ? "Livraison" : "Retrait"}</small></span><strong>${euro(order.total)}</strong></div>`).join("") : '<p class="menu-note">Aucune commande payée pour ce client.</p>'}</div><p class="menu-note">Les 10 dernières commandes payées sont affichées, y compris celles annulées ensuite.</p>`;
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
  if (!["orders", "reservations", "rewards", "menu", "backups", "customers", "marketing", "notifications", "crm", "settings"].includes(view)) return showToast("Cette rubrique sera disponible prochainement.");
  currentView = view;
  document.querySelector("#orders-view").hidden = view !== "orders";
  document.querySelector("#orders-metrics").hidden = view !== "orders";
  document.querySelector("#reservations-view").hidden = view !== "reservations";
  document.querySelector("#rewards-view").hidden = view !== "rewards";
  document.querySelector("#menu-view").hidden = view !== "menu";
  document.querySelector("#backups-view").hidden = view !== "backups";
  document.querySelector("#customers-view").hidden = view !== "customers";
  document.querySelector("#marketing-view").hidden = view !== "marketing";
  document.querySelector("#notifications-view").hidden = view !== "notifications";
  document.querySelector("#crm-view").hidden = view !== "crm";
  document.querySelector("#settings-view").hidden = view !== "settings";
  document.querySelector("#dashboard-title").textContent = { orders: "Commandes en direct", reservations: "Réservations de tables", rewards: "Récompenses clients", menu: "Carte & disponibilité", backups: "Sauvegardes & sécurité", customers: "Fidélité clients", marketing: "Actualités & concours", notifications: "Notifications clients", crm: "CRM marketing & statistiques", settings: "Paramètres" }[view];
  document.querySelector("#refresh-orders").textContent = "↻ Actualiser";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "menu") { renderMenu(); void loadMenu(); }
  if (view === "backups") void loadBackups();
  if (view === "customers") void loadCustomers();
  if (view === "marketing") void marketingPanel?.load();
  if (view === "notifications") void notificationsPanel?.load();
  if (["crm", "settings"].includes(view)) void crmPanel?.load();
}

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderOrders();
}));

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

document.querySelector("#sound-button").addEventListener("click", async (event) => {
  const enable = !soundPlayer.state().ready;
  event.currentTarget.disabled = true;
  const ready = await soundPlayer.setEnabled(enable);
  try { localStorage.setItem("bibous-restaurant-sound", enable ? "on" : "off"); } catch { /* Private browsing may block storage. */ }
  updateSoundControls();
  if (ready) soundPlayer.play("orders");
  else if (enable) updateText("#sound-status", "Le son est bloqué par le navigateur. Cliquez à nouveau sur Activer le son ou vérifiez les autorisations du site.");
});
document.querySelector("#test-sound-button").addEventListener("click", () => {
  const played = soundPlayer.play("orders");
  updateSoundControls();
  updateText("#sound-status", played ? "Son de test lancé. Si vous n’entendez rien, vérifiez le volume et la sortie audio du Mac." : "Le son n’est pas prêt. Cliquez sur Activer le son.");
});
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
  if (currentView === "marketing") return marketingPanel?.load();
  if (currentView === "notifications") return notificationsPanel?.load();
  if (currentView === "customers") return loadCustomers();
  if (currentView === "backups") return loadBackups();
  if (currentView === "menu") return loadMenu();
  const results = await refreshFeeds();
  if (dashboardToken) showToast(results.every(Boolean) ? "Demandes actualisées." : "Actualisation incomplète. Vérifiez la connexion.");
});
document.querySelector("#dashboard-login").addEventListener("click", async () => {
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
    sessionStorage.setItem("bibous-dashboard-token", dashboardToken);
    showDashboard();
    void refreshFeeds({ notify: false });
    if (currentView === "menu") loadMenu();
    if (currentView === "backups") loadBackups();
    if (currentView === "customers") loadCustomers();
    if (currentView === "marketing") marketingPanel?.load();
    if (currentView === "notifications") notificationsPanel?.load();
    if (["crm", "settings"].includes(currentView)) crmPanel?.load();
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Accéder aux commandes"; }
});
document.querySelector("#dashboard-password").addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#dashboard-login").click(); });

if (typeof window.BibouMarketing === 'function') marketingPanel = window.BibouMarketing({ root: document.querySelector('#marketing-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouNotifications === 'function') notificationsPanel = window.BibouNotifications({ root: document.querySelector('#notifications-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.') });
if (typeof window.BibouCrm === 'function') crmPanel = window.BibouCrm({ root: document.querySelector('#crm-view'), settingsRoot: document.querySelector('#settings-view'), api: API_BASE_URL, token: () => dashboardToken, onUnauthorized: () => showLogin('Session expirée. Reconnectez-vous.'), onLogout: () => showLogin('Vous êtes déconnecté de cet onglet.') });
refreshMetrics();
updateSoundControls();
updateConnectionStatus();
document.querySelector("#service-date-heading").textContent = todayHeading();
renderOrders();
renderReservations();
renderRewardClaims();
if (dashboardToken) { showDashboard(); void refreshFeeds({ notify: false }); } else { showLogin(); }
const resumeUpdates = () => {
  if (!dashboardToken) return;
  updateConnectionStatus();
  updateSoundControls();
  void refreshFeeds();
  if (currentView === "menu") void loadMenu();
  if (currentView === "backups" && !document.hidden) void loadBackups();
  if (currentView === "customers" && !document.hidden && Date.now() - customerLastUpdate >= 30000) void loadCustomers();
};
window.setInterval(resumeUpdates, 10000);
window.addEventListener("online", resumeUpdates);
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("focus", resumeUpdates);
document.addEventListener("visibilitychange", () => { if (!document.hidden) resumeUpdates(); });
