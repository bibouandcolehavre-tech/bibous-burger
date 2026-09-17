import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

const taurusPhoto = require("./assets/taurus.jpg");
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
const orderFromApi = (order) => ({ id: `#${order.number}`, apiId: order.id, product: order.items.map((item) => item.name).join(", "), total: order.total, method: order.method, slot: order.slot, date: order.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "Aujourd’hui" : "Commande précédente", status: order.status, progress: progressForStatus[order.status] ?? 0 });
const POINTS_PER_ORDER = 20;
const REWARD_POINTS = 700;
const GOOGLE_REVIEW_URL = "https://share.google/ZnSdNG7pj8QtMieYO";
const REWARDS = [
  { points: 200, emoji: "🍟", title: "Une portion de frites offerte", detail: "Frites maison, tout simplement" },
  { points: 400, emoji: "🥤", title: "Une boisson fraîche offerte", detail: "À ajouter à ta prochaine commande" },
  { points: 700, emoji: "✨", title: "5 € de remise", detail: "À utiliser sur une prochaine commande" },
  { points: 1500, emoji: "🍔", title: "Un menu classique offert", detail: "Le plaisir est pour Bibou's Burgers" },
  { points: 5000, emoji: "👑", title: "Un menu pour deux offert", detail: "La récompense ultime du Club Bibou" },
];
const PRESTIGE_LEVELS = [
  { level: 1, name: "Débutant", metal: "Bronze", color: "#B66A35", softColor: "#F6E0D1", points: 200, reward: "Une portion de frites offerte" },
  { level: 2, name: "Gourmand", metal: "Argent", color: "#7D8792", softColor: "#E8EDF1", points: 400, reward: "Une boisson fraîche offerte" },
  { level: 3, name: "Ambassadeur", metal: "Or", color: "#B98A12", softColor: "#FFF0B8", points: 700, reward: "5 € de remise" },
  { level: 4, name: "Légende", metal: "Platine", color: "#43858E", softColor: "#DDF1F2", points: 1500, reward: "Un menu classique offert" },
  { level: 5, name: "Mythique", metal: "Diamant", color: "#6955C7", softColor: "#E9E4FF", points: 5000, reward: "Un menu pour deux offert" },
];
const money = (value) => `${value.toFixed(2).replace(".", ",")} €`;
const deliveryCostForDistance = (distanceKm) => DELIVERY_PRICING.find((tier) => distanceKm <= tier.maxKm)?.price;
const deliveryCost = (method) => method === "delivery" ? deliveryCostForDistance(0) : 0;

const PRODUCTS = [
  { id: "taurus", name: "Le Taurus", price: 16.9, isMenu: true, image: taurusPhoto, description: "Pain brioché au charbon végétal, pesto rosso, jambon de Parme, mozzarella, roquette, tomates fraîches, oignons caramélisés et cornichons.", detail: "Pain brioché au charbon végétal, pesto rosso, jambon de Parme et mozzarella fondante." },
  { id: "montagnes-menu", name: "À travers les montagnes", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_268K7YE3TN9G4R6PQF0XXGY6MH/image.png" }, description: "Fromage à raclette fondant, bacon croustillant et oignons caramélisés dans un burger maison généreux.", detail: "Fromage à raclette, bacon croustillant et oignons caramélisés." },
  { id: "atlas-menu", name: "Au sommet de l'Atlas", price: 18.9, isMenu: true, soldOut: true, image: { uri: "https://images.sumup.com/img_3DQDCG8NT99KCR0SFK6G53V02X/image.png" }, description: "Pain brioché noir, agneau confit au thym et miel, chèvre, sauce barbecue au miel et crudités fraîches.", detail: "Agneau confit au thym et au miel, chèvre et sauce barbecue au miel." },
  { id: "classique-menu", name: "Classique, simple et efficace", price: 14.9, isMenu: true, image: { uri: "https://images.sumup.com/img_7JTJCTSXG29HYR09R699BXWB5Z/image.png" }, description: "Pain brioché, steak haché frais, cheddar fondant, roquette, tomates, cornichons et oignons caramélisés.", detail: "Steak haché frais, cheddar fondant et oignons caramélisés." },
  { id: "duck-menu", name: "Duck", price: 18.9, isMenu: true, image: { uri: "https://images.sumup.com/img_64ZB5FFC1M8988TZ0J71Q9KBE2/image.png" }, description: "Pain au charbon végétal, canard effiloché aux cinq parfums, mozzarella, concombre, oignons caramélisés et sauce chinoise.", detail: "Canard effiloché aux cinq parfums, mozzarella et sauce chinoise." },
  { id: "dynamite-menu", name: "Dynamite Chicken", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_62MB1W5CWT9B6AJ82BKQNSN61K/image.png" }, description: "Tenders de poulet marinés et panés maison, cheddar, sauce thaï, roquette, chou rouge, oignons et cornichons.", detail: "Tenders de poulet croustillants, cheddar et sauce thaï." },
  { id: "gros-lard-menu", name: "Le gros lard", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_5AWN55RQGY8RTVGJJPNNWY3EC3/image.png" }, description: "Pain brioché maison, lard fumé, fourme d'Ambert AOP, steak haché frais, roquette, tomate, oignons caramélisés et cornichons.", detail: "Lard fumé, fourme d'Ambert AOP et steak haché frais." },
  { id: "hambagu-menu", name: "Hambagu", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_56NGPCKJ708929SVCEJTR07D20/image.png" }, description: "Pain au charbon végétal, steak hambagu bœuf-porc, sauce au mirin et saké, maasdam, concombre et salade thaï.", detail: "Steak hambagu bœuf-porc, sauce japonaise au mirin et saké." },
  { id: "basilic-menu", name: "Le basilic du potager", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_5MP8QBZ1XG80NBFY8ZN7DEKMBS/image.png" }, description: "Pain brioché maison, pesto verde, mozzarella, steak haché frais, chèvre, roquette, tomates et oignons caramélisés.", detail: "Pesto verde, mozzarella fondante, chèvre et steak haché frais." },
  { id: "pork-menu", name: "Le Pork", price: 16.9, isMenu: true, image: { uri: "https://images.sumup.com/img_6CS5SEEFGM9GXA41KR1XAP0H0S/image.png" }, description: "Pain au charbon végétal, porc effiloché, sauce coréenne, mozzarella, concombre, oignons caramélisés et salade thaï.", detail: "Porc effiloché, sauce coréenne et mozzarella fondante." },
  { id: "atlas", name: "Au sommet de l'Atlas", price: 13.9, image: { uri: "https://images.sumup.com/img_3DQDCG8NT99KCR0SFK6G53V02X/image.png" }, description: "Pain brioché noir, agneau confit au thym et miel, chèvre, sauce barbecue au miel et crudités fraîches.", detail: "Agneau confit au thym et au miel, chèvre et sauce barbecue au miel." },
  { id: "classique", name: "Classique, simple et efficace", price: 9.9, image: { uri: "https://images.sumup.com/img_7JTJCTSXG29HYR09R699BXWB5Z/image.png" }, description: "Pain brioché, steak haché frais, cheddar fondant, roquette, tomates, cornichons et oignons caramélisés.", detail: "Steak haché frais, cheddar fondant et oignons caramélisés." },
  { id: "duck", name: "Duck", price: 13.9, image: { uri: "https://images.sumup.com/img_64ZB5FFC1M8988TZ0J71Q9KBE2/image.png" }, description: "Pain au charbon végétal, canard effiloché aux cinq parfums, mozzarella, concombre, oignons caramélisés et sauce chinoise.", detail: "Canard effiloché aux cinq parfums, mozzarella et sauce chinoise." },
  { id: "dynamite", name: "Dynamite Chicken", price: 11.9, image: { uri: "https://images.sumup.com/img_62MB1W5CWT9B6AJ82BKQNSN61K/image.png" }, description: "Tenders de poulet marinés et panés maison, cheddar, sauce thaï, roquette, chou rouge, oignons et cornichons.", detail: "Tenders de poulet croustillants, cheddar et sauce thaï." },
  { id: "hambagu", name: "Hambagu", price: 11.9, image: { uri: "https://images.sumup.com/img_56NGPCKJ708929SVCEJTR07D20/image.png" }, description: "Pain au charbon végétal, steak hambagu bœuf-porc, sauce au mirin et saké, maasdam, concombre et salade thaï.", detail: "Steak hambagu bœuf-porc, sauce japonaise au mirin et saké." },
  { id: "basilic", name: "Le basilic du potager", price: 11.9, image: { uri: "https://images.sumup.com/img_5MP8QBZ1XG80NBFY8ZN7DEKMBS/image.png" }, description: "Pain brioché maison, pesto verde, mozzarella, steak haché frais, chèvre, roquette, tomates et oignons caramélisés.", detail: "Pesto verde, mozzarella fondante, chèvre et steak haché frais." },
  { id: "montagnes", name: "À travers les montagnes", price: 11.9, image: { uri: "https://images.sumup.com/img_268K7YE3TN9G4R6PQF0XXGY6MH/image.png" }, description: "Fromage à raclette fondant, bacon croustillant et oignons caramélisés dans un burger maison généreux.", detail: "Fromage à raclette, bacon croustillant et oignons caramélisés." },
  { id: "gros-lard", name: "Le gros lard", price: 11.9, image: { uri: "https://images.sumup.com/img_5AWN55RQGY8RTVGJJPNNWY3EC3/image.png" }, description: "Pain brioché maison, lard fumé, fourme d'Ambert AOP, steak haché frais, roquette, tomate, oignons caramélisés et cornichons.", detail: "Lard fumé, fourme d'Ambert AOP et steak haché frais." },
  { id: "pork", name: "Le Pork", price: 11.9, image: { uri: "https://images.sumup.com/img_6CS5SEEFGM9GXA41KR1XAP0H0S/image.png" }, description: "Pain au charbon végétal, porc effiloché, sauce coréenne, mozzarella, concombre, oignons caramélisés et salade thaï.", detail: "Porc effiloché, sauce coréenne et mozzarella fondante." },
];

const PROMOTIONS = [
  { id: "taurus", productId: "taurus", title: "Le Taurus", subtitle: "Le burger du mois · Découvrir le menu" },
  { id: "duck", productId: "duck-menu", title: "Le Duck", subtitle: "Canard aux cinq parfums · Voir le menu" },
  { id: "pork", productId: "pork-menu", title: "Le Pork", subtitle: "Porc effiloché et sauce coréenne · Voir le menu" },
  { id: "paris-normandie", productId: "taurus", title: "Étoiles gourmandes 2026", subtitle: "Bibou's Burgers à l'honneur dans Paris-Normandie · Lire l'article", url: "https://www.paris-normandie.fr/id717021/article/2026-05-11/etoiles-gourmandes-2026-bibous-burgers-des-burgers-faits-maison-aux-saveurs", image: { uri: "https://prmeng.rosselcdn.net/sites/default/files/dpistyles_v2/prm_scale_736w/2026/05/11/node_717021/59096972/public/2026/05/11/76410790.jpeg?itok=_a-a2B7-1784644032" } },
];

const PROTEIN = { id: "protein", title: "VÉGÉTARIEN OU NON ?", required: true, min: 1, max: 1, options: [{ id: "viande", label: "Viande", price: 0 }, { id: "galette", label: "Galette de pomme de terre (végétarien)", price: 0 }] };
const SALAD = { id: "salad", title: "CRUDITÉS", required: true, min: 1, max: 4, options: [{ id: "roquette", label: "Roquette", price: 0 }, { id: "tomate", label: "Tomate", price: 0 }, { id: "oignons", label: "Oignons caramélisés", price: 0 }, { id: "cornichons", label: "Cornichons", price: 0 }, { id: "sans-crudites", label: "Pas de crudités", price: 0, exclusive: true }] };
const SAUCES = { id: "sauces", title: "SAUCES", required: true, min: 1, options: [{ id: "ketchup", label: "Ketchup", price: 0 }, { id: "mayo", label: "Mayonnaise", price: 0 }, { id: "moutarde", label: "Moutarde", price: 0 }, { id: "barbecue", label: "Barbecue", price: 0 }, { id: "tartare", label: "Tartare", price: 0 }, { id: "blanche", label: "Blanche", price: 0 }, { id: "bearnaise", label: "Béarnaise", price: 0 }, { id: "sans-sauce", label: "Pas de sauce", price: 0, exclusive: true }] };
const SUPPLEMENTS = { id: "extras", title: "UN SUPPLÉMENT DANS VOTRE BURGER ?", options: [{ id: "second-steak", label: "Second steak", price: 3 }, { id: "galette-plus", label: "Galette de pomme de terre", price: 2 }, { id: "cheddar", label: "Cheddar", price: 1 }, { id: "raclette", label: "Raclette", price: 1 }, { id: "mozzarella", label: "Mozzarella", price: 1 }, { id: "fourme", label: "Fourme d'Ambert", price: 1 }, { id: "lard", label: "Lard fumé", price: 1.5 }, { id: "bacon", label: "Bacon", price: 1 }] };
const SIDES = { id: "sides", title: "ENCORE UN PETIT CREUX ?", options: [{ id: "frites", label: "Frites maison", price: 3.9 }, { id: "frites-cheddar", label: "Frites cheddar bacon", price: 6.9 }, { id: "tenders", label: "3 Tenders", price: 6.9 }] };
const DESSERTS = { id: "desserts", title: "UN DESSERT ?", options: [{ id: "oreo", label: "Tiramisu Oreo", price: 3.9 }, { id: "cookie", label: "Tiramisu cookie", price: 3.9 }, { id: "framboise", label: "Tiramisu framboise pistache", price: 3.9 }] };
const DRINKS = { id: "drink", title: "BOISSONS", max: 1, options: [{ id: "coca", label: "Coca 33 cl", price: 0 }, { id: "coca-zero", label: "Coca Zero", price: 0 }, { id: "lipton", label: "Lipton pêche", price: 0 }, { id: "oasis", label: "Oasis pomme cassis framboise", price: 0 }, { id: "fanta", label: "Fanta Orange", price: 0 }, { id: "eau", label: "Cristaline 50 cl", price: 0 }] };
const MENU_OPTION_GROUPS = [PROTEIN, SALAD, SAUCES, DRINKS, SUPPLEMENTS, SIDES];
const BURGER_OPTION_GROUPS = [PROTEIN, SALAD, SAUCES, SUPPLEMENTS, SIDES, DESSERTS];
const RESTAURANT_ADDRESS = "153 quai George-V, 76600 Le Havre";
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
const DEFAULT_DELIVERY_DAY = DELIVERY_SCHEDULE[0];
function Header({ onBack, right }) {
  return <View style={styles.header}>{onBack ? <Pressable accessibilityLabel="Retour" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable> : <Text style={styles.wordmark}>Bibou's Burgers</Text>}<Text style={styles.headerRight}>{right || ""}</Text></View>;
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

function PromotionsCarousel({ onOpenProduct }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 40);
  const openPromotion = (promotion) => {
    if (promotion.url) Linking.openURL(promotion.url);
    else onOpenProduct(PRODUCTS.find((product) => product.id === promotion.productId));
  };
  return <View><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promotionsTrack}>{PROMOTIONS.map((promotion) => {
    const product = PRODUCTS.find((item) => item.id === promotion.productId);
    return <Pressable key={promotion.id} onPress={() => openPromotion(promotion)} style={[styles.promotionCard, { width: cardWidth }]}><Image source={promotion.image || product.image} style={styles.promotionImage} /><View style={styles.promotionShade} /><View style={styles.promotionCopy}><Text style={styles.promotionEyebrow}>{promotion.url ? "À LA UNE" : "NOS MENUS"}</Text><Text style={styles.promotionTitle}>{promotion.title}</Text><Text style={styles.promotionSubtitle}>{promotion.subtitle}</Text></View></Pressable>;
  })}</ScrollView><View style={styles.promotionDots}>{PROMOTIONS.map((promotion, index) => <View key={promotion.id} style={[styles.promotionDot, index === 0 && styles.promotionDotActive]} />)}</View></View>;
}

function GoogleReviewsCarousel() {
  const { width } = useWindowDimensions();
  const [googleReviews, setGoogleReviews] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE_URL}/google-reviews`).then((response) => response.ok ? response.json() : null).then((payload) => { if (payload?.configured && payload.reviews?.length) setGoogleReviews(payload); }).catch(() => {});
  }, []);
  if (!googleReviews) return null;
  const cardWidth = Math.max(260, width - 72);
  return <View style={styles.googleReviewsSection}><View style={styles.googleReviewsHeading}><View><Text style={styles.googleReviewsTitle}>Avis Google</Text><Text style={styles.googleReviewsScore}>★ {googleReviews.rating?.toFixed(1)} · {googleReviews.reviewCount} avis</Text></View><Pressable onPress={() => Linking.openURL(GOOGLE_REVIEW_URL)}><Text style={styles.googleReviewsLink}>Voir sur Google ↗</Text></Pressable></View><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.googleReviewsTrack}>{googleReviews.reviews.map((review, index) => <View key={`${review.author}-${index}`} style={[styles.googleReviewCard, { width: cardWidth }]}><Text style={styles.googleReviewStars}>{"★".repeat(Math.round(review.rating || 0))}{"☆".repeat(5 - Math.round(review.rating || 0))}</Text><Text style={styles.googleReviewText} numberOfLines={4}>{review.text || "Avis partagé sur Google"}</Text><Text style={styles.googleReviewAuthor}>{review.author} · Google</Text></View>)}</ScrollView></View>;
}

function MenuScreen({ onOpenProduct, cartCount, onOpenCart, loyaltyPoints, onOpenLoyalty, onOpenAccount, customer }) {
  const taurus = PRODUCTS[0];
  const menus = PRODUCTS.filter((product) => product.isMenu && product.id !== taurus.id);
  const burgers = PRODUCTS.filter((product) => !product.isMenu);
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><Header right="🔔" /><View style={styles.homeTopRow}><View style={styles.addressBox}><Text style={styles.addressLabel}>Zone de livraison</Text><Text style={styles.addressValue}>{DELIVERY_ZONE}</Text></View><Pressable onPress={onOpenAccount} style={styles.accountShortcut}><Text style={styles.accountShortcutIcon}>👤</Text><Text style={styles.accountShortcutText}>{customer.name ? customer.name.split(" ")[0] : "Mon compte"}</Text></Pressable></View><Pressable onPress={onOpenLoyalty} style={styles.loyaltyShortcut}><View><Text style={styles.loyaltyShortcutEyebrow}>CLUB BIBOU</Text><Text style={styles.loyaltyShortcutTitle}>★ {loyaltyPoints} points disponibles</Text></View><Text style={styles.loyaltyShortcutArrow}>›</Text></Pressable><Text style={styles.title}>Une grosse faim?{"\n"}On s’en occupe.</Text><PromotionsCarousel onOpenProduct={onOpenProduct} /><GoogleReviewsCarousel /><Text style={styles.sectionTitle}>Nos menus (Burger + frites et boisson)</Text>{menus.map((product) => <ProductCard key={product.id} product={product} onPress={onOpenProduct} />)}<Text style={styles.sectionTitle}>Burgers seuls</Text>{burgers.map((product) => <ProductCard key={product.id} product={product} onPress={onOpenProduct} />)}<Pressable onPress={onOpenCart} style={styles.floatingCart}><Text style={styles.floatingCartText}>Panier{cartCount ? ` · ${cartCount}` : ""}</Text><Text style={styles.floatingCartIcon}>🛍</Text></Pressable></ScrollView>;
}

function AccountScreen({ customer, loyalty, orders, onBack, onOpenOrders, onOpenLoyalty }) {
  const activeOrder = orders.find((order) => order.progress < ORDER_STEPS.length - 1);
  const customerName = customer.name || "Client Bibou";
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.accountContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><View style={styles.accountHero}><View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{customerName.slice(0, 1).toUpperCase()}</Text></View><View><Text style={styles.accountGreeting}>Bonjour, {customerName.split(" ")[0]} !</Text><Text style={styles.accountContact}>{customer.phone || "Ajoute ton téléphone lors de ta première commande"}</Text></View></View>{activeOrder && <Pressable onPress={onOpenOrders} style={styles.currentOrderCard}><View><Text style={styles.currentOrderEyebrow}>COMMANDE EN COURS</Text><Text style={styles.currentOrderTitle}>{activeOrder.product}</Text><Text style={styles.currentOrderText}>{ORDER_STEPS[activeOrder.progress]} · {activeOrder.slot}</Text></View><Text style={styles.currentOrderArrow}>›</Text></Pressable>}<Text style={styles.sectionTitle}>Mon espace</Text><Pressable onPress={onOpenOrders} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>🧾</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Mes commandes</Text><Text style={styles.accountActionText}>{orders.length} commande{orders.length > 1 ? "s" : ""} dans ton historique</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><Pressable onPress={onOpenLoyalty} style={styles.accountAction}><View style={styles.accountActionIcon}><Text>★</Text></View><View style={styles.accountActionCopy}><Text style={styles.accountActionTitle}>Club Bibou</Text><Text style={styles.accountActionText}>{loyalty.points} points disponibles</Text></View><Text style={styles.accountActionArrow}>›</Text></Pressable><View style={styles.accountAddress}><Text style={styles.accountAddressTitle}>Adresse enregistrée</Text><Text style={styles.accountAddressText}>{customer.address ? `${customer.address}, ${customer.postalCode} ${customer.city}` : "Elle sera enregistrée lors de ta première livraison."}</Text></View><Text style={styles.accountFinePrint}>Dans la version publiée, ce profil sera sécurisé par un compte client.</Text></ScrollView></SafeAreaView>;
}

function SmsLoginScreen({ onBack, onAuthenticated }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone");
  const [loading, setLoading] = useState(false);
  const sendCode = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/sms/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’envoyer le code.");
      setStep("code");
    } catch (error) { Alert.alert("SMS indisponible", error.message || "Réessaie dans un instant."); }
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
  const validPhone = /^((\+33|0)[67])[\s.-]?\d{2}([\s.-]?\d{2}){3}$/.test(phone);
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled"><Header onBack={onBack} /><View style={styles.loginIcon}><Text style={styles.loginIconText}>✉</Text></View><Text style={styles.title}>{step === "phone" ? "Bienvenue" : "Vérifie ton numéro"}</Text><Text style={styles.loginIntro}>{step === "phone" ? "Connecte-toi avec ton numéro de téléphone pour retrouver tes commandes et tes points fidélité." : `Un code a été envoyé au ${phone}.`}</Text><View style={styles.loginCard}>{step === "phone" ? <><Text style={styles.deliveryLabel}>NUMÉRO DE TÉLÉPHONE</Text><TextInput value={phone} onChangeText={setPhone} placeholder="06 12 34 56 78" placeholderTextColor="#9B877B" style={styles.fieldInput} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" /><Text style={styles.loginFinePrint}>Un code à usage unique te sera envoyé par SMS. Aucun mot de passe à retenir.</Text><Pressable disabled={!validPhone || loading} onPress={sendCode} style={[styles.primaryButton, (!validPhone || loading) && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{loading ? "Envoi en cours…" : "Recevoir mon code"}</Text></Pressable></> : <><Text style={styles.deliveryLabel}>CODE REÇU PAR SMS</Text><TextInput value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.codeInput]} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} /><Pressable disabled={code.length < 4 || loading} onPress={checkCode} style={[styles.primaryButton, (code.length < 4 || loading) && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{loading ? "Vérification…" : "Valider le code"}</Text></Pressable><Pressable onPress={() => { setCode(""); setStep("phone"); }} style={styles.loginSecondary}><Text style={styles.loginSecondaryText}>Modifier mon numéro</Text></Pressable></>}</View><Text style={styles.loginLegal}>En te connectant, tu acceptes de recevoir ce SMS de vérification nécessaire à la sécurisation de ton compte.</Text></ScrollView></SafeAreaView>;
}

function OrdersScreen({ orders, onBack, onRefresh }) {
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status));
  const activeMessage = activeOrder?.progress === 0 ? "Le restaurant a bien reçu ta commande." : activeOrder?.progress === 1 ? "Le restaurant prépare ta commande." : activeOrder?.progress === 2 ? "Ta commande est prête : le livreur arrive." : "Ton livreur est en route.";
  const labelForOrder = (order) => order.status === "cancelled" ? "Annulée" : ORDER_STEPS[order.progress];
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.accountContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Mes commandes</Text>{activeOrder && <><Text style={styles.sectionTitle}>Suivi en direct</Text><View style={styles.trackingCard}><View style={styles.trackingHeader}><View><Text style={styles.trackingOrder}>{activeOrder.id} · {activeOrder.product}</Text><Text style={styles.trackingMeta}>{activeOrder.method === "delivery" ? "Livraison" : "Retrait"} · {activeOrder.slot}</Text></View><Text style={styles.trackingPrice}>{money(activeOrder.total)}</Text></View><View style={styles.trackingSteps}>{ORDER_STEPS.map((step, index) => <View key={step} style={styles.trackingStep}><View style={[styles.trackingDot, index <= activeOrder.progress && styles.trackingDotDone]}>{index <= activeOrder.progress && <Text style={styles.trackingCheck}>✓</Text>}</View><Text style={[styles.trackingLabel, index <= activeOrder.progress && styles.trackingLabelDone]}>{step}</Text></View>)}</View><Text style={styles.trackingMessage}>{activeMessage}</Text></View><Pressable onPress={onRefresh} style={styles.simulateButton}><Text style={styles.simulateButtonText}>Actualiser le suivi</Text><Text style={styles.simulateHint}>Voir la dernière mise à jour du restaurant</Text></Pressable></>}<Text style={styles.sectionTitle}>Historique</Text>{orders.map((order) => <View key={order.id} style={styles.historyOrder}><View style={styles.historyIcon}><Text>{order.status === "delivered" ? "✓" : order.status === "cancelled" ? "×" : "◷"}</Text></View><View style={styles.historyCopy}><Text style={styles.historyTitle}>{order.product}</Text><Text style={styles.historyMeta}>{order.id} · {labelForOrder(order)} · {order.date}</Text></View><Text style={styles.historyPrice}>{money(order.total)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function ProductScreen({ product, onBack, onAdd }) {
  const optionGroups = product.isMenu ? MENU_OPTION_GROUPS : BURGER_OPTION_GROUPS;
  const [choices, setChoices] = useState({});
  const [openGroups, setOpenGroups] = useState({ protein: true, salad: true, sauces: true });
  const selectedOptions = useMemo(() => optionGroups.flatMap((group) => group.options.filter((option) => choices[group.id]?.includes(option.id))), [choices, optionGroups]);
  const total = product.price + selectedOptions.reduce((sum, option) => sum + option.price, 0);
  const hasRequiredChoices = optionGroups.filter((group) => group.required).every((group) => (choices[group.id] || []).length >= group.min);
  const toggleChoice = (group, option) => {
    const current = choices[group.id] || [];
    const isSelected = current.includes(option.id);
    let next;
    if (isSelected) next = current.filter((id) => id !== option.id);
    else if (option.exclusive) next = [option.id];
    else { const withoutExclusive = current.filter((id) => !group.options.find((item) => item.id === id)?.exclusive); next = group.max === 1 ? [option.id] : [...withoutExclusive, option.id]; if (group.max && next.length > group.max) return; }
    setChoices({ ...choices, [group.id]: next });
  };
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Image source={product.image} style={styles.detailImage} /><View style={styles.priceRow}><Text style={styles.detailTitle}>{product.name}</Text><Text style={styles.detailPrice}>{money(product.price)}</Text></View><Text style={styles.detailDescription}>{product.detail}</Text>{product.isMenu && <Text style={styles.includedText}>Frites maison incluses dans le menu</Text>}<Text style={styles.sectionTitle}>{product.isMenu ? "Compose ton menu" : "Compose ton burger"}</Text>{optionGroups.map((group) => <OptionGroup key={group.id} group={group} selectedIds={choices[group.id] || []} isOpen={!!openGroups[group.id]} onToggleOpen={() => setOpenGroups({ ...openGroups, [group.id]: !openGroups[group.id] })} onToggleChoice={(option) => toggleChoice(group, option)} />)}</ScrollView><View style={styles.stickyAction}>{!hasRequiredChoices && <Text style={styles.requiredHint}>Choisis les options marquées « requis » pour continuer.</Text>}<Pressable disabled={!hasRequiredChoices} style={[styles.primaryButton, !hasRequiredChoices && styles.primaryButtonDisabled]} onPress={() => onAdd({ product, total, options: selectedOptions.map((option) => option.label) })}><Text style={styles.primaryButtonText}>Ajouter au panier · {money(total)}</Text></Pressable></View></SafeAreaView>;
}

function OptionGroup({ group, selectedIds, isOpen, onToggleOpen, onToggleChoice }) {
  const selectionText = group.max ? `${selectedIds.length} sur ${group.max} sélectionné${selectedIds.length > 1 ? "s" : ""}` : `${selectedIds.length} sélectionné${selectedIds.length > 1 ? "s" : ""}`;
  const helper = group.required ? `Sélectionnez entre ${group.min} et ${group.max || "plusieurs"}` : group.max === 1 ? "Sélectionnez jusqu'à 1" : "Facultatif";
  return <View style={styles.optionGroup}><Pressable onPress={onToggleOpen} style={styles.optionGroupHeader}><View style={styles.optionGroupTitleWrap}><Text style={styles.optionGroupTitle}>{group.title}{group.required ? "  (requis)" : ""}</Text><Text style={styles.optionGroupHelper}>{selectionText} · {helper}</Text></View><Text style={styles.chevron}>{isOpen ? "⌃" : "⌄"}</Text></Pressable>{isOpen && group.options.map((option) => <OptionRow key={option.id} option={option} selected={selectedIds.includes(option.id)} onPress={() => onToggleChoice(option)} />)}</View>;
}

function OptionRow({ option, selected, onPress }) {
  return <Pressable onPress={onPress} style={styles.option}><View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Text style={styles.checkmark}>✓</Text>}</View><Text style={styles.optionName}>{option.label}</Text><Text style={styles.optionValue}>{option.price ? `+ ${money(option.price)}` : "0,00 €"}</Text></Pressable>;
}

function ReceiptLine({ label, value, strong }) { return <View style={styles.receiptLine}><Text style={strong && styles.strong}>{label}</Text><Text style={strong && styles.strong}>{value}</Text></View>; }

function CartScreen({ cart, onBack, onCheckout }) {
  const fee = cart ? (cart.delivery.fee ?? deliveryCost(cart.delivery.method)) : 0;
  const total = cart ? cart.total + fee : 0;
  const hasExactFee = cart?.delivery.fee !== undefined;
  return <SafeAreaView style={styles.safeArea}><View style={styles.detailContent}><Header onBack={onBack} /><Text style={styles.title}>Ton panier</Text>{!cart ? <View style={styles.emptyState}><Text style={styles.emptyIcon}>🛍</Text><Text style={styles.emptyTitle}>Ton panier est vide</Text><Text style={styles.emptyText}>Ajoute un burger qui te fait envie.</Text></View> : <><View style={styles.cartItem}><Image source={cart.product.image} style={styles.cartImage} /><View style={styles.productInfo}><Text style={styles.productName}>{cart.product.name}</Text><Text numberOfLines={2} style={styles.productDescription}>{cart.product.isMenu ? "Menu · " : ""}{cart.options.join(", ")}</Text></View><Text style={styles.productPrice}>{money(cart.total)}</Text></View><View style={styles.receipt}><ReceiptLine label="Sous-total" value={money(cart.total)} /><ReceiptLine label={cart.delivery.method === "delivery" && !hasExactFee ? "Livraison (dès)" : cart.delivery.method === "delivery" ? "Livraison" : "Retrait"} value={fee ? money(fee) : "Offert"} /><View style={styles.receiptDivider} /><ReceiptLine label={cart.delivery.method === "delivery" && !hasExactFee ? "Total estimé" : "Total"} value={money(total)} strong /></View>{cart.delivery.method === "delivery" && !hasExactFee && <Text style={styles.cartFeeHint}>Les frais exacts seront calculés selon l’adresse, dans un rayon de 5 km.</Text>}<Text style={styles.eta}>● Choisis ton créneau avant le paiement</Text></>}</View>{cart && <View style={styles.stickyAction}><Pressable style={styles.primaryButton} onPress={onCheckout}><Text style={styles.primaryButtonText}>Choisir mon créneau · {hasExactFee ? "" : "dès "}{money(total)}</Text></Pressable></View>}</SafeAreaView>;
}

function ChoiceChip({ label, selected, onPress }) { return <Pressable onPress={onPress} style={[styles.choiceChip, selected && styles.choiceChipSelected]}><Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{label}</Text></Pressable>; }

function DeliveryScreen({ cart, onBack, onChange, onContinue }) {
  const { delivery } = cart;
  const total = cart.total + deliveryCost(delivery.method);
  const selectedDay = DELIVERY_SCHEDULE.find((day) => day.id === delivery.day) || DELIVERY_SCHEDULE[0];
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Quand veux-tu être livré?</Text><Text style={styles.deliveryIntro}>Choisis le mode, le jour et le créneau qui t’arrangent.</Text><Text style={styles.deliveryLabel}>MODE</Text><View style={styles.methodRow}><ChoiceChip label="🛵 Livraison" selected={delivery.method === "delivery"} onPress={() => onChange({ ...delivery, method: "delivery", fee: undefined })} /><ChoiceChip label="🏠 Retrait" selected={delivery.method === "pickup"} onPress={() => onChange({ ...delivery, method: "pickup", fee: 0 })} /></View><View style={styles.addressNotice}><Text style={styles.addressNoticeTitle}>{delivery.method === "delivery" ? "Zone de livraison" : "Retrait au restaurant"}</Text><Text style={styles.addressNoticeText}>{delivery.method === "delivery" ? DELIVERY_ZONE : RESTAURANT_ADDRESS}</Text>{delivery.method === "delivery" && <><View style={styles.deliveryPrices}>{DELIVERY_PRICING.map((tier) => <View key={tier.label} style={styles.deliveryPriceRow}><Text style={styles.deliveryPriceDistance}>{tier.label}</Text><Text style={styles.deliveryPriceValue}>{money(tier.price)}</Text></View>)}</View><Text style={styles.deliveryFeeHint}>Le tarif sera choisi automatiquement selon l’adresse.</Text></>}</View><Text style={styles.deliveryLabel}>JOUR</Text><View style={styles.dayRow}>{DELIVERY_SCHEDULE.map((day) => <ChoiceChip key={day.id} label={day.label} selected={delivery.day === day.id} onPress={() => onChange({ ...delivery, day: day.id, dayLabel: day.name, slot: null })} />)}</View><Text style={styles.deliveryLabel}>CRÉNEAUX · {selectedDay.name.toUpperCase()}</Text><View style={styles.slots}>{selectedDay.slots.map((slot) => <Pressable key={slot} onPress={() => onChange({ ...delivery, slot })} style={[styles.slot, delivery.slot === slot && styles.slotSelected]}><Text style={[styles.slotText, delivery.slot === slot && styles.slotTextSelected]}>{slot}</Text></Pressable>)}</View></ScrollView><View style={styles.stickyAction}>{!delivery.slot && <Text style={styles.requiredHint}>Choisis un créneau pour continuer.</Text>}<Pressable disabled={!delivery.slot} style={[styles.primaryButton, !delivery.slot && styles.primaryButtonDisabled]} onPress={onContinue}><Text style={styles.primaryButtonText}>Mes coordonnées · {money(total)}</Text></Pressable></View></SafeAreaView>;
}

function CheckoutDetailsScreen({ cart, customer, onChange, onBack, onContinue }) {
  const isDelivery = cart.delivery.method === "delivery";
  const [quote, setQuote] = useState(null);
  const deliveryFee = isDelivery ? quote?.deliveryFee : 0;
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
      const response = await fetch(`${API_BASE_URL}/delivery-quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customer) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de calculer la livraison.");
      setQuote({ status: "success", ...payload });
      onChange({ ...customer, distance: String(payload.distanceKm) });
    } catch (error) {
      setQuote({ status: "error", error: error.message || "Impossible de calculer la livraison." });
    }
  };
  const hasExactFee = !isDelivery || quoteReady;
  const total = cart.total + (deliveryFee ?? deliveryCostForDistance(0));
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Tes coordonnées</Text><Text style={styles.detailsIntro}>Elles permettent au restaurant de préparer et de suivre ta commande.</Text><Text style={styles.deliveryLabel}>CONTACT</Text><TextInput value={customer.name} onChangeText={(value) => update("name", value)} placeholder="Prénom et nom" placeholderTextColor="#9B877B" style={styles.fieldInput} autoCapitalize="words" /><TextInput value={customer.phone} onChangeText={(value) => update("phone", value)} placeholder="Téléphone" placeholderTextColor="#9B877B" style={styles.fieldInput} keyboardType="phone-pad" />{isDelivery ? <><Text style={styles.deliveryLabel}>ADRESSE DE LIVRAISON</Text><TextInput value={customer.address} onChangeText={(value) => update("address", value)} placeholder="Numéro et nom de rue" placeholderTextColor="#9B877B" style={styles.fieldInput} autoCapitalize="words" /><View style={styles.fieldRow}><TextInput value={customer.postalCode} onChangeText={(value) => update("postalCode", value)} placeholder="Code postal" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.fieldHalf]} keyboardType="number-pad" maxLength={5} /><TextInput value={customer.city} onChangeText={(value) => update("city", value)} placeholder="Ville" placeholderTextColor="#9B877B" style={[styles.fieldInput, styles.fieldCity]} autoCapitalize="words" /></View><View style={[styles.distanceCard, quote?.status === "error" && styles.distanceCardError]}><Text style={styles.distanceTitle}>Frais de livraison automatiques</Text><Text style={styles.distanceText}>Ton adresse est utilisée uniquement pour calculer l’itinéraire et vérifier la zone de 5 km.</Text><Pressable onPress={calculateQuote} disabled={quote?.status === "loading"} style={[styles.quoteButton, quote?.status === "loading" && styles.quoteButtonDisabled]}><Text style={styles.quoteButtonText}>{quote?.status === "loading" ? "Calcul en cours…" : "Calculer mon tarif"}</Text></Pressable>{quote?.status === "success" && quote.withinZone && <Text style={styles.distanceSuccess}>✓ À {quote.distanceKm.toFixed(2).replace(".", ",")} km · Livraison {money(quote.deliveryFee)}</Text>}{quote?.status === "success" && !quote.withinZone && <Text style={styles.distanceError}>Cette adresse est hors de la zone de livraison de 5 km.</Text>}{quote?.status === "error" && <Text style={styles.distanceError}>{quote.error}</Text>}</View></> : <View style={styles.pickupCard}><Text style={styles.pickupTitle}>Retrait au restaurant</Text><Text style={styles.pickupText}>{RESTAURANT_ADDRESS}</Text><Text style={styles.pickupText}>Aucun frais de livraison.</Text></View>}<Text style={styles.detailsFinePrint}>Le montant exact est calculé avant le paiement à partir de l’itinéraire routier.</Text></ScrollView><View style={styles.stickyAction}>{!complete && <Text style={styles.requiredHint}>{isDelivery && !quoteReady ? "Calcule ton tarif de livraison pour continuer." : "Complète les informations pour continuer."}</Text>}<Pressable disabled={!complete} style={[styles.primaryButton, !complete && styles.primaryButtonDisabled]} onPress={() => onContinue(deliveryFee)}><Text style={styles.primaryButtonText}>Vérifier et payer · {!hasExactFee ? "dès " : ""}{money(total)}</Text></Pressable></View></SafeAreaView>;
}

function PaymentScreen({ cart, customer, onBack, onPay }) {
  const fee = cart.delivery.fee ?? deliveryCost(cart.delivery.method);
  const total = cart.total + fee;
  const isDelivery = cart.delivery.method === "delivery";
  return <SafeAreaView style={styles.safeArea}><View style={styles.detailContent}><Header onBack={onBack} /><Text style={styles.title}>Vérifie ta commande</Text><Text style={styles.deliveryIntro}>Tout est prêt pour le paiement sécurisé.</Text><View style={styles.paymentSummary}><Text style={styles.paymentProduct}>{cart.product.name}</Text><Text style={styles.paymentLine}>{cart.delivery.dayLabel} · {cart.delivery.slot}</Text><View style={styles.receiptDivider} /><ReceiptLine label="Sous-total" value={money(cart.total)} /><ReceiptLine label={isDelivery ? "Livraison" : "Retrait"} value={fee ? money(fee) : "Offert"} /><View style={styles.receiptDivider} /><ReceiptLine label="Total" value={money(total)} strong /></View><View style={styles.customerSummary}><Text style={styles.customerSummaryTitle}>{isDelivery ? "Livrer à" : "Retrait par"}</Text><Text style={styles.customerSummaryText}>{customer.name} · {customer.phone}</Text>{isDelivery && <Text style={styles.customerSummaryText}>{customer.address}, {customer.postalCode} {customer.city}</Text>}</View><View style={styles.securePayment}><Text style={styles.securePaymentIcon}>🔒</Text><View><Text style={styles.securePaymentTitle}>Paiement sécurisé avec SumUp</Text><Text style={styles.securePaymentText}>Carte bancaire · le paiement sera ouvert par SumUp.</Text></View></View></View><View style={styles.stickyAction}><Pressable style={styles.primaryButton} onPress={() => onPay(total)}><Text style={styles.primaryButtonText}>Payer avec SumUp · {money(total)}</Text></Pressable></View></SafeAreaView>;
}

function PaymentPendingScreen({ onCheckPayment, onBack }) {
  return <SafeAreaView style={styles.safeArea}><View style={styles.successContent}><Text style={styles.successEmoji}>🔒</Text><Text style={styles.successTitle}>Paiement en cours</Text><Text style={styles.successText}>Finalise le paiement sur la page sécurisée SumUp, puis reviens ici. Nous vérifierons son statut avant de confirmer la commande.</Text><View style={styles.statusCard}><Text style={styles.statusTitle}>● En attente de SumUp</Text><Text style={styles.statusDescription}>Aucune commande n’est considérée comme payée tant que SumUp ne l’a pas confirmée.</Text></View><Pressable style={styles.primaryButton} onPress={onCheckPayment}><Text style={styles.primaryButtonText}>J’ai terminé le paiement</Text></Pressable><Pressable style={styles.trackOrderButton} onPress={onBack}><Text style={styles.trackOrderButtonText}>Retour au paiement</Text></Pressable></View></SafeAreaView>;
}

function SuccessScreen({ cart, onHome, onReview, onTrack }) {
  const label = cart.delivery.method === "delivery" ? "Livraison" : "Retrait";
  return <SafeAreaView style={styles.safeArea}><View style={styles.successContent}><Text style={styles.successEmoji}>🎉</Text><Text style={styles.successTitle}>Commande confirmée!</Text><Text style={styles.successText}>Le restaurant prépare déjà ton {cart.product.name}.</Text><View style={styles.statusCard}><Text style={styles.statusTitle}>● Préparation en cours</Text><Text style={styles.statusDescription}>{label} {cart.delivery.dayLabel.toLowerCase()} entre {cart.delivery.slot}.</Text></View><Pressable style={styles.trackOrderButton} onPress={onTrack}><Text style={styles.trackOrderButtonText}>Suivre ma commande ›</Text></Pressable><Pressable style={styles.reviewPrompt} onPress={onReview}><Text style={styles.reviewPromptTitle}>Ton avis compte pour nous</Text><Text style={styles.reviewPromptText}>Raconte-nous ton expérience après la dégustation.</Text><Text style={styles.reviewPromptLink}>Laisser un avis ›</Text></Pressable><Pressable style={styles.primaryButton} onPress={onHome}><Text style={styles.primaryButtonText}>Retour à l’accueil</Text></Pressable></View></SafeAreaView>;
}

function ReviewScreen({ onBack }) {
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}><Header onBack={onBack} /><Text style={styles.title}>Votre avis compte</Text><Text style={styles.reviewIntro}>Partagez votre expérience avec Bibou’s Burgers directement sur notre page Google.</Text><View style={styles.reviewCard}><Text style={styles.reviewQuestion}>Merci pour votre commande !</Text><Text style={styles.ratingHelper}>Votre avis Google aide d’autres gourmands à nous découvrir.</Text></View><Pressable onPress={() => Linking.openURL(GOOGLE_REVIEW_URL)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Laisser mon avis sur Google ↗</Text></Pressable><Text style={styles.reviewFinePrint}>Google ouvrira sa page officielle. Vous restez libre de publier ou non votre avis.</Text></ScrollView></SafeAreaView>;
}

function LoyaltyScreen({ loyalty, onBack, onSimulateOrder, onRefer }) {
  const multiplier = loyalty.orders ? Math.min(loyalty.orders, 3) : 1;
  const weeklyPoints = loyalty.orders * POINTS_PER_ORDER * multiplier;
  const remaining = Math.max(0, REWARD_POINTS - loyalty.points);
  const progress = Math.min(100, (loyalty.points / REWARD_POINTS) * 100);
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
          <Text style={styles.pointsSubtext}>{remaining ? `Encore ${remaining} points avant 5 € offerts` : "Ta récompense de 5 € est disponible !"}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.progressCaption}>{loyalty.points} / {REWARD_POINTS} points</Text>
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
            return <View key={reward.points} style={[styles.rewardRow, unlocked && styles.rewardRowUnlocked]}>
              <View style={styles.rewardIcon}><Text style={styles.rewardEmoji}>{reward.emoji}</Text></View>
              <View style={styles.rewardCopy}><Text style={styles.rewardTitle}>{reward.title}</Text><Text style={styles.rewardDetail}>{reward.detail}</Text></View>
              <View style={[styles.rewardStatus, unlocked && styles.rewardStatusUnlocked]}>
                <Text style={[styles.rewardStatusText, unlocked && styles.rewardStatusTextUnlocked]}>{unlocked ? "Disponible" : `+${difference}`}</Text>
                <Text style={[styles.rewardStatusSubtext, unlocked && styles.rewardStatusTextUnlocked]}>{unlocked ? "à utiliser" : "points"}</Text>
              </View>
            </View>;
          })}
        </View>

        <Text style={styles.sectionTitle}>Ton bonus de la semaine</Text>
        <View style={styles.weeklyCard}>
          <View style={styles.weeklyHeader}>
            <View><Text style={styles.weeklyTitle}>{loyalty.orders} commande{loyalty.orders > 1 ? "s" : ""} cette semaine</Text><Text style={styles.weeklySubtext}>{loyalty.orders ? `${loyalty.orders * POINTS_PER_ORDER} points de base × ${multiplier}` : "Ta première commande débloque tes points"}</Text></View>
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
        <Pressable style={styles.simulateButton} onPress={onSimulateOrder}><Text style={styles.simulateButtonText}>Simuler une commande</Text><Text style={styles.simulateHint}>Maquette : visualiser les points gagnés</Text></Pressable>

        <Text style={styles.sectionTitle}>Parrainage</Text>
        <Pressable onPress={onRefer} style={styles.referralCard}>
          <View style={styles.referralIcon}><Text style={styles.referralEmoji}>🎁</Text></View>
          <View style={styles.referralCopy}><Text style={styles.referralTitle}>Invite un proche</Text><Text style={styles.referralText}>+ 100 points après sa première commande.</Text></View>
          <Text style={styles.loyaltyShortcutArrow}>›</Text>
        </Pressable>
        <Text style={styles.loyaltyLegal}>Dans la version connectée, les commandes et les parrainages seront associés au compte du client.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [activeProduct, setActiveProduct] = useState(null);
  const [cart, setCart] = useState(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", postalCode: "", city: "Le Havre", distance: "" });
  const [loyalty, setLoyalty] = useState({ points: 0, orders: 0 });
  const [orders, setOrders] = useState([]);
  const [authToken, setAuthToken] = useState("");
  const [pendingOrder, setPendingOrder] = useState(null);
  const cartCount = useMemo(() => (cart ? 1 : 0), [cart]);
  const loadCustomerOrders = async (token = authToken) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/customer/orders`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’actualiser les commandes.");
      setOrders(payload.orders.map(orderFromApi));
    } catch (error) {
      Alert.alert("Actualisation indisponible", error.message || "Réessaie dans un instant.");
    }
  };
  const authenticate = ({ token, customer: savedCustomer }) => {
    setAuthToken(token);
    setCustomer((current) => ({ ...current, ...savedCustomer }));
    setLoyalty({ points: savedCustomer.points, orders: savedCustomer.weeklyOrders });
    void loadCustomerOrders(token);
    setScreen("account");
  };
  const openProduct = (product) => { setActiveProduct(product); setScreen("product"); };
  const addToCart = (item) => { setCart({ ...item, delivery: { method: "delivery", day: DEFAULT_DELIVERY_DAY.id, dayLabel: DEFAULT_DELIVERY_DAY.name, slot: null } }); setScreen("cart"); };
  const updateDelivery = (delivery) => setCart({ ...cart, delivery });
  const continueWithCustomer = async (deliveryFee) => {
    let savedCustomer = customer;
    if (API_BASE_URL) {
      try {
        const endpoint = customer.id ? `${API_BASE_URL}/customers/${customer.id}` : `${API_BASE_URL}/customers`;
        const response = await fetch(endpoint, { method: customer.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customer) });
        if (response.ok) savedCustomer = (await response.json()).customer;
      } catch {}
    }
    setCustomer((current) => ({ ...current, ...savedCustomer }));
    setCart({ ...cart, delivery: { ...cart.delivery, fee: deliveryFee } });
    setScreen("payment");
  };
  const pay = async (total) => {
    try {
      const statusResponse = await fetch(`${API_BASE_URL}/integrations/sumup/status`);
      const status = await statusResponse.json();
      if (!status.checkoutReady) throw new Error("Le paiement sécurisé est encore en cours de configuration.");

      let activeCustomer = customer;
      if (!activeCustomer.id) {
        const customerResponse = await fetch(`${API_BASE_URL}/customers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customer) });
        if (!customerResponse.ok) throw new Error("Impossible d’enregistrer vos coordonnées.");
        activeCustomer = (await customerResponse.json()).customer;
        setCustomer((current) => ({ ...current, ...activeCustomer }));
      }

      const orderResponse = await fetch(`${API_BASE_URL}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: activeCustomer.id, items: [{ name: cart.product.name, quantity: 1, price: cart.total }], method: cart.delivery.method, slot: cart.delivery.slot, distanceKm: cart.delivery.method === "delivery" ? Number.parseFloat(customer.distance.replace(",", ".")) : 0 }) });
      if (!orderResponse.ok) throw new Error("Impossible de créer la commande.");
      const orderPayload = await orderResponse.json();

      const checkoutResponse = await fetch(`${API_BASE_URL}/payments/sumup-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: orderPayload.order.id }) });
      const checkoutPayload = await checkoutResponse.json();
      if (!checkoutResponse.ok || !checkoutPayload.checkoutUrl) throw new Error(checkoutPayload.error || "Impossible d’ouvrir le paiement SumUp.");

      setPendingOrder(orderPayload.order);
      setScreen("payment-pending");
      await Linking.openURL(checkoutPayload.checkoutUrl);
    } catch (error) {
      Alert.alert("Paiement indisponible", error.message || "Une erreur est survenue. Réessaie dans un instant.");
    }
  };
  const checkPayment = async () => {
    if (!pendingOrder) return;
    try {
      const response = await fetch(`${API_BASE_URL}/payments/sumup-checkout/${pendingOrder.id}`);
      const payload = await response.json();
      if (payload.payment?.status === "PAID") {
        if (payload.customer) {
          setCustomer((current) => ({ ...current, ...payload.customer }));
          setLoyalty({ points: payload.customer.points, orders: payload.customer.weeklyOrders });
        }
        setOrders((currentOrders) => currentOrders.some((order) => order.apiId === payload.order.id) ? currentOrders : [orderFromApi(payload.order), ...currentOrders]);
        setScreen("success");
      } else {
        Alert.alert("Paiement en attente", "SumUp n’a pas encore confirmé le paiement. Réessaie dans quelques instants.");
      }
    } catch {
      Alert.alert("Vérification indisponible", "Impossible de vérifier le paiement pour le moment.");
    }
  };
  const simulateOrder = () => {
    const before = loyalty.orders * POINTS_PER_ORDER * Math.min(Math.max(loyalty.orders, 1), 3);
    const nextOrders = loyalty.orders + 1;
    const after = nextOrders * POINTS_PER_ORDER * Math.min(nextOrders, 3);
    const added = after - before;
    Alert.alert("Points ajoutés", `+ ${added} points grâce au multiplicateur × ${Math.min(nextOrders, 3)}.`);
    setLoyalty({ points: loyalty.points + added, orders: nextOrders });
  };
  const referFriend = () => Alert.alert("Code de parrainage", "BIBOU-HELEN\n\nTon proche recevra son invitation. Tu gagneras 100 points après sa première commande.");
  if (screen === "product") return <ProductScreen product={activeProduct} onBack={() => setScreen("menu")} onAdd={addToCart} />;
  if (screen === "cart") return <CartScreen cart={cart} onBack={() => setScreen("menu")} onCheckout={() => setScreen("delivery")} />;
  if (screen === "delivery") return <DeliveryScreen cart={cart} onBack={() => setScreen("cart")} onChange={updateDelivery} onContinue={() => setScreen("details")} />;
  if (screen === "details") return <CheckoutDetailsScreen cart={cart} customer={customer} onChange={setCustomer} onBack={() => setScreen("delivery")} onContinue={continueWithCustomer} />;
  if (screen === "payment") return <PaymentScreen cart={cart} customer={customer} onBack={() => setScreen("details")} onPay={pay} />;
  if (screen === "payment-pending") return <PaymentPendingScreen onCheckPayment={checkPayment} onBack={() => setScreen("payment")} />;
  if (screen === "success") return <SuccessScreen cart={cart} onReview={() => setScreen("review")} onTrack={() => setScreen("orders")} onHome={() => { setCart(null); setScreen("menu"); }} />;
  if (screen === "review") return <ReviewScreen onBack={() => setScreen("success")} />;
  if (screen === "loyalty") return <LoyaltyScreen loyalty={loyalty} onBack={() => setScreen("menu")} onSimulateOrder={simulateOrder} onRefer={referFriend} />;
  if (screen === "login") return <SmsLoginScreen onBack={() => setScreen("menu")} onAuthenticated={authenticate} />;
  if (screen === "account") return authToken ? <AccountScreen customer={customer} loyalty={loyalty} orders={orders} onBack={() => setScreen("menu")} onOpenOrders={() => { void loadCustomerOrders(); setScreen("orders"); }} onOpenLoyalty={() => setScreen("loyalty")} /> : <SmsLoginScreen onBack={() => setScreen("menu")} onAuthenticated={authenticate} />;
  if (screen === "orders") return <OrdersScreen orders={orders} onBack={() => setScreen("account")} onRefresh={() => void loadCustomerOrders()} />;
  return <SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" /><MenuScreen cartCount={cartCount} loyaltyPoints={loyalty.points} customer={customer} onOpenAccount={() => setScreen(authToken ? "account" : "login")} onOpenLoyalty={() => setScreen("loyalty")} onOpenProduct={openProduct} onOpenCart={() => setScreen("cart")} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFF8F2" }, scrollContent: { padding: 20, paddingBottom: 110 }, detailContent: { flexGrow: 1, padding: 20, paddingBottom: 120 },
  header: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, wordmark: { color: "#E95122", fontSize: 20, fontWeight: "800", letterSpacing: -0.7 }, headerRight: { fontSize: 18 }, backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F8EAE0", alignItems: "center", justifyContent: "center" }, backText: { fontSize: 30, lineHeight: 32, color: "#2C201B" },
  homeTopRow: { flexDirection: "row", gap: 9, alignItems: "stretch" }, addressBox: { marginTop: 15, borderRadius: 15, backgroundColor: "#F8EAE0", padding: 13, flex: 1 }, addressLabel: { color: "#826E63", fontSize: 12 }, addressValue: { color: "#2C201B", fontWeight: "700", marginTop: 2 }, accountShortcut: { marginTop: 15, width: 88, backgroundColor: "#FFF0E9", borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }, accountShortcutIcon: { fontSize: 18 }, accountShortcutText: { color: "#D74318", fontSize: 10, fontWeight: "800", marginTop: 3, textAlign: "center" }, title: { color: "#2C201B", fontSize: 30, lineHeight: 33, fontWeight: "800", letterSpacing: -1.1, marginTop: 25 }, sectionTitle: { color: "#2C201B", fontSize: 18, fontWeight: "800", marginTop: 26, marginBottom: 11 },
  loyaltyShortcut: { marginTop: 12, backgroundColor: "#2C201B", borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, loyaltyShortcutEyebrow: { color: "#FFB797", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }, loyaltyShortcutTitle: { color: "white", fontSize: 15, fontWeight: "800", marginTop: 3 }, loyaltyShortcutArrow: { color: "#E95122", fontSize: 30, fontWeight: "400", lineHeight: 30 },
  hero: { height: 155, borderRadius: 23, overflow: "hidden", justifyContent: "flex-end" }, heroImage: { position: "absolute", width: "100%", height: "100%", resizeMode: "cover" }, heroShade: { position: "absolute", width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.32)" }, heroCopy: { padding: 17 }, heroTitle: { color: "white", fontSize: 21, fontWeight: "800" }, heroSubtitle: { color: "white", marginTop: 5, fontWeight: "600" },
  promotionsTrack: { gap: 12 }, promotionCard: { height: 190, borderRadius: 23, overflow: "hidden", justifyContent: "flex-end" }, promotionImage: { position: "absolute", width: "100%", height: "100%", resizeMode: "cover" }, promotionShade: { position: "absolute", width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.34)" }, promotionCopy: { padding: 18 }, promotionEyebrow: { color: "#FFE5D8", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, promotionTitle: { color: "white", fontSize: 25, fontWeight: "800", marginTop: 5 }, promotionSubtitle: { color: "white", fontSize: 13, fontWeight: "600", marginTop: 5 }, promotionDots: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 11, marginBottom: 4 }, promotionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D6BEB1" }, promotionDotActive: { width: 18, backgroundColor: "#E95122" },
  googleReviewsSection: { marginTop: 24, marginBottom: 4 }, googleReviewsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }, googleReviewsTitle: { color: "#2C201B", fontSize: 18, fontWeight: "800" }, googleReviewsScore: { color: "#826E63", fontSize: 12, marginTop: 2 }, googleReviewsLink: { color: "#D74318", fontWeight: "800", fontSize: 12 }, googleReviewsTrack: { gap: 10 }, googleReviewCard: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 16, minHeight: 145 }, googleReviewStars: { color: "#F1A326", fontSize: 18, letterSpacing: 1 }, googleReviewText: { color: "#473831", fontSize: 13, lineHeight: 19, marginTop: 9, flex: 1 }, googleReviewAuthor: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 10 },
  productCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomColor: "#EADBD2", borderBottomWidth: 1 }, productCardSoldOut: { opacity: 0.52 }, productImage: { width: 72, height: 72, borderRadius: 18, resizeMode: "cover", backgroundColor: "#EADBD2" }, productInfo: { flex: 1 }, productName: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, productDescription: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 3 }, productPrice: { color: "#2C201B", fontWeight: "800", marginTop: 7 }, soldOutText: { color: "#9B5C48" }, plus: { backgroundColor: "#E95122", width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" }, plusSoldOut: { backgroundColor: "#A99388" }, plusText: { color: "white", fontSize: 22, lineHeight: 24 }, floatingCart: { marginTop: 22, backgroundColor: "#2C201B", borderRadius: 15, paddingVertical: 15, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between" }, floatingCartText: { color: "white", fontWeight: "800" }, floatingCartIcon: { color: "white" },
  detailImage: { width: "100%", height: 230, borderRadius: 25, resizeMode: "cover", marginTop: 14, backgroundColor: "#EADBD2" }, priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, detailTitle: { color: "#2C201B", fontSize: 26, fontWeight: "800", letterSpacing: -1, flex: 1, paddingRight: 14 }, detailPrice: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, detailDescription: { color: "#826E63", lineHeight: 20, marginTop: 7 }, includedText: { color: "#397353", fontSize: 13, fontWeight: "700", marginTop: 10 },
  optionGroup: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 16, overflow: "hidden", marginBottom: 11 }, optionGroupHeader: { minHeight: 70, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F8EAE0" }, optionGroupTitleWrap: { flex: 1, paddingRight: 10 }, optionGroupTitle: { color: "#2C201B", fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }, optionGroupHelper: { color: "#826E63", fontSize: 12, marginTop: 5 }, chevron: { color: "#E95122", fontSize: 22, fontWeight: "700" }, option: { minHeight: 57, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomColor: "#EADBD2", borderBottomWidth: 1 }, checkbox: { width: 21, height: 21, borderColor: "#CBB7AA", borderWidth: 1.5, borderRadius: 7, alignItems: "center", justifyContent: "center", marginRight: 11 }, checkboxSelected: { backgroundColor: "#E95122", borderColor: "#E95122" }, checkmark: { color: "white", fontWeight: "800" }, optionName: { color: "#2C201B", flex: 1, fontSize: 13, fontWeight: "600", paddingRight: 8 }, optionValue: { color: "#826E63", fontSize: 12 },
  stickyAction: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, paddingBottom: 18, backgroundColor: "#FFF8F2", borderTopColor: "#EADBD2", borderTopWidth: 1 }, requiredHint: { color: "#826E63", fontSize: 12, textAlign: "center", marginBottom: 8 }, primaryButton: { backgroundColor: "#E95122", borderRadius: 16, padding: 16, alignItems: "center" }, primaryButtonDisabled: { backgroundColor: "#C9B4A7" }, primaryButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingTop: 75 }, emptyIcon: { fontSize: 56 }, emptyTitle: { color: "#2C201B", fontSize: 20, fontWeight: "800", marginTop: 12 }, emptyText: { color: "#826E63", marginTop: 7 }, cartItem: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 25 }, cartImage: { width: 74, height: 74, borderRadius: 18, resizeMode: "cover", backgroundColor: "#EADBD2" }, receipt: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 16, marginTop: 24 }, receiptLine: { flexDirection: "row", justifyContent: "space-between", marginVertical: 5, color: "#2C201B" }, receiptDivider: { height: 1, backgroundColor: "#DEC8BA", marginVertical: 9 }, strong: { fontWeight: "800", color: "#2C201B" }, eta: { color: "#397353", fontWeight: "700", marginTop: 17 },
  deliveryIntro: { color: "#826E63", lineHeight: 20, marginTop: 9, marginBottom: 22 }, deliveryLabel: { color: "#826E63", fontSize: 12, fontWeight: "900", letterSpacing: 0.4, marginTop: 20, marginBottom: 9 }, methodRow: { flexDirection: "row", gap: 9 }, dayRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, choiceChip: { borderWidth: 1.5, borderColor: "#EADBD2", borderRadius: 13, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: "#FFFDFC" }, choiceChipSelected: { borderColor: "#E95122", backgroundColor: "#FFF0E9" }, choiceChipText: { color: "#2C201B", fontWeight: "700", fontSize: 13 }, choiceChipTextSelected: { color: "#D74318" }, addressNotice: { backgroundColor: "#F8EAE0", borderRadius: 14, padding: 13, marginTop: 13 }, addressNoticeTitle: { color: "#826E63", fontSize: 12 }, addressNoticeText: { color: "#2C201B", fontWeight: "700", marginTop: 3 }, deliveryPrices: { marginTop: 9, borderTopWidth: 1, borderTopColor: "#EADBD2", paddingTop: 5 }, deliveryPriceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }, deliveryPriceDistance: { color: "#826E63", fontSize: 12 }, deliveryPriceValue: { color: "#2C201B", fontSize: 12, fontWeight: "800" }, deliveryFeeHint: { color: "#826E63", fontSize: 11, marginTop: 5 }, cartFeeHint: { color: "#826E63", fontSize: 11, lineHeight: 15, marginTop: 10 }, slots: { gap: 9 }, slot: { borderWidth: 1.5, borderColor: "#EADBD2", borderRadius: 14, padding: 15, backgroundColor: "#FFFDFC" }, slotSelected: { borderColor: "#E95122", backgroundColor: "#FFF0E9" }, slotText: { color: "#2C201B", fontWeight: "700" }, slotTextSelected: { color: "#D74318" },
  detailsContent: { flexGrow: 1, padding: 20, paddingBottom: 120 }, detailsIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, fieldInput: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC", paddingHorizontal: 14, color: "#2C201B", fontSize: 15, marginBottom: 10 }, fieldRow: { flexDirection: "row", gap: 10 }, fieldHalf: { flex: 0.8 }, fieldCity: { flex: 1.2 }, distanceCard: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 15, marginTop: 5, borderWidth: 1, borderColor: "#F0D7CB" }, distanceCardError: { backgroundColor: "#FFF0ED", borderColor: "#E3A18C" }, distanceTitle: { color: "#2C201B", fontWeight: "800" }, distanceText: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 5 }, distanceInput: { minHeight: 48, borderRadius: 12, backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", paddingHorizontal: 13, color: "#2C201B", fontSize: 14, marginTop: 12 }, distanceSuccess: { color: "#397353", fontSize: 12, fontWeight: "800", marginTop: 9 }, distanceError: { color: "#A3472A", fontSize: 12, fontWeight: "800", marginTop: 9 }, pickupCard: { backgroundColor: "#EAF5E4", borderRadius: 18, padding: 16, marginTop: 22 }, pickupTitle: { color: "#397353", fontWeight: "800" }, pickupText: { color: "#526D57", lineHeight: 18, marginTop: 5, fontSize: 13 }, detailsFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 17, textAlign: "center" }, paymentSummary: { backgroundColor: "#F8EAE0", borderRadius: 19, padding: 17, marginTop: 22 }, paymentProduct: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, paymentLine: { color: "#826E63", fontSize: 12, marginTop: 6 }, customerSummary: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 16, marginTop: 13 }, customerSummaryTitle: { color: "#826E63", fontSize: 12, fontWeight: "800", textTransform: "uppercase" }, customerSummaryText: { color: "#2C201B", fontSize: 13, lineHeight: 18, marginTop: 6 }, securePayment: { backgroundColor: "#EAF5E4", borderRadius: 18, padding: 15, marginTop: 13, flexDirection: "row", alignItems: "center" }, securePaymentIcon: { fontSize: 22, marginRight: 11 }, securePaymentTitle: { color: "#397353", fontWeight: "800" }, securePaymentText: { color: "#526D57", fontSize: 11, lineHeight: 15, marginTop: 3, paddingRight: 24 },
  quoteButton: { alignSelf: "flex-start", backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#D74318", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 }, quoteButtonDisabled: { opacity: 0.6 }, quoteButtonText: { color: "#D74318", fontSize: 13, fontWeight: "800" },
  successContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, successEmoji: { fontSize: 64 }, successTitle: { color: "#2C201B", fontSize: 28, fontWeight: "800", marginTop: 15, textAlign: "center" }, successText: { color: "#826E63", textAlign: "center", lineHeight: 20, marginTop: 9 }, statusCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 18, width: "100%", marginTop: 30, marginBottom: 12 }, statusTitle: { color: "#397353", fontWeight: "800" }, statusDescription: { color: "#826E63", lineHeight: 19, marginTop: 8 }, trackOrderButton: { width: "100%", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 16, padding: 14, alignItems: "center", marginBottom: 12 }, trackOrderButtonText: { color: "#D74318", fontWeight: "800" },
  reviewPrompt: { width: "100%", borderWidth: 1.5, borderColor: "#E95122", borderRadius: 18, padding: 16, marginBottom: 12, backgroundColor: "#FFF0E9" }, reviewPromptTitle: { color: "#2C201B", fontWeight: "800" }, reviewPromptText: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 4 }, reviewPromptLink: { color: "#D74318", fontWeight: "800", marginTop: 9 }, reviewContent: { padding: 20, paddingBottom: 44 }, reviewIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, reviewCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 18, marginTop: 23, alignItems: "center" }, reviewQuestion: { color: "#2C201B", fontWeight: "800", fontSize: 16 }, starsRow: { flexDirection: "row", marginTop: 12 }, starButton: { paddingHorizontal: 4, paddingVertical: 3 }, star: { color: "#D5BDB0", fontSize: 38, lineHeight: 43 }, starActive: { color: "#F1A326" }, ratingHelper: { color: "#826E63", fontSize: 12, marginTop: 7 }, reviewReward: { backgroundColor: "#EAF5E4", borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", marginTop: 15 }, reviewRewardEmoji: { fontSize: 25, marginRight: 11 }, reviewRewardTitle: { color: "#2C201B", fontWeight: "800" }, reviewRewardText: { color: "#397353", fontSize: 12, fontWeight: "700", marginTop: 4 }, reviewLabel: { color: "#826E63", fontSize: 12, fontWeight: "900", letterSpacing: 0.4, marginTop: 25, marginBottom: 8 }, reviewInput: { minHeight: 130, borderRadius: 17, borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC", padding: 14, color: "#2C201B", fontSize: 14, lineHeight: 20 }, characterCount: { color: "#826E63", fontSize: 11, alignSelf: "flex-end", marginTop: 6 }, reviewSubmit: { marginTop: 20 }, googleReviewButton: { borderWidth: 1, borderColor: "#EADBD2", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 11, backgroundColor: "#FFFDFC" }, googleReviewText: { color: "#2C201B", fontWeight: "800", fontSize: 13 }, reviewFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: "center" },
  accountContent: { padding: 20, paddingBottom: 46 }, accountHero: { backgroundColor: "#2C201B", borderRadius: 22, padding: 19, marginTop: 20, flexDirection: "row", alignItems: "center" }, accountAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#E95122", alignItems: "center", justifyContent: "center", marginRight: 13 }, accountAvatarText: { color: "white", fontSize: 22, fontWeight: "900" }, accountGreeting: { color: "white", fontSize: 18, fontWeight: "800" }, accountContact: { color: "#F2C8B5", fontSize: 12, marginTop: 5, maxWidth: 230 }, currentOrderCard: { backgroundColor: "#EAF5E4", borderRadius: 20, padding: 16, marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, currentOrderEyebrow: { color: "#397353", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }, currentOrderTitle: { color: "#2C201B", fontSize: 15, fontWeight: "800", marginTop: 5 }, currentOrderText: { color: "#526D57", fontSize: 12, marginTop: 4 }, currentOrderArrow: { color: "#397353", fontSize: 30 }, accountAction: { backgroundColor: "#FFFDFC", borderRadius: 18, borderWidth: 1, borderColor: "#EADBD2", padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 10 }, accountActionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 }, accountActionCopy: { flex: 1 }, accountActionTitle: { color: "#2C201B", fontWeight: "800" }, accountActionText: { color: "#826E63", fontSize: 12, marginTop: 4 }, accountActionArrow: { color: "#D74318", fontSize: 26 }, accountAddress: { backgroundColor: "#F8EAE0", borderRadius: 18, padding: 15, marginTop: 15 }, accountAddressTitle: { color: "#2C201B", fontWeight: "800" }, accountAddressText: { color: "#826E63", fontSize: 13, lineHeight: 18, marginTop: 6 }, accountFinePrint: { color: "#826E63", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 19 }, trackingCard: { backgroundColor: "#FFFDFC", borderRadius: 20, borderWidth: 1, borderColor: "#EADBD2", padding: 16 }, trackingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, trackingOrder: { color: "#2C201B", fontSize: 15, fontWeight: "800", maxWidth: 230 }, trackingMeta: { color: "#826E63", fontSize: 12, marginTop: 5 }, trackingPrice: { color: "#2C201B", fontWeight: "800" }, trackingSteps: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 }, trackingStep: { flex: 1, alignItems: "center" }, trackingDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#F3E9E2", borderWidth: 1, borderColor: "#D6BEB1", alignItems: "center", justifyContent: "center" }, trackingDotDone: { backgroundColor: "#E95122", borderColor: "#E95122" }, trackingCheck: { color: "white", fontSize: 12, fontWeight: "900" }, trackingLabel: { color: "#9B877B", fontSize: 8, fontWeight: "700", textAlign: "center", marginTop: 5 }, trackingLabelDone: { color: "#D74318" }, trackingMessage: { color: "#397353", fontWeight: "700", fontSize: 12, textAlign: "center", marginTop: 18 }, historyOrder: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 9 }, historyIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EAF5E4", alignItems: "center", justifyContent: "center", marginRight: 10 }, historyCopy: { flex: 1 }, historyTitle: { color: "#2C201B", fontSize: 13, fontWeight: "800" }, historyMeta: { color: "#826E63", fontSize: 11, marginTop: 4 }, historyPrice: { color: "#2C201B", fontWeight: "800", fontSize: 12 },
  loginContent: { padding: 20, paddingBottom: 44 }, loginIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginTop: 26 }, loginIconText: { color: "#E95122", fontSize: 31 }, loginIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, loginCard: { backgroundColor: "#F8EAE0", borderRadius: 22, padding: 17, marginTop: 23 }, loginFinePrint: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 16 }, loginSecondary: { alignItems: "center", paddingTop: 17 }, loginSecondaryText: { color: "#D74318", fontWeight: "800" }, loginLegal: { color: "#826E63", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 18 }, codeInput: { fontSize: 24, fontWeight: "800", letterSpacing: 8, textAlign: "center" },
  loyaltyContent: { padding: 20, paddingBottom: 44 }, loyaltyIntro: { color: "#826E63", lineHeight: 20, marginTop: 9 }, pointsCard: { backgroundColor: "#2C201B", borderRadius: 24, padding: 21, marginTop: 22 }, pointsEyebrow: { color: "#FFB797", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, pointsTotal: { color: "white", fontSize: 30, fontWeight: "800", marginTop: 7 }, pointsSubtext: { color: "#F9D6C8", fontWeight: "600", marginTop: 7 }, progressTrack: { height: 9, backgroundColor: "#5D4740", borderRadius: 6, overflow: "hidden", marginTop: 19 }, progressFill: { height: "100%", backgroundColor: "#E95122", borderRadius: 6 }, progressCaption: { color: "#EBC8B9", fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "right" }, prestigeCard: { backgroundColor: "#FFF0E9", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#F2C7B7" }, prestigeTop: { flexDirection: "row", alignItems: "center" }, prestigeBadge: { width: 94, height: 60, borderRadius: 20, backgroundColor: "#F8EAE0", borderWidth: 2, borderColor: "#D3BDB1", alignItems: "center", justifyContent: "center", marginRight: 12 }, prestigeBadgeText: { color: "#826E63", fontSize: 16, fontWeight: "900" }, prestigeCopy: { flex: 1 }, prestigeTitle: { color: "#2C201B", fontSize: 15, fontWeight: "900" }, prestigeReward: { color: "#826E63", fontSize: 12, lineHeight: 16, marginTop: 4 }, prestigeLevels: { flexDirection: "row", justifyContent: "space-between", marginTop: 19 }, prestigeLevel: { alignItems: "center", flex: 1 }, prestigeAboveLabel: { color: "#826E63", fontSize: 9, fontWeight: "800", marginBottom: 5 }, prestigeDot: { width: 50, height: 40, borderRadius: 20, backgroundColor: "#F8EAE0", borderWidth: 2, borderColor: "#D3BDB1", alignItems: "center", justifyContent: "center" }, prestigeDotUnlocked: { backgroundColor: "#E95122", borderColor: "#E95122" }, prestigeDotText: { color: "#826E63", fontSize: 10, fontWeight: "900" }, prestigeDotTextUnlocked: { color: "white" }, prestigeLevelLabel: { color: "#9B877B", fontSize: 8, lineHeight: 12, fontWeight: "700", marginTop: 5, textAlign: "center" }, prestigeLevelLabelActive: { color: "#D74318" }, prestigeNext: { color: "#826E63", fontSize: 12, marginTop: 15, textAlign: "center" }, rewardsTable: { borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#EADBD2", backgroundColor: "#FFFDFC" }, rewardRow: { minHeight: 76, padding: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EADBD2" }, rewardRowUnlocked: { backgroundColor: "#F4F8F0" }, rewardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 11 }, rewardEmoji: { fontSize: 21 }, rewardCopy: { flex: 1, paddingRight: 8 }, rewardTitle: { color: "#2C201B", fontSize: 13, fontWeight: "800" }, rewardDetail: { color: "#826E63", fontSize: 11, lineHeight: 14, marginTop: 3 }, rewardStatus: { minWidth: 56, borderRadius: 11, backgroundColor: "#F2E8E2", paddingVertical: 6, paddingHorizontal: 5, alignItems: "center" }, rewardStatusUnlocked: { backgroundColor: "#DDEED7" }, rewardStatusText: { color: "#826E63", fontSize: 11, fontWeight: "900" }, rewardStatusTextUnlocked: { color: "#397353" }, rewardStatusSubtext: { color: "#826E63", fontSize: 9, marginTop: 2 }, weeklyCard: { backgroundColor: "#F8EAE0", borderRadius: 20, padding: 17 }, weeklyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, weeklyTitle: { color: "#2C201B", fontSize: 16, fontWeight: "800" }, weeklySubtext: { color: "#826E63", fontSize: 12, marginTop: 4 }, multiplierBadge: { width: 53, height: 53, borderRadius: 18, backgroundColor: "#E95122", justifyContent: "center", alignItems: "center" }, multiplierText: { color: "white", fontSize: 22, fontWeight: "900" }, weeklyPoints: { color: "#397353", fontWeight: "800", marginTop: 16 }, stepsRow: { flexDirection: "row", alignItems: "center", marginTop: 20 }, step: { width: 48, alignItems: "center" }, stepActive: { opacity: 1 }, stepNumber: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#CDB7AB", color: "#826E63", textAlign: "center", lineHeight: 28, fontWeight: "800", backgroundColor: "#FFF8F2" }, stepNumberActive: { backgroundColor: "#E95122", borderColor: "#E95122", color: "white" }, stepLabel: { color: "#826E63", fontSize: 11, fontWeight: "700", marginTop: 5 }, stepLine: { flex: 1, height: 2, backgroundColor: "#D5BDB0", marginBottom: 17 }, weeklyFootnote: { color: "#826E63", fontSize: 12, lineHeight: 17, marginTop: 16 }, simulateButton: { borderRadius: 16, borderWidth: 1.5, borderColor: "#E95122", padding: 14, alignItems: "center", marginTop: 14 }, simulateButtonText: { color: "#D74318", fontWeight: "800" }, simulateHint: { color: "#826E63", fontSize: 11, marginTop: 4 }, referralCard: { backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: "#EADBD2", borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center" }, referralIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: "#FFF0E9", alignItems: "center", justifyContent: "center", marginRight: 12 }, referralEmoji: { fontSize: 22 }, referralCopy: { flex: 1 }, referralTitle: { color: "#2C201B", fontWeight: "800" }, referralText: { color: "#826E63", fontSize: 12, marginTop: 4, lineHeight: 16 }, loyaltyLegal: { color: "#826E63", fontSize: 11, lineHeight: 16, marginTop: 18, textAlign: "center" },
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
});
