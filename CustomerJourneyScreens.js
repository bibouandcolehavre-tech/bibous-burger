import { createContext, useState } from 'react';
import { Image, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { AnimatedOrderAction } from './ExperienceActions';
import AutomaticOfferNotice from './AutomaticOfferNotice';
const { CUSTOMER_CATEGORIES, loyaltyMilestoneProgress } = require('./customer-journey');
const { PARTNERS } = require('./partners');
const { DELIVERY_PRICING, DELIVERY_MAX_KM } = require('./delivery-pricing');
const logo = require('./assets/bibous-official-wordmark-preview.png');
const money = value => Number(value).toFixed(2).replace('.', ',') + ' €';
// Stable web-only styling hooks, rather than generated React Native class names.
const webPart = name => Platform.OS === 'web' ? { bibou: name } : undefined;

function Action({ label, onPress, secondary = false, disabled = false }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action, secondary && s.secondary, disabled && s.disabled]}><Text style={[s.actionText, secondary && s.secondaryText]}>{label}</Text></Pressable>;
}
function Tile({ label, detail, icon, onPress, wide = false, selected = false, partner = false, delivery = false }) {
  return <Pressable dataSet={webPart(wide ? 'wide-tile' : 'tile')} accessibilityRole="button" onPress={onPress} style={[s.tile, partner && s.partnerTile, delivery && s.deliveryTile, selected && s.selectedTile, wide && s.wide]}><Text style={s.tileIcon}>{icon}</Text><Text dataSet={webPart('tile-label')} style={[s.tileLabel, (wide || selected) && s.wideText]}>{label}</Text><Text style={[s.tileDetail, (wide || selected) && s.wideText]}>{detail}</Text></Pressable>;
}
export const CustomerJourneyLegacyContext = createContext(false);
function NavIcon({ name, color = '#315B4B' }) {
  return <Svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {name === 'home' && <><Path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><Path d="M9 21v-8h6v8" /></>}
    {name === 'card' && <><Path d="M4 3v5a2 2 0 0 0 4 0V3M6 3v18M20 3c-4 1-5 5-5 8h5v10M20 3v8" /></>}
    {name === 'orders' && <><Path d="M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><Path d="M8 8h8M8 12h8M8 16h4" /></>}
    {name === 'account' && <><Circle cx={12} cy={8} r={4} /><Path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}
    {name === 'back' && <Path d="m12 5-7 7 7 7M5 12h14" />}
  </Svg>;
}
function Satisfaction({ product }) {
  const score = product.satisfaction;
  return <Text style={s.small}>{score?.count > 0 ? `${score.percent} % de satisfaction · ${score.count} avis vérifié${score.count > 1 ? 's' : ''}` : 'Pas encore de note client'}</Text>;
}
function NaanPhoto({ source, name }) {
  const [imageWidth, setImageWidth] = useState(0);
  return <Image source={source} resizeMode="contain" accessibilityLabel={name}
    onLayout={({ nativeEvent }) => { const width = nativeEvent.layout.width; if (width > 0) setImageWidth(previous => previous === width ? previous : width); }}
    style={[s.naanImage, { height: imageWidth * 4 / 3 }]} />;
}
export function CustomerJourneyFrame({ title, eyebrow, onBack, onHome, onCard, onOrders, onAccount, onCart, cartCount = 0, children, embedded = false, currentNav = 'home' }) {
  return <SafeAreaView dataSet={webPart('journey')} style={s.safe}>
    <View dataSet={webPart('header')} style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={onBack || onHome} style={s.headerButton}><NavIcon name="back" color="#FFFDF8" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Accueil Bibou" onPress={onHome}><Image source={logo} resizeMode="contain" style={s.logo} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Mon panier" onPress={onCart} style={s.headerButton}><Text style={s.white}>🛍️ {cartCount || ''}</Text></Pressable></View>
    {embedded ? <View dataSet={webPart('embedded')} style={s.embedded}>{children}</View> : <ScrollView dataSet={webPart('journey-scroll')} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}><View dataSet={webPart('content')} style={s.content}>{eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}{title && <Text dataSet={webPart('title')} accessibilityRole="header" style={s.title}>{title}</Text>}{children}</View></ScrollView>}
    <View dataSet={webPart('navigation')} style={s.nav}>{[['home', 'Accueil', onHome], ['card', 'La carte', onCard], ['orders', 'Commandes', onOrders], ['account', 'Mon compte', onAccount]].map(([icon, label, callback]) => <Pressable dataSet={webPart('navigation-button')} key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: currentNav === icon }} onPress={callback} style={[s.navButton, currentNav === icon && s.navButtonSelected]}><NavIcon name={icon} /><Text style={[s.navLabel, currentNav === icon && s.navLabelSelected]}>{label}</Text></Pressable>)}</View>
  </SafeAreaView>;
}
export function CustomerLoyaltyStrip({ signedIn, points, rewards, onLogin, onRewards }) {
  if (!signedIn) return <Pressable accessibilityRole="button" onPress={onLogin} style={s.loyalty}><Text style={s.gift}>🎁</Text><View style={s.giftCopy}><Text style={s.giftTitle}>Crée ton compte : −10 %</Text><Text style={s.body}>sur ta première commande</Text><Text style={s.small}>Retrouve tes points et tes avantages.</Text></View></Pressable>;
  const p = loyaltyMilestoneProgress(points, rewards);
  return <Pressable accessibilityRole="button" accessibilityLabel={'Club Bibou : ' + p.points + ' points. ' + (p.next ? 'Il te manque ' + (p.next.points - p.points) + ' points pour ' + p.next.title : 'Les cinq paliers sont débloqués')} onPress={onRewards} style={[s.loyalty, s.loyaltyColumn]}><Text style={s.giftTitle}>{p.points.toLocaleString('fr-FR')} points · Club Bibou</Text><View style={s.stages}>{p.stages.map(r => <View key={r.id} style={s.stage}><Text>{r.emoji}</Text><View style={s.track}><View style={[s.fill, { width: (r.fraction * 100) + '%' }]} /></View><Text style={s.small}>{r.points.toLocaleString('fr-FR')}</Text></View>)}</View><Text style={s.body}>{p.next ? 'Il te manque ' + (p.next.points - p.points).toLocaleString('fr-FR') + ' points pour débloquer : ' + p.next.title.toLowerCase() + '.' : 'Tu as débloqué les cinq paliers !'}</Text></Pressable>;
}
export function CustomerJourneyHome({ frame, loyalty, customer, onOrder, onReserve, onClub, onPlus, onNews, onPartners, onReferral, onReplayOpening, onResumePayment, pendingPayment, reviews, stockMessage, news, contest, reviewTools }) {
  return <CustomerJourneyFrame {...frame} title="Une petite faim ?" eyebrow={customer?.name ? 'Bonjour ' + customer.name.split(' ')[0] : 'Bienvenue chez Bibou’s Burgers'}>
    <Text style={s.body}>Retrait au restaurant ou livraison chez toi.</Text><AnimatedOrderAction onPress={onOrder} />
    {pendingPayment && <View style={s.panel}><Text style={s.body}>Une tentative de paiement reste à vérifier. Tu peux consulter la carte librement.</Text><Action label="Retrouver ma tentative" onPress={onResumePayment} secondary /></View>}
    <View style={s.shortcutRow}><View style={s.shortcut}><Action label="Mes commandes" onPress={frame.onOrders} secondary /></View><View style={s.shortcut}><Action label="Réserver une table" onPress={onReserve} secondary /></View></View>
    {reviewTools}{news}{contest}
    <View style={s.panel}>{[['Club Bibou · points et roue', onClub], ['Parrainer un proche', onReferral], ['Bibou Plus', onPlus], ['Actualités & réseaux', onNews], ['Nos partenaires', onPartners], ['Mon compte', frame.onAccount]].map(([label, callback]) => <Pressable key={label} accessibilityRole="button" onPress={callback} style={s.listLink}><Text style={s.listLabel}>{label}</Text><Text style={s.listLabel}>›</Text></Pressable>)}</View>
    {loyalty}{stockMessage ? <Text style={s.small}>{stockMessage}</Text> : null}{reviews}
    <Action label="Revoir la petite moto d’ouverture" onPress={onReplayOpening} secondary />
  </CustomerJourneyFrame>;
}
export function CustomerServiceScreen({ frame, onSelect, onReserve, loyalty }) {
  return <CustomerJourneyFrame {...frame} title="Comment profiter de Bibou ?">{loyalty}<View style={s.grid}><Tile label="Click & collect" detail="Ton burger t’attend chez Bibou" icon="🛍️" onPress={() => onSelect('pickup')} /><Tile label="Livraison" detail="Le goût de Bibou vient jusqu’à toi" icon="🛵" onPress={() => onSelect('delivery')} delivery /></View><Text style={s.small}>Livraison jusqu’à {DELIVERY_MAX_KM} km par la route. Plus de 5 km et jusqu’à {DELIVERY_MAX_KM} km : {money(DELIVERY_PRICING[DELIVERY_PRICING.length - 1].price)}.</Text><Action label="Réserver une table" onPress={onReserve} secondary /><Text style={s.small}>Le dimanche soir : click & collect et livraison uniquement.</Text></CustomerJourneyFrame>;
}
export function CustomerCategoriesScreen({ frame, loyalty, showNaans, onCategory, onCustom, service, reservation }) {
  return <CustomerJourneyFrame {...frame} title="Qu’est-ce qui te fait envie ?" eyebrow={reservation ? 'Pour ta table' : service === 'delivery' ? 'En livraison' : 'Click & collect'}>{loyalty}<View style={s.grid}><Tile label="Compose ton burger" detail="Ta protéine, ton pain, ton fromage : à toi de choisir !" icon="👨‍🍳" onPress={onCustom} wide />{CUSTOMER_CATEGORIES.filter(c => c.id !== 'naans' || showNaans).map(c => <Tile key={c.id} label={c.label} detail={c.detail} icon={c.icon} onPress={() => onCategory(c.id)} />)}</View>{reservation && <View style={s.panel}><Text style={s.body}>Repas pour ta table · {reservation.guests} personne(s) · {reservation.dayLabel} à {reservation.slot}</Text></View>}</CustomerJourneyFrame>;
}
export function CustomerCatalogScreen({ frame, loyalty, category, products, onProduct, onQuickAdd, stockMessage, onCustom, onCategory, showNaans, service, onService, contest }) {
  const c = CUSTOMER_CATEGORIES.find(c => c.id === category);
  return <CustomerJourneyFrame {...frame}>{loyalty}<Text accessibilityRole="header" style={s.title}>Qu’est-ce qui te fait envie ?</Text>
    {onService && <View style={s.shortcutRow}>{[['pickup', 'Retrait'], ['delivery', 'Livraison']].map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: service === id }} onPress={() => onService(id)} style={[s.serviceChoice, service === id && s.serviceChosen]}><Text style={[s.serviceText, service === id && s.serviceChosenText]}>{label}</Text></Pressable>)}</View>}
    {onCustom && <Pressable accessibilityRole="button" onPress={onCustom} style={s.compose}><Text style={s.productTitle}>👨‍🍳 Compose ton burger</Text><Text style={s.small}>Ta protéine, ton pain, ton fromage : à toi de choisir ! →</Text></Pressable>}
    {onCategory && <View style={s.categories}>{CUSTOMER_CATEGORIES.filter(item => item.id !== 'naans' || showNaans).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: category === item.id }} onPress={() => onCategory(item.id)} style={[s.category, category === item.id && s.serviceChosen]}><Text style={[s.serviceText, category === item.id && s.serviceChosenText]}>{item.label}</Text></Pressable>)}</View>}
    {contest}{stockMessage ? <Text style={s.small}>{stockMessage}</Text> : null}<Text style={s.productTitle}>{c?.label || 'La carte'}</Text><View dataSet={webPart('catalogue')}>{products.map(p => <View key={p.id} style={[s.product, p.kind !== 'naan' && s.horizontalProduct]}>
    {p.image && (p.kind === 'naan' ? <NaanPhoto source={p.image} name={p.name} /> : <Image source={p.image} resizeMode="contain" style={s.productImage} accessibilityLabel={p.name} />)}
    <View style={s.productCopy}>
    <Text style={s.productTitle}>{p.isMenu ? 'Menu · ' : ''}{p.name}</Text>
    {p.isMenu && <Text style={s.body}>Burger + frites + boisson</Text>}
    {p.kind === 'naan' && <Text style={s.body}>Uniquement le midi · seul {money(p.price)} · menu {money(p.menuPrice)}<Text>{'\n'}Naan + boisson + frites OU dessert</Text></Text>}
    <Text style={s.small}>{p.description}</Text><AutomaticOfferNotice product={p} /><Satisfaction product={p} />
    <View style={s.row}><Text style={s.price}>{p.soldOut ? 'Épuisé' : money(p.price)}</Text><Action label="Choisir" disabled={p.soldOut} onPress={() => p.isMenu || ['naan', 'solo', 'duo'].includes(p.kind) || category === 'burgers' ? onProduct(p) : onQuickAdd(p)} /></View>
    </View>
  </View>)}</View>{!products.length && <Text style={s.body}>Aucun article disponible dans cette rubrique pour le moment.</Text>}</CustomerJourneyFrame>;
}
export function CustomerPartnersScreen({ frame }) {
  return <CustomerJourneyFrame {...frame} title="Nos partenaires" eyebrow="Le Havre · nos liens">{PARTNERS.map(p => <View key={p.id} style={s.panel}><Text style={s.productTitle}>{p.name}</Text><Text style={s.body}>{p.detail}</Text><Pressable accessibilityRole="link" onPress={() => Linking.openURL(p.url)} style={s.action}><Text style={s.actionText}>Découvrir son site ↗</Text></Pressable></View>)}</CustomerJourneyFrame>;
}
const s = StyleSheet.create({
  shortcutRow: { flexDirection: 'row', gap: 9, marginVertical: 6 }, shortcut: { flex: 1 }, listLink: { minHeight: 52, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#E3E4D9' }, listLabel: { color: '#315B4B', fontSize: 15, fontWeight: '700', flexShrink: 1 }, compose: { backgroundColor: '#FFFDF8', borderColor: '#315B4B', borderWidth: 1, padding: 15, borderRadius: 15, marginVertical: 13 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 8 }, category: { minHeight: 44, borderRadius: 22, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: '#DCEBE2' }, serviceChoice: { flex: 1, minHeight: 48, padding: 12, backgroundColor: '#DCEBE2', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, serviceChosen: { backgroundColor: '#315B4B' }, serviceText: { color: '#315B4B', fontWeight: '700', fontSize: 14 }, serviceChosenText: { color: '#FFFDF8' },
  safe: { flex: 1, backgroundColor: '#FBF3E6' }, embedded: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center' }, scroll: { flexGrow: 1, paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#315B4B', padding: 12, gap: 8 }, headerButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' }, white: { color: '#FFFDF8', fontSize: 20 }, logo: { width: 142, height: 59 },
  content: { width: '100%', maxWidth: 430, alignSelf: 'center', padding: 18 }, eyebrow: { color: '#315B4B', fontSize: 13, marginBottom: 6 }, title: { color: '#243B31', fontSize: 27, fontWeight: '700', marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 }, tile: { width: '47%', flexGrow: 1, minHeight: 116, paddingVertical: 18, paddingHorizontal: 14, backgroundColor: '#FFFDF8', borderRadius: 18, borderWidth: 1, borderColor: '#D9DCCD' }, selectedTile: { backgroundColor: '#315B4B', borderColor: '#315B4B' }, partnerTile: { backgroundColor: '#EDF4E8' }, deliveryTile: { backgroundColor: '#FFF0E9', borderColor: '#EDB59F' }, wide: { width: '100%', backgroundColor: '#D74318', borderColor: '#D74318', minHeight: 116 }, wideText: { color: '#FFFDF8' }, tileIcon: { fontSize: 30, marginBottom: 10 }, tileLabel: { fontSize: 16, color: '#243B31', fontWeight: '700' }, tileDetail: { color: '#5A6C60', fontSize: 12, marginTop: 6 },
  loyalty: { flexDirection: 'row', backgroundColor: '#DCEBE2', borderRadius: 18, padding: 15, gap: 12, marginBottom: 14 }, gift: { fontSize: 32 }, giftCopy: { flex: 1 }, giftTitle: { color: '#315B4B', fontSize: 18, fontWeight: '700' }, loyaltyColumn: { flexDirection: 'column' }, stages: { flexDirection: 'row', gap: 7 }, stage: { flex: 1, alignItems: 'center', gap: 6 }, track: { width: '100%', height: 6, borderRadius: 3, backgroundColor: '#BDD3C5', overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#315B4B' },
  body: { color: '#243B31', fontSize: 15, lineHeight: 22, marginVertical: 5 }, small: { color: '#5A6C60', fontSize: 13, lineHeight: 20, marginVertical: 5 },
  panel: { backgroundColor: '#FFFDF8', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#D9DCCD', marginVertical: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, product: { backgroundColor: '#FFFDF8', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9DCCD', marginVertical: 8 }, horizontalProduct: { flexDirection: 'row', alignItems: 'center', gap: 13 }, productCopy: { flex: 1, minWidth: 0 }, productImage: { width: 108, height: 108, backgroundColor: '#FFFDF8' }, naanImage: { width: '100%', height: undefined, aspectRatio: 3 / 4, marginBottom: 12 }, productTitle: { color: '#243B31', fontWeight: '700', fontSize: 15 }, price: { color: '#315B4B', fontSize: 18, fontWeight: '700' },
  action: { minHeight: 48, backgroundColor: '#315B4B', borderRadius: 14, padding: 13, justifyContent: 'center', alignItems: 'center', marginVertical: 6 }, actionText: { color: '#FFFDF8', fontSize: 15, fontWeight: '700', textAlign: 'center' }, secondary: { backgroundColor: '#DCEBE2' }, secondaryText: { color: '#315B4B' }, disabled: { opacity: .5 },
  nav: { flexDirection: 'row', width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 7, backgroundColor: '#FFFDF8', borderTopWidth: 1, borderTopColor: '#D9DCCD' }, navButton: { flex: 1, minWidth: 0, minHeight: 68, paddingVertical: 9, paddingHorizontal: 3, borderWidth: 1, borderColor: '#D9DCCD', borderRadius: 13, backgroundColor: '#FBF3E6', alignItems: 'center', justifyContent: 'center', gap: 6 }, navButtonSelected: { backgroundColor: '#DCEBE2', borderColor: '#315B4B' }, navLabel: { fontSize: 11, lineHeight: 15, color: '#315B4B', textAlign: 'center', flexShrink: 1 }, navLabelSelected: { fontWeight: '700' },
});
