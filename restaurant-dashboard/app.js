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
let filter = "all";
let reservationFilter = "upcoming";
let rewardFilter = "active";
let soundOn = true;
let currentView = "orders";
let dashboardToken = sessionStorage.getItem("bibous-dashboard-token") || "";
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
const showLogin = (message = "") => { dashboardToken = ""; sessionStorage.removeItem("bibous-dashboard-token"); document.querySelector("#dashboard-app").hidden = true; document.querySelector("#login-screen").hidden = false; document.querySelector("#login-error").textContent = message; };
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

async function loadOrders({ notify = false } = {}) {
  if (!API_BASE_URL) return;
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/orders`, { headers: dashboardHeaders() });
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error("Chargement impossible");
    const payload = await response.json();
    const nextOrders = payload.orders.map(orderFromApi);
    const hadNewOrder = orders.length && nextOrders.some((order) => !orders.some((current) => current.apiId === order.apiId) && order.status === "Nouvelle");
    orders = nextOrders;
    refreshMetrics();
    renderOrders();
    if (notify && hadNewOrder && soundOn) showToast("Nouvelle commande reçue !");
  } catch {
    showToast("Impossible de joindre les commandes pour le moment.");
  }
}

async function loadReservations({ notify = false } = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reservations`, { headers: dashboardHeaders() });
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error("Chargement impossible");
    const payload = await response.json();
    const nextReservations = payload.reservations.map(reservationFromApi);
    const hasNewReservation = reservations.length && nextReservations.some((reservation) => !reservations.some((current) => current.apiId === reservation.apiId) && reservation.status === "pending");
    reservations = nextReservations;
    refreshMetrics();
    renderReservations();
    if (notify && hasNewReservation && soundOn) showToast("Nouvelle réservation reçue !");
  } catch {
    showToast("Impossible de joindre les réservations pour le moment.");
  }
}

async function loadRewardClaims({ notify = false } = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/reward-claims`, { headers: dashboardHeaders() });
    if (response.status === 401) return showLogin("Votre session a expiré. Connectez-vous à nouveau.");
    if (!response.ok) throw new Error("Chargement impossible");
    const payload = await response.json();
    const nextClaims = payload.claims.map(rewardClaimFromApi);
    const hasNewClaim = rewardClaims.length && nextClaims.some((claim) => !rewardClaims.some((current) => current.apiId === claim.apiId) && claim.status === "active");
    rewardClaims = nextClaims;
    refreshMetrics();
    renderRewardClaims();
    if (notify && hasNewClaim && soundOn) showToast("Nouvelle récompense réclamée !");
  } catch {
    showToast("Impossible de joindre les récompenses pour le moment.");
  }
}

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

function showView(view) {
  if (!["orders", "reservations", "rewards", "menu"].includes(view)) return showToast("Cette rubrique sera disponible prochainement.");
  currentView = view;
  document.querySelector("#orders-view").hidden = view !== "orders";
  document.querySelector("#orders-metrics").hidden = view !== "orders";
  document.querySelector("#reservations-view").hidden = view !== "reservations";
  document.querySelector("#rewards-view").hidden = view !== "rewards";
  document.querySelector("#menu-view").hidden = view !== "menu";
  document.querySelector("#dashboard-title").textContent = { orders: "Commandes en direct", reservations: "Réservations de tables", rewards: "Récompenses clients", menu: "Carte & disponibilité" }[view];
  document.querySelector("#refresh-orders").textContent = "↻ Actualiser";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "menu") { renderMenu(); void loadMenu(); }
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

document.querySelector("#sound-button").addEventListener("click", (event) => {
  soundOn = !soundOn;
  event.currentTarget.textContent = soundOn ? "🔔 Son activé" : "🔕 Son désactivé";
  event.currentTarget.style.color = soundOn ? "" : "#806e65";
});

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelector("#refresh-orders").addEventListener("click", async () => { if (currentView === "menu") return loadMenu(); if (currentView === "orders") { await loadOrders(); showToast("Commandes actualisées."); } else if (currentView === "reservations") { await loadReservations(); showToast("Réservations actualisées."); } else { await loadRewardClaims(); showToast("Récompenses actualisées."); } });
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
    loadOrders();
    loadReservations();
    loadRewardClaims();
    if (currentView === "menu") loadMenu();
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Accéder aux commandes"; }
});
document.querySelector("#dashboard-password").addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#dashboard-login").click(); });

refreshMetrics();
document.querySelector("#service-date-heading").textContent = todayHeading();
renderOrders();
renderReservations();
renderRewardClaims();
if (dashboardToken) { showDashboard(); loadOrders(); loadReservations(); loadRewardClaims(); } else { showLogin(); }
window.setInterval(() => { if (dashboardToken) { loadOrders({ notify: true }); loadReservations({ notify: true }); loadRewardClaims({ notify: true }); if (currentView === "menu") loadMenu(); } }, 10000);
