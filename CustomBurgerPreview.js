import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
const { PROTEINS, BREADS, CHEESES, SAUCES, CRUDITES, EXTRAS, initialBurger, priceCents, stockAvailable } = require('./custom-burger-preview');

const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const categories = [
  { id: 'protein', label: 'Viande' }, { id: 'bread', label: 'Pain' },
  { id: 'cheese', label: 'Fromage' }, { id: 'sauces', label: 'Sauces' },
  { id: 'crudites', label: 'Crudités' }, { id: 'extras', label: 'Suppléments' }
];
const choiceGroups = { protein: PROTEINS, bread: BREADS, cheese: CHEESES, sauces: SAUCES, crudites: CRUDITES, extras: EXTRAS };
const stockIdForExtra = {
  'second-steak': 'ingredient-second-steak', 'extra-poulet': 'dynamite', 'extra-canard': 'duck',
  'extra-agneau': 'atlas', 'extra-pork': 'pork', 'extra-hambagu': 'hambagu',
  'extra-galette': 'ingredient-potato-patty', 'extra-cheddar': 'ingredient-cheddar',
  'extra-mozzarella': 'ingredient-mozzarella', 'extra-raclette': 'ingredient-raclette',
  'extra-fourme': 'ingredient-fourme', bacon: 'ingredient-bacon', lard: 'ingredient-lard'
};

export default function CustomBurgerPreview({ catalog, onBack }) {
  const [selection, setSelection] = useState(initialBurger);
  const [category, setCategory] = useState('protein');
  const protein = PROTEINS.find((option) => option.id === selection.protein);
  const choose = (option) => {
    if (category === 'protein') {
      setSelection((current) => ({ ...current, protein: option.id, bread: option.recipe.bread, cheese: option.recipe.cheese, sauces: [option.recipe.sauce], halal: option.pork ? false : current.halal, extras: current.extras.filter((id) => !((current.halal && EXTRAS.find((extra) => extra.id === id)?.pork))) }));
      return;
    }
    if (['bread', 'cheese'].includes(category)) { setSelection((current) => ({ ...current, [category]: option.id })); return; }
    setSelection((current) => {
      const values = current[category];
      return { ...current, [category]: values.includes(option.id) ? values.filter((id) => id !== option.id) : [...values, option.id] };
    });
  };
  const toggleHalal = () => setSelection((current) => {
    const halal = !current.halal;
    return { ...current, halal, extras: halal ? current.extras.filter((id) => !EXTRAS.find((option) => option.id === id)?.pork) : current.extras };
  });
  const selected = (id) => Array.isArray(selection[category]) ? selection[category].includes(id) : selection[category] === id;
  const extraPrice = (option) => option.cents || 0;
  const priceFor = (option) => {
    if (category === 'protein') return `Base + ${euro(option.cents)}`;
    if (category === 'bread' && option.id === 'charbon' && ['canard', 'agneau', 'pork', 'hambagu'].includes(selection.protein)) return 'Inclus avec cette viande';
    if (category === 'cheese' && option.id === 'chevre' && selection.protein === 'agneau') return 'Inclus avec l’agneau';
    if (category === 'sauces') return selected(option.id) && selection.sauces.indexOf(option.id) >= 1 ? '+0,50 €' : selection.sauces.length >= 1 && !selected(option.id) ? '+0,50 € si ajouté' : 'Une sauce incluse';
    if (category === 'crudites') return selected(option.id) && selection.crudites.indexOf(option.id) >= 5 ? '+0,50 €' : selection.crudites.length >= 5 && !selected(option.id) ? '+0,50 € si ajoutée' : 'Cinq incluses';
    return option.cents ? `+ ${euro(extraPrice(option))}` : 'Inclus';
  };
  const isBlocked = (option) => {
    if (selection.halal && option.pork) return true;
    if (category === 'protein' && !stockAvailable(catalog, option.productId)) return true;
    if (category === 'extras' && !stockAvailable(catalog, stockIdForExtra[option.id])) return true;
    return false;
  };
  const price = priceCents(selection);
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
    <Text style={s.eyebrow}>ESSAI DANS LA WEB APP</Text>
    <Text style={s.title}>Compose ton burger</Text>
    <Text style={s.intro}>Choisis chaque ingrédient. Le prix évolue immédiatement ; tu peux revenir à la carte à tout moment.</Text>
    <View style={s.priceCard}><Text style={s.priceLabel}>Ton burger</Text><Text accessibilityLiveRegion="polite" style={s.price}>{euro(price)}</Text><Text style={s.priceHint}>{protein?.reference ? `Avec la recette de départ : même prix que « ${protein.reference} » seul.` : 'Base 6,90 € + protéine et suppléments choisis.'}</Text></View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selection.halal, disabled: !!protein?.pork }} disabled={!!protein?.pork} onPress={toggleHalal} style={[s.halal, protein?.pork && s.disabled]}><Text style={s.halalCheck}>{selection.halal ? '☑' : '□'}</Text><Text style={s.halalText}>Version halal · les ingrédients au porc sont désactivés</Text></Pressable>
    <View style={s.tabs}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={[s.tab, category === item.id && s.tabActive]}><Text style={[s.tabText, category === item.id && s.tabTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={s.section}>{categories.find((item) => item.id === category)?.label}</Text>
    <Text style={s.helper}>{category === 'protein' ? 'Choisis une protéine obligatoire.' : category === 'crudites' ? 'Cinq crudités comprises, puis +0,50 € chacune.' : category === 'sauces' ? 'Une sauce comprise, puis +0,50 € chacune.' : category === 'bread' ? 'Le pain au charbon végétal ajoute 1 €, sauf quand il fait partie de la recette de cette viande.' : 'Sélectionne ce que tu veux ajouter.'}</Text>
    {choiceGroups[category].map((option) => {
      const blocked = isBlocked(option);
      return <Pressable key={option.id} accessibilityRole={['sauces', 'crudites', 'extras'].includes(category) ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected(option.id), disabled: blocked }} disabled={blocked} onPress={() => choose(option)} style={[s.option, selected(option.id) && s.optionSelected, blocked && s.disabled]}><View style={s.optionLeft}><Text style={s.check}>{selected(option.id) ? '✓' : ''}</Text><View style={s.optionCopy}><Text style={s.optionLabel}>{option.label}{option.pork ? ' · porc' : ''}</Text>{blocked && <Text style={s.blockedText}>{selection.halal && option.pork ? 'Non halal' : 'Actuellement indisponible'}</Text>}</View></View><Text style={s.optionPrice}>{priceFor(option)}</Text></Pressable>;
    })}
    <View style={s.bottom}><Text style={s.bottomTitle}>Prix de ton burger : {euro(price)}</Text><Text style={s.bottomCopy}>Aucune commande ni paiement ne part de cet écran d’essai. Les menus et les burgers habituels restent commandables dans la carte.</Text></View>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F3EB' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 54 },
  back: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#D9EEE5', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  backText: { color: '#315B4B', fontSize: 30, lineHeight: 34, fontWeight: '800' },
  eyebrow: { color: '#315B4B', fontSize: 12, letterSpacing: 1.2, fontWeight: '900' },
  title: { color: '#263D34', fontSize: 32, fontWeight: '900', marginTop: 7 },
  intro: { color: '#594D45', fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 20 },
  priceCard: { backgroundColor: '#D9EEE5', borderRadius: 20, padding: 20, marginBottom: 12 },
  priceLabel: { color: '#315B4B', fontSize: 15, fontWeight: '700' },
  price: { color: '#173F34', fontSize: 34, fontWeight: '900', marginTop: 3 },
  priceHint: { color: '#315B4B', fontSize: 13, lineHeight: 18, marginTop: 6 },
  halal: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 13 },
  halalCheck: { color: '#315B4B', fontSize: 24 },
  halalText: { color: '#315B4B', fontSize: 14, fontWeight: '700', flex: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tab: { borderRadius: 12, borderWidth: 1, borderColor: '#BCD8CC', paddingHorizontal: 13, paddingVertical: 11, backgroundColor: '#FFFDF8' },
  tabActive: { backgroundColor: '#315B4B', borderColor: '#315B4B' },
  tabText: { color: '#315B4B', fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: '#FFFDF8' },
  section: { color: '#263D34', fontSize: 22, fontWeight: '900' },
  helper: { color: '#67574D', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 11 },
  option: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E3D9CD', borderRadius: 15, padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionSelected: { borderColor: '#315B4B', backgroundColor: '#EEF7F1' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  check: { width: 22, height: 22, borderWidth: 1, borderColor: '#315B4B', borderRadius: 7, color: '#315B4B', textAlign: 'center', lineHeight: 20, fontWeight: '900' },
  optionCopy: { flex: 1 },
  optionLabel: { color: '#2D342F', fontSize: 15, fontWeight: '800' },
  blockedText: { color: '#A4442D', fontSize: 12, marginTop: 3 },
  optionPrice: { color: '#315B4B', fontSize: 13, fontWeight: '800', textAlign: 'right', maxWidth: 135 },
  disabled: { opacity: 0.5 },
  bottom: { paddingVertical: 19 },
  bottomTitle: { color: '#263D34', fontSize: 19, fontWeight: '900' },
  bottomCopy: { color: '#67574D', fontSize: 13, lineHeight: 19, marginTop: 7 }
});
