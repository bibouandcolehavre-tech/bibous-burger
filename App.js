import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, Linking, Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import NewsCarousel from "./NewsCarousel";
import ContestScreen from "./ContestScreen";
import NotificationSettings from "./NotificationSettings";
import CustomerOffers from "./CustomerOffers";
const { bestClientOffer } = require('./crm-client');
import { syncPushDevice, detachPushDevice, observePush } from "./push-client";
import { customerAlert as Alert } from "./customer-alert";
import { readSession, saveSession, clearSession, readAttempt, saveAttempt, clearAttempt } from "./client-storage";
const { createAttempt, parseAttempt, paymentState, openCheckoutUrl } = require("./payment-recovery");
const { normalizeFrenchMobile } = require("./phone");
const { applyProductStock, cartStockProblem, availableOptionGroups } = require("./stock-client");

const taurusPhoto = require("./assets/taurus.jpg");
const headerWordmark = require("./assets/bibous-wordmark-white.png");
const drinkCocaPhoto = require("./assets/drinks/cutout/coca.png");
const drinkCocaCherryPhoto = require("./assets/drinks/cutout/coca-cherry.png");
const drinkFuseMenthePhoto = require("./assets/drinks/cutout/fuse-menthe.png");
const drinkLiptonFramboisePhoto = require("./assets/drinks/cutout/lipton-framboise.png");
const drinkLiptonPechePhoto = require("./assets/drinks/cutout/lipton-peche.png");
const drinkOasisPommePhoto = require("./assets/drinks/cutout/oasis-pomme.png");
const drinkOasisTropicalPhoto = require("./assets/drinks/cutout/oasis-tropical.png");
const drinkPerrierPhoto = require("./assets/drinks/cutout/perrier.png");
const drinkTropicoPhoto = require("./assets/drinks/cutout/tropico.png");
const DELIVERY_PRICING = [
  { maxKm: 1.5, label: "0 à 1,5 km", price: 3.99 },
  { maxKm: 3, label: "1,5 à 3 km", price: 4.99 },
  { maxKm: 5, label: "3 à 5 km", price: 5.99 },
];
const DELIVERY_FEE = DELIVERY_PRICING[0].price;
const ORDER_STEPS = ["Confirmée", "En préparation", "Prête", "En livraison", "Livrée"];
const PUBLIC_API_BASE_URL = "https://bibous-burger.onrender.com/api";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || (typeof window !== "undefined" && window.location?.hostname === "localhost" ? "http://localhost:3001/api" : PUBLIC_API_BASE_URL);
const progressForStatus = { confirmed: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4 };
const orderFromApi = (order) => ({ id: `#${order.number}`, apiId: order.id, product: order.items.map((item) => item.name).join(", "), total: order.total, method: order.method, slot: order.slot, date: order.serviceDate ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${order.serviceDate}T12:00:00`)) : order.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "Aujourd’hui" : "Commande précédente", status: order.status, progress: progressForStatus[order.status] ?? 0 });
const reservationStatus = { pending: { label: "En attente", icon: "◷", message: "Le restaurant doit encore répondre.", color: "#A35B22", background: "#FFF0E0" }, confirmed: { label: "Confirmée", icon: "✓", message: "Ta table est confirmée.", color: "#397353", background: "#EAF5E4" }, cancelled: { label: "Refusée", icon: "×", message: "Cette demande n’a pas pu être acceptée.", color: "#A3472A", background: "#FAE6E2" } };
const reservationFromApi = (reservation) => ({ ...reservation, dateLabel: new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${reservation.serviceDate}T12:00:00`)) });
const BIBOU_PLUS_PRICE = 9.99;
const BIBOU_PLUS_DISCOUNT_RATE = 0.05;
const WELCOME_DISCOUNT_RATE = 0.1;
const POINT_EARNING_RULES = [
  { emoji: "🍔", title: "Burger seul", points: "+10 points", detail: "À chaque burger seul payé" },
  { emoji: "🍟", title: "Menu complet", points: "+15 points", detail: "Burger, frites et boisson" },
  { emoji: "🏠", title: "Retrait anticipé", points: "Points ×2", detail: "Commande en click & collect enregistrée au moins 30 min avant le retrait" },
  { emoji: "🎁", title: "Parrainage validé", points: "+100 points", detail: "Après la première commande payée du filleul" },
  { emoji: "⚡", title: "Bonus de la semaine", points: "×2 puis ×3", detail: "Selon le nombre de commandes de la semaine" },
  { emoji: "✦", title: "Membre Bibou +", points: "Points ×2", detail: "Sur chaque commande pendant l’abonnement" },
];
const GOOGLE_REVIEW_URL = "https://share.google/ZnSdNG7pj8QtMieYO";
const CUSTOMER_APP_URL = "https://bibous-burger-app.onrender.com/";
const REWARDS = [
  { id: "fries", points: 200, emoji: "🍟", title: "Une portion de frites offerte", detail: "Frites maison, tout simplement" },
  { id: "drink", points: 400, emoji: "🥤", title: "Une boisson fraîche offerte", detail: "À ajouter à ta prochaine commande" },
  { id: "discount-5", points: 700, emoji: "✨", title: "5 € de remise", detail: "À utiliser sur une prochaine commande" },
  { id: "classic-menu", points: 1500, emoji: "🍔", title: "Un menu classique offert", detail: "Le plaisir est pour Bibou's Burgers" },
  { id: "duo-menu", points: 5000, emoji: "👑", title: "Un menu pour deux offert", detail: "La récompense ultime du Club Bibou" },
];
const PRESTIGE_LEVELS = [
  { level: 1, name: "Débutant", metal: "Bronze", color: "#B66A35", softColor: "#F6E0D1", points: 200, reward: "Une portion de frites offerte" },
  { level: 2, name: "Gourmand", metal: "Argent", color: "#7D8792", softColor: "#E8EDF1", points: 400, reward: "Une boisson fraîche offerte" },
  { level: 3, name: "Ambassadeur", metal: "Or", color: "#B98A12", softColor: "#FFF0B8", points: 700, reward: "5 € de remise" },
  { level: 4, name: "Légende", metal: "Platine", color: "#43858E", softColor: "#DDF1F2", points: 1500, reward: "Un menu classique offert" },
  { level: 5, name: "Mythique", metal: "Diamant", color: "#6955C7", softColor: "#E9E4FF", points: 5000, reward: "Un menu pour deux offert" },
];
const money = (value) => `${value.toFixed(2).replace(".", ",")} €`;
const customerHasBibouPlus = (customer) => {
  const expiresAt = customer?.bibouPlusExpiresAt ? new Date(customer.bibouPlusExpiresAt).getTime() : 0;
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};
const customerHasWelcomeReward = (customer) => customer?.welcomeReward?.status === "available";
const customerOrderPricing = (subtotal, standardDeliveryFee, customer, isDelivery = true) => {
  const bibouPlus = customerHasBibouPlus(customer);
  const baseRate = customerHasWelcomeReward(customer) ? WELCOME_DISCOUNT_RATE : bibouPlus ? BIBOU_PLUS_DISCOUNT_RATE : 0;
  const offer = bestClientOffer(customer?.crmOffers,subtotal,baseRate);
  const discountRate = offer ? offer.discountPercent / 100 : baseRate;
  const discount = Math.round(subtotal * discountRate * 100) / 100;
  const deliveryFee = bibouPlus && isDelivery ? 0 : standardDeliveryFee;
  const discountLabel = offer ? `Offre personnelle · −${offer.discountPercent} %` : customerHasWelcomeReward(customer) ? 'Cadeau de bienvenue · −10 %' : 'Remise Bibou + · −5 %';
  return { bibouPlus, discountRate, discount, discountLabel, deliveryFee, total: Math.round((subtotal - discount + deliveryFee) * 100) / 100 };
};
const deliveryCostForDistance = (distanceKm) => DELIVERY_PRICING.find((tier) => distanceKm <= tier.maxKm)?.price;
const deliveryCost = (method) => method === "delivery" ? deliveryCostForDistance(0) : 0;
const referralCodeFromUrl = () => {
  if (typeof window === "undefined") return "";
  try { return new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() || ""; } catch { return ""; }
};
const initialScreenFromUrl = () => {
  if (typeof window === "undefined") return "menu";
  try {
    if (new URLSearchParams(window.location.search).get("contest")) return "contest";
    const legalPage = new URLSearchParams(window.location.search).get("legal");
    if (legalPage === "privacy") return "privacy";
    if (legalPage === "delete-account") return "delete-account";
  } catch {}
  return "menu";
};

const PRODUCTS = [
  { id: "taurus", name: "Le Taurus", price: 16.9, isMenu: true, image: taurusPhoto, description: "Pain brioché maison au charbon végétal, pesto rosso, jambon de Parme, mozzarella fondante, roquette, tomates fraîches, oignons caramélisés et cornichons.", detail: "Un pain brioché maison au charbon végétal, garni de pesto rosso, jambon de Parme, mozzarella fondante, roquette, tomates fraîches, oignons caramélisés et cornichons : une création méditerranéenne généreuse et pleine de caractère." },
  { id: "montagnes-menu", name: "À travers les montagnes", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_268K7YE3TN9G4R6PQF0XXGY6MH/image.png" }, description: "Pain brioché maison, steak de bœuf haché frais, raclette fondante, bacon croustillant, roquette, tomates, oignons caramélisés et cornichons.", detail: "Le fondant de la raclette rencontre le croustillant du bacon et la douceur des oignons caramélisés, dans un pain brioché maison garni de steak de bœuf frais et de crudités." },
  { id: "atlas-menu", name: "Au sommet de l'Atlas", price: 18.9, isMenu: true, soldOut: true, image: { uri: "https://images.sumup.com/img_3DQDCG8NT99KCR0SFK6G53V02X/image.png" }, description: "Pain brioché noir, agneau confit au thym et au miel, chèvre, sauce barbecue au miel, roquette, tomates, oignons caramélisés et cornichons.", detail: "Une épaule d’agneau confite au thym et au miel, du chèvre et une sauce barbecue au miel dans un pain brioché noir, relevés par des crudités fraîches et croquantes." },
  { id: "classique-menu", name: "Classique, simple et efficace", price: 14.9, isMenu: true, image: { uri: "https://images.sumup.com/img_7JTJCTSXG29HYR09R699BXWB5Z/image.png" }, description: "Pain brioché maison, steak de bœuf haché frais, cheddar fondant, roquette, tomates fraîches, oignons caramélisés et cornichons croquants.", detail: "Un classique généreux et parfaitement équilibré : pain brioché maison, steak de bœuf frais, cheddar fondant, roquette, tomates fraîches, oignons caramélisés et cornichons." },
  { id: "duck-menu", name: "Duck", price: 18.9, isMenu: true, image: { uri: "https://images.sumup.com/img_64ZB5FFC1M8988TZ0J71Q9KBE2/image.png" }, description: "Pain brioché maison au charbon végétal, canard effiloché aux cinq parfums, sauce chinoise, mozzarella fondante, concombre et salade thaï.", detail: "Du canard effiloché aux cinq parfums, une sauce chinoise onctueuse et de la mozzarella fondante, équilibrés par le concombre croquant, les oignons caramélisés et la salade thaï." },
  { id: "dynamite-menu", name: "Dynamite Chicken", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_62MB1W5CWT9B6AJ82BKQNSN61K/image.png" }, description: "Pain brioché maison, tenders de poulet marinés et panés maison, cheddar fondant, sauce thaï, roquette, chou rouge, oignons et cornichons.", detail: "Des tenders de poulet croustillants à l’extérieur et moelleux à l’intérieur, du cheddar fondant et une sauce thaï légèrement sucrée et relevée, avec des crudités fraîches." },
  { id: "gros-lard-menu", name: "Le gros lard", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_5AWN55RQGY8RTVGJJPNNWY3EC3/image.png" }, description: "Pain brioché maison, lard fumé, fourme d’Ambert AOP, steak de bœuf haché frais, roquette, tomate, oignons caramélisés et cornichons.", detail: "Un burger puissant et généreux qui marie lard fumé, fourme d’Ambert AOP et steak de bœuf haché frais dans un pain brioché maison." },
  { id: "hambagu-menu", name: "Hambagu", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_56NGPCKJ708929SVCEJTR07D20/image.png" }, description: "Pain brioché maison au charbon végétal, steak hambagu bœuf-porc, sauce au mirin et au saké, maasdam, concombre et salade thaï.", detail: "Un steak hambagu tendre et juteux, composé à parts égales de bœuf et de porc, nappé d’une sauce sucrée-salée au mirin et au saké, avec maasdam et crudités." },
  { id: "basilic-menu", name: "Le basilic du potager", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_5MP8QBZ1XG80NBFY8ZN7DEKMBS/image.png" }, description: "Pain brioché maison, pesto verde, mozzarella fondante, steak haché frais, chèvre crémeux, roquette, tomates, oignons caramélisés et cornichons.", detail: "Le pesto verde apporte sa fraîcheur herbacée, tandis que la mozzarella fondante et le chèvre crémeux accompagnent le steak frais et les crudités dans un pain brioché maison." },
  { id: "pork-menu", name: "Le Pork", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_6CS5SEEFGM9GXA41KR1XAP0H0S/image.png" }, description: "Pain brioché maison au charbon végétal, porc effiloché, sauce coréenne légèrement pimentée, mozzarella fondante, concombre et salade thaï.", detail: "Le fondant du porc effiloché et de la mozzarella rencontre la fraîcheur du concombre et de la salade thaï, relevés par une sauce coréenne sucrée-salée et légèrement pimentée." },
  { id: "atlas", name: "Au sommet de l'Atlas", price: 13.9, image: { uri: "https://images.sumup.com/img_3DQDCG8NT99KCR0SFK6G53V02X/image.png" }, description: "Pain brioché noir, agneau confit au thym et au miel, chèvre, sauce barbecue au miel, roquette, tomates, oignons caramélisés et cornichons.", detail: "Une épaule d’agneau confite au thym et au miel, du chèvre et une sauce barbecue au miel dans un pain brioché noir, relevés par des crudités fraîches et croquantes." },
  { id: "classique", name: "Classique, simple et efficace", price: 9.9, image: { uri: "https://images.sumup.com/img_7JTJCTSXG29HYR09R699BXWB5Z/image.png" }, description: "Pain brioché maison, steak de bœuf haché frais, cheddar fondant, roquette, tomates fraîches, oignons caramélisés et cornichons croquants.", detail: "Un classique généreux et parfaitement équilibré : pain brioché maison, steak de bœuf frais, cheddar fondant, roquette, tomates fraîches, oignons caramélisés et cornichons." },
  { id: "duck", name: "Duck", price: 13.9, image: { uri: "https://images.sumup.com/img_64ZB5FFC1M8988TZ0J71Q9KBE2/image.png" }, description: "Pain brioché maison au charbon végétal, canard effiloché aux cinq parfums, sauce chinoise, mozzarella fondante, concombre et salade thaï.", detail: "Du canard effiloché aux cinq parfums, une sauce chinoise onctueuse et de la mozzarella fondante, équilibrés par le concombre croquant, les oignons caramélisés et la salade thaï." },
  { id: "dynamite", name: "Dynamite Chicken", price: 11.9, image: { uri: "https://images.sumup.com/img_62MB1W5CWT9B6AJ82BKQNSN61K/image.png" }, description: "Pain brioché maison, tenders de poulet marinés et panés maison, cheddar fondant, sauce thaï, roquette, chou rouge, oignons et cornichons.", detail: "Des tenders de poulet croustillants à l’extérieur et moelleux à l’intérieur, du cheddar fondant et une sauce thaï légèrement sucrée et relevée, avec des crudités fraîches." },
  { id: "hambagu", name: "Hambagu", price: 11.9, image: { uri: "https://images.sumup.com/img_56NGPCKJ708929SVCEJTR07D20/image.png" }, description: "Pain brioché maison au charbon végétal, steak hambagu bœuf-porc, sauce au mirin et au saké, maasdam, concombre et salade thaï.", detail: "Un steak hambagu tendre et juteux, composé à parts égales de bœuf et de porc, nappé d’une sauce sucrée-salée au mirin et au saké, avec maasdam et crudités." },
  { id: "basilic", name: "Le basilic du potager", price: 11.9, image: { uri: "https://images.sumup.com/img_5MP8QBZ1XG80NBFY8ZN7DEKMBS/image.png" }, description: "Pain brioché maison, pesto verde, mozzarella fondante, steak haché frais, chèvre crémeux, roquette, tomates, oignons caramélisés et cornichons.", detail: "Le pesto verde apporte sa fraîcheur herbacée, tandis que la mozzarella fondante et le chèvre crémeux accompagnent le steak frais et les crudités dans un pain brioché maison." },
  { id: "montagnes", name: "À travers les montagnes", price: 11.9, image: { uri: "https://images.sumup.com/img_268K7YE3TN9G4R6PQF0XXGY6MH/image.png" }, description: "Pain brioché maison, steak de bœuf haché frais, raclette fondante, bacon croustillant, roquette, tomates, oignons caramélisés et cornichons.", detail: "Le fondant de la raclette rencontre le croustillant du bacon et la douceur des oignons caramélisés, dans un pain brioché maison garni de steak de bœuf frais et de crudités." },
  { id: "gros-lard", name: "Le gros lard", price: 11.9, image: { uri: "https://images.sumup.com/img_5AWN55RQGY8RTVGJJPNNWY3EC3/image.png" }, description: "Pain brioché maison, lard fumé, fourme d’Ambert AOP, steak de bœuf haché frais, roquette, tomate, oignons caramélisés et cornichons.", detail: "Un burger puissant et généreux qui marie lard fumé, fourme d’Ambert AOP et steak de bœuf haché frais dans un pain brioché maison." },
  { id: "pork", name: "Le Pork", price: 11.9, image: { uri: "https://images.sumup.com/img_6CS5SEEFGM9GXA41KR1XAP0H0S/image.png" }, description: "Pain brioché maison au charbon végétal, porc effiloché, sauce coréenne légèrement pimentée, mozzarella fondante, concombre et salade thaï.", detail: "Le fondant du porc effiloché et de la mozzarella rencontre la fraîcheur du concombre et de la salade thaï, relevés par une sauce coréenne sucrée-salée et légèrement pimentée." },
];

const FIXED_SAUCES = {
  atlas: { id: "fixed-atlas", label: "Barbecue miel" },
  dynamite: { id: "fixed-dynamite", label: "Sauce thaï" },
  duck: { id: "fixed-duck", label: "Sauce chinoise" },
  hambagu: { id: "fixed-hambagu", label: "Sauce Hambagu (à base de mirin, de soja et de saké)" },
  basilic: { id: "fixed-basilic", label: "Pesto" },
  pork: { id: "fixed-pork", label: "Barbecue coréenne" },
};
const fixedSauceForProduct = (product) => FIXED_SAUCES[product.id.replace(/-menu$/, "")] || null;

const PROTEIN = { id: "protein", title: "VÉGÉTARIEN OU NON ?", required: true, min: 1, max: 1, options: [{ id: "viande", label: "Viande", price: 0 }, { id: "galette", label: "Galette de pomme de terre (végétarien)", price: 0 }] };
const SALAD = { id: "salad", title: "CRUDITÉS", required: true, min: 1, max: 4, options: [{ id: "roquette", label: "Roquette", price: 0 }, { id: "tomate", label: "Tomate", price: 0 }, { id: "oignons", label: "Oignons caramélisés", price: 0 }, { id: "cornichons", label: "Cornichons", price: 0 }, { id: "sans-crudites", label: "Pas de crudités", price: 0, exclusive: true }] };
const SAUCES = { id: "sauces", title: "SAUCES", required: true, min: 1, options: [{ id: "ketchup", label: "Ketchup", price: 0 }, { id: "mayo", label: "Mayonnaise", price: 0 }, { id: "moutarde", label: "Moutarde", price: 0 }, { id: "barbecue", label: "Barbecue", price: 0 }, { id: "tartare", label: "Tartare", price: 0 }, { id: "blanche", label: "Blanche", price: 0 }, { id: "bearnaise", label: "Béarnaise", price: 0 }, { id: "sans-sauce", label: "Pas de sauce", price: 0, exclusive: true }] };
const SAUCE_VISUALS = {
  ketchup: require("./assets/sauces/photoreal/ketchup.png"),
  mayo: require("./assets/sauces/photoreal/mayonnaise.png"),
  moutarde: require("./assets/sauces/photoreal/moutarde.png"),
  barbecue: require("./assets/sauces/photoreal/barbecue.png"),
  tartare: require("./assets/sauces/photoreal/tartare.png"),
  blanche: require("./assets/sauces/photoreal/blanche.png"),
  bearnaise: require("./assets/sauces/photoreal/bearnaise.png"),
};
const SUPPLEMENT_VISUALS = {
  "second-steak": require("./assets/supplements/steak-hache-cuit.png"),
  "galette-plus": require("./assets/supplements/rosti-pomme-de-terre.png"),
  cheddar: require("./assets/supplements/cheddar.png"),
  raclette: require("./assets/supplements/raclette.png"),
  mozzarella: require("./assets/supplements/mozzarella.png"),
  fourme: require("./assets/supplements/fourme-d-ambert.png"),
  lard: require("./assets/supplements/lard-fume.png"),
  bacon: require("./assets/supplements/bacon.png"),
};
const SUPPLEMENTS = { id: "extras", title: "UN SUPPLÉMENT DANS VOTRE BURGER ?", options: [{ id: "second-steak", label: "Second steak", price: 3 }, { id: "galette-plus", label: "Galette de pomme de terre", price: 2 }, { id: "cheddar", label: "Cheddar", price: 1 }, { id: "raclette", label: "Raclette", price: 1 }, { id: "mozzarella", label: "Mozzarella", price: 1 }, { id: "fourme", label: "Fourme d'Ambert", price: 1 }, { id: "lard", label: "Lard fumé", price: 1.5 }, { id: "bacon", label: "Bacon", price: 1 }].map((option) => ({ ...option, image: SUPPLEMENT_VISUALS[option.id] })) };
const SIDE_VISUALS = {
  frites: require("./assets/extras/frites-maison.png"),
  "frites-cheddar": require("./assets/extras/frites-cheddar-bacon.png"),
  tenders: require("./assets/extras/tenders-3.png"),
};
const SIDES = { id: "sides", title: "ENCORE UN PETIT CREUX ?", options: [{ id: "frites", label: "Frites maison", price: 3.9 }, { id: "frites-cheddar", label: "Frites cheddar bacon", price: 6.9 }, { id: "tenders", label: "3 Tenders", price: 6.9 }].map((option) => ({ ...option, image: SIDE_VISUALS[option.id] })) };
const MENU_SIDES = { id: "sides", title: "UN EXTRA EN PLUS DU MENU ?", options: [{ id: "frites", label: "Deuxième portion de frites maison", price: 3.9 }, { id: "frites-cheddar", label: "Frites cheddar bacon supplémentaires", price: 6.9 }, { id: "tenders", label: "3 Tenders supplémentaires", price: 6.9 }].map((option) => ({ ...option, image: SIDE_VISUALS[option.id] })) };
const DESSERTS = { id: "desserts", title: "UN DESSERT ?", options: [{ id: "oreo", label: "Tiramisu Oreo", price: 3.9 }, { id: "cookie", label: "Tiramisu cookie", price: 3.9 }, { id: "framboise", label: "Tiramisu framboise pistache", price: 3.9 }] };
const DRINK_VISUALS = {
  coca: require("./assets/drinks/cutout/coca.png"),
  "coca-zero": require("./assets/drinks/cutout/coca.png"),
  "coca-cherry": require("./assets/drinks/cutout/coca-cherry.png"),
  "coca-vanille": require("./assets/drinks/cutout/coca-vanille.png"),
  "lipton-peche": require("./assets/drinks/cutout/lipton-peche.png"),
  "lipton-framboise": require("./assets/drinks/cutout/lipton-framboise.png"),
  "fuse-menthe": require("./assets/drinks/cutout/fuse-menthe.png"),
  "oasis-pomme": require("./assets/drinks/cutout/oasis-pomme.png"),
  "oasis-tropical": require("./assets/drinks/cutout/oasis-tropical.png"),
  "fanta-orange": require("./assets/drinks/cutout/fanta-orange.png"),
  perrier: require("./assets/drinks/cutout/perrier.png"),
  tropico: require("./assets/drinks/cutout/tropico.png"),
  eau: require("./assets/drinks/cutout/cristaline.png")
};
const MENU_DRINK_OPTIONS = [
  { id: "coca", label: "Coca 33 cl", price: 0 },
  { id: "coca-zero", label: "Coca Zero", price: 0 },
  { id: "coca-cherry", label: "Coca Cherry", price: 0 },
  { id: "coca-vanille", label: "Coca Vanille", price: 0 },
  { id: "lipton-peche", label: "Lipton pêche", price: 0 },
  { id: "lipton-framboise", label: "Lipton framboise", price: 0 },
  { id: "fuse-menthe", label: "Fuse Tea thé vert menthe", price: 0 },
  { id: "oasis-pomme", label: "Oasis pomme cassis framboise", price: 0 },
  { id: "oasis-tropical", label: "Oasis tropical", price: 0 },
  { id: "fanta-orange", label: "Fanta Orange", price: 0 },
  { id: "fanta-dragon", label: "Fanta fruit du dragon", price: 0 },
  { id: "perrier", label: "Perrier", price: 0 },
  { id: "tropico", label: "Tropico", price: 0 },
  { id: "eau", label: "Cristaline 50 cl", price: 0 },
].map((option) => ({ ...option, image: DRINK_VISUALS[option.id] || null }));
const DRINKS = { id: "drink", title: "BOISSONS", max: 1, options: MENU_DRINK_OPTIONS };
const DUO_DRINK_ONE = { id: "duo-drink-one", title: "PREMIÈRE BOISSON", required: true, min: 1, max: 1, options: MENU_DRINK_OPTIONS };
const DUO_DRINK_TWO = { id: "duo-drink-two", title: "DEUXIÈME BOISSON", required: true, min: 1, max: 1, options: MENU_DRINK_OPTIONS };
const MENU_OPTION_GROUPS = [PROTEIN, SALAD, SAUCES, DRINKS, SUPPLEMENTS, MENU_SIDES];
const BURGER_OPTION_GROUPS = [PROTEIN, SALAD, SAUCES, SUPPLEMENTS, SIDES, DESSERTS];
const SNACK_PRODUCTS = [
  { id: "frites-maison", name: "Frites maison", price: 3.9, kind: "simple", emoji: "🍟", image: { uri: "https://images.sumup.com/img_5TCPD9QKS8903BEZRHHP009TDC/image.png" }, description: "Pommes de terre fraîches, épluchées et préparées maison." },
  { id: "frites-cheddar-bacon", name: "Frites cheddar bacon", price: 6.9, kind: "simple", emoji: "🍟", image: { uri: "https://images.sumup.com/img_24R58J2CVM80V8D65XB3DQXXC5/image.png" }, description: "Frites maison généreuses, cheddar fondant et bacon." },
  { id: "tenders-xl-3", name: "Tenders XL par 3", price: 6.9, kind: "simple", emoji: "🍗", image: { uri: "https://images.sumup.com/img_5JR68H81S19B4THE20E4Y21SMT/image.png" }, description: "Trois tenders XL faits maison, croustillants et épicés." },
  { id: "menu-duo-tenders", name: "Menu Duo · 10 tenders", price: 19.9, kind: "duo", emoji: "🍗", image: { uri: "https://images.sumup.com/img_5AHJN2GTG79EFV0AJN5KSZB1VW/image.png" }, description: "10 tenders spicy faits maison, 2 frites maison et 2 boissons.", detail: "Une box à partager avec 10 tenders spicy faits maison, deux portions de frites et deux boissons.", optionGroups: [DUO_DRINK_ONE, DUO_DRINK_TWO] },
];
const DRINK_PRODUCTS = [
  { id: "drink-coca", name: "Coca 33 cl", price: 1.8, kind: "drink", emoji: "🥤", image: drinkCocaPhoto, description: "Canette 33 cl bien fraîche." },
  { id: "drink-coca-cherry", name: "Coca Cherry 33 cl", price: 1.8, kind: "drink", emoji: "🥤", image: drinkCocaCherryPhoto, description: "Canette 33 cl bien fraîche." },
  { id: "drink-fuse-menthe", name: "Fuse Tea thé vert menthe", price: 1.8, kind: "drink", emoji: "🧊", image: drinkFuseMenthePhoto, description: "Boisson rafraîchissante au thé vert et à la menthe." },
  { id: "drink-lipton-framboise", name: "Lipton framboise 33 cl", price: 1.8, kind: "drink", emoji: "🧊", image: drinkLiptonFramboisePhoto, description: "Canette 33 cl bien fraîche." },
  { id: "drink-lipton-peche", name: "Lipton pêche 33 cl", price: 1.8, kind: "drink", emoji: "🧊", image: drinkLiptonPechePhoto, description: "Canette 33 cl bien fraîche." },
  { id: "drink-oasis-pomme", name: "Oasis pomme cassis framboise", price: 1.8, kind: "drink", emoji: "🥤", image: drinkOasisPommePhoto, description: "Boisson fruitée bien fraîche." },
  { id: "drink-oasis-tropical", name: "Oasis tropical", price: 1.8, kind: "drink", emoji: "🥤", image: drinkOasisTropicalPhoto, description: "Boisson tropicale bien fraîche." },
  { id: "drink-perrier", name: "Perrier", price: 1.8, kind: "drink", emoji: "💧", image: drinkPerrierPhoto, description: "Eau gazeuse bien fraîche." },
  { id: "drink-tropico", name: "Tropico", price: 1.8, kind: "drink", emoji: "🥤", image: drinkTropicoPhoto, description: "Boisson aux fruits bien fraîche." },
];
const RESTAURANT_ADDRESS = "153 quai Georges V, 76600 Le Havre";
const DELIVERY_ZONE = "Rayon de 5 km autour de Bibou's Burgers";
const DELIVERY_SCHEDULE = [
  { id: "monday", label: "Lun.", name: "Lundi", slots: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "tuesday", label: "Mar.", name: "Mardi", slots: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "wednesday", label: "Mer.", name: "Mercredi", slots: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "thursday", label: "Jeu.", name: "Jeudi", slots: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "friday", label: "Ven.", name: "Vendredi", slots: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "saturday", label: "Sam.", name: "Samedi", slots: ["19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"] },
  { id: "sunday", label: "Dim.", name: "Dimanche", slots: ["19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00"] },
];
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const scheduleIdForDate = (date) => ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
const UPCOMING_DELIVERY_DAYS = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + index);
  const schedule = DELIVERY_SCHEDULE.find((day) => day.id === scheduleIdForDate(date));
  const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date);
  return { ...schedule, date: localDateKey(date), label: `${schedule.label} ${shortDate}`, dayLabel: `${schedule.name} ${shortDate}` };
});
const DEFAULT_DELIVERY_DAY = UPCOMING_DELIVERY_DAYS[0];
const quarterHourSlots = (ranges) => ranges.flatMap(range => {
  const start = range.slice(0, 5);
  return [start, start.slice(0, 3) + String(Number(start.slice(3)) + 15).padStart(2, "0")];
});
function Header({ onBack, right, onRight }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  return <View style={[styles.header, desktop && styles.headerDesktop]}>{onBack ? <Pressable accessibilityLabel="Retour" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.headerBrand}><View style={[styles.wordmarkBadge, desktop && styles.wordmarkBadgeDesktop]}><Image source={headerWordmark} style={[styles.wordmarkImage, desktop && styles.wordmarkImageDesktop]} resizeMode="contain" /></View>{desktop && <Text style={styles.wordmarkTagline}>Burgers faits maison · Le Havre</Text>}</View>}{onRight ? <Pressable accessibilityLabel="Ouvrir le panier" onPress={onRight} style={styles.headerCart}><Text style={styles.headerCartText}>{right || "🛍"}</Text></Pressable> : <Text style={styles.headerRight}>{right || ""}</Text>}</View>;
}

function PrestigeEmblem({ level, unlocked = true, large = false }) {
  return <View style={[styles.prestigeEmblemWrap, large && styles.prestigeEmblemWrapLarge, { opacity: unlocked ? 1 : 0.58 }]}>
    <Text style={[styles.prestigeCrown, large && styles.prestigeCrownLarge, { color: level.color }]}>♛</Text>
    <View style={[styles.prestigeShield, large && styles.prestigeShieldLarge, { backgroundColor: level.softColor, borderColor: level.color }]}>
      <View style={[styles.prestigeShieldBand, { backgroundColor: level.color }]} />
      <Text style={[styles.prestigeShieldStars, large && styles.prestigeShieldStarsLarge, { color: level.color }]}>{"★".repeat(level.level)}</Text>
      <Text style={[styles.prestigeShieldGem, { color: level.color }]}>◆</Text>
    </View>
  </View>;
}

function ProductCard({ product, onPress }) {
  return <Pressable disabled={product.soldOut} onPress={() => onPress(product)} style={[styles.productCard, product.soldOut && styles.productCardSoldOut]}><Image source={product.image} style={styles.productImage} /><View style={styles.productInfo}><Text style={styles.productName}>{product.isMenu ? `Menu - ${product.name}` : product.name}</Text><Text numberOfLines={2} style={styles.productDescription}>{product.description}</Text><Text style={[styles.productPrice, product.soldOut && styles.soldOutText]}>{product.soldOut ? "Épuisé" : money(product.price)}</Text></View><View style={[styles.plus, product.soldOut && styles.plusSoldOut]}><Text style={styles.plusText}>{product.soldOut ? "–" : "+"}</Text></View></Pressable>;
}

function AccessoryCard({ product, onPress }) {
  return <Pressable disabled={product.soldOut} onPress={() => onPress(product)} style={[styles.productCard, product.soldOut && styles.productCardSoldOut]}>
    {product.image ? product.kind === "drink" ? <View style={styles.drinkImageFrame}><Image source={product.image} style={styles.drinkProductImage} /></View> : <Image source={product.image} style={styles.productImage} /> : <View style={styles.productEmojiImage}><Text style={styles.productEmoji}>{product.emoji}</Text></View>}
    <View style={styles.productInfo}><Text style={styles.productName}>{product.name}</Text><Text numberOfLines={2} style={styles.productDescription}>{product.description}</Text><Text style={[styles.productPrice, product.soldOut && styles.soldOutText]}>{product.soldOut ? "Épuisé" : money(product.price)}</Text></View>
    <View style={[styles.plus, product.soldOut && styles.plusSoldOut]}><Text style={styles.plusText}>{product.soldOut ? "–" : "+"}</Text></View>
  </Pressable>;
}

function CategoryHeader({ title, subtitle }) {
  return <View style={styles.categoryHeader}>
    <Text style={styles.categoryHeaderTitle}>{title}</Text>
    {subtitle ? <Text style={styles.categoryHeaderSubtitle}>{subtitle}</Text> : null}
  </View>;
}

function GoogleReviewsCarousel() {
  const { width } = useWindowDimensions();
  const [googleReviews, setGoogleReviews] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE_URL}/google-reviews`).then((response) => response.ok ? response.json() : null).then((payload) => { if (payload?.configured && payload.reviews?.length) setGoogleReviews(payload); }).catch(() => {});
  }, []);
  if (!googleReviews) return null;
  const cardWidth = width >= 900 ? 360 : Math.max(260, width - 72);
  return <View style={styles.googleReviewsSection}><View style={styles.googleReviewsHeading}><View><Text style={styles.googleReviewsTitle}>Avis Google</Text><Text style={styles.googleReviewsScore}>★ {googleReviews.rating?.toFixed(1)} · {googleReviews.reviewCount} avis</Text></View><Pressable onPress={() => Linking.openURL(GOOGLE_REVIEW_URL)}><Text style={styles.googleReviewsLink}>Voir sur Google ↗</Text></Pressable></View><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.googleReviewsTrack}>{googleReviews.reviews.map((review, index) => <View key={`${review.author}-${index}`} style={[styles.googleReviewCard, { width: cardWidth }]}><Text style={styles.googleReviewStars}>{"★".repeat(Math.round(review.rating || 0))}{"☆".repeat(5 - Math.round(review.rating || 0))}</Text><Text style={styles.googleReviewText} numberOfLines={4}>{review.text || "Avis partagé sur Google"}</Text><Text style={styles.googleReviewAuthor}>{review.author} · Google</Text></View>)}</ScrollView></View>;
}

function BibouPlusHomeCard({ active, customer, onPress }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.bibouPlusShortcut}>
    <Pressable onPress={() => setExpanded((value) => !value)} style={styles.bibouPlusShortcutHeader} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel="Afficher les avantages de l’abonnement Bibou +">
      <View style={styles.bibouPlusShortcutMark}><Text style={styles.bibouPlusShortcutMarkText}>✦</Text></View>
      <View style={styles.bibouPlusShortcutHeading}><Text style={styles.bibouPlusShortcutTitle}>L’ABONNEMENT BIBOU +</Text></View>
      {active && <View style={styles.bibouPlusShortcutActiveBadge}><Text style={styles.bibouPlusShortcutActiveText}>ACTIF</Text></View>}
      <Text style={styles.bibouPlusShortcutDisclosure}>{expanded ? "⌃" : "⌄"}</Text>
    </Pressable>
    {expanded && <><View style={styles.bibouPlusShortcutBenefits}>
      <View style={styles.bibouPlusShortcutBenefit}><Text style={styles.bibouPlusShortcutCheck}>✓</Text><Text style={styles.bibouPlusShortcutBenefitText}>Livraison offerte</Text></View>
      <View style={styles.bibouPlusShortcutBenefit}><Text style={styles.bibouPlusShortcutCheck}>✓</Text><Text style={styles.bibouPlusShortcutBenefitText}>−5 % sur toutes les commandes</Text></View>
      <View style={styles.bibouPlusShortcutBenefit}><Text style={styles.bibouPlusShortcutCheck}>✓</Text><Text style={styles.bibouPlusShortcutBenefitText}>Points de fidélité multipliés par 2</Text></View>
    </View>
    <Pressable onPress={onPress} style={styles.bibouPlusShortcutFooter} accessibilityRole="button" accessibilityLabel={active ? "Gérer ou prolonger l’abonnement Bibou +" : "Souscrire à Bibou + pour 9,99 euros"}><View><Text style={styles.bibouPlusShortcutPrice}>{active ? "Abonnement en cours" : "9,99 €"}</Text><Text style={styles.bibouPlusShortcutPeriod}>{active ? `Valable jusqu’au ${new Date(customer.bibouPlusExpiresAt).toLocaleDateString("fr-FR")}` : "Souscrire · 30 jours · sans renouvellement automatique"}</Text></View><Text style={styles.bibouPlusShortcutArrow}>›</Text></Pressable></>}
  </View>;
}

function MenuScreen({ onOpenContest, onOpenProduct, onQuickAdd, cartCount, onOpenCart, loyaltyPoints, onOpenLoyalty, onOpenAccount, onOpenReservation, onOpenBibouPlus, onOpenPrivacy, onChooseOrderMethod, preferredMethod, customer, catalog, stockMessage, pendingPayment, onResumePayment }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const scrollRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(0);
  const products = PRODUCTS.map((product) => applyProductStock(product, catalog));
  const snacks = SNACK_PRODUCTS.map((product) => applyProductStock(product, catalog));
  const drinks = DRINK_PRODUCTS.map((product) => applyProductStock(product, catalog));
  const taurus = products[0];
  const menus = products.filter((product) => product.isMenu && product.id !== taurus.id);
  const burgers = products.filter((product) => !product.isMenu);
  const chooseOrderMethod = (method) => {
    onChooseOrderMethod(method);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, menuPosition - 18), animated: true }), 50);
  };
  const bibouPlusActive = customerHasBibouPlus(customer);
  return <ScrollView ref={scrollRef} contentContainerStyle={[styles.scrollContent, desktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}><Header right={cartCount ? `🛍  ${cartCount}` : "🛍"} onRight={onOpenCart} /><>{pendingPayment && <Pressable accessibilityRole="button" onPress={onResumePayment} style={styles.statusCard}><Text style={styles.statusTitle}>Retrouver mon paiement en cours ›</Text><Text style={styles.statusDescription}>Vérifie cette tentative avant de repasser commande.</Text></Pressable>}</><View style={[styles.homeTopRow, desktop && styles.homeTopRowDesktop]}><View style={styles.addressBox}><Text style={styles.addressLabel}>Zone de livraison</Text><Text style={styles.addressValue}>{DELIVERY_ZONE}</Text></View><Pressable onPress={onOpenAccount} style={[styles.accountShortcut, desktop && styles.accountShortcutDesktop]}><Text style={styles.accountShortcutIcon}>👤</Text><Text style={styles.accountShortcutText}>{customer.name ? customer.name.split(" ")[0] : "Mon compte"}</Text></Pressable></View><Text style={styles.serviceTitle}>Que souhaites-tu faire ?</Text><View style={[styles.serviceActions, desktop && styles.serviceActionsDesktop]}><Pressable onPress={() => chooseOrderMethod("pickup")} style={[styles.serviceAction, preferredMethod === "pickup" && styles.serviceActionSelected]}><Text style={styles.serviceActionIcon}>🛍</Text><Text style={styles.serviceActionTitle}>Click & Collect</Text><Text style={styles.serviceActionText}>Retrait sur place</Text></Pressable><Pressable onPress={() => chooseOrderMethod("delivery")} style={[styles.serviceAction, preferredMethod === "delivery" && styles.serviceActionSelected]}><Text style={styles.serviceActionIcon}>🛵</Text><Text style={styles.serviceActionTitle}>Livraison</Text><Text style={styles.serviceActionText}>Chez toi</Text></Pressable><Pressable onPress={onOpenReservation} style={[styles.serviceAction, styles.serviceActionReservation]}><Text style={styles.serviceActionIcon}>🍽</Text><Text style={styles.serviceActionTitle}>Réserver</Text><Text style={styles.serviceActionText}>Une table</Text></Pressable></View><BibouPlusHomeCard active={bibouPlusActive} customer={customer} onPress={onOpenBibouPlus} />{customerHasWelcomeReward(customer) && <View style={styles.welcomeRewardBanner}><Text style={styles.welcomeRewardIcon}>🎉</Text><View><Text style={styles.welcomeRewardTitle}>Bienvenue ! −10 % sur ta première commande</Text><Text style={styles.welcomeRewardText}>La remise s’appliquera automatiquement au paiement.</Text></View></View>}<Pressable onPress={onOpenLoyalty} style={[styles.loyaltyShortcut, desktop && styles.loyaltyShortcutDesktop]}><View><Text style={styles.loyaltyShortcutEyebrow}>CLUB BIBOU</Text><Text style={styles.loyaltyShortcutTitle}>★ {loyaltyPoints} points disponibles</Text></View><Text style={styles.loyaltyShortcutArrow}>›</Text></Pressable><NewsCarousel apiBaseUrl={API_BASE_URL} onOpenContest={onOpenContest} /><GoogleReviewsCarousel />{stockMessage ? <Text style={styles.stockNotice}>{stockMessage}</Text> : null}<View onLayout={(event) => setMenuPosition(event.nativeEvent.layout.y)}><CategoryHeader title="Nos menus" subtitle="Burger + frites et boisson" size="menu" /></View><View style={desktop && styles.productGrid}>{menus.map((product) => <View key={product.id} style={desktop && styles.productGridItem}><ProductCard product={product} onPress={onOpenProduct} /></View>)}</View><CategoryHeader title="Nos burgers" subtitle="Burgers seuls" size="burgers" /><View style={desktop && styles.productGrid}>{burgers.map((product) => <View key={product.id} style={desktop && styles.productGridItem}><ProductCard product={product} onPress={onOpenProduct} /></View>)}</View><CategoryHeader title="Petites faims" subtitle="À partager… ou à garder rien que pour soi." size="snacks" /><View style={desktop && styles.productGrid}>{snacks.map((product) => <View key={product.id} style={desktop && styles.productGridItem}><AccessoryCard product={product} onPress={product.kind === "duo" ? onOpenProduct : onQuickAdd} /></View>)}</View><CategoryHeader title="Boissons" subtitle="Une boisson fraîche pour compléter ta commande." /><View style={desktop && styles.productGrid}>{drinks.map((product) => <View key={product.id} style={desktop && styles.productGridItem}><AccessoryCard product={product} onPress={onQuickAdd} /></View>)}</View>{desktop && <View style={styles.siteFooter}><View><Text style={styles.siteFooterTitle}>Bibou's Burgers</Text><Text style={styles.siteFooterText}>153 quai Georges V, 76600 Le Havre{"\n"}Livraison dans un rayon de 5 km · Retrait au restaurant</Text></View><Pressable onPress={() => Linking.openURL(GOOGLE_REVIEW_URL)} style={styles.siteFooterButton}><Text style={styles.siteFooterButtonText}>Voir les avis Google ↗</Text></Pressable></View>}<Pressable onPress={onOpenPrivacy} style={styles.homePrivacyLink}><Text style={styles.homePrivacyLinkText}>Confidentialité et données personnelles</Text></Pressable><Pressable onPress={onOpenCart} style={[styles.floatingCart, desktop && styles.floatingCartDesktop]}><Text style={styles.floatingCartText}>Panier{cartCount ? ` · ${cartCount}` : ""}</Text><Text style={styles.floatingCartIcon}>🛍</Text></Pressable></ScrollView>;
}

function AccountScreen({ onOpenOffers, onOpenNotifications, customer, loyalty, orders, reservations, onBack, onOpenOrders, onOpenReservations, onOpenLoyalty, onOpenBibouPlus, onOpenPrivacy, onDeleteAccount, onLogout }) {
  const activeOrder = orders.find((order) => order.progress < ORDER_STEPS.length - 1);
  const customerName = customer.name || "Client Bibou";
  const bibouPlusActive = customerHasBibouPlus(customer);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.accountContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><View style={styles.accountHero}><View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{customerName.slice(0, 1).toUpperCase()}</Text></View><View><Text style={styles.accountGreeting}>Bonjour, {customerName.split(" ")[0]} !</Text><Text style={styles.accountContact}>{customer.phone || "Ajoute ton téléphone lors de ta première commande"}</Text></View></View>{customerHasWelcomeReward(customer) && <View style={styles.welcomeRewardBanner}><Text style={styles.welcomeRewardIcon}>🎉</Text><View><Text style={styles.welcomeRewardTitle}>Ton cadeau de bienvenue est prêt</Text><Text style={styles.welcomeRewardText}>−10 % automatiquement sur ta première commande.</Text></View></View>}{activeOrder && <Pressable onPress={onOpenOrders} style={styles.currentOrderCard}><View><Text style={styles.currentOrderEyebrow}>COMMANDE EN COURS</Text><Text style={styles.currentOrderTitle}>{activeOrder.product}</Text><Text style={styles.currentOrderText}>{ORDER_STEPS[activeOrder.progress]} · {activeOrder.slot}</Text></View><Text style={styles.currentOrderArrow}>›</Text></Pressable>}<Text style={styles.sectionTitle}>Mon espace</Text><Pressable onPress={onOpenBibouPlus} style={[styles.accountAction, bibouPlusActive && styles.accountActionPlusActive]}><View style={[styles.accountActionIcon, styles.accountActionPlusIcon]}><Text>✦</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Bibou +</Text><Text style={styles.accountActionText}>{bibouPlusActive ? `Actif jusqu’au ${new Date(customer.bibouPlusExpiresAt).toLocaleDateString("fr-FR")}` : "Livraison offerte, −5 % et points ×2"}</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenOrders} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>🧾</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Mes commandes</Text><Text style={styles.accountActionText}>{orders.length} commande{orders.length > 1 ? "s" : ""} dans ton historique</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenReservations} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>🍽</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Mes réservations</Text><Text style={styles.accountActionText}>{reservations.length ? `${reservations.length} réservation${reservations.length > 1 ? "s" : ""} retrouvée${reservations.length > 1 ? "s" : ""}` : "Suis ici la confirmation de ta table"}</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenLoyalty} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>★</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Club Bibou</Text><Text style={styles.accountActionText}>{loyalty.points} points disponibles</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenOffers} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>🎁</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Mes offres</Text><Text style={styles.accountActionText}>Bons personnels et anniversaire facultatif</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenNotifications} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>◉</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Mes notifications</Text><Text style={styles.accountActionText}>Suivi des commandes et promotions : à toi de choisir</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenPrivacy} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>🔒</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Confidentialité</Text><Text style={styles.accountActionText}>Tes données et tes choix</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable accessibilityRole="button" onPress={onLogout} style={styles.accountAction}><Text style={styles.accountActionTitle}>Me déconnecter</Text></Pressable><Pressable onPress={onDeleteAccount} style={styles.accountDeleteAction}><Text style={styles.accountDeleteText}>Supprimer mon compte</Text></Pressable><View style={styles.accountAddress}><Text style={styles.accountAddressTitle}>Adresse enregistrée</Text><Text style={styles.accountAddressText}>{customer.address ? `${customer.address}, ${customer.postalCode} ${customer.city}` : "Elle sera enregistrée lors de ta première livraison."}</Text></View><Text style={styles.accountFinePrint}>Ton espace est sécurisé par ta connexion SMS.</Text></ScrollView></SafeAreaView>;
}

function BibouPlusScreen({ customer, authToken, loading, onBack, onLogin, onSubscribe }) {
  const active = customerHasBibouPlus(customer);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.bibouPlusContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><View style={styles.bibouPlusHero}><Text style={styles.bibouPlusSpark}>✦</Text><Text style={styles.bibouPlusName}>BIBOU +</Text><Text style={styles.bibouPlusPrice}>9,99 € <Text style={styles.bibouPlusPeriod}>/ 30 jours</Text></Text><Text style={styles.bibouPlusTagline}>Plus de plaisir, moins de frais à chaque commande.</Text></View>{active && <View style={styles.bibouPlusActiveCard}><Text style={styles.bibouPlusActiveTitle}>✓ Tes avantages sont actifs</Text><Text style={styles.bibouPlusActiveText}>Jusqu’au {new Date(customer.bibouPlusExpiresAt).toLocaleDateString("fr-FR")}. Une nouvelle période prolongera cette date de 30 jours.</Text></View>}<Text style={styles.sectionTitle}>Tes avantages</Text><View style={styles.bibouPlusBenefits}><View style={styles.bibouPlusBenefit}><Text style={styles.bibouPlusBenefitIcon}>🛵</Text><View><Text style={styles.bibouPlusBenefitTitle}>Livraison offerte</Text><Text style={styles.bibouPlusBenefitText}>Dans toute notre zone habituelle de 5 km.</Text></View></View><View style={styles.bibouPlusBenefit}><Text style={styles.bibouPlusBenefitIcon}>%</Text><View><Text style={styles.bibouPlusBenefitTitle}>5 % sur les produits</Text><Text style={styles.bibouPlusBenefitText}>La remise est appliquée automatiquement.</Text></View></View><View style={styles.bibouPlusBenefit}><Text style={styles.bibouPlusBenefitIcon}>★</Text><View><Text style={styles.bibouPlusBenefitTitle}>Points de fidélité doublés</Text><Text style={styles.bibouPlusBenefitText}>En plus du multiplicateur de la semaine.</Text></View></View></View><View style={styles.bibouPlusTerms}><Text style={styles.bibouPlusTermsTitle}>Simple et sans surprise</Text><Text style={styles.bibouPlusTermsText}>Cette première version fonctionne par périodes de 30 jours. Il n’y a aucun renouvellement ni débit automatique : tu décides quand prolonger.</Text></View>{!authToken ? <Pressable onPress={onLogin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Me connecter pour m’abonner</Text></Pressable> : <Pressable disabled={loading} onPress={onSubscribe} style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{loading ? "Ouverture du paiement…" : active ? `Prolonger de 30 jours · ${money(BIBOU_PLUS_PRICE)}` : `Activer Bibou + · ${money(BIBOU_PLUS_PRICE)}`}</Text></Pressable>}<Text style={styles.bibouPlusLegal}>Paiement sécurisé par SumUp. Les avantages commencent uniquement après confirmation du paiement.</Text></ScrollView></SafeAreaView>;
}

function BibouPlusPendingScreen({ onCheckPayment, onBack }) {
  return <SafeAreaView style={styles.safeArea}><View style={styles.successContent}><Text style={styles.successEmoji}>✦</Text><Text style={styles.successTitle}>Activation de Bibou +</Text><Text style={styles.successText}>Finalise le paiement de 9,99 € sur la page sécurisée SumUp, puis reviens ici.</Text><View style={styles.statusCard}><Text style={styles.statusTitle}>● En attente de SumUp</Text><Text style={styles.statusDescription}>La livraison offerte, les 5 % et les points doublés seront activés ensemble après confirmation.</Text></View><Pressable style={styles.primaryButton} onPress={onCheckPayment}><Text style={styles.primaryButtonText}>J’ai terminé le paiement</Text></Pressable><Pressable style={styles.trackOrderButton} onPress={onBack}><Text style={styles.trackOrderButtonText}>Retour à Bibou +</Text></Pressable></View></SafeAreaView>;
}

function PrivacyScreen({ onBack, onDeleteAccount }) {
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Confidentialité</Text><Text style={styles.legalUpdated}>Politique mise à jour le 19 septembre 2026</Text><Text style={styles.legalIntro}>Bibou & Co utilise uniquement les informations nécessaires pour prendre les commandes, livrer, réserver une table et faire fonctionner le programme de fidélité Bibou’s Burgers.</Text><LegalSection title="Données utilisées" text="Nom, numéro de téléphone, adresse de livraison, commandes, réservations, solde fidélité et statut Bibou +. L’application ne contient ni publicité ni suivi publicitaire." /><LegalSection title="Pourquoi ces données ?" text="Elles servent à sécuriser la connexion par SMS, préparer et livrer les commandes, gérer les réservations, calculer les avantages fidélité et répondre aux demandes du client." /><LegalSection title="Services partenaires" text="Twilio envoie les codes de connexion par SMS. SumUp traite les paiements par carte : Bibou & Co ne reçoit jamais le numéro complet de la carte. Google aide à calculer la distance de livraison et à afficher les avis publics." /><LegalSection title="Conservation et sécurité" text="Les données du compte sont conservées tant que le compte est actif. Après suppression, les coordonnées personnelles sont effacées ou anonymisées. Les informations strictement nécessaires aux obligations comptables peuvent être conservées sans profil client identifiable." /><LegalSection title="Notifications" text="Le suivi des commandes et les promotions sont deux choix distincts, désactivés par défaut. Expo, Apple et Google transmettent les notifications aux appareils autorisés. Nous conservons l’identifiant technique de notification et les préférences, sans publicité tierce. Les appareils inactifs sont retirés après 90 jours ; l’historique technique des envois est conservé 7 jours. Tu peux désactiver chaque catégorie dans Mon compte > Mes notifications. La déconnexion retire cet appareil ; la suppression du compte retire toutes ses associations." /><LegalSection title="Offres personnalisées" text="Sur ton accord facultatif, ton historique de commandes (fréquence et montants) et ton anniversaire (jour et mois seulement) peuvent servir à t’attribuer des bons personnels. Aucun ancien compte n’est inscrit automatiquement. Tu peux modifier ou retirer ton accord et effacer ton anniversaire dans Mon compte > Mes offres. Les données de ciblage et les bons personnels sont supprimés avec le compte. Les promotions push restent un choix séparé. Les bons déjà accordés restent valables si tu retires ton accord." /><LegalSection title="Tes choix" text="Tu peux consulter et corriger tes coordonnées depuis ton compte. Tu peux aussi supprimer définitivement ton compte et ses données personnelles depuis l’application ou la version web." /><LegalSection title="Responsable" text="Bibou & Co · Bibou’s Burgers · 153 quai Georges V, 76600 Le Havre, France." /><Pressable onPress={onDeleteAccount} style={styles.legalDeleteLink}><Text style={styles.legalDeleteLinkText}>Demander la suppression de mon compte ›</Text></Pressable><Text style={styles.legalFootnote}>Cette page est accessible publiquement à l’adresse bibous-burger-app.onrender.com/?legal=privacy.</Text></ScrollView></SafeAreaView>;
}

function LegalSection({ title, text }) {
  return <View style={styles.legalSection}><Text style={styles.legalSectionTitle}>{title}</Text><Text style={styles.legalSectionText}>{text}</Text></View>;
}

function DeleteAccountScreen({ authToken, loading, onBack, onLogin, onDelete }) {
  const [confirmed, setConfirmed] = useState(false);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><View style={styles.deleteAccountIcon}><Text style={styles.deleteAccountIconText}>×</Text></View><Text style={styles.title}>Supprimer mon compte</Text><Text style={styles.legalIntro}>Cette action efface tes coordonnées, ton solde et tes avantages. Tes réservations actives seront annulées. Les anciennes commandes seront anonymisées lorsqu’elles doivent être conservées pour la comptabilité.</Text>{!authToken ? <><View style={styles.legalSection}><Text style={styles.legalSectionTitle}>Vérification nécessaire</Text><Text style={styles.legalSectionText}>Connecte-toi par SMS avec le numéro du compte à supprimer.</Text></View><Pressable onPress={onLogin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Me connecter par SMS</Text></Pressable></> : !confirmed ? <Pressable onPress={() => setConfirmed(true)} style={styles.deleteAccountOutline}><Text style={styles.deleteAccountOutlineText}>Continuer</Text></Pressable> : <View style={styles.deleteConfirmCard}><Text style={styles.deleteConfirmTitle}>Dernière confirmation</Text><Text style={styles.deleteConfirmText}>La suppression est définitive et ne peut pas être annulée.</Text><Pressable disabled={loading} onPress={onDelete} style={[styles.deleteAccountButton, loading && styles.primaryButtonDisabled]}><Text style={styles.deleteAccountButtonText}>{loading ? "Suppression…" : "Supprimer définitivement"}</Text></Pressable><Pressable disabled={loading} onPress={() => setConfirmed(false)} style={styles.loginSecondary}><Text style={styles.loginSecondaryText}>Annuler</Text></Pressable></View>}</ScrollView></SafeAreaView>;
}

function SmsLoginScreen({ onBack, onAuthenticated }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const normalizedPhone = normalizeFrenchMobile(phone);
  const sendCode = async () => {
    if (!normalizedPhone) {
      setFeedback("Saisis un numéro mobile français complet commençant par 06 ou 07.");
      return;
    }
    setLoading(true);
    setFeedback("");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/sms/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalizedPhone }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’envoyer le code.");
      setPhone(normalizedPhone);
      setStep("code");
    } catch (error) {
      const message = error.message || "Réessaie dans un instant.";
      setFeedback(message);
      Alert.alert("SMS indisponible", message);
    }
    finally { setLoading(false); }
  };
  const checkCode = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/sms/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Le code est invalide.");
      onAuthenticated(payload);
    } catch (error) { Alert.alert("Code invalide", error.message || "Réessaie avec un nouveau code."); }
    finally { setLoading(false); }
  };
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled"><Header onBack={onBack} /><View style={styles.loginIcon}><Text style={styles.loginIconText}>✉</Text></View><Text style={styles.title}>{step === "phone" ? "Bienvenue" : "Vérifie ton numéro"}</Text><Text style={styles.loginIntro}>{step === "phone" ? "Connecte-toi avec ton numéro de téléphone pour retrouver tes commandes et tes points fidélité." : `Un code a été envoyé au ${phone}.`}</Text><View style={styles.loginCard}>{step === "phone" ? <><Text style={styles.deliveryLabel}>NUMÉRO DE TÉLÉPHONE</Text><TextInput value={phone} onChangeText={(value) => { setPhone(value); setFeedback(""); }} placeholder="06 12 34 56 78" placeholderTextColor="#9B877B" style={styles.fieldInput} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" /><Text style={feedback ? styles.loginError : styles.loginFinePrint}>{feedback || "Un code à usage unique te sera envoyé par SMS. Aucun mot de passe à retenir."}</Text><Pressable disabled={loading} onPress={sendCode} style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{loading ? "Envoi en cours…" : "Recevoir mon code"}</Text></Pressable></> : <><Text style={styles.deliveryLabel}>CODE REÇU PAR SMS</Text><TextInput value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.codeInput]} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} />{feedback ? <Text style={styles.loginError}>{feedback}</Text> : null}<Pressable disabled={code.length < 4 || loading} onPress={checkCode} style={[styles.primaryButton, (code.length < 4 || loading) && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{loading ? "Vérification…" : "Valider le code"}</Text></Pressable><Pressable onPress={() => { setCode(""); setFeedback(""); setStep("phone"); }} style={styles.loginSecondary}><Text style={styles.loginSecondaryText}>Modifier mon numéro</Text></Pressable></>}</View><Text style={styles.loginLegal}>En te connectant, tu acceptes de recevoir ce SMS de vérification nécessaire à la sécurisation de ton compte.</Text></ScrollView></SafeAreaView>;
}

function OrdersScreen({ orders, onBack, onRefresh }) {
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status));
  const activeMessage = activeOrder?.progress === 0 ? "Le restaurant a bien reçu ta commande." : activeOrder?.progress === 1 ? "Le restaurant prépare ta commande." : activeOrder?.progress === 2 ? "Ta commande est prête : le livreur arrive." : "Ton livreur est en route.";
  const labelForOrder = (order) => order.status === "cancelled" ? "Annulée" : ORDER_STEPS[order.progress];
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.accountContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Mes commandes</Text>{activeOrder && <><Text style={styles.sectionTitle}>Suivi en direct</Text><View style={styles.trackingCard}><View style={styles.trackingHeader}><View><Text style={styles.trackingOrder}>{activeOrder.id} · {activeOrder.product}</Text><Text style={styles.trackingMeta}>{activeOrder.method === "delivery" ? "Livraison" : "Retrait"} · {activeOrder.slot}</Text></View><Text style={styles.trackingPrice}>{money(activeOrder.total)}</Text></View><View style={styles.trackingSteps}>{ORDER_STEPS.map((step, index) => <View key={step} style={styles.trackingStep}><View style={[styles.trackingDot, index <= activeOrder.progress && styles.trackingDotDone]}>{index <= activeOrder.progress && <Text style={styles.trackingCheck}>✓</Text>}</View><Text style={[styles.trackingLabel, index <= activeOrder.progress && styles.trackingLabelDone]}>{step}</Text></View>)}</View><Text style={styles.trackingMessage}>{activeMessage}</Text></View><Pressable onPress={onRefresh} style={styles.simulateButton}><Text style={styles.simulateButtonText}>Actualiser le suivi</Text><Text style={styles.simulateHint}>Voir la dernière mise à jour du restaurant</Text></Pressable></>}<Text style={styles.sectionTitle}>Historique</Text>{orders.map((order) => <View key={order.id} style={styles.historyOrder}><View style={styles.historyIcon}><Text>{order.status === "delivered" ? "✓" : order.status === "cancelled" ? "×" : "◷"}</Text></View><View style={styles.historyCopy}><Text style={styles.historyTitle}>{order.product}</Text><Text style={styles.historyMeta}>{order.id} · {labelForOrder(order)} · {order.date}</Text></View><Text style={styles.historyPrice}>{money(order.total)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function ReservationsScreen({ reservations, onBack, onRefresh }) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => {
    refreshRef.current(true);
    const timer = setInterval(() => refreshRef.current(true), 10000);
    return () => clearInterval(timer);
  }, []);
  const today = localDateKey(new Date());
  const upcoming = reservations.filter((reservation) => reservation.serviceDate >= today && reservation.status !== "cancelled");
  const history = reservations.filter((reservation) => !upcoming.includes(reservation));
  const card = (reservation) => {
    const status = reservationStatus[reservation.status] || reservationStatus.pending;
    return <View key={reservation.id} style={styles.customerReservationCard}><View style={[styles.customerReservationIcon, { backgroundColor: status.background }]}><Text style={[styles.customerReservationIconText, { color: status.color }]}>{status.icon}</Text></View><View style={styles.customerReservationCopy}><Text style={styles.customerReservationTitle}>{reservation.dateLabel} · {reservation.slot.slice(0, 5)}</Text><Text style={styles.customerReservationMeta}>{reservation.guests} personne{reservation.guests > 1 ? "s" : ""} · Réservation n°{reservation.number}</Text><Text style={[styles.customerReservationStatus, { color: status.color }]}>{status.label} · {status.message}</Text></View></View>;
  };
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.accountContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Mes réservations</Text><Text style={styles.deliveryIntro}>Retrouve ici les demandes associées à ton numéro de téléphone. Leur statut s’actualise automatiquement.</Text><Pressable onPress={() => onRefresh(false)} style={styles.simulateButton}><Text style={styles.simulateButtonText}>Actualiser maintenant</Text><Text style={styles.simulateHint}>Mise à jour automatique toutes les 10 secondes</Text></Pressable><Text style={styles.sectionTitle}>À venir</Text>{upcoming.length ? upcoming.map(card) : <View style={styles.emptyReservationState}><Text style={styles.emptyIcon}>🍽</Text><Text style={styles.emptyTitle}>Aucune table à venir</Text><Text style={styles.emptyText}>Tu peux réserver depuis l’accueil.</Text></View>}{history.length > 0 && <><Text style={styles.sectionTitle}>Historique</Text>{history.map(card)}</>}</ScrollView></SafeAreaView>;
}

function ProductScreen({ product, catalog, onBack, onAdd }) {
  const fixedSauce = fixedSauceForProduct(product);
  const optionGroups = availableOptionGroups(product.optionGroups || (product.isMenu ? MENU_OPTION_GROUPS : BURGER_OPTION_GROUPS), catalog).filter((group) => group.id !== "sauces" || !fixedSauce);
  const [choices, setChoices] = useState({});
  const selectedOptions = useMemo(() => {
    const choicesMade = optionGroups.flatMap((group) => group.options.filter((option) => choices[group.id]?.includes(option.id)).map((option) => ({ ...option, groupId: group.id })));
    return fixedSauce ? [...choicesMade, { groupId: "sauces", id: fixedSauce.id, label: `Sauce imposée · ${fixedSauce.label}`, price: 0 }] : choicesMade;
  }, [choices, optionGroups, fixedSauce]);
  const total = product.price + selectedOptions.reduce((sum, option) => sum + option.price, 0);
  const stockProblem = cartStockProblem([{ product, selections: selectedOptions }], catalog);
  const hasRequiredChoices = !stockProblem && optionGroups.filter((group) => group.required).every((group) => (choices[group.id] || []).length >= group.min);
  const toggleChoice = (group, option) => {
    const current = choices[group.id] || [];
    const isSelected = current.includes(option.id);
    let next;
    if (isSelected) next = current.filter((id) => id !== option.id);
    else if (option.soldOut) return;
    else if (option.exclusive) next = [option.id];
    else { const withoutExclusive = current.filter((id) => !group.options.find((item) => item.id === id)?.exclusive); next = group.max === 1 ? [option.id] : [...withoutExclusive, option.id]; if (group.max && next.length > group.max) return; }
    setChoices({ ...choices, [group.id]: next });
  };
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Image source={product.image} style={styles.detailImage} /><View style={styles.priceRow}><Text style={styles.detailTitle}>{product.name}</Text><Text style={styles.detailPrice}>{money(product.price)}</Text></View><Text style={styles.detailDescription}>{product.detail}</Text>{product.isMenu && <Text style={styles.includedText}>Frites maison incluses dans le menu</Text>}<Text style={styles.sectionTitle}>{product.kind === "duo" ? "Choisis les deux boissons" : product.isMenu ? "Compose ton menu" : "Compose ton burger"}</Text>{fixedSauce && <View style={styles.fixedSauceNotice}><Text style={styles.fixedSauceEyebrow}>SAUCE IMPOSÉE</Text><Text style={styles.fixedSauceName}>{fixedSauce.label}</Text><Text style={styles.fixedSauceText}>Cette sauce fait partie de la recette et ne peut pas être remplacée.</Text></View>}{optionGroups.map((group) => <OptionGroup key={group.id} group={group} selectedIds={choices[group.id] || []} onToggleChoice={(option) => toggleChoice(group, option)} />)}</ScrollView><View style={styles.stickyAction}>{stockProblem ? <Text style={styles.stockNotice}>{stockProblem}</Text> : !hasRequiredChoices && <Text style={styles.requiredHint}>Choisis les options marquées « requis » pour continuer.</Text>}<Pressable disabled={!hasRequiredChoices} style={[styles.primaryButton, !hasRequiredChoices && styles.primaryButtonDisabled]} onPress={() => onAdd({ product, total, options: selectedOptions.map((option) => option.label), selections: selectedOptions.map(({ groupId, id }) => ({ groupId, id })) })}><Text style={styles.primaryButtonText}>Ajouter au panier · {money(total)}</Text></Pressable></View></SafeAreaView>;
}

function OptionVisual({ groupId, option }) {
  if (groupId === "sauces") return SAUCE_VISUALS[option.id] ? <Image source={SAUCE_VISUALS[option.id]} style={styles.saucePotPhoto} /> : <View style={styles.noSauceVisual}><Text style={styles.noSauceVisualText}>×</Text></View>;
  if (groupId === "drink" || groupId.startsWith("duo-drink")) return option.image ? <Image source={option.image} style={styles.optionDrinkImage} /> : <View style={styles.optionDrinkFallback}><Text style={styles.optionDrinkFallbackText}>🥤</Text></View>;
  return null;
}

function OptionGroup({ group, selectedIds, onToggleChoice }) {
  const selectionText = group.max ? `${selectedIds.length} sur ${group.max} sélectionné${selectedIds.length > 1 ? "s" : ""}` : `${selectedIds.length} sélectionné${selectedIds.length > 1 ? "s" : ""}`;
  const helper = group.id === "protein" ? "Choisis viande ou version végétarienne" : group.id === "salad" ? "Sélectionne les crudités que tu souhaites" : group.id === "sauces" ? "Sélectionne les sauces que tu souhaites" : group.id === "drink" || group.id.startsWith("duo-drink") ? "Choisis une boisson" : group.max === 1 ? "Sélectionne jusqu’à 1 choix" : "Facultatif";
  return <View style={styles.optionGroup}><View style={styles.optionGroupHeader}><View style={styles.optionGroupTitleWrap}><Text style={styles.optionGroupTitle}>{group.title}{group.required ? "  (requis)" : ""}</Text><Text style={styles.optionGroupHelper}>{selectionText} · {helper}</Text></View></View><View style={styles.optionGrid}>{group.options.map((option) => <OptionRow key={option.id} groupId={group.id} option={option} selected={selectedIds.includes(option.id)} onPress={() => onToggleChoice(option)} />)}</View></View>;
}

function OptionRow({ groupId, option, selected, onPress }) {
  if (groupId === "sides" || groupId === "extras") return <Pressable disabled={option.soldOut && !selected} onPress={onPress} style={[styles.option, styles.sideOption, selected && styles.optionSelected, option.soldOut && styles.optionSoldOut]}><Image source={option.image} style={styles.optionSideImage} /><View style={styles.sideOptionChoice}><View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Text style={styles.checkmark}>✓</Text>}</View><Text style={[styles.optionName, selected && styles.optionNameSelected]}>{option.label}</Text></View>{option.soldOut ? <Text style={styles.soldOutText}>Épuisé</Text> : option.price > 0 && <Text style={styles.sideOptionValue}>+ {money(option.price)}</Text>}</Pressable>;
  return <Pressable disabled={option.soldOut && !selected} onPress={onPress} style={[styles.option, selected && styles.optionSelected, option.soldOut && styles.optionSoldOut]}><OptionVisual groupId={groupId} option={option} /><View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Text style={styles.checkmark}>✓</Text>}</View><Text style={[styles.optionName, selected && styles.optionNameSelected]}>{option.label}</Text>{option.soldOut ? <Text style={styles.soldOutText}>Épuisé</Text> : option.price > 0 && <Text style={styles.optionValue}>+ {money(option.price)}</Text>}</Pressable>;
}

function ReceiptLine({ label, value, strong }) { return <View style={styles.receiptLine}><Text style={strong && styles.strong}>{label}</Text><Text style={strong && styles.strong}>{value}</Text></View>; }

function CartScreen({ cart, customer, catalog, onBack, onCheckout, onAddMore, onRemove, onQuickAdd }) {
  const standardFee = cart ? (cart.delivery.fee ?? deliveryCost(cart.delivery.method)) : 0;
  const pricing = cart ? customerOrderPricing(cart.total, standardFee, customer, cart.delivery.method === "delivery") : { total: 0, deliveryFee: 0, discount: 0, bibouPlus: false };
  const hasExactFee = cart?.delivery.fee !== undefined || pricing.bibouPlus;
  const productIds = new Set(cart?.items?.map((item) => item.product.id) || []);
  const stockProblem = cartStockProblem(cart?.items, catalog);
  const suggestions = [...SNACK_PRODUCTS.filter((product) => product.kind === "simple"), ...DRINK_PRODUCTS].map((product) => applyProductStock(product, catalog)).filter((product) => !product.soldOut && !productIds.has(product.id)).slice(0, 3);
  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      <Header onBack={onBack} />
      <Text style={styles.title}>Ton panier</Text>
      {!cart ? <View style={styles.emptyState}><Text style={styles.emptyIcon}>🛍</Text><Text style={styles.emptyTitle}>Ton panier est vide</Text><Text style={styles.emptyText}>Ajoute un burger qui te fait envie.</Text></View> : <>
        <View style={styles.cartItems}>{cart.items.map((item) => <View key={item.lineId} style={styles.cartItem}>
          {item.product.image ? <Image source={item.product.image} style={[styles.cartImage, item.product.kind === "drink" && styles.drinkCartImage]} /> : <View style={styles.cartEmoji}><Text style={styles.cartEmojiText}>{item.product.emoji}</Text></View>}
          <View style={styles.productInfo}><Text style={styles.productName}>{item.product.isMenu ? `Menu · ${item.product.name}` : item.product.name}</Text>{item.options.length > 0 && <Text numberOfLines={3} style={styles.productDescription}>{item.options.join(", ")}</Text>}<Pressable onPress={() => onRemove(item.lineId)}><Text style={styles.cartRemove}>Retirer</Text></Pressable></View>
          <Text style={styles.productPrice}>{money(item.total)}</Text>
        </View>)}</View>
        <Pressable onPress={onAddMore} style={styles.addMoreButton}><Text style={styles.addMoreButtonText}>＋ Ajouter autre chose</Text></Pressable>
        {suggestions.length > 0 && <View style={styles.cartSuggestions}><Text style={styles.cartSuggestionsTitle}>Un petit plus ?</Text><Text style={styles.cartSuggestionsIntro}>Complète ta commande en un toucher.</Text>{suggestions.map((product) => <Pressable key={product.id} onPress={() => onQuickAdd(product)} style={styles.cartSuggestion}><View style={styles.cartSuggestionVisual}>{product.image ? <Image source={product.image} style={[styles.cartSuggestionImage, product.kind === "drink" && styles.drinkSuggestionImage]} /> : <Text style={styles.cartSuggestionEmoji}>{product.emoji}</Text>}</View><View style={styles.cartSuggestionCopy}><Text style={styles.cartSuggestionName}>{product.name}</Text><Text style={styles.cartSuggestionPrice}>{money(product.price)}</Text></View><View style={styles.cartSuggestionAdd}><Text style={styles.cartSuggestionAddText}>+ Ajouter</Text></View></Pressable>)}</View>}
        <View style={styles.receipt}><ReceiptLine label="Sous-total" value={money(cart.total)} />{pricing.discount > 0 && <ReceiptLine label={pricing.discountLabel} value={`− ${money(pricing.discount)}`} />}<ReceiptLine label={cart.delivery.method === "delivery" && !hasExactFee ? "Livraison (dès)" : cart.delivery.method === "delivery" ? "Livraison" : "Retrait"} value={pricing.deliveryFee ? money(pricing.deliveryFee) : "Offert"} /><View style={styles.receiptDivider} /><ReceiptLine label={cart.delivery.method === "delivery" && !hasExactFee ? "Total estimé" : "Total"} value={money(pricing.total)} strong /></View>
        {pricing.bibouPlus && cart.delivery.method === "delivery" && <Text style={styles.bibouPlusApplied}>✦ Livraison offerte avec Bibou +</Text>}
        {cart.delivery.method === "delivery" && !hasExactFee && <Text style={styles.cartFeeHint}>Les frais exacts seront calculés selon l’adresse, dans un rayon de 5 km.</Text>}
        <Text style={styles.eta}>● Choisis ton créneau avant le paiement</Text>
      </>}
    </ScrollView>
    {cart && <View style={styles.stickyAction}>{stockProblem ? <Text style={styles.stockNotice}>{stockProblem} Retire cet article puis choisis un remplacement.</Text> : null}<Pressable disabled={!!stockProblem} style={[styles.primaryButton, !!stockProblem && styles.primaryButtonDisabled]} onPress={onCheckout}><Text style={styles.primaryButtonText}>Choisir mon créneau · {hasExactFee ? "" : "dès "}{money(pricing.total)}</Text></Pressable></View>}
  </SafeAreaView>;
}

function ChoiceChip({ label, selected, onPress }) { return <Pressable onPress={onPress} style={[styles.choiceChip, selected && styles.choiceChipSelected]}><Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{label}</Text></Pressable>; }

function ReservationScreen({ customer, authToken, onBack, onCreated, onOpenReservations }) {
  const [day, setDay] = useState(DEFAULT_DELIVERY_DAY);
  const [slot, setSlot] = useState(null);
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState({});
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotError, setSlotError] = useState(false);
  const [slotsDate, setSlotsDate] = useState(null);
  const [slotRetry, setSlotRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const autoAdvance = useRef(true);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    setSlotError(false);
    fetch(`${API_BASE_URL}/reservation-availability?date=${encodeURIComponent(day.date)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Créneaux indisponibles");
        if (!active) return;
        setAvailability(payload.slots || {});
        setSlotsDate(day.date);
        if (slot && (payload.slots?.[slot]?.unavailable || payload.slots?.[slot]?.full)) setSlot(null);
        const hasAvailableSlot = Object.values(payload.slots || {}).some((item) => !item.unavailable && !item.full);
        const currentIndex = UPCOMING_DELIVERY_DAYS.findIndex((item) => item.date === day.date);
        if (!hasAvailableSlot && autoAdvance.current && currentIndex >= 0 && currentIndex < UPCOMING_DELIVERY_DAYS.length - 1) {
          setDay(UPCOMING_DELIVERY_DAYS[currentIndex + 1]);
          return;
        }
        autoAdvance.current = false;
        setLoadingSlots(false);
      })
      .catch(() => { if (active) { setLoadingSlots(false); setSlotError(true); } });
    return () => { active = false; };
  }, [day.date, slotRetry]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const headers = { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };
      const response = await fetch(`${API_BASE_URL}/reservations`, { method: "POST", headers, body: JSON.stringify({ name, phone, guests, serviceDate: day.date, slot, note }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossible d’envoyer la réservation.");
      setConfirmed(payload.reservation);
      onCreated(payload.reservation);
    } catch (error) {
      Alert.alert("Réservation non envoyée", error.message || "Réessaie dans un instant.");
    } finally { setSubmitting(false); }
  };

  if (confirmed) return <SafeAreaView style={styles.safeArea}><View style={styles.reservationSuccess}><Header onBack={onBack} /><View style={styles.reservationSuccessBody}><Text style={styles.successEmoji}>🍽</Text><Text style={styles.successTitle}>Demande envoyée !</Text><Text style={styles.successText}>Le restaurant a bien reçu ta demande de réservation n°{confirmed.number}.</Text><View style={styles.reservationRecapCard}><View style={styles.reservationRecapRow}><Text style={styles.reservationRecapLabel}>Date</Text><Text style={styles.reservationRecapValue}>{day.dayLabel}</Text></View><View style={styles.reservationRecapRow}><Text style={styles.reservationRecapLabel}>Heure d’arrivée</Text><Text style={styles.reservationRecapValue}>{confirmed.slot}</Text></View><View style={styles.reservationRecapRow}><Text style={styles.reservationRecapLabel}>Table</Text><Text style={styles.reservationRecapValue}>{confirmed.guests} personne{confirmed.guests > 1 ? "s" : ""}</Text></View><View style={[styles.reservationRecapRow, styles.reservationRecapRowLast]}><Text style={styles.reservationRecapLabel}>Nom</Text><Text style={styles.reservationRecapValue}>{name.trim()}</Text></View></View><View style={styles.reservationPendingCard}><Text style={styles.reservationPendingTitle}>◷ En attente de confirmation</Text><Text style={styles.reservationPendingText}>{authToken ? "Le statut se mettra à jour automatiquement dans « Mes réservations »." : "Après l’activation de la connexion SMS, tu pourras suivre la réponse du restaurant depuis ton compte."}</Text></View>{authToken && <Pressable onPress={onOpenReservations} style={[styles.trackOrderButton, styles.reservationHomeButton]}><Text style={styles.trackOrderButtonText}>Suivre ma réservation</Text></Pressable>}<Pressable onPress={onBack} style={[styles.primaryButton, styles.reservationHomeButton]}><Text style={styles.primaryButtonText}>Retour à l’accueil</Text></Pressable></View></View></SafeAreaView>;

  const slotsReady = !loadingSlots && !slotError && slotsDate === day.date;
  const complete = name.trim().length > 1 && phone.trim().length >= 10 && Boolean(slot) && slotsReady && Boolean(availability[slot]) && !availability[slot].unavailable && !availability[slot].full;
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><Header onBack={onBack} /><Text style={styles.title}>Réserver une table</Text><Text style={styles.deliveryIntro}>Choisis une heure d’arrivée précise, toutes les 15 minutes. Merci d’arriver à l’heure réservée. Aucun paiement n’est demandé.</Text><Text style={styles.deliveryLabel}>NOMBRE DE PERSONNES · 4 MAXIMUM</Text><View style={styles.guestCounter}><Pressable disabled={guests <= 1} onPress={() => setGuests((value) => value - 1)} style={[styles.guestButton, guests <= 1 && styles.guestButtonDisabled]}><Text style={styles.guestButtonText}>−</Text></Pressable><View style={styles.guestCount}><Text style={styles.guestCountNumber}>{guests}</Text><Text style={styles.guestCountLabel}>personne{guests > 1 ? "s" : ""}</Text></View><Pressable disabled={guests >= 4} onPress={() => setGuests((value) => value + 1)} style={[styles.guestButton, guests >= 4 && styles.guestButtonDisabled]}><Text style={styles.guestButtonText}>+</Text></Pressable></View><Text style={styles.deliveryLabel}>JOUR</Text><View style={styles.dayRow}>{UPCOMING_DELIVERY_DAYS.map((item) => <ChoiceChip key={item.date} label={item.label} selected={day.date === item.date} onPress={() => { autoAdvance.current = false; setDay(item); setSlot(null); }} />)}</View><Text style={styles.deliveryLabel}>HEURE D’ARRIVÉE · {day.dayLabel.toUpperCase()}</Text><Text style={styles.deliveryIntro}>Deux réservations maximum par demi-heure, partagées entre les deux heures d’arrivée proposées. Jusqu’à quatre personnes par réservation.</Text>{slotError && <Pressable onPress={() => setSlotRetry(value => value + 1)}><Text style={styles.availabilityError}>Horaires indisponibles. Appuie ici pour réessayer.</Text></Pressable>}<View style={styles.slots}>{quarterHourSlots(day.slots).map((item) => {
    const slotInfo = availability[item];
    const unavailable = Boolean(slotInfo?.unavailable);
    const full = Boolean(slotInfo?.full);
    const disabled = !slotsReady || !slotInfo || unavailable || full;
    const status = !slotsReady ? "À vérifier" : unavailable ? "Passé" : full ? "Complet" : slotInfo ? `${slotInfo.remaining} réservation${slotInfo.remaining > 1 ? "s" : ""} possible${slotInfo.remaining > 1 ? "s" : ""}` : "Indisponible";
    const selected = slot === item;
    return <Pressable key={item} disabled={disabled} onPress={() => setSlot(item)} style={[styles.slot, selected && styles.slotSelected, disabled && styles.slotDisabled]}><View style={styles.slotRow}><Text style={[styles.slotText, selected && styles.slotTextSelected, (unavailable || full) && styles.slotTextFull]}>{item}</Text><View style={styles.slotStatus}><Text style={[styles.slotAvailability, selected && styles.slotAvailabilitySelected, (unavailable || full) && styles.slotAvailabilityFull]}>{selected ? "Sélectionné" : status}</Text><View style={[styles.slotCheck, selected && styles.slotCheckSelected]}>{selected && <Text style={styles.slotCheckmark}>✓</Text>}</View></View></View></Pressable>;
  })}</View><Text style={styles.deliveryLabel}>TES COORDONNÉES</Text><TextInput value={name} onChangeText={setName} placeholder="Prénom et nom" placeholderTextColor="#9B877B" style={styles.fieldInput} autoComplete="name" /><TextInput value={phone} onChangeText={setPhone} placeholder="06 12 34 56 78" placeholderTextColor="#9B877B" style={styles.fieldInput} keyboardType="phone-pad" autoComplete="tel" /><Text style={styles.deliveryLabel}>UNE PRÉCISION ? (FACULTATIF)</Text><TextInput value={note} onChangeText={setNote} placeholder="Chaise bébé, accessibilité, anniversaire…" placeholderTextColor="#9B877B" style={styles.reservationNote} multiline maxLength={500} /><View style={styles.reservationInfo}><Text style={styles.reservationInfoTitle}>Demande sans paiement</Text><Text style={styles.reservationInfoText}>La table est bloquée uniquement lorsque le restaurant accepte la demande.</Text></View><Pressable disabled={!complete || submitting} onPress={submit} style={[styles.primaryButton, styles.reservationSubmit, (!complete || submitting) && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{submitting ? "Envoi en cours…" : "Envoyer ma demande"}</Text></Pressable></ScrollView></SafeAreaView>;
}

function DeliveryScreen({ cart, customer, onBack, onChange, onContinue, onOpenBibouPlus }) {
  const { delivery } = cart;
  const [availability, setAvailability] = useState({});
  const [availabilityStatus, setAvailabilityStatus] = useState("loading");
  const [availabilityKey, setAvailabilityKey] = useState(null);
  const [slotRetry, setSlotRetry] = useState(0);
  const pricing = customerOrderPricing(cart.total, deliveryCost(delivery.method), customer, delivery.method === "delivery");
  const selectedDay = UPCOMING_DELIVERY_DAYS.find((day) => day.date === delivery.date) || DEFAULT_DELIVERY_DAY;
  useEffect(() => {
    let active = true;
    setAvailabilityStatus("loading");
    fetch(`${API_BASE_URL}/availability?date=${encodeURIComponent(selectedDay.date)}&method=${delivery.method}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Disponibilités indisponibles");
        if (!active) return;
        setAvailability(payload.slots || {});
        setAvailabilityKey(delivery.method + selectedDay.date);
        setAvailabilityStatus("ready");
        if (delivery.slot && (payload.slots?.[delivery.slot]?.full || payload.slots?.[delivery.slot]?.unavailable)) onChange({ ...delivery, slot: null });
      })
      .catch(() => { if (active) setAvailabilityStatus("error"); });
    return () => { active = false; };
  }, [delivery.method, selectedDay.date, slotRetry]);
  const slotsReady = availabilityStatus === "ready" && availabilityKey === delivery.method + selectedDay.date;
  const offeredSlots = delivery.method === "pickup" ? quarterHourSlots(selectedDay.slots) : selectedDay.slots;
  const selectedSlot = slotsReady && availability[delivery.slot];
  const canContinue = Boolean(selectedSlot && !selectedSlot.full && !selectedSlot.unavailable);


  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
    <Header onBack={onBack} />
    <Text style={styles.title}>{delivery.method === "pickup" ? "À quelle heure viens-tu retirer ?" : "Quand veux-tu être livré ?"}</Text>
    <Text style={styles.deliveryIntro}>Choisis le mode, le jour et l’horaire qui t’arrangent.</Text>
    <Text style={styles.deliveryLabel}>MODE</Text>
    <View style={styles.methodRow}><ChoiceChip label="🛵 Livraison" selected={delivery.method === "delivery"} onPress={() => onChange({ ...delivery, method: "delivery", fee: undefined, slot: null })} /><ChoiceChip label="🏠 Retrait" selected={delivery.method === "pickup"} onPress={() => onChange({ ...delivery, method: "pickup", fee: 0, slot: null })} /></View>
    <View style={styles.addressNotice}><Text style={styles.addressNoticeTitle}>{delivery.method === "delivery" ? "Zone de livraison" : "Retrait au restaurant"}</Text><Text style={styles.addressNoticeText}>{delivery.method === "delivery" ? DELIVERY_ZONE : RESTAURANT_ADDRESS}</Text>{delivery.method === "delivery" && <><View style={styles.deliveryPrices}>{DELIVERY_PRICING.map((tier) => <View key={tier.label} style={styles.deliveryPriceRow}><Text style={styles.deliveryPriceDistance}>{tier.label}</Text><Text style={styles.deliveryPriceValue}>{money(tier.price)}</Text></View>)}</View><Text style={styles.deliveryFeeHint}>Le tarif sera choisi automatiquement selon l’adresse. Deux livraisons maximum par créneau.</Text></>}</View>
    {delivery.method === "delivery" && (pricing.bibouPlus ? <View style={styles.bibouPlusDeliveryActive}><Text style={styles.bibouPlusDeliveryIcon}>✦</Text><View><Text style={styles.bibouPlusDeliveryTitle}>Ta livraison est offerte</Text><Text style={styles.bibouPlusDeliveryText}>Avantage Bibou + déjà actif sur cette commande.</Text></View></View> : <Pressable onPress={onOpenBibouPlus} style={styles.bibouPlusDeliveryOffer}><View style={styles.bibouPlusDeliveryOfferTop}><Text style={styles.bibouPlusDeliveryBadge}>BIBOU +</Text><Text style={styles.bibouPlusDeliveryPrice}>9,99 € / 30 jours</Text></View><Text style={styles.bibouPlusDeliveryOfferTitle}>Et si cette livraison devenait gratuite ?</Text><Text style={styles.bibouPlusDeliveryOfferText}>Active Bibou + avant de payer et profite aussi de −5 % et des points doublés.</Text><Text style={styles.bibouPlusDeliveryLink}>Découvrir et activer ›</Text></Pressable>)}
    {delivery.method === "pickup" && <View style={styles.addressNotice}><Text style={styles.addressNoticeTitle}>Retrait anticipé · points ×2</Text><Text style={styles.addressNoticeText}>Enregistre ta commande au moins 30 minutes avant l’heure de retrait. Les points des burgers et menus sont doublés après paiement, en plus des bonus Bibou + et de la semaine. Hors parrainage.</Text></View>}
    <Text style={styles.deliveryLabel}>JOUR</Text>
    <View style={styles.dayRow}>{UPCOMING_DELIVERY_DAYS.map((day) => <ChoiceChip key={day.date} label={day.label} selected={selectedDay.date === day.date} onPress={() => onChange({ ...delivery, day: day.id, date: day.date, dayLabel: day.dayLabel, slot: null })} />)}</View>
    <Text style={styles.deliveryLabel}>{delivery.method === "pickup" ? "HEURE DE RETRAIT" : "CRÉNEAUX"} · {selectedDay.dayLabel.toUpperCase()}</Text>
    {availabilityStatus === "error" && <Pressable onPress={() => setSlotRetry(value => value + 1)}><Text style={styles.availabilityError}>Horaires indisponibles. Appuie ici pour réessayer.</Text></Pressable>}
    <View style={styles.slots}>{offeredSlots.map((slot) => {
      const slotInfo = availability[slot];
      const full = Boolean(slotInfo?.full);
      const unavailable = Boolean(slotInfo?.unavailable);
      const checking = !slotsReady;
      const disabled = full || unavailable || checking || !slotInfo;
      const blocked = full || unavailable;
      const status = checking ? "Vérification…" : unavailable ? "Passé" : full ? "Complet" : !slotInfo ? "Indisponible" : delivery.method === "pickup" ? "Retrait disponible" : `${slotInfo.remaining} place${slotInfo.remaining > 1 ? "s" : ""}`;
      const selected = delivery.slot === slot;
      return <Pressable key={slot} disabled={disabled} onPress={() => onChange({ ...delivery, slot })} style={[styles.slot, selected && styles.slotSelected, disabled && styles.slotDisabled]}><View style={styles.slotRow}><Text style={[styles.slotText, selected && styles.slotTextSelected, blocked && styles.slotTextFull]}>{slot}</Text><View style={styles.slotStatus}><Text style={[styles.slotAvailability, selected && styles.slotAvailabilitySelected, blocked && styles.slotAvailabilityFull]}>{selected ? "Sélectionné" : status}</Text><View style={[styles.slotCheck, selected && styles.slotCheckSelected]}>{selected && <Text style={styles.slotCheckmark}>✓</Text>}</View></View></View></Pressable>;
    })}</View>
  </ScrollView><View style={styles.stickyAction}>{!canContinue && <Text style={styles.requiredHint}>Choisis un horaire disponible pour continuer.</Text>}<Pressable disabled={!canContinue} style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]} onPress={onContinue}><Text style={styles.primaryButtonText}>Mes coordonnées · {money(pricing.total)}</Text></Pressable></View></SafeAreaView>;
}

function CheckoutDetailsScreen({ cart, customer, authToken, onChange, onBack, onContinue }) {
  const isDelivery = cart.delivery.method === "delivery";
  const [quote, setQuote] = useState(null);
  const standardDeliveryFee = isDelivery ? quote?.deliveryFee : 0;
  const quoteReady = !isDelivery || (quote?.status === "success" && quote.withinZone);
  const complete = customer.name.trim().length > 1 && customer.phone.trim().length > 5 && (!isDelivery || (customer.address.trim() && customer.postalCode.trim() && customer.city.trim() && quoteReady));
  const update = (field, value) => {
    if (["address", "postalCode", "city"].includes(field)) setQuote(null);
    onChange({ ...customer, [field]: value });
  };
  const calculateQuote = async () => {
    if (![customer.address, customer.postalCode, customer.city].every((value) => value.trim())) {
      setQuote({ status: "error", error: "Indique ton adresse complète pour calculer le tarif." });
      return;
    }
    setQuote({ status: "loading" });
    try {
      const response = await fetch(`${API_BASE_URL}/delivery-quote`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify(customer) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de calculer la livraison.");
      setQuote({ status: "success", ...payload });
      onChange({ ...customer, distance: String(payload.distanceKm) });
    } catch (error) {
      setQuote({ status: "error", error: error.message || "Impossible de calculer la livraison." });
    }
  };
  const hasExactFee = !isDelivery || quoteReady;
  const pricing = customerOrderPricing(cart.total, standardDeliveryFee ?? deliveryCostForDistance(0), customer, isDelivery);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Tes coordonnées</Text><Text style={styles.detailsIntro}>Elles permettent au restaurant de préparer et de suivre ta commande.</Text><Text style={styles.deliveryLabel}>CONTACT</Text><TextInput value={customer.name} onChangeText={(value) => update("name", value)} placeholder="Prénom et nom" placeholderTextColor="#9B877B" style={styles.fieldInput} autoCapitalize="words" /><TextInput value={customer.phone} onChangeText={(value) => update("phone", value)} placeholder="Téléphone" placeholderTextColor="#9B877B" style={styles.fieldInput} keyboardType="phone-pad" /><Text style={styles.deliveryLabel}>PARRAINAGE · FACULTATIF</Text>{customer.referredByCustomerId ? <View style={styles.referralApplied}><Text style={styles.referralAppliedText}>✓ Ton parrain est déjà enregistré</Text></View> : <TextInput value={customer.sponsorCode || ""} onChangeText={(value) => update("sponsorCode", value.toUpperCase())} placeholder="Exemple : BIBOU-A1B2C3" placeholderTextColor="#9B877B" style={styles.fieldInput} autoCapitalize="characters" autoCorrect={false} />}<Text style={styles.referralFieldHint}>Le parrain gagne 100 points après ta première commande réellement payée.</Text>{isDelivery ? <><Text style={styles.deliveryLabel}>ADRESSE DE LIVRAISON</Text><TextInput value={customer.address} onChangeText={(value) => update("address", value)} placeholder="Numéro et nom de rue" placeholderTextColor="#9B877B" style={styles.fieldInput} autoCapitalize="words" /><View style={styles.fieldRow}><TextInput value={customer.postalCode} onChangeText={(value) => update("postalCode", value)} placeholder="Code postal" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.fieldHalf]} keyboardType="number-pad" maxLength={5} /><TextInput value={customer.city} onChangeText={(value) => update("city", value)} placeholder="Ville" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.fieldCity]} autoCapitalize="words" /></View><View style={[styles.distanceCard, quote?.status === "error" && styles.distanceCardError]}><Text style={styles.distanceTitle}>Vérification de la zone</Text><Text style={styles.distanceText}>Ton adresse sert à calculer l’itinéraire et à vérifier le rayon de 5 km.</Text><Pressable onPress={calculateQuote} disabled={quote?.status === "loading"} style={[styles.quoteButton, quote?.status === "loading" && styles.quoteButtonDisabled]}><Text style={styles.quoteButtonText}>{quote?.status === "loading" ? "Calcul en cours…" : "Calculer mon tarif"}</Text></Pressable>{quote?.status === "success" && quote.withinZone && <Text style={styles.distanceSuccess}>✓ À {quote.distanceKm.toFixed(2).replace(".", ",")} km · {pricing.bibouPlus ? `Livraison offerte au lieu de ${money(quote.deliveryFee)}` : `Livraison ${money(quote.deliveryFee)}`}</Text>}{quote?.status === "success" && !quote.withinZone && <Text style={styles.distanceError}>Cette adresse est hors de la zone de livraison de 5 km.</Text>}{quote?.status === "error" && <Text style={styles.distanceError}>{quote.error}</Text>}</View></> : <View style={styles.pickupCard}><Text style={styles.pickupTitle}>Retrait au restaurant</Text><Text style={styles.pickupText}>{RESTAURANT_ADDRESS}</Text><Text style={styles.pickupText}>Aucun frais de livraison.</Text></View>}<Text style={styles.detailsFinePrint}>Les remises et avantages sont vérifiés une dernière fois par le serveur avant le paiement.</Text></ScrollView><View style={styles.stickyAction}>{!complete && <Text style={styles.requiredHint}>{isDelivery && !quoteReady ? "Calcule ton tarif de livraison pour continuer." : "Complète les informations pour continuer."}</Text>}<Pressable disabled={!complete} style={[styles.primaryButton, !complete && styles.primaryButtonDisabled]} onPress={() => onContinue(standardDeliveryFee)}><Text style={styles.primaryButtonText}>Vérifier et payer · {!hasExactFee ? "dès " : ""}{money(pricing.total)}</Text></Pressable></View></SafeAreaView>;
}

function PaymentScreen({ cart, customer, onBack, onPay }) {
  const isDelivery = cart.delivery.method === "delivery";
  const standardFee = cart.delivery.fee ?? deliveryCost(cart.delivery.method);
  const pricing = customerOrderPricing(cart.total, standardFee, customer, isDelivery);
  const [paying, setPaying] = useState(false);
  const paymentInFlight = useRef(false);
  const submitPayment = async () => {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    setPaying(true);
    try { await onPay(pricing.total); } finally { paymentInFlight.current = false; setPaying(false); }
  };
  return <SafeAreaView style={styles.safeArea}><View style={styles.detailContent}><Header onBack={onBack} /><Text style={styles.title}>Vérifie ta commande</Text><Text style={styles.deliveryIntro}>Tout est prêt pour le paiement sécurisé.</Text><View style={styles.paymentSummary}><Text style={styles.paymentProduct}>{cart.items.map((item) => item.product.isMenu ? `Menu · ${item.product.name}` : item.product.name).join(" · ")}</Text><Text style={styles.paymentLine}>{cart.delivery.dayLabel} · {cart.delivery.slot}</Text><View style={styles.receiptDivider} /><ReceiptLine label="Sous-total" value={money(cart.total)} />{pricing.discount > 0 && <ReceiptLine label={pricing.discountLabel} value={`− ${money(pricing.discount)}`} />}<ReceiptLine label={isDelivery ? "Livraison" : "Retrait"} value={pricing.deliveryFee ? money(pricing.deliveryFee) : "Offert"} />{pricing.bibouPlus && isDelivery && standardFee > 0 && <ReceiptLine label="Économie livraison Bibou +" value={`− ${money(standardFee)}`} />}<View style={styles.receiptDivider} /><ReceiptLine label="Total débité par SumUp" value={money(pricing.total)} strong /></View>{pricing.bibouPlus && <View style={styles.bibouPlusPaymentNote}><Text style={styles.bibouPlusPaymentNoteText}>✦ Tes points seront également doublés après le paiement.</Text></View>}<View style={styles.customerSummary}><Text style={styles.customerSummaryTitle}>{isDelivery ? "Livrer à" : "Retrait par"}</Text><Text style={styles.customerSummaryText}>{customer.name} · {customer.phone}</Text>{isDelivery && <Text style={styles.customerSummaryText}>{customer.address}, {customer.postalCode} {customer.city}</Text>}</View><View style={styles.securePayment}><Text style={styles.securePaymentIcon}>🔒</Text><View><Text style={styles.securePaymentTitle}>Paiement sécurisé avec SumUp</Text><Text style={styles.securePaymentText}>Carte bancaire · le paiement sera ouvert par SumUp.</Text></View></View></View><View style={styles.stickyAction}><Pressable disabled={paying} style={[styles.primaryButton, paying && styles.primaryButtonDisabled]} onPress={submitPayment}><Text style={styles.primaryButtonText}>{paying ? "Ouverture de SumUp…" : `Payer avec SumUp · ${money(pricing.total)}`}</Text></Pressable></View></SafeAreaView>;
}

function PaymentPendingScreen({ record, kind, message, busy, onCheckPayment, onResume, onBack }) {
  const state = paymentState(record, kind);
  const terminal = ['paid', 'cancelled', 'expired'].includes(state);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.successContent}>
    <Text style={styles.successEmoji}>🔒</Text>
    <Text style={styles.successTitle}>{kind === 'bibou-plus' ? 'Ton paiement Bibou +' : 'Ton paiement sécurisé'}</Text>
    {record && <Text style={[styles.successText, styles.paymentRecoveryText]}>{kind === 'order' ? `Commande #${record.number} · ${money(record.total)}` : `Bibou + · ${money(record.amount)}`}</Text>}
    <Text style={[styles.successText, styles.paymentRecoveryText]}>{terminal ? 'Statut retrouvé pour cette tentative.' : 'Ta tentative est sauvegardée. Reviens ici après SumUp, même si tu as fermé l’application.'}</Text>
    <View style={styles.statusCard}><Text style={styles.statusTitle}>{busy ? 'Vérification en cours…' : 'Suivi du paiement'}</Text><Text accessibilityLiveRegion="polite" style={styles.statusDescription}>{message || 'Aucun paiement n’est confirmé sans vérification auprès de SumUp.'}</Text></View>
    {!terminal && <><Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, styles.paymentRecoveryPrimary, busy && styles.primaryButtonDisabled]} onPress={onResume}><Text style={styles.primaryButtonText}>Reprendre le paiement SumUp</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={[styles.trackOrderButton, styles.paymentRecoverySecondary]} onPress={onCheckPayment}><Text style={[styles.trackOrderButtonText, styles.paymentRecoveryText]}>Vérifier mon paiement</Text></Pressable></>}
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.trackOrderButton, styles.paymentRecoverySecondary]} onPress={onBack}><Text style={[styles.trackOrderButtonText, styles.paymentRecoveryText]}>Retour à l’accueil</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function SuccessScreen({ order, onHome, onReview, onTrack }) {
  const label = order?.method === "delivery" ? "Livraison" : "Retrait";
  return <SafeAreaView style={styles.safeArea}><View style={styles.successContent}><Text style={styles.successEmoji}>🎉</Text><Text style={styles.successTitle}>Paiement confirmé !</Text><Text style={styles.successText}>Ta commande a été transmise au restaurant. Tu peux suivre son acceptation et sa préparation.</Text><View style={styles.statusCard}><Text style={styles.statusTitle}>● Commande #{order?.number}</Text><Text style={styles.statusDescription}>{label} le {order?.serviceDate} · {order?.slot}.</Text></View><Pressable style={styles.trackOrderButton} onPress={onTrack}><Text style={styles.trackOrderButtonText}>Suivre ma commande ›</Text></Pressable><Pressable style={styles.reviewPrompt} onPress={onReview}><Text style={styles.reviewPromptTitle}>Ton avis compte pour nous</Text><Text style={styles.reviewPromptText}>Raconte-nous ton expérience après la dégustation.</Text><Text style={styles.reviewPromptLink}>Laisser un avis ›</Text></Pressable><Pressable style={styles.primaryButton} onPress={onHome}><Text style={styles.primaryButtonText}>Retour à l’accueil</Text></Pressable></View></SafeAreaView>;
}

function ReviewScreen({ onBack }) {
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Votre avis compte</Text><Text style={styles.reviewIntro}>Partagez votre expérience avec Bibou’s Burgers directement sur notre page Google.</Text><View style={styles.reviewCard}><Text style={styles.reviewQuestion}>Merci pour votre commande !</Text><Text style={styles.ratingHelper}>Votre avis Google aide d’autres gourmands à nous découvrir.</Text></View><Pressable onPress={() => Linking.openURL(GOOGLE_REVIEW_URL)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Laisser mon avis sur Google ↗</Text></Pressable><Text style={styles.reviewFinePrint}>Google ouvrira sa page officielle. Vous restez libre de publier ou non votre avis.</Text></ScrollView></SafeAreaView>;
}

function LoyaltyScreen({ loyalty, customer, rewardClaims, rewardLoading, onBack, onRefer, onClaimReward }) {
  const multiplier = loyalty.orders ? Math.min(loyalty.orders, 3) : 1;
  const weeklyPoints = loyalty.weeklyProgramPoints || 0;
  const nextReward = REWARDS.find((reward) => loyalty.points < reward.points);
  const rewardTarget = nextReward?.points || REWARDS[REWARDS.length - 1].points;
  const remaining = nextReward ? nextReward.points - loyalty.points : 0;
  const progress = nextReward ? Math.min(100, (loyalty.points / rewardTarget) * 100) : 100;
  const currentPrestigeIndex = PRESTIGE_LEVELS.reduce((activeIndex, level, index) => loyalty.points >= level.points ? index : activeIndex, -1);
  const currentPrestige = currentPrestigeIndex >= 0 ? PRESTIGE_LEVELS[currentPrestigeIndex] : null;
  const nextPrestige = PRESTIGE_LEVELS[currentPrestigeIndex + 1];
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.loyaltyContent} showsVerticalScrollIndicator={false}>
        <Header onBack={onBack} />
        <Text style={styles.title}>Club Bibou</Text>
        <Text style={styles.loyaltyIntro}>Tes points restent acquis. Seul ton bonus de la semaine repart à zéro le lundi.</Text>
        <View style={styles.pointsCard}>
          <Text style={styles.pointsEyebrow}>TON SOLDE FIDÉLITÉ</Text>
          <Text style={styles.pointsTotal}>★ {loyalty.points} points</Text>
          <Text style={styles.pointsSubtext}>{nextReward ? `Encore ${remaining} points avant : ${nextReward.title}` : "Toutes les récompenses sont débloquées !"}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.progressCaption}>{Math.min(loyalty.points, rewardTarget)} / {rewardTarget} points</Text>
        </View>

        <Text style={styles.sectionTitle}>Tes badges Prestige</Text>
        <View style={styles.prestigeCard}>
          <View style={styles.prestigeTop}>
            <PrestigeEmblem level={currentPrestige || PRESTIGE_LEVELS[0]} unlocked={Boolean(currentPrestige)} large />
            <View style={styles.prestigeCopy}>
              <Text style={styles.prestigeTitle}>{currentPrestige ? `Prestige ${currentPrestige.level} · ${currentPrestige.metal} · ${currentPrestige.name}` : "Prochain niveau · Prestige 1 Bronze"}</Text>
              <Text style={styles.prestigeReward}>{currentPrestige ? `Récompense obtenue : ${currentPrestige.reward}` : `À 200 points : ${PRESTIGE_LEVELS[0].reward}`}</Text>
            </View>
          </View>
          <View style={styles.prestigeLevels}>
            {PRESTIGE_LEVELS.map((level, index) => {
              const unlocked = index <= currentPrestigeIndex;
              return <View key={level.level} style={styles.prestigeLevel}>
                <Text style={[styles.prestigeAboveLabel, { color: level.color, opacity: unlocked ? 1 : 0.65 }]}>Prestige {level.level}</Text>
                <PrestigeEmblem level={level} unlocked={unlocked} />
                <Text style={[styles.prestigeLevelLabel, { color: level.color, opacity: unlocked ? 1 : 0.72 }]}>{level.name}{"\n"}{level.metal} · {level.points} pts</Text>
              </View>;
            })}
          </View>
          <Text style={styles.prestigeNext}>{nextPrestige ? `Prochain badge : Prestige ${nextPrestige.level} dans ${nextPrestige.points - loyalty.points} points` : "Niveau maximum atteint · vous êtes mythique !"}</Text>
        </View>

        <Text style={styles.sectionTitle}>Tes récompenses</Text>
        <View style={styles.rewardsTable}>
          {REWARDS.map((reward) => {
            const unlocked = loyalty.points >= reward.points;
            const difference = reward.points - loyalty.points;
            const claim = rewardClaims.find((item) => item.rewardId === reward.id);
            const used = claim?.status === "used";
            return <View key={reward.points} style={[styles.rewardRow, unlocked && styles.rewardRowUnlocked]}>
              <View style={styles.rewardIcon}><Text style={styles.rewardEmoji}>{reward.emoji}</Text></View>
              <View style={styles.rewardCopy}><Text style={styles.rewardTitle}>{reward.title}</Text><Text style={styles.rewardDetail}>{reward.detail}</Text></View>
              {!unlocked ? <View style={styles.rewardStatus}>
                <Text style={styles.rewardStatusText}>+{difference}</Text>
                <Text style={styles.rewardStatusSubtext}>points</Text>
              </View> : claim ? <View style={[styles.rewardClaimedStatus, used && styles.rewardUsedStatus]}>
                <Text style={[styles.rewardClaimedLabel, used && styles.rewardUsedText]}>{used ? "Utilisée" : "À présenter"}</Text>
                <Text style={[styles.rewardClaimCode, used && styles.rewardUsedText]}>{claim.code}</Text>
              </View> : <Pressable disabled={rewardLoading === reward.id} onPress={() => onClaimReward(reward)} style={styles.rewardClaimButton}>
                <Text style={styles.rewardClaimButtonText}>{rewardLoading === reward.id ? "…" : "Réclamer"}</Text>
                <Text style={styles.rewardClaimButtonHint}>une fois</Text>
              </Pressable>}
            </View>;
          })}
        </View>
        <Text style={styles.rewardClaimFootnote}>Les points et les badges Prestige restent acquis. Chaque récompense peut être réclamée une seule fois puis présentée au restaurant.</Text>

        <Text style={styles.sectionTitle}>Comment gagner des points ?</Text>
        <View style={styles.pointsRulesTable}>{POINT_EARNING_RULES.map((rule) => <View key={rule.title} style={styles.pointsRuleRow}><View style={styles.pointsRuleIcon}><Text style={styles.pointsRuleEmoji}>{rule.emoji}</Text></View><View style={styles.pointsRuleCopy}><Text style={styles.pointsRuleTitle}>{rule.title}</Text><Text style={styles.pointsRuleDetail}>{rule.detail}</Text></View><Text style={styles.pointsRuleValue}>{rule.points}</Text></View>)}</View>
        <Text style={styles.pointsRuleFootnote}>Les points sont crédités après confirmation du paiement et retirés en cas d’annulation. Retrait anticipé : burger 20 points, menu 30 points, avant les autres bonus. Le bonus retrait se cumule avec Bibou + et le multiplicateur de la semaine ; le parrainage reste à 100 points. Les boissons et petites faims seules ne rapportent pas de points pour le moment.</Text>

        <Text style={styles.sectionTitle}>Ton bonus de la semaine</Text>
        <View style={styles.weeklyCard}>
          <View style={styles.weeklyHeader}>
            <View><Text style={styles.weeklyTitle}>{loyalty.orders} commande{loyalty.orders > 1 ? "s" : ""} cette semaine</Text><Text style={styles.weeklySubtext}>{loyalty.orders ? `Multiplicateur actuel × ${multiplier}${customerHasBibouPlus(customer) ? " · Bibou + ×2" : ""}` : "Ta première commande débloque tes points"}</Text></View>
            <View style={styles.multiplierBadge}><Text style={styles.multiplierText}>× {multiplier}</Text></View>
          </View>
          <Text style={styles.weeklyPoints}>+ {weeklyPoints} points gagnés cette semaine</Text>
          <View style={styles.stepsRow}>
            <View style={styles.step}><Text style={styles.stepNumber}>1</Text><Text style={styles.stepLabel}>normal</Text></View>
            <View style={styles.stepLine} />
            <View style={[styles.step, loyalty.orders >= 2 && styles.stepActive]}><Text style={[styles.stepNumber, loyalty.orders >= 2 && styles.stepNumberActive]}>2</Text><Text style={styles.stepLabel}>× 2</Text></View>
            <View style={styles.stepLine} />
            <View style={[styles.step, loyalty.orders >= 3 && styles.stepActive]}><Text style={[styles.stepNumber, loyalty.orders >= 3 && styles.stepNumberActive]}>3</Text><Text style={styles.stepLabel}>× 3</Text></View>
          </View>
          <Text style={styles.weeklyFootnote}>{loyalty.orders >= 3 ? "Bonus maximum atteint pour cette semaine." : "Passe une nouvelle commande pour augmenter ton multiplicateur."}</Text>
        </View>
        <Text style={styles.sectionTitle}>Parrainage</Text>
        <Pressable onPress={onRefer} style={styles.referralCard}>
          <View style={styles.referralIcon}><Text style={styles.referralEmoji}>🎁</Text></View>
          <View style={styles.referralCopy}><Text style={styles.referralTitle}>Invite un proche</Text><Text style={styles.referralText}>{customer?.referralCode ? `Ton code : ${customer.referralCode}` : "Connecte-toi pour obtenir ton code personnel."}{"\n"}+ 100 points après sa première commande payée.</Text></View>
          <Text style={styles.loyaltyShortcutArrow}>›</Text>
        </Pressable>
        <Text style={styles.loyaltyLegal}>Un seul parrain par client. Le bonus est retiré si la commande qui l’a déclenché est annulée.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [stockMessage, setStockMessage] = useState("Vérification des disponibilités…");
  const [stockFeedback, setStockFeedback] = useState("");
  useEffect(() => {
    let stopped = false;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(`${API_BASE_URL}/catalog`);
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.products) || !payload.options) throw new Error("Catalogue indisponible");
        if (!stopped) { setCatalog(payload); setStockMessage(""); }
      } catch {
        if (!stopped) setStockMessage("Disponibilités non actualisées. Une nouvelle vérification aura lieu avant le paiement.");
      } finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const onFocus = () => { void refresh(); };
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    return () => { stopped = true; clearInterval(timer); subscription.remove(); if (typeof window !== "undefined") window.removeEventListener("focus", onFocus); };
  }, []);
  const [screen, setScreen] = useState(initialScreenFromUrl);
  const [crmWelcomeDestination, setCrmWelcomeDestination] = useState('account');
  const [activeProduct, setActiveProduct] = useState(null);
  const [cart, setCart] = useState(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", postalCode: "", city: "Le Havre", distance: "", sponsorCode: referralCodeFromUrl() });
  const [loyalty, setLoyalty] = useState({ points: 0, orders: 0 });
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [rewardClaims, setRewardClaims] = useState([]);
  const [rewardLoading, setRewardLoading] = useState("");
  const [authToken, setAuthToken] = useState("");
  const sessionTokenRef = useRef('');
  const sessionEpoch = useRef(0);
  const [pendingOrder, setPendingOrder] = useState(null);
  const paymentAttempt = useRef(null);
  const paymentBusyRef = useRef(false);
  const paymentStartRef = useRef(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [pendingBibouPlus, setPendingBibouPlus] = useState(null);
  const [bibouPlusLoading, setBibouPlusLoading] = useState(false);
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false);
  const [bibouPlusReturnScreen, setBibouPlusReturnScreen] = useState("menu");
  const [loginDestination, setLoginDestination] = useState("account");
  const [preferredMethod, setPreferredMethod] = useState("delivery");
  const cartCount = useMemo(() => cart?.items?.length || 0, [cart]);
  const loadCustomerOrders = async (token = authToken) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/customer/orders`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’actualiser les commandes.");
      if (sessionTokenRef.current !== token) return;
      setOrders(payload.orders.map(orderFromApi));
    } catch (error) {
      Alert.alert("Actualisation indisponible", error.message || "Réessaie dans un instant.");
    }
  };
  const loadCustomerReservations = async ({ token = authToken, silent = false } = {}) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/customer/reservations`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’actualiser les réservations.");
      if (sessionTokenRef.current !== token) return;
      setReservations(payload.reservations.map(reservationFromApi));
    } catch (error) {
      if (!silent) Alert.alert("Actualisation indisponible", error.message || "Réessaie dans un instant.");
    }
  };
  const loadCustomerRewards = async ({ token = authToken, silent = false } = {}) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/customer/rewards`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’actualiser les récompenses.");
      if (sessionTokenRef.current !== token) return;
      setRewardClaims(payload.claims || []);
    } catch (error) {
      if (!silent) Alert.alert("Récompenses indisponibles", error.message || "Réessaie dans un instant.");
    }
  };
  const authenticate = async ({ token, customer: savedCustomer, isNewCustomer = false }) => {
    sessionEpoch.current += 1;
    sessionTokenRef.current = token;
    setAuthToken(token);
    try { await saveSession(token); } catch { setStockFeedback("Connexion active, mais elle ne peut pas être mémorisée sur cet appareil."); }
    setCustomer((current) => ({
      ...savedCustomer,
      name: current.name || savedCustomer.name || "",
      phone: savedCustomer.phone || current.phone || "",
      address: current.address || savedCustomer.address || "",
      postalCode: current.postalCode || savedCustomer.postalCode || "",
      city: current.city || savedCustomer.city || "Le Havre",
      distance: current.distance || "",
      sponsorCode: current.sponsorCode || "",
    }));
    setLoyalty({ points: savedCustomer.points, orders: savedCustomer.weeklyOrders, weeklyProgramPoints: savedCustomer.weeklyProgramPoints || 0 });
    void loadCustomerOrders(token);
    void loadCustomerReservations({ token });
    void loadCustomerRewards({ token });
    setCrmWelcomeDestination(loginDestination);
    setScreen(isNewCustomer ? 'crm-welcome' : loginDestination);
    setLoginDestination("account");
    void recoverPayment(token, savedCustomer.id).catch(() => setStockFeedback('Impossible de lire le suivi du paiement sur cet appareil.'));
  };
  useEffect(() => {
    let stopped = false;
    const epoch = sessionEpoch.current;
    const restore = async () => {
      try {
        const savedToken = await readSession();
        if (!savedToken || stopped) return;
        const response = await apiRequest('/auth/me', savedToken);
        if (stopped || sessionEpoch.current !== epoch) return;
        if (response.status === 401) { await clearSession(); return; }
        const payload = response.payload;
        if (!response.ok || !payload.customer) throw new Error("Connexion temporairement indisponible.");
        if (stopped || sessionEpoch.current !== epoch) return;
        sessionTokenRef.current = savedToken;
        setAuthToken(savedToken);
        setCustomer((current) => ({ ...current, ...payload.customer }));
        setLoyalty({ points: payload.customer.points, orders: payload.customer.weeklyOrders, weeklyProgramPoints: payload.customer.weeklyProgramPoints || 0 });
        void loadCustomerOrders(savedToken);
        void loadCustomerReservations({ token: savedToken, silent: true });
        void loadCustomerRewards({ token: savedToken, silent: true });
        await recoverPayment(savedToken, payload.customer.id);
      } catch { if (!stopped) setStockFeedback("Connexion non actualisée. Ton accès est conservé : réessaie lorsque le réseau revient."); }
    };
    void restore();
    return () => { stopped = true; };
  }, []);
  useEffect(() => {
    if (!authToken) return;
    const sync = () => { if (sessionTokenRef.current === authToken) void syncPushDevice(API_BASE_URL, authToken).catch(() => {}); };
    sync();
    const stop = observePush(data => {
      if (sessionTokenRef.current !== authToken || data.accountId !== customer.id) return;
      if (!['menu', 'orders', 'reservations', 'loyalty', 'bibou-plus', 'reservation', 'account', 'offers'].includes(data.screen)) return;
      if (data.screen === 'orders') void loadCustomerOrders(authToken);
      if (data.screen === 'reservations') void loadCustomerReservations({ token: authToken });
      if (data.screen === 'bibou-plus') setBibouPlusReturnScreen('menu');
      setScreen(data.screen);
    }, sync);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { stop(); sub.remove(); };
  }, [authToken, customer.id]);
  useEffect(() => {
    if (!authToken || !customer.id) return;
    let stopped = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${API_BASE_URL}/customer/crm`, { headers: { Authorization: `Bearer ${authToken}` }, signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error('Offres non actualisées'); return response.json(); })
      .then(result => { if (!stopped && sessionTokenRef.current === authToken) setCustomer(current => ({ ...current, crmOffers: result.offers })); })
      .catch(() => { if (!stopped && sessionTokenRef.current === authToken) setCustomer(current => ({ ...current, crmOffers: [] })); })
      .finally(() => clearTimeout(timer));
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [authToken, customer.id, screen]);
  const openProduct = (product) => {
    const current = applyProductStock(product, catalog);
    if (current.soldOut) { setStockFeedback(current.stockReason || "Ce produit est momentanément indisponible."); return; }
    setStockFeedback(""); setActiveProduct(current); setScreen("product");
  };
  const addToCart = (item) => {
    const problem = cartStockProblem([item], catalog);
    if (problem) { setStockFeedback(problem); return; }
    setStockFeedback("");
    setCart((current) => {
      const items = [...(current?.items || []), { ...item, lineId: `${Date.now()}-${Math.random().toString(36).slice(2)}` }];
      return { items, total: Math.round(items.reduce((sum, entry) => sum + entry.total, 0) * 100) / 100, delivery: current?.delivery || { method: preferredMethod, fee: preferredMethod === "pickup" ? 0 : undefined, day: DEFAULT_DELIVERY_DAY.id, date: DEFAULT_DELIVERY_DAY.date, dayLabel: DEFAULT_DELIVERY_DAY.dayLabel, slot: null } };
    });
    setScreen("cart");
  };
  const addSimpleToCart = (product) => addToCart({ product, total: product.price, options: [], selections: [] });
  const removeFromCart = (lineId) => setCart((current) => {
    const items = current.items.filter((item) => item.lineId !== lineId);
    return items.length ? { ...current, items, total: Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100 } : null;
  });
  const updateDelivery = (delivery) => setCart({ ...cart, delivery });
  const continueWithCustomer = async (deliveryFee) => {
    if (!authToken) {
      setLoginDestination("details");
      setScreen("login");
      return;
    }
    let savedCustomer = customer;
    if (API_BASE_URL) {
      try {
        const endpoint = `${API_BASE_URL}/customers/${customer.id}`;
        const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify(customer) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Impossible d’enregistrer tes coordonnées.");
        savedCustomer = payload.customer;
      } catch (error) {
        Alert.alert("Coordonnées non enregistrées", error.message || "Réessaie dans un instant.");
        return;
      }
    }
    setCustomer((current) => ({ ...current, ...savedCustomer }));
    setCart({ ...cart, delivery: { ...cart.delivery, fee: deliveryFee } });
    setScreen("payment");
  };
  const apiRequest = async (route, token, body) => {
    const controller = new AbortController();
    // Render may need time to wake up before creating or checking a payment.
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${API_BASE_URL}${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status, payload: await response.json().catch(() => ({})) };
    } finally { clearTimeout(timer); }
  };
  const showPaymentRecord = (attempt, record) => {
    if (attempt.kind === 'order') setPendingOrder(record);
    else setPendingBibouPlus(record);
    setScreen(attempt.kind === 'order' ? 'payment-pending' : 'bibou-plus-pending');
  };
  const finishPayment = async (attempt, record, token) => {
    const state = paymentState(record, attempt.kind);
    showPaymentRecord(attempt, record);
    if (state === 'paid') {
      // Confirmation comes exclusively from the authenticated server, never the return URL.
      await clearAttempt();
      paymentAttempt.current = null;
      try {
        const { ok, payload } = await apiRequest('/auth/me', token);
        if (ok && payload.customer) {
          setCustomer(current => ({ ...current, ...payload.customer }));
          setLoyalty({ points: payload.customer.points, orders: payload.customer.weeklyOrders, weeklyProgramPoints: payload.customer.weeklyProgramPoints || 0 });
        }
      } catch { /* The payment remains confirmed even if account refresh is temporarily unavailable. */ }
      if (attempt.kind === 'order') {
        setOrders(current => [orderFromApi(record), ...current.filter(order => order.apiId !== record.id)]);
        setCart(null);
        setScreen('success');
      } else {
        setPendingBibouPlus(null);
        setStockFeedback('Bibou + activé : livraison offerte, remise de 5 % et points doublés.');
        setScreen(cart && bibouPlusReturnScreen === 'delivery' ? 'delivery' : 'bibou-plus');
      }
      return true;
    }
    if (state === 'cancelled' || state === 'expired') {
      await clearAttempt();
      paymentAttempt.current = null;
      setPaymentMessage(state === 'cancelled'
        ? 'Cette commande est annulée et ne donne pas de points. Si un débit a eu lieu, contacte le restaurant : l’annulation ne rembourse pas automatiquement le paiement.'
        : 'Ce paiement a expiré. Il ne sera pas rouvert. Reviens à l’accueil pour choisir un nouveau créneau.');
      return true;
    }
    return false;
  };
  const processAttempt = async (attempt, token, openCheckout = false) => {
    showPaymentRecord(attempt, null);
    const health = await apiRequest('/health', token);
    if (!health.ok || health.payload.capabilities?.paymentRecovery !== 1) throw new Error('Le service de paiement est en cours de mise à jour. Ta tentative est conservée. Réessaie dans un instant.');
    const found = await apiRequest(`/customer/payment-attempts/${encodeURIComponent(attempt.requestId)}`, token);
    if (!found.ok && found.status !== 404) throw new Error(found.payload.error || 'Impossible de retrouver le paiement.');
    let record = found.payload.record || null;
    if (record && found.payload.kind !== attempt.kind) throw new Error('Cette tentative ne correspond pas au paiement attendu.');
    if (record && await finishPayment(attempt, record, token)) return;
    if (record?.payment?.checkoutReference) {
      const route = attempt.kind === 'order' ? '/payments/sumup-checkout/' : '/bibou-plus/checkout/';
      const checked = await apiRequest(route + encodeURIComponent(record.id), token);
      if (!checked.ok) throw new Error(checked.payload.error || 'Impossible de vérifier le paiement auprès de SumUp.');
      record = checked.payload.order || checked.payload.purchase;
      if (await finishPayment(attempt, record, token)) return;
    }
    if (!openCheckout) {
      showPaymentRecord(attempt, record);
      setPaymentMessage(record?.payment?.status === 'FAILED'
        ? 'Le paiement n’a pas abouti. Reprends la page SumUp pour réessayer ou utiliser une autre carte, sans créer une deuxième commande.'
        : record ? 'SumUp n’a pas encore confirmé de paiement. Reprends le même paiement ou vérifie de nouveau son statut.'
        : 'Ta tentative a été retrouvée. Clique sur « Reprendre » pour continuer avec la même référence.');
      return;
    }
    if (!record && attempt.kind === 'order') {
      const created = await apiRequest('/orders', token, { ...attempt.input, requestId: attempt.requestId });
      if (!created.ok) {
        if ([400, 422].includes(created.status) || (created.status === 409 && created.payload.code !== 'ATTEMPT_CONFLICT')) {
          await clearAttempt(); paymentAttempt.current = null;
          setScreen(cart ? 'cart' : 'menu');
          setStockFeedback(created.payload.error || 'Choisis de nouveau tes produits et ton créneau.');
        }
        throw new Error(created.payload.error || 'Impossible de créer la commande.');
      }
      record = created.payload.order;
      if (await finishPayment(attempt, record, token)) return;
    }
    const opened = attempt.kind === 'order'
      ? await apiRequest('/payments/sumup-checkout', token, { orderId: record.id })
      : await apiRequest('/bibou-plus/checkout', token, { requestId: attempt.requestId });
    if (!opened.ok) throw new Error(opened.payload.error || 'Impossible d’ouvrir SumUp. Ta tentative est conservée.');
    record = opened.payload.order || opened.payload.purchase;
    if (await finishPayment(attempt, record, token)) return;
    const checkoutUrl = opened.payload.checkoutUrl;
    setPaymentMessage('Finalise le paiement chez SumUp, puis reviens ici pour vérifier la confirmation.');
    // A delayed window.open can be blocked by browsers after the network calls.
    // Same-tab navigation keeps the hosted checkout reliable on web and 3DS flows.
    await openCheckoutUrl(checkoutUrl, typeof window === 'undefined' ? null : window, Linking);
  };
  const runPayment = async (attempt, token = authToken, openCheckout = false) => {
    if (paymentBusyRef.current || !attempt || !token) return;
    paymentBusyRef.current = true;
    setPaymentBusy(true);
    setPaymentMessage('');
    try { await processAttempt(attempt, token, openCheckout); }
    catch (error) { setPaymentMessage(error.name === 'AbortError' ? 'Le réseau met trop de temps à répondre. Ta tentative est conservée : réessaie sans refaire de commande.' : error.message || 'Vérification indisponible. Réessaie dans un instant.'); }
    finally { paymentBusyRef.current = false; setPaymentBusy(false); }
  };
  const recoverPayment = async (token, customerId) => {
    const attempt = parseAttempt(await readAttempt(), customerId);
    if (!attempt) return;
    paymentAttempt.current = attempt;
    // Legal links remain readable even when a payment needs checking.
    if (['privacy', 'delete-account'].includes(initialScreenFromUrl())) return;
    await runPayment(attempt, token);
  };
  const beginPayment = async (kind, input) => {
    if (paymentBusyRef.current || paymentStartRef.current) return;
    paymentStartRef.current = true;
    try {
      const existing = parseAttempt(await readAttempt(), customer.id);
      const attempt = existing || createAttempt(customer.id, kind, input);
      // Persist before any server mutation. Storage failure must never start a payment.
      await saveAttempt(attempt);
      paymentAttempt.current = attempt;
      await runPayment(attempt, authToken, true);
    } catch {
      setStockFeedback('Le paiement n’a pas été lancé : impossible de sauvegarder sa reprise sur cet appareil. Vérifie le stockage de ton navigateur.');
      setScreen('menu');
    } finally { paymentStartRef.current = false; }
  };
  const pay = async () => {
    if (!authToken || !customer.id || !cart?.items?.length) { setScreen('login'); return; }
    const input = { customerId: customer.id, items: cart.items.map(item => ({ productId: item.product.id, quantity: 1, selections: item.selections })), method: cart.delivery.method, serviceDate: cart.delivery.date, slot: cart.delivery.slot };
    await beginPayment('order', input);
  };
  const startBibouPlus = async () => {
    if (!authToken) { setLoginDestination('bibou-plus'); setScreen('login'); return; }
    setBibouPlusLoading(true);
    try { await beginPayment('bibou-plus'); } finally { setBibouPlusLoading(false); }
  };
  const checkPayment = () => runPayment(paymentAttempt.current);
  const resumePayment = () => runPayment(paymentAttempt.current, authToken, true);
  useEffect(() => {
    if (!authToken || !['payment-pending', 'bibou-plus-pending'].includes(screen)) return;
    const refresh = () => { void runPayment(paymentAttempt.current); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    if (typeof window !== 'undefined') window.addEventListener('focus', refresh);
    return () => { subscription.remove(); if (typeof window !== 'undefined') window.removeEventListener('focus', refresh); };
  }, [screen, authToken]);
  const logoutCustomer = async () => {
    try {
      await detachPushDevice(API_BASE_URL, authToken);
      await clearSession();
      sessionEpoch.current += 1;
      sessionTokenRef.current = '';
      setAuthToken('');
      setCustomer({ name: '', phone: '', address: '', postalCode: '', city: 'Le Havre', distance: '', sponsorCode: '' });
      setLoyalty({ points: 0, orders: 0 });
      setOrders([]); setReservations([]); setRewardClaims([]); setCart(null);
      setPendingOrder(null); setPendingBibouPlus(null); paymentAttempt.current = null;
      // Keep the non-secret payment journal: only the same authenticated account can resume it.
      setScreen('menu');
    } catch { Alert.alert('Déconnexion indisponible', 'Impossible de déconnecter cet appareil en toute sécurité. Vérifie Internet et réessaie pour arrêter aussi ses notifications.'); }
  };
  const deleteCustomerAccount = async () => {
    if (!authToken) return;
    setAccountDeletionLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/customer/account`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.deleted) throw new Error(payload.error || "La suppression n’a pas pu être terminée.");
      await clearSession();
      await clearAttempt();
      sessionEpoch.current += 1;
      sessionTokenRef.current = '';
      paymentAttempt.current = null;
      setPendingOrder(null);
      setPendingBibouPlus(null);
      setAuthToken("");
      setCustomer({ name: "", phone: "", address: "", postalCode: "", city: "Le Havre", distance: "", sponsorCode: "" });
      setLoyalty({ points: 0, orders: 0, weeklyProgramPoints: 0 });
      setOrders([]);
      setReservations([]);
      setRewardClaims([]);
      setCart(null);
      setScreen("menu");
      Alert.alert("Compte supprimé", "Tes coordonnées et tes avantages ont été supprimés. Les anciennes commandes ont été anonymisées.");
    } catch (error) {
      Alert.alert("Suppression impossible", error.message || "Réessaie dans un instant.");
    } finally { setAccountDeletionLoading(false); }
  };
  const claimLoyaltyReward = async (reward) => {
    if (!authToken) {
      setLoginDestination("loyalty");
      setScreen("login");
      return;
    }
    setRewardLoading(reward.id);
    try {
      const response = await fetch(`${API_BASE_URL}/customer/rewards/${encodeURIComponent(reward.id)}/claim`, { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "La récompense n’a pas pu être réclamée.");
      setRewardClaims(payload.claims || []);
      Alert.alert("Récompense activée", `${reward.title}\n\nCode : ${payload.claim.code}\n\nPrésente ce code au restaurant. Tes points et ton prestige restent acquis.`);
    } catch (error) {
      Alert.alert("Récompense indisponible", error.message || "Réessaie dans un instant.");
    } finally {
      setRewardLoading("");
    }
  };
  const referFriend = async () => {
    if (!customer.referralCode) {
      Alert.alert("Connexion nécessaire", "Ouvre « Mon compte » et connecte-toi pour obtenir ton code personnel de parrainage.");
      return;
    }
    const referralUrl = `${CUSTOMER_APP_URL}?ref=${encodeURIComponent(customer.referralCode)}`;
    const message = `Je t’invite chez Bibou’s Burgers ! Utilise mon code ${customer.referralCode} lors de ta première commande : ${referralUrl}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Bibou’s Burgers", text: message, url: referralUrl });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert("Invitation copiée", `Le lien et le code ${customer.referralCode} sont prêts à être envoyés.`);
      } else {
        await Share.share({ title: "Bibou’s Burgers", message, url: referralUrl });
      }
    } catch (error) {
      if (error?.name !== "AbortError") Alert.alert("Ton code de parrainage", `${customer.referralCode}\n\n${referralUrl}`);
    }
  };
  if (screen === "contest") return <ContestScreen apiBaseUrl={API_BASE_URL} token={authToken} sponsorCode={referralCodeFromUrl()} onBack={() => setScreen("menu")} onLogin={() => { setLoginDestination("contest"); setScreen("login"); }} />;
  if (screen === "product") return <ProductScreen product={applyProductStock(activeProduct, catalog)} catalog={catalog} onBack={() => setScreen("menu")} onAdd={addToCart} />;
  if (screen === "cart") return <CartScreen catalog={catalog} cart={cart} customer={customer} onBack={() => setScreen("menu")} onAddMore={() => setScreen("menu")} onRemove={removeFromCart} onQuickAdd={addSimpleToCart} onCheckout={() => setScreen("delivery")} />;
  if (screen === "delivery") return <DeliveryScreen cart={cart} customer={customer} onBack={() => setScreen("cart")} onChange={updateDelivery} onContinue={() => { if (authToken) setScreen("details"); else { setLoginDestination("details"); setScreen("login"); } }} onOpenBibouPlus={() => { setBibouPlusReturnScreen("delivery"); setScreen("bibou-plus"); }} />;
  if (screen === "details") return <CheckoutDetailsScreen cart={cart} customer={customer} authToken={authToken} onChange={setCustomer} onBack={() => setScreen("delivery")} onContinue={continueWithCustomer} />;
  if (screen === "payment") return <PaymentScreen cart={cart} customer={customer} onBack={() => setScreen("details")} onPay={pay} />;
  if (screen === "payment-pending") return <PaymentPendingScreen kind="order" record={pendingOrder} message={paymentMessage} busy={paymentBusy} onCheckPayment={checkPayment} onResume={resumePayment} onBack={() => setScreen("menu")} />;
  if (screen === "success") return <SuccessScreen order={pendingOrder} onReview={() => setScreen("review")} onTrack={() => setScreen("orders")} onHome={() => { setCart(null); setScreen("menu"); }} />;
  if (screen === "review") return <ReviewScreen onBack={() => setScreen("success")} />;
  if (screen === "loyalty") return <LoyaltyScreen loyalty={loyalty} customer={customer} rewardClaims={rewardClaims} rewardLoading={rewardLoading} onBack={() => setScreen("menu")} onRefer={referFriend} onClaimReward={claimLoyaltyReward} />;
  if (screen === "bibou-plus") return <BibouPlusScreen customer={customer} authToken={authToken} loading={bibouPlusLoading} onBack={() => setScreen(bibouPlusReturnScreen)} onLogin={() => { setLoginDestination("bibou-plus"); setScreen("login"); }} onSubscribe={startBibouPlus} />;
  if (screen === "bibou-plus-pending") return <PaymentPendingScreen kind="bibou-plus" record={pendingBibouPlus} message={paymentMessage} busy={paymentBusy} onCheckPayment={checkPayment} onResume={resumePayment} onBack={() => setScreen("menu")} />;
  if (screen === "notifications") return <NotificationSettings key={authToken} api={API_BASE_URL} authToken={authToken} onBack={() => setScreen("account")} />;
  if (['offers','crm-welcome'].includes(screen)) return <CustomerOffers key={authToken} api={API_BASE_URL} authToken={authToken} onboarding={screen === 'crm-welcome'} onBack={() => setScreen(screen === 'crm-welcome' ? crmWelcomeDestination : 'account')} onUpdated={result => { if (sessionTokenRef.current === authToken) setCustomer(current => ({ ...current, crmOffers: result.offers, crmPreferences: result.preferences })); }} />;
  if (screen === "privacy") return <PrivacyScreen onBack={() => setScreen("menu")} onDeleteAccount={() => setScreen("delete-account")} />;
  if (screen === "delete-account") return <DeleteAccountScreen authToken={authToken} loading={accountDeletionLoading} onBack={() => setScreen(authToken ? "account" : "privacy")} onLogin={() => { setLoginDestination("delete-account"); setScreen("login"); }} onDelete={deleteCustomerAccount} />;
  if (screen === "reservation") return <ReservationScreen customer={customer} authToken={authToken} onBack={() => setScreen("menu")} onCreated={(reservation) => setReservations((current) => [reservationFromApi(reservation), ...current.filter((item) => item.id !== reservation.id)])} onOpenReservations={() => setScreen("reservations")} />;
  if (screen === "login") return <SmsLoginScreen onBack={() => setScreen(loginDestination === "account" ? "menu" : loginDestination)} onAuthenticated={authenticate} />;
  if (screen === "account") return authToken ? <AccountScreen onOpenOffers={() => setScreen("offers")} onOpenNotifications={() => setScreen("notifications")} onLogout={logoutCustomer} customer={customer} loyalty={loyalty} orders={orders} reservations={reservations} onBack={() => setScreen("menu")} onOpenOrders={() => { void loadCustomerOrders(); setScreen("orders"); }} onOpenReservations={() => { void loadCustomerReservations(); setScreen("reservations"); }} onOpenLoyalty={() => setScreen("loyalty")} onOpenBibouPlus={() => { setBibouPlusReturnScreen("account"); setScreen("bibou-plus"); }} onOpenPrivacy={() => setScreen("privacy")} onDeleteAccount={() => setScreen("delete-account")} /> : <SmsLoginScreen onBack={() => setScreen("menu")} onAuthenticated={authenticate} />;
  if (screen === "orders") return <OrdersScreen orders={orders} onBack={() => setScreen("account")} onRefresh={() => void loadCustomerOrders()} />;
  if (screen === "reservations") return <ReservationsScreen reservations={reservations} onBack={() => setScreen("account")} onRefresh={(silent = false) => void loadCustomerReservations({ silent })} />;
  return <SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" /><MenuScreen onOpenContest={() => setScreen("contest")} pendingPayment={Boolean(authToken && paymentAttempt.current)} onResumePayment={() => void runPayment(paymentAttempt.current)} catalog={catalog} stockMessage={stockFeedback || stockMessage} cartCount={cartCount} loyaltyPoints={loyalty.points} customer={customer} preferredMethod={preferredMethod} onChooseOrderMethod={setPreferredMethod} onOpenReservation={() => { if (authToken) setScreen("reservation"); else { setLoginDestination("reservation"); setScreen("login"); } }} onOpenPrivacy={() => setScreen("privacy")} onOpenAccount={() => setScreen(authToken ? "account" : "login")} onOpenLoyalty={() => setScreen("loyalty")} onOpenBibouPlus={() => { setBibouPlusReturnScreen("menu"); setScreen("bibou-plus"); }} onOpenProduct={openProduct} onQuickAdd={addSimpleToCart} onOpenCart={() => setScreen("cart")} /></SafeAreaView>;
}

const APP_PALETTE = {
  "#FFF8F2": "#E54832",
  "#FFFDFC": "#FFFCF7",
  "#F8EAE0": "#EEE2D6",
  "#FFF0E9": "#F3DDD3",
  "#EADBD2": "#DED0C4",
  "#E95122": "#B85C3C",
  "#D74318": "#98452F",
  "#2C201B": "#171412",
  "#473831": "#332A25",
  "#826E63": "#76665D",
  "#9B877B": "#88786F",
  "#FFB797": "#E7B09A",
  "#FFE5D8": "#F4DFD4",
  "#D6BEB1": "#CAB7AC",
  "#CBB7AA": "#BFAEA3",
  "#C9B4A7": "#B8AAA0",
  "#DEC8BA": "#CDBAAF",
  "#D5BDB0": "#C6B5AA",
  "#A99388": "#9A8C83",
  "#F2C8B5": "#DFB5A2",
  "#F9D6C8": "#EAC9BA",
  "#5D4740": "#463A34",
  "#EBC8B9": "#D9B7A8",
  "#F2C7B7": "#DDB4A4",
  "#D3BDB1": "#C5B3A8",
  "#CDB7AB": "#BDACA2",
  "#F2E8E2": "#EAE0D7",
  "#F3E9E2": "#EAE1D9",
  "#E4D6CE": "#D8CAC0",
  "#907E74": "#81736B",
  "#EAF5E4": "#F2E7DE",
  "#C7E1BF": "#D8C3B7"
};

const applyAppPalette = (styleSheet) => Object.fromEntries(Object.entries(styleSheet).map(([name, style]) => {
  const themedStyle = Object.fromEntries(Object.entries(style).map(([property, value]) => [property, APP_PALETTE[value] || value]));
  if (["wordmark", "siteFooterTitle"].includes(name)) themedStyle.color = "#171412";
  return [name, themedStyle];
}));

const styles = StyleSheet.create(applyAppPalette({
  paymentRecoveryText: { color: '#25120B' },
  paymentRecoveryPrimary: { backgroundColor: '#191919', width: '100%' },
  paymentRecoverySecondary: { borderColor: '#25120B', backgroundColor: '#FFEBDC', width: '100%' },
  stockNotice: { backgroundColor: "#fff1dc", color: "#51251a", padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 20, fontWeight: "600", marginVertical: 10 },
  optionSoldOut: { opacity: 0.55 },
  safeArea: { flex: 1, backgroundColor: "#FFF8F2" }, scrollContent: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: 20, paddingBottom: 110 }, scrollContentDesktop: { paddingHorizontal: 32, paddingBottom: 60 }, detailContent: { flexGrow: 1, width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, paddingBottom: 120 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerBrand: { flexDirection: "row", alignItems: "center" }, wordmarkBadge: { width: 140, height: 50, alignItems: "center", justifyContent: "center" }, wordmarkBadgeDesktop: { width: 158, height: 56 }, wordmarkImage: { width: 134, height: 48 }, wordmarkImageDesktop: { width: 152, height: 54 }, headerRight: { fontSize: 18 }, backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F8EAE0", alignItems: "center", justifyContent: "center" }, backText: { fontSize: 30, lineHeight: 32, color: "#2C201B" },
  headerDesktop: { height: 76, borderBottomWidth: 1, borderBottomColor: "#EADBD2", marginBottom: 4 }, wordmarkDesktop: { fontSize: 29, letterSpacing: -1.1 }, wordmarkTagline: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 2 },
  homeTopRow: { flexDirection: "row", gap: 9, alignItems: "stretch" }, addressBox: { marginTop: 15, borderRadius: 15, backgroundColor: "#F8EAE0", padding: 13, flex: 1 }, addressLabel: { color: "#826E63", fontSize: 12 }, addressValue: { color: "#2C201B", fontWeight: "700", marginTop: 2 }, accountShortcut: { marginTop: 15, width: 88, backgroundColor: "#FFF0E9", borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }, accountShortcutIcon: { fontSize: 18 }, accountShortcutText: { color: "#D74318", fontSize: 10, fontWeight: "800", marginTop: 3, textAlign: "center" }, title: { color: "#2C201B", fontSize: 30, lineHeight: 33, fontWeight: "800", letterSpacing: -1.1, marginTop: 25 }, sectionTitle: { color: "#2C201B", fontSize: 18, fontWeight: "800", marginTop: 26, marginBottom: 11 },
  serviceTitle: { color: "#2C201B", fontSize: 16, fontWeight: "900", marginTop: 20, marginBottom: 10 }, serviceActions: { flexDirection: "row", gap: 8 }, serviceActionsDesktop: { maxWidth: 720, gap: 12 }, serviceAction: { flex: 1, minHeight: 116, backgroundColor: "#FFFDFC", borderWidth: 1.5, borderColor: "#EADBD2", borderRadius: 18, paddingHorizontal: 8, paddingVertical: 13, alignItems: "center", justifyContent: "center" }, serviceActionSelected: { borderColor: "#E95122", backgroundColor: "#FFF0E9" }, serviceActionReservation: { backgroundColor: "#EAF5E4", borderColor: "#C7E1BF" }, serviceActionIcon: { fontSize: 26 }, serviceActionTitle: { color: "#2C201B", fontSize: 12, fontWeight: "900", textAlign: "center", marginTop: 7 }, serviceActionText: { color: "#826E63", fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 3 },
  homeTopRowDesktop: { maxWidth: 640 }, accountShortcutDesktop: { width: 120 }, titleDesktop: { fontSize: 48, lineHeight: 49, letterSpacing: -2, marginTop: 38, marginBottom: 4 }, sectionTitleDesktop: { fontSize: 25, marginTop: 42, marginBottom: 16 }, productGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }, productGridItem: { width: "48.8%", backgroundColor: "#FFFDFC", borderRadius: 19, paddingHorizontal: 14, borderWidth: 1, borderColor: "#EADBD2" },
  loyaltyShortcut: { marginTop: 12, backgroundColor: "#2C201B", borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, loyaltyShortcutEyebrow: { color: "#FFB797", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }, loyaltyShortcutTitle: { color: "white", fontSize: 15, fontWeight: "800", marginTop: 3 }, loyaltyShortcutArrow: { color: "#E95122", fontSize: 30, fontWeight: "400", lineHeight: 30 },
  loyaltyShortcutDesktop: { maxWidth: 640 },
  hero: { height: 155, borderRadius: 23, overflow: "hidden", justifyContent: "flex-end" }, heroImage: { position: "absolute", width: "100%", height: "100%", resizeMode: "cover" }, heroShade: { position: "absolute", width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.32)" }, heroCopy: { padding: 17 }, heroTitle: { color: "white", fontSize: 21, fontWeight: "800" }, heroSubtitle: { color: "white", marginTop: 5, fontWeight: "600" },
  promotionsTrack: { gap: 12 }, promotionCard: { height: 190, borderRadius: 23, overflow: "hidden", justifyContent: "flex-end" }, promotionImage: { position: "absolute", width: "100%", height: "100%", resizeMode: "cover" }, promotionShade: { position: "absolute", width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.34)" }, promotionCopy: { padding: 18 }, promotionEyebrow: { color: "#FFE5D8", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, promotionTitle: { color: "white", fontSize: 25, fontWeight: "800", marginTop: 5 }, promotionSubtitle: { color: "white", fontSize: 13, fontWeight: "600", marginTop: 5 }, promotionDots: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 11, marginBottom: 4 }, promotionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D6BEB1" }, promotionDotActive: { width: 18, backgroundColor: "#241C18" }, promotionDotButton: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  googleReviewsSection: { marginTop: 24, marginBottom: 4 }, googleReviewsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }, googleReviewsTitle: { color: "#2C201B", fontSize: 18, fontWeight: "800" }, googleReviewsScore: { color: "#826E63", fontSize: 12, marginTop: 2 }, googleReviewsLink: { color: "#D74318", fontWeight: "800", fontSize: 12 }, googleReviewsTrack: { gap: 10 }, googleReviewCard: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 16, minHeight: 145 }, googleReviewStars: { color: "#F1A326", fontSize: 18, letterSpacing: 1 }, googleReviewText: { color: "#473831", fontSize: 13, lineHeight: 19, marginTop: 9, flex: 1 }, googleReviewAuthor: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 10 },
  productCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomColor: "#EADBD2", borderBottomWidth: 1 }, productCardSoldOut: { opacity: 0.52 }, productImage: { width: 72, height: 72, borderRadius: 18, resizeMode: "cover", backgroundColor: "#EADBD2" }, productEmojiImage: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0E9" }, productEmoji: { fontSize: 34 }, productInfo: { flex: 1 }, productName: { color: "#2C201B", fontSize: 16, fontWeight: "900" }, productDescription: { color: "#493A33", fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 3 }, productPrice: { color: "#2C201B", fontWeight: "800", marginTop: 7 }, soldOutText: { color: "#9B5C48" }, plus: { backgroundColor: "#E95122", width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" }, plusSoldOut: { backgroundColor: "#A99388" }, plusText: { color: "white", fontSize: 22, lineHeight: 24 }, categoryIntro: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: -10, marginBottom: 4 }, floatingCart: { marginTop: 22, backgroundColor: "#2C201B", borderRadius: 15, paddingVertical: 15, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between" }, floatingCartText: { color: "white", fontWeight: "800" }, floatingCartIcon: { color: "white" },
  drinkImageFrame: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#F5EBDD", borderWidth: 1, borderColor: "#E6D3C0" },
  drinkProductImage: { width: 66, height: 66, resizeMode: "contain" },
  floatingCartDesktop: { maxWidth: 420, alignSelf: "flex-end", width: "100%", marginTop: 28 }, siteFooter: { marginTop: 46, paddingVertical: 28, borderTopWidth: 1, borderTopColor: "#EADBD2", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, siteFooterTitle: { color: "#E95122", fontSize: 24, fontWeight: "900" }, siteFooterText: { color: "#826E63", fontSize: 13, lineHeight: 20, marginTop: 7 }, siteFooterButton: { backgroundColor: "#FFF0E9", borderRadius: 14, paddingHorizontal: 17, paddingVertical: 13 }, siteFooterButtonText: { color: "#D74318", fontWeight: "800" },
  detailImage: { width: "100%", height: 230, borderRadius: 25, resizeMode: "cover", marginTop: 14, backgroundColor: "#EADBD2" }, priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, detailTitle: { color: "#2C201B", fontSize: 26, fontWeight: "900", letterSpacing: -1, flex: 1, paddingRight: 14 }, detailPrice: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, detailDescription: { color: "#826E63", lineHeight: 20, marginTop: 7 }, includedText: { color: "#397353", fontSize: 13, fontWeight: "700", marginTop: 10 }, fixedSauceNotice: { backgroundColor: "#FFF0E9", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 16, padding: 14, marginBottom: 14 }, fixedSauceEyebrow: { color: "#D74318", fontSize: 11, fontWeight: "900", letterSpacing: 0.6 }, fixedSauceName: { color: "#2C201B", fontSize: 15, fontWeight: "900", marginTop: 4 }, fixedSauceText: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 4 },
  optionGroup: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 16, overflow: "hidden", marginBottom: 14 }, optionGroupHeader: { minHeight: 70, padding: 14, backgroundColor: "#F8EAE0" }, optionGroupTitleWrap: { flex: 1 }, optionGroupTitle: { color: "#2C201B", fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }, optionGroupHelper: { color: "#826E63", fontSize: 12, marginTop: 5 }, optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, padding: 10 }, option: { width: "48.5%", minHeight: 78, paddingHorizontal: 9, paddingVertical: 9, flexDirection: "row", alignItems: "center", borderColor: "#EADBD2", borderWidth: 1.5, borderRadius: 13, backgroundColor: "#FFFDFC" }, optionSelected: { backgroundColor: "#FFF0E9", borderColor: "#E95122", borderWidth: 2.5, paddingHorizontal: 8 }, checkbox: { width: 22, height: 22, borderColor: "#CBB7AA", borderWidth: 1.5, borderRadius: 7, alignItems: "center", justifyContent: "center", marginRight: 6, flexShrink: 0 }, checkboxSelected: { backgroundColor: "#E95122", borderColor: "#E95122" }, checkmark: { color: "white", fontWeight: "900" }, optionName: { color: "#2C201B", flex: 1, fontSize: 12, lineHeight: 15, fontWeight: "700", paddingRight: 2 }, optionNameSelected: { color: "#98452F", fontWeight: "900" }, optionValue: { color: "#826E63", fontSize: 10, fontWeight: "800", flexShrink: 0 }, optionDrinkImage: { width: 36, height: 48, resizeMode: "contain", marginRight: 4 }, sideOption: { minHeight: 180, flexDirection: "column", alignItems: "stretch" }, optionSideImage: { width: "100%", height: 92, borderRadius: 10, resizeMode: "cover", backgroundColor: "#F5EBDD" }, sideOptionChoice: { flexDirection: "row", alignItems: "center", marginTop: 9 }, sideOptionValue: { color: "#826E63", fontSize: 11, fontWeight: "800", marginTop: 7, marginLeft: 28 }, optionDrinkFallback: { width: 36, height: 44, borderRadius: 11, backgroundColor: "#F5EBDD", alignItems: "center", justifyContent: "center", marginRight: 4 }, optionDrinkFallbackText: { fontSize: 20 }, saucePotPhoto: { width: 43, height: 50, resizeMode: "contain", marginRight: 3 }, noSauceVisual: { width: 43, height: 43, borderRadius: 22, backgroundColor: "#F2E8E2", alignItems: "center", justifyContent: "center", marginRight: 3 }, noSauceVisualText: { color: "#826E63", fontSize: 24, fontWeight: "700" },
  stickyAction: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, paddingBottom: 18, backgroundColor: "#FFF8F2", borderTopColor: "#EADBD2", borderTopWidth: 1 }, requiredHint: { color: "#826E63", fontSize: 12, textAlign: "center", marginBottom: 8 }, primaryButton: { backgroundColor: "#E95122", borderRadius: 16, padding: 16, alignItems: "center" }, primaryButtonDisabled: { backgroundColor: "#C9B4A7" }, primaryButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingTop: 75 }, emptyIcon: { fontSize: 56 }, emptyTitle: { color: "#2C201B", fontSize: 20, fontWeight: "800", marginTop: 12 }, emptyText: { color: "#826E63", marginTop: 7 }, cartItems: { marginTop: 14 }, cartItem: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EADBD2" }, cartImage: { width: 74, height: 74, borderRadius: 18, resizeMode: "cover", backgroundColor: "#EADBD2" }, cartEmoji: { width: 74, height: 74, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0E9" }, cartEmojiText: { fontSize: 34 }, cartRemove: { color: "#D74318", fontSize: 12, fontWeight: "800", marginTop: 6 }, addMoreButton: { alignItems: "center", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 14, paddingVertical: 12, marginTop: 15 }, addMoreButtonText: { color: "#D74318", fontWeight: "900" }, cartSuggestions: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 19, padding: 14, marginTop: 20 }, cartSuggestionsTitle: { color: "#2C201B", fontSize: 18, fontWeight: "900" }, cartSuggestionsIntro: { color: "#826E63", fontSize: 12, marginTop: 3, marginBottom: 8 }, cartSuggestion: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#F0E3DC" }, cartSuggestionVisual: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 10 }, cartSuggestionImage: { width: 48, height: 48, resizeMode: "cover" }, cartSuggestionEmoji: { fontSize: 24 }, cartSuggestionCopy: { flex: 1 }, cartSuggestionName: { color: "#2C201B", fontSize: 13, fontWeight: "900" }, cartSuggestionPrice: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 3 }, cartSuggestionAdd: { backgroundColor: "#E95122", borderRadius: 11, paddingVertical: 8, paddingHorizontal: 9 }, cartSuggestionAddText: { color: "white", fontSize: 10, fontWeight: "900" }, receipt: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 16, marginTop: 24 }, receiptLine: { flexDirection: "row", justifyContent: "space-between", marginVertical: 5, color: "#2C201B" }, receiptDivider: { height: 1, backgroundColor: "#DEC8BA", marginVertical: 9 }, strong: { fontWeight: "800", color: "#2C201B" }, eta: { color: "#397353", fontWeight: "700", marginTop: 17 },
  drinkCartImage: { resizeMode: "contain", backgroundColor: "#F5EBDD" },
  drinkSuggestionImage: { width: 44, height: 44, resizeMode: "contain" },
  deliveryIntro: { color: "#251C18", lineHeight: 20, marginTop: 9, marginBottom: 22 }, deliveryLabel: { color: "#251C18", fontSize: 12, fontWeight: "900", letterSpacing: 0.4, marginTop: 20, marginBottom: 9 }, methodRow: { flexDirection: "row", gap: 9 }, dayRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, choiceChip: { borderWidth: 1.5, borderColor: "#EADBD2", borderRadius: 13, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: "#FFFDFC" }, choiceChipSelected: { borderColor: "#E95122", backgroundColor: "#FFF0E9" }, choiceChipText: { color: "#2C201B", fontWeight: "700", fontSize: 13 }, choiceChipTextSelected: { color: "#D74318" }, addressNotice: { backgroundColor: "#F8EAE0", borderRadius: 14, padding: 13, marginTop: 13 }, addressNoticeTitle: { color: "#826E63", fontSize: 12 }, addressNoticeText: { color: "#2C201B", fontWeight: "700", marginTop: 3 }, deliveryPrices: { marginTop: 9, borderTopWidth: 1, borderTopColor: "#EADBD2", paddingTop: 5 }, deliveryPriceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }, deliveryPriceDistance: { color: "#826E63", fontSize: 12 }, deliveryPriceValue: { color: "#2C201B", fontSize: 12, fontWeight: "800" }, deliveryFeeHint: { color: "#826E63", fontSize: 11, marginTop: 5 }, cartFeeHint: { color: "#826E63", fontSize: 11, lineHeight: 15, marginTop: 10 }, slots: { gap: 9, flexDirection: "row", flexWrap: "wrap" }, slot: { width: "48.5%", borderWidth: 1.5, borderColor: "#EADBD2", borderRadius: 14, padding: 12, backgroundColor: "#FFFDFC" }, slotSelected: { borderColor: "#E95122", borderWidth: 2.5, backgroundColor: "#FFF0E9", shadowColor: "#E95122", shadowOpacity: 0.16, shadowRadius: 8 }, slotDisabled: { backgroundColor: "#F2E8E2", borderColor: "#E4D6CE", opacity: 0.72 }, slotRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }, slotText: { color: "#2C201B", fontWeight: "800", fontSize: 13 }, slotTextSelected: { color: "#D74318" }, slotTextFull: { color: "#907E74" }, slotStatus: { flexDirection: "row", alignItems: "center", gap: 5 }, slotAvailability: { color: "#397353", fontSize: 9, fontWeight: "800", textAlign: "right" }, slotAvailabilitySelected: { color: "#D74318" }, slotAvailabilityFull: { color: "#A3472A" }, slotCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#CBB7AA", backgroundColor: "#FFFDFC", alignItems: "center", justifyContent: "center" }, slotCheckSelected: { backgroundColor: "#E95122", borderColor: "#E95122" }, slotCheckmark: { color: "white", fontSize: 12, fontWeight: "900" }, availabilityError: { color: "#251C18", fontSize: 12, fontWeight: "700", marginBottom: 9 },
  guestCounter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: "#F8EAE0", borderRadius: 19, padding: 14 }, guestButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#E95122", alignItems: "center", justifyContent: "center" }, guestButtonDisabled: { backgroundColor: "#CDB7AB" }, guestButtonText: { color: "white", fontSize: 27, fontWeight: "800", lineHeight: 29 }, guestCount: { minWidth: 82, alignItems: "center" }, guestCountNumber: { color: "#2C201B", fontSize: 27, fontWeight: "900" }, guestCountLabel: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 1 }, reservationNote: { minHeight: 100, borderRadius: 14, borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC", padding: 14, color: "#2C201B", fontSize: 14, textAlignVertical: "top" }, reservationInfo: { backgroundColor: "#EAF5E4", borderRadius: 17, padding: 15, marginTop: 18 }, reservationInfoTitle: { color: "#397353", fontWeight: "900" }, reservationInfoText: { color: "#526D57", fontSize: 12, lineHeight: 17, marginTop: 4 }, reservationSubmit: { marginTop: 15 }, reservationSuccess: { flex: 1, padding: 20 }, reservationSuccessBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 30 }, reservationRecapCard: { width: "100%", backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, paddingHorizontal: 16, marginTop: 22 }, reservationRecapRow: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EADBD2" }, reservationRecapRowLast: { borderBottomWidth: 0 }, reservationRecapLabel: { color: "#826E63", fontSize: 12, fontWeight: "700" }, reservationRecapValue: { color: "#2C201B", fontSize: 12, fontWeight: "900", textAlign: "right", flex: 1 }, reservationPendingCard: { width: "100%", backgroundColor: "#FFF0E9", borderRadius: 18, padding: 17, marginTop: 14 }, reservationPendingTitle: { color: "#D74318", fontWeight: "900" }, reservationPendingText: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 5 }, reservationHomeButton: { width: "100%", marginTop: 14 },
  detailsContent: { flexGrow: 1, padding: 20, paddingBottom: 120 }, detailsIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, fieldInput: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC", paddingHorizontal: 14, color: "#2C201B", fontSize: 15, marginBottom: 10 }, fieldRow: { flexDirection: "row", gap: 10 }, fieldHalf: { flex: 0.8 }, fieldCity: { flex: 1.2 }, distanceCard: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 15, marginTop: 5, borderWidth: 1, borderColor: "#F0D7CB" }, distanceCardError: { backgroundColor: "#FFF0ED", borderColor: "#E3A18C" }, distanceTitle: { color: "#2C201B", fontWeight: "800" }, distanceText: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 5 }, distanceInput: { minHeight: 48, borderRadius: 12, backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", paddingHorizontal: 13, color: "#2C201B", fontSize: 14, marginTop: 12 }, distanceSuccess: { color: "#397353", fontSize: 12, fontWeight: "800", marginTop: 9 }, distanceError: { color: "#A3472A", fontSize: 12, fontWeight: "800", marginTop: 9 }, pickupCard: { backgroundColor: "#EAF5E4", borderRadius: 18, padding: 16, marginTop: 22 }, pickupTitle: { color: "#397353", fontWeight: "800" }, pickupText: { color: "#526D57", lineHeight: 18, marginTop: 5, fontSize: 13 }, detailsFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 17, textAlign: "center" }, paymentSummary: { backgroundColor: "#F8EAE0", borderRadius: 19, padding: 17, marginTop: 22 }, paymentProduct: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, paymentLine: { color: "#826E63", fontSize: 12, marginTop: 6 }, customerSummary: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 16, marginTop: 13 }, customerSummaryTitle: { color: "#826E63", fontSize: 12, fontWeight: "800", textTransform: "uppercase" }, customerSummaryText: { color: "#2C201B", fontSize: 13, lineHeight: 18, marginTop: 6 }, securePayment: { backgroundColor: "#EAF5E4", borderRadius: 18, padding: 15, marginTop: 13, flexDirection: "row", alignItems: "center" }, securePaymentIcon: { fontSize: 22, marginRight: 11 }, securePaymentTitle: { color: "#397353", fontWeight: "800" }, securePaymentText: { color: "#526D57", fontSize: 11, lineHeight: 15, marginTop: 3, paddingRight: 24 },
  quoteButton: { alignSelf: "flex-start", backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#D74318", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 }, quoteButtonDisabled: { opacity: 0.6 }, quoteButtonText: { color: "#D74318", fontSize: 13, fontWeight: "800" },
  referralApplied: { minHeight: 48, borderRadius: 13, backgroundColor: "#EAF5E4", borderWidth: 1, borderColor: "#C7E1BF", paddingHorizontal: 14, justifyContent: "center" }, referralAppliedText: { color: "#397353", fontWeight: "800" }, referralFieldHint: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: -3, marginBottom: 2 },
  successContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, successEmoji: { fontSize: 64 }, successTitle: { color: "#2C201B", fontSize: 28, fontWeight: "800", marginTop: 15, textAlign: "center" }, successText: { color: "#826E63", textAlign: "center", lineHeight: 20, marginTop: 9 }, statusCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 18, width: "100%", marginTop: 30, marginBottom: 12 }, statusTitle: { color: "#397353", fontWeight: "800" }, statusDescription: { color: "#826E63", lineHeight: 19, marginTop: 8 }, trackOrderButton: { width: "100%", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 16, padding: 14, alignItems: "center", marginBottom: 12 }, trackOrderButtonText: { color: "#D74318", fontWeight: "800" },
  reviewPrompt: { width: "100%", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 18, padding: 16, marginBottom: 12, backgroundColor: "#FFF0E9" }, reviewPromptTitle: { color: "#2C201B", fontWeight: "800" }, reviewPromptText: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 4 }, reviewPromptLink: { color: "#D74318", fontWeight: "800", marginTop: 9 }, reviewContent: { padding: 20, paddingBottom: 44 }, reviewIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, reviewCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 18, marginTop: 23, alignItems: "center" }, reviewQuestion: { color: "#2C201B", fontWeight: "800", fontSize: 16 }, starsRow: { flexDirection: "row", marginTop: 12 }, starButton: { paddingHorizontal: 4, paddingVertical: 3 }, star: { color: "#D5BDB0", fontSize: 38, lineHeight: 43 }, starActive: { color: "#F1A326" }, ratingHelper: { color: "#826E63", fontSize: 12, marginTop: 7 }, reviewReward: { backgroundColor: "#EAF5E4", borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", marginTop: 15 }, reviewRewardEmoji: { fontSize: 25, marginRight: 11 }, reviewRewardTitle: { color: "#2C201B", fontWeight: "800" }, reviewRewardText: { color: "#397353", fontSize: 12, fontWeight: "700", marginTop: 4 }, reviewLabel: { color: "#826E63", fontSize: 12, fontWeight: "900", letterSpacing: 0.4, marginTop: 25, marginBottom: 8 }, reviewInput: { minHeight: 130, borderRadius: 17, borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC", padding: 14, color: "#2C201B", fontSize: 14, lineHeight: 20 }, characterCount: { color: "#826E63", fontSize: 11, alignSelf: "flex-end", marginTop: 6 }, reviewSubmit: { marginTop: 20 }, googleReviewButton: { borderWidth: 1, borderColor: "#EADBD2", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 11, backgroundColor: "#FFFDFC" }, googleReviewText: { color: "#2C201B", fontWeight: "800", fontSize: 13 }, reviewFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: "center" },
  accountContent: { padding: 20, paddingBottom: 46 }, accountHero: { backgroundColor: "#2C201B", borderRadius: 22, padding: 19, marginTop: 20, flexDirection: "row", alignItems: "center" }, accountAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#E95122", alignItems: "center", justifyContent: "center", marginRight: 13 }, accountAvatarText: { color: "white", fontSize: 22, fontWeight: "900" }, accountGreeting: { color: "white", fontSize: 18, fontWeight: "800" }, accountContact: { color: "#F2C8B5", fontSize: 12, marginTop: 5, maxWidth: 230 }, currentOrderCard: { backgroundColor: "#EAF5E4", borderRadius: 20, padding: 16, marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, currentOrderEyebrow: { color: "#397353", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }, currentOrderTitle: { color: "#2C201B", fontSize: 15, fontWeight: "800", marginTop: 5 }, currentOrderText: { color: "#526D57", fontSize: 12, marginTop: 4 }, currentOrderArrow: { color: "#397353", fontSize: 30 }, accountAction: { backgroundColor: "#FFFDFC", borderRadius: 18, borderWidth: 1, borderColor: "#EADBD2", padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 10 }, accountActionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 }, accountActionCopy: { flex: 1 }, accountActionTitle: { color: "#2C201B", fontWeight: "800" }, accountActionText: { color: "#826E63", fontSize: 12, marginTop: 4 }, accountActionArrow: { color: "#D74318", fontSize: 26 }, accountAddress: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 15, marginTop: 15 }, accountAddressTitle: { color: "#2C201B", fontWeight: "800" }, accountAddressText: { color: "#826E63", fontSize: 13, lineHeight: 18, marginTop: 6 }, accountFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 19 }, trackingCard: { backgroundColor: "#FFFDFC", borderRadius: 20, borderWidth: 1, borderColor: "#EADBD2", padding: 16 }, trackingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, trackingOrder: { color: "#2C201B", fontSize: 15, fontWeight: "800", maxWidth: 230 }, trackingMeta: { color: "#826E63", fontSize: 12, marginTop: 5 }, trackingPrice: { color: "#2C201B", fontWeight: "800" }, trackingSteps: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 }, trackingStep: { flex: 1, alignItems: "center" }, trackingDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#F3E9E2", borderWidth: 1, borderColor: "#D6BEB1", alignItems: "center", justifyContent: "center" }, trackingDotDone: { backgroundColor: "#E95122", borderColor: "#E95122" }, trackingCheck: { color: "white", fontSize: 12, fontWeight: "900" }, trackingLabel: { color: "#9B877B", fontSize: 8, fontWeight: "700", textAlign: "center", marginTop: 5 }, trackingLabelDone: { color: "#D74318" }, trackingMessage: { color: "#397353", fontWeight: "700", fontSize: 12, textAlign: "center", marginTop: 18 }, historyOrder: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 9 }, historyIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EAF5E4", alignItems: "center", justifyContent: "center", marginRight: 10 }, historyCopy: { flex: 1 }, historyTitle: { color: "#2C201B", fontSize: 13, fontWeight: "800" }, historyMeta: { color: "#826E63", fontSize: 11, marginTop: 4 }, historyPrice: { color: "#2C201B", fontWeight: "800", fontSize: 12 },
  customerReservationCard: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "flex-start", marginBottom: 10 }, customerReservationIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 }, customerReservationIconText: { fontSize: 21, fontWeight: "900" }, customerReservationCopy: { flex: 1 }, customerReservationTitle: { color: "#2C201B", fontSize: 14, fontWeight: "900", textTransform: "capitalize" }, customerReservationMeta: { color: "#826E63", fontSize: 11, marginTop: 4 }, customerReservationStatus: { fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 8 }, emptyReservationState: { alignItems: "center", paddingVertical: 28, backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18 },
  loginContent: { padding: 20, paddingBottom: 44 }, loginIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginTop: 26 }, loginIconText: { color: "#E95122", fontSize: 31 }, loginIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, loginCard: { backgroundColor: "#F8EAE0", borderRadius: 22, padding: 17, marginTop: 23 }, loginFinePrint: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 16 }, loginError: { color: "#A3472A", fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 2, marginBottom: 16 }, loginSecondary: { alignItems: "center", paddingTop: 17 }, loginSecondaryText: { color: "#D74318", fontWeight: "800" }, loginLegal: { color: "#826E63", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 18 }, codeInput: { fontSize: 24, fontWeight: "800", letterSpacing: 8, textAlign: "center" },
  loyaltyContent: { padding: 20, paddingBottom: 44 }, loyaltyIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, pointsCard: { backgroundColor: "#2C201B", borderRadius: 24, padding: 21, marginTop: 22 }, pointsEyebrow: { color: "#FFB797", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, pointsTotal: { color: "white", fontSize: 30, fontWeight: "800", marginTop: 7 }, pointsSubtext: { color: "#F9D6C8", fontWeight: "600", marginTop: 7 }, progressTrack: { height: 9, backgroundColor: "#5D4740", borderRadius: 6, overflow: "hidden", marginTop: 19 }, progressFill: { height: "100%", backgroundColor: "#E95122", borderRadius: 6 }, progressCaption: { color: "#EBC8B9", fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "right" }, prestigeCard: { backgroundColor: "#FFF0E9", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#F2C7B7" }, prestigeTop: { flexDirection: "row", alignItems: "center" }, prestigeBadge: { width: 94, height: 60, borderRadius: 20, backgroundColor: "#F8EAE0", borderWidth: 2, borderColor: "#D3BDB1", alignItems: "center", justifyContent: "center", marginRight: 12 }, prestigeBadgeText: { color: "#826E63", fontSize: 16, fontWeight: "900" }, prestigeCopy: { flex: 1 }, prestigeTitle: { color: "#2C201B", fontSize: 15, fontWeight: "900" }, prestigeReward: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 4 }, prestigeLevels: { flexDirection: "row", justifyContent: "space-between", marginTop: 19 }, prestigeLevel: { alignItems: "center", flex: 1 }, prestigeAboveLabel: { color: "#826E63", fontSize: 9, fontWeight: "800", marginBottom: 5 }, prestigeDot: { width: 50, height: 40, borderRadius: 20, backgroundColor: "#F8EAE0", borderWidth: 2, borderColor: "#D3BDB1", alignItems: "center", justifyContent: "center" }, prestigeDotUnlocked: { backgroundColor: "#E95122", borderColor: "#E95122" }, prestigeDotText: { color: "#826E63", fontSize: 10, fontWeight: "900" }, prestigeDotTextUnlocked: { color: "white" }, prestigeLevelLabel: { color: "#9B877B", fontSize: 8, lineHeight: 12, fontWeight: "700", marginTop: 5, textAlign: "center" }, prestigeLevelLabelActive: { color: "#D74318" }, prestigeNext: { color: "#826E63", fontSize: 12, marginTop: 15, textAlign: "center" }, rewardsTable: { borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC" }, rewardRow: { minHeight: 76, padding: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EADBD2" }, rewardRowUnlocked: { backgroundColor: "#F4F8F0" }, rewardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 }, rewardEmoji: { fontSize: 21 }, rewardCopy: { flex: 1, paddingRight: 8 }, rewardTitle: { color: "#2C201B", fontSize: 13, fontWeight: "800" }, rewardDetail: { color: "#826E63", fontSize: 11, lineHeight: 14, marginTop: 3 }, rewardStatus: { minWidth: 56, borderRadius: 11, backgroundColor: "#F2E8E2", paddingVertical: 6, paddingHorizontal: 5, alignItems: "center" }, rewardStatusText: { color: "#826E63", fontSize: 11, fontWeight: "900" }, rewardStatusSubtext: { color: "#826E63", fontSize: 9, marginTop: 2 }, rewardClaimButton: { minWidth: 70, borderRadius: 12, backgroundColor: "#397353", paddingVertical: 8, paddingHorizontal: 8, alignItems: "center" }, rewardClaimButtonText: { color: "white", fontSize: 11, fontWeight: "900" }, rewardClaimButtonHint: { color: "#DDF0E2", fontSize: 8, marginTop: 2 }, rewardClaimedStatus: { minWidth: 82, borderRadius: 12, backgroundColor: "#DDEED7", paddingVertical: 7, paddingHorizontal: 7, alignItems: "center" }, rewardClaimedLabel: { color: "#397353", fontSize: 9, fontWeight: "900" }, rewardClaimCode: { color: "#2E6144", fontSize: 9, fontWeight: "900", marginTop: 3 }, rewardUsedStatus: { backgroundColor: "#E8E2DE" }, rewardUsedText: { color: "#826E63" }, rewardClaimFootnote: { color: "#5A4A42", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 11 }, weeklyCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 17 }, weeklyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, weeklyTitle: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, weeklySubtext: { color: "#826E63", fontSize: 12, marginTop: 4 }, multiplierBadge: { width: 53, height: 53, borderRadius: 18, backgroundColor: "#E95122", justifyContent: "center", alignItems: "center" }, multiplierText: { color: "white", fontSize: 22, fontWeight: "900" }, weeklyPoints: { color: "#397353", fontWeight: "800", marginTop: 16 }, stepsRow: { flexDirection: "row", alignItems: "center", marginTop: 20 }, step: { width: 48, alignItems: "center" }, stepActive: { opacity: 1 }, stepNumber: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#CDB7AB", color: "#826E63", textAlign: "center", lineHeight: 28, fontWeight: "800", backgroundColor: "#FFF8F2" }, stepNumberActive: { backgroundColor: "#E95122", borderColor: "#E95122", color: "white" }, stepLabel: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 5 }, stepLine: { flex: 1, height: 2, backgroundColor: "#D5BDB0", marginBottom: 17 }, weeklyFootnote: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 16 }, simulateButton: { borderRadius: 16, borderWidth: 1.5, borderColor: "#E95122", padding: 14, alignItems: "center", marginTop: 14 }, simulateButtonText: { color: "#D74318", fontWeight: "800" }, simulateHint: { color: "#826E63", fontSize: 11, marginTop: 4 }, referralCard: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center" }, referralIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 12 }, referralEmoji: { fontSize: 22 }, referralCopy: { flex: 1 }, referralTitle: { color: "#2C201B", fontWeight: "800" }, referralText: { color: "#826E63", fontSize: 12, marginTop: 4, lineHeight: 16 }, loyaltyLegal: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 18, textAlign: "center" },
  headerCart: { minWidth: 44, height: 38, borderRadius: 13, backgroundColor: "#FFF0E9", paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  headerCartText: { color: "#D74318", fontSize: 16, fontWeight: "900" },
  categoryHeader: {
    width: "100%",
    backgroundColor: "#F4B13D",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#FFD787",
    shadowColor: "#7A4713",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  categoryHeaderTitle: { color: "#2C201B", fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },
  categoryHeaderSubtitle: { color: "#5B3A1B", fontSize: 12, fontWeight: "700", marginTop: 3 },
  bibouPlusShortcut: { marginTop: 14, width: "100%", maxWidth: 640, borderRadius: 23, padding: 18, backgroundColor: "#7A2018", borderWidth: 1.5, borderColor: "#F0A65A", shadowColor: "#2C201B", shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  bibouPlusShortcutHeader: { flexDirection: "row", alignItems: "center" },
  bibouPlusShortcutMark: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#F0A65A", marginRight: 12 },
  bibouPlusShortcutMarkText: { color: "#4C1713", fontSize: 22, fontWeight: "900" },
  bibouPlusShortcutHeading: { flex: 1 },
  bibouPlusShortcutTitle: { color: "#FFF8EE", fontSize: 16, fontWeight: "900", letterSpacing: 0.35 },
  bibouPlusShortcutEyebrow: { color: "#F6C98D", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  bibouPlusShortcutName: { color: "#FFF8EE", fontSize: 22, fontWeight: "900", marginTop: 2 },
  bibouPlusShortcutActiveBadge: { borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#EAF5E4" },
  bibouPlusShortcutActiveText: { color: "#397353", fontSize: 9, fontWeight: "900" },
  bibouPlusShortcutDisclosure: { color: "#F0A65A", fontSize: 24, lineHeight: 25, marginLeft: 9, marginTop: -3 },
  bibouPlusShortcutBenefits: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#A95346" },
  bibouPlusShortcutBenefit: { minHeight: 37, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#A95346" },
  bibouPlusShortcutCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#F0A65A", color: "#4C1713", textAlign: "center", lineHeight: 22, fontSize: 12, fontWeight: "900", marginRight: 9 },
  bibouPlusShortcutBenefitText: { color: "#FFF8EE", fontSize: 13, fontWeight: "800" },
  bibouPlusShortcutFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  bibouPlusShortcutPrice: { color: "#FFF8EE", fontSize: 22, fontWeight: "900" },
  bibouPlusShortcutPeriod: { color: "#F6C98D", fontSize: 10, fontWeight: "700", marginTop: 3 },
  bibouPlusShortcutArrow: { color: "#F0A65A", fontSize: 34, lineHeight: 34 },
  welcomeRewardBanner: { maxWidth: 640, marginTop: 12, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", backgroundColor: "#EAF5E4", borderWidth: 1, borderColor: "#C7E1BF" },
  welcomeRewardIcon: { fontSize: 25, marginRight: 11 },
  welcomeRewardTitle: { color: "#2C201B", fontSize: 13, fontWeight: "900" },
  welcomeRewardText: { color: "#526D57", fontSize: 11, lineHeight: 16, marginTop: 3, paddingRight: 28 },
  bibouPlusContent: { flexGrow: 1, width: "100%", maxWidth: 660, alignSelf: "center", padding: 20, paddingBottom: 44 },
  bibouPlusHero: { borderRadius: 26, backgroundColor: "#2C201B", padding: 25, marginTop: 20, alignItems: "center", borderWidth: 1, borderColor: "#5B4238" },
  bibouPlusSpark: { color: "#FFB797", fontSize: 34, lineHeight: 38 },
  bibouPlusName: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", letterSpacing: 2, marginTop: 5 },
  bibouPlusPrice: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: 13 },
  bibouPlusPeriod: { color: "#F2C8B5", fontSize: 14, fontWeight: "700" },
  bibouPlusTagline: { color: "#F2C8B5", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 8 },
  bibouPlusActiveCard: { backgroundColor: "#EAF5E4", borderRadius: 17, padding: 15, marginTop: 13, borderWidth: 1, borderColor: "#C7E1BF" },
  bibouPlusActiveTitle: { color: "#397353", fontWeight: "900" },
  bibouPlusActiveText: { color: "#526D57", fontSize: 12, lineHeight: 17, marginTop: 5 },
  bibouPlusBenefits: { backgroundColor: "#FFFDFC", borderRadius: 20, borderWidth: 1, borderColor: "#EADBD2", overflow: "hidden" },
  bibouPlusBenefit: { minHeight: 78, padding: 15, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EADBD2" },
  bibouPlusBenefitIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#FFF0E9", color: "#D74318", textAlign: "center", lineHeight: 43, fontSize: 20, fontWeight: "900", marginRight: 12 },
  bibouPlusBenefitTitle: { color: "#2C201B", fontSize: 14, fontWeight: "900" },
  bibouPlusBenefitText: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 4, paddingRight: 32 },
  bibouPlusTerms: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 16, marginVertical: 16 },
  bibouPlusTermsTitle: { color: "#2C201B", fontWeight: "900" },
  bibouPlusTermsText: { color: "#826E63", fontSize: 12, lineHeight: 18, marginTop: 5 },
  bibouPlusLegal: { color: "#826E63", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 13 },
  bibouPlusDeliveryActive: { backgroundColor: "#EAF5E4", borderWidth: 1, borderColor: "#C7E1BF", borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", marginTop: 13 },
  bibouPlusDeliveryIcon: { color: "#397353", fontSize: 25, marginRight: 11 },
  bibouPlusDeliveryTitle: { color: "#397353", fontWeight: "900" },
  bibouPlusDeliveryText: { color: "#526D57", fontSize: 11, lineHeight: 16, marginTop: 3 },
  bibouPlusDeliveryOffer: { backgroundColor: "#2C201B", borderRadius: 19, padding: 16, marginTop: 13, borderWidth: 1, borderColor: "#5B4238" },
  bibouPlusDeliveryOfferTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bibouPlusDeliveryBadge: { color: "#FFB797", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  bibouPlusDeliveryPrice: { color: "#F2C8B5", fontSize: 11, fontWeight: "800" },
  bibouPlusDeliveryOfferTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 10 },
  bibouPlusDeliveryOfferText: { color: "#F2C8B5", fontSize: 12, lineHeight: 17, marginTop: 5 },
  bibouPlusDeliveryLink: { color: "#FFB797", fontSize: 12, fontWeight: "900", marginTop: 11 },
  bibouPlusApplied: { color: "#397353", fontSize: 12, fontWeight: "900", marginTop: 12 },
  bibouPlusPaymentNote: { backgroundColor: "#EAF5E4", borderRadius: 14, padding: 12, marginTop: 12 },
  bibouPlusPaymentNoteText: { color: "#397353", fontSize: 12, fontWeight: "800", textAlign: "center" },
  accountActionPlusActive: { backgroundColor: "#F4F8F0", borderColor: "#AFCFA6" },
  accountActionPlusIcon: { backgroundColor: "#FFB797" },
  pointsRulesTable: { borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC" },
  pointsRuleRow: { minHeight: 73, padding: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EADBD2" },
  pointsRuleIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 },
  pointsRuleEmoji: { fontSize: 20 },
  pointsRuleCopy: { flex: 1, paddingRight: 8 },
  pointsRuleTitle: { color: "#2C201B", fontSize: 13, fontWeight: "900" },
  pointsRuleDetail: { color: "#826E63", fontSize: 10, lineHeight: 14, marginTop: 3 },
  pointsRuleValue: { color: "#D74318", fontSize: 12, fontWeight: "900", textAlign: "right" },
  pointsRuleFootnote: { color: "#251C18", fontSize: 11, lineHeight: 16, marginTop: 10 },
  accountDeleteAction: { alignItems: "center", paddingVertical: 13, marginTop: 4 },
  accountDeleteText: { color: "#A3472A", fontSize: 12, fontWeight: "800" },
  homePrivacyLink: { alignItems: "center", paddingVertical: 14, marginTop: 22 },
  homePrivacyLinkText: { color: "#826E63", fontSize: 11, fontWeight: "700", textDecorationLine: "underline" },
  legalContent: { flexGrow: 1, width: "100%", maxWidth: 680, alignSelf: "center", padding: 20, paddingBottom: 52 },
  legalUpdated: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 8 },
  legalIntro: { color: "#473831", fontSize: 14, lineHeight: 21, marginTop: 19, marginBottom: 8 },
  legalSection: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 17, padding: 15, marginTop: 11 },
  legalSectionTitle: { color: "#2C201B", fontSize: 14, fontWeight: "900" },
  legalSectionText: { color: "#826E63", fontSize: 12, lineHeight: 18, marginTop: 6 },
  legalDeleteLink: { borderWidth: 1.5, borderColor: "#A3472A", borderRadius: 15, padding: 14, alignItems: "center", marginTop: 18 },
  legalDeleteLinkText: { color: "#A3472A", fontWeight: "900" },
  legalFootnote: { color: "#826E63", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 17 },
  deleteAccountIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: "#FFF0ED", alignItems: "center", justifyContent: "center", marginTop: 25 },
  deleteAccountIconText: { color: "#A3472A", fontSize: 36, lineHeight: 38 },
  deleteAccountOutline: { borderWidth: 1.5, borderColor: "#A3472A", borderRadius: 16, padding: 15, alignItems: "center", marginTop: 22 },
  deleteAccountOutlineText: { color: "#A3472A", fontWeight: "900" },
  deleteConfirmCard: { backgroundColor: "#FFF0ED", borderWidth: 1, borderColor: "#E3A18C", borderRadius: 19, padding: 17, marginTop: 22 },
  deleteConfirmTitle: { color: "#A3472A", fontSize: 16, fontWeight: "900" },
  deleteConfirmText: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 6 },
  deleteAccountButton: { backgroundColor: "#A3472A", borderRadius: 15, padding: 15, alignItems: "center", marginTop: 16 },
  deleteAccountButtonText: { color: "#FFFFFF", fontWeight: "900" },
  prestigeEmblemWrap: { width: 56, height: 68, alignItems: "center", justifyContent: "flex-end" },
  prestigeEmblemWrapLarge: { width: 100, height: 88, marginRight: 12 },
  prestigeCrown: { position: "absolute", top: -2, zIndex: 2, fontSize: 19, lineHeight: 22, fontWeight: "900" },
  prestigeCrownLarge: { top: -4, fontSize: 28, lineHeight: 31 },
  prestigeShield: { width: 54, height: 52, borderWidth: 2, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: "#2C201B", shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  prestigeShieldLarge: { width: 96, height: 70, borderWidth: 2.5, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  prestigeShieldBand: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  prestigeShieldStars: { fontSize: 10, lineHeight: 13, fontWeight: "900", letterSpacing: -0.5, marginTop: 4 },
  prestigeShieldStarsLarge: { fontSize: 17, lineHeight: 21, letterSpacing: 0 },
  prestigeShieldGem: { fontSize: 8, lineHeight: 10, marginTop: 2 },
}));
