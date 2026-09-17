const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3001/api" : "";
const statusLabel = { confirmed: "Nouvelle", preparing: "Acceptée", ready: "Prête", out_for_delivery: "En livraison", delivered: "Terminée", cancelled: "Refusée" };
const statusForLabel = Object.fromEntries(Object.entries(statusLabel).map(([key, value]) => [value, key]));
let orders = [];
let filter = "all";
let soundOn = true;
const euro = (number) => `${Number(number).toFixed(2).replace(".", ",")} €`;
const active = () => orders.filter((order) => !["Terminée", "Refusée"].includes(order.status));
const showToast = (message) => { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2600); };

function orderFromApi(order) {
  const created = new Date(order.createdAt);
  const minutes = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
  return { id: order.number, apiId: order.id, customer: order.customerName, age: minutes < 1 ? "À l’instant" : `Il y a ${minutes} min`, type: order.method === "delivery" ? "Livraison" : "Retrait", slot: order.slot, total: order.total, items: order.items.map((item) => item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name).join(" · "), status: statusLabel[order.status] || "Nouvelle" };
}

function actionMarkup(order) {
  if (order.status === "Nouvelle") return `<div class="actions"><button class="reject" data-action="Refusée" data-id="${order.id}">Refuser</button><button class="accept" data-action="Acceptée" data-id="${order.id}">Accepter</button></div>`;
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
}

async function loadOrders({ notify = false } = {}) {
  if (!API_BASE_URL) return;
  try {
    const response = await fetch(`${API_BASE_URL}/orders`);
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

async function changeOrder(id, status) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;
  const previousStatus = order.status;
  order.status = status;
  refreshMetrics();
  renderOrders();
  try {
    if (!API_BASE_URL || !order.apiId) throw new Error("API indisponible");
    const response = await fetch(`${API_BASE_URL}/orders/${order.apiId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: statusForLabel[status] }) });
    if (!response.ok) throw new Error("Mise à jour impossible");
    const messages = { Acceptée: `Commande #${id} acceptée.`, Refusée: `Commande #${id} refusée.`, Prête: `Commande #${id} est prête.`, "En livraison": `Commande #${id} confiée au livreur.`, Terminée: `Commande #${id} terminée.` };
    showToast(messages[status]);
  } catch {
    order.status = previousStatus;
    refreshMetrics();
    renderOrders();
    showToast("La mise à jour n’a pas été enregistrée.");
  }
}

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderOrders();
}));

document.querySelector("#sound-button").addEventListener("click", (event) => {
  soundOn = !soundOn;
  event.currentTarget.textContent = soundOn ? "🔔 Son activé" : "🔕 Son désactivé";
  event.currentTarget.style.color = soundOn ? "" : "#806e65";
});

document.querySelector("#simulate-order").addEventListener("click", () => showToast("Utilise l’application client pour simuler une vraie commande."));

refreshMetrics();
renderOrders();
loadOrders();
window.setInterval(() => loadOrders({ notify: true }), 10000);
