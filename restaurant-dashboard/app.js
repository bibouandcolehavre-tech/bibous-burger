const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3001/api" : "https://bibous-burger.onrender.com/api";
const statusLabel = { confirmed: "Nouvelle", preparing: "Acceptée", ready: "Prête", out_for_delivery: "En livraison", delivered: "Terminée", cancelled: "Refusée" };
const statusForLabel = Object.fromEntries(Object.entries(statusLabel).map(([key, value]) => [value, key]));
const reservationStatusLabel = { pending: "À confirmer", confirmed: "Confirmée", cancelled: "Refusée" };
let orders = [];
let reservations = [];
let filter = "all";
let reservationFilter = "upcoming";
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
  return { id: order.number, apiId: order.id, customer: order.customerName, age: minutes < 1 ? "À l’instant" : `Il y a ${minutes} min`, type: order.method === "delivery" ? "Livraison" : "Retrait", slot: `${serviceDateLabel(order.serviceDate)} · ${order.slot}`, total: order.total, items: order.items.map((item) => item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name).join(" · "), status: statusLabel[order.status] || "Nouvelle" };
}

function reservationFromApi(reservation) {
  return { id: reservation.number, apiId: reservation.id, customer: reservation.customerName, phone: reservation.phone, guests: reservation.guests, serviceDate: reservation.serviceDate, date: serviceDateLabel(reservation.serviceDate), slot: reservation.slot, note: reservation.note || "", status: reservation.status, receivedAt: receivedTimeLabel(reservation.createdAt) };
}

function actionMarkup(order) {
  if (order.status === "Nouvelle") return `<div class="actions"><button class="reject" data-action="Refusée" data-id="${order.id}">Annuler</button><button class="accept" data-action="Acceptée" data-id="${order.id}">Accepter</button></div>`;
  if (order.status === "Acceptée") return `<div class="actions"><button class="advance" data-action="Prête" data-id="${order.id}">Marquer prête</button></div>`;
  if (order.status === "Prête") return `<div class="actions"><button class="advance ready" data-action="En livraison" data-id="${order.id}">${order.type === "Livraison" ? "Confier au livreur" : "Remettre au client"}</button></div>`;
  return `<div class="actions"><button class="advance delivery" data-action="Terminée" data-id="${order.id}">Terminer la commande</button></div>`;
}

function renderOrders() {
  const visible = active().filter((order) => filter === "all" || order.status === filter);
  document.querySelector("#orders-list").innerHTML = visible.length ? visible.map((order) => `<article class="order-card ${order.status === "Nouvelle" ? "new" : ""}"><div class="order-head"><div><div class="order-id">#${order.id} · ${order.customer}</div><div class="order-meta">${order.age} · ${order.type}</div></div><span class="status ${order.status.replace(" ", "-")}">${order.status}</span></div><p class="order-items">${order.items}</p><div class="order-bottom"><div class="order-details">🕒 ${order.slot}<span class="order-total">${euro(order.total)}</span></div>${actionMarkup(order)}</div></article>`).join("") : `<div class="empty">🍔<strong>Aucune commande ici</strong>Les nouvelles commandes apparaîtront dès leur réception.</div>`;
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

function showView(view) {
  if (!["orders", "reservations"].includes(view)) return showToast("Cette rubrique sera disponible prochainement.");
  currentView = view;
  document.querySelector("#orders-view").hidden = view !== "orders";
  document.querySelector("#orders-metrics").hidden = view !== "orders";
  document.querySelector("#reservations-view").hidden = view !== "reservations";
  document.querySelector("#dashboard-title").textContent = view === "orders" ? "Commandes en direct" : "Réservations de tables";
  document.querySelector("#refresh-orders").textContent = view === "orders" ? "↻ Actualiser" : "↻ Actualiser les réservations";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderOrders();
}));

document.querySelectorAll(".reservation-filter").forEach((button) => button.addEventListener("click", () => {
  reservationFilter = button.dataset.reservationFilter;
  document.querySelectorAll(".reservation-filter").forEach((item) => item.classList.toggle("active", item === button));
  renderReservations();
}));

document.querySelector("#sound-button").addEventListener("click", (event) => {
  soundOn = !soundOn;
  event.currentTarget.textContent = soundOn ? "🔔 Son activé" : "🔕 Son désactivé";
  event.currentTarget.style.color = soundOn ? "" : "#806e65";
});

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelector("#refresh-orders").addEventListener("click", async () => { if (currentView === "orders") { await loadOrders(); showToast("Commandes actualisées."); } else { await loadReservations(); showToast("Réservations actualisées."); } });
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
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Accéder aux commandes"; }
});
document.querySelector("#dashboard-password").addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#dashboard-login").click(); });

refreshMetrics();
document.querySelector("#service-date-heading").textContent = todayHeading();
renderOrders();
renderReservations();
if (dashboardToken) { showDashboard(); loadOrders(); loadReservations(); } else { showLogin(); }
window.setInterval(() => { if (dashboardToken) { loadOrders({ notify: true }); loadReservations({ notify: true }); } }, 10000);
