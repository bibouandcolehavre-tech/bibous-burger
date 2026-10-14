import { useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
const { BASE_CENTS, PROTEINS, BREADS, CHEESES, SAUCES, CRUDITES, EXTRAS, EXTRA_STOCK_IDS, initialBurger, priceCents, pricedOptions, selectionEntries, stockAvailable } = require('./custom-burger-preview');

const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const steps = ['La garniture principale', 'Pain et fromage', 'Sauce', 'Crudités', 'Suppléments', 'Ton burger'];
const signatureBreadIncluded = (protein) => ['canard', 'agneau', 'pork', 'hambagu'].includes(protein);
const nameOf = (options, id) => options.find((option) => option.id === id)?.label || '';

export default function CustomBurgerPreview({ catalog, onBack, onAdd }) {
  const [selection, setSelection] = useState(initialBurger);
  const [step, setStep] = useState(0);
  const scrollRef = useRef(null);
  const protein = PROTEINS.find((option) => option.id === selection.protein);
  const price = priceCents(selection);
  const productStatus = catalog?.products?.find((product) => product.id === 'custom-burger');
  const entries = selectionEntries(selection);
  const unavailableChoice = entries.some(({ groupId, id }) => catalog?.options?.[`${groupId}:${id}`] === false)
    || !stockAvailable(catalog, protein?.productId)
    || selection.extras.some((id) => !stockAvailable(catalog, EXTRA_STOCK_IDS[id]));
  const canOrder = Boolean(productStatus?.available) && !unavailableChoice;

  const goTo = (nextStep) => {
    setStep(nextStep);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };
  const choose = (group, option) => {
    if (group === 'protein') {
      setSelection((current) => ({
        ...current, protein: option.id, bread: option.recipe.bread, cheese: option.recipe.cheese,
        sauces: [option.recipe.sauce], extras: current.extras.filter((id) => !((current.halal && EXTRAS.find((extra) => extra.id === id)?.pork)))
      }));
      return;
    }
    if (group === 'bread' || group === 'cheese') {
      setSelection((current) => ({ ...current, [group]: option.id }));
      return;
    }
    setSelection((current) => ({
      ...current,
      [group]: current[group].includes(option.id)
        ? current[group].filter((id) => id !== option.id)
        : [...current[group], option.id]
    }));
  };
  const toggleHalal = () => {
    setSelection((current) => {
      const halal = !current.halal;
      return {
        ...current, halal,
        extras: halal ? current.extras.filter((id) => !EXTRAS.find((option) => option.id === id)?.pork) : current.extras
      };
    });
  };
  const blocked = (group, option) => {
    if (selection.halal && option.pork) return true;
    const stockGroup = { protein: 'custom-protein', cheese: 'custom-cheese', extras: 'custom-extra' }[group];
    if (stockGroup && catalog?.options?.[`${stockGroup}:${option.id}`] === false) return true;
    if (group === 'protein' && !stockAvailable(catalog, option.productId)) return true;
    if (group === 'extras' && !stockAvailable(catalog, EXTRA_STOCK_IDS[option.id])) return true;
    return false;
  };
  const optionPrice = (group, option, selected) => {
    if (group === 'protein') return `Dès ${euro(BASE_CENTS + option.cents)}`;
    if (group === 'bread') return option.id === 'charbon' && !signatureBreadIncluded(selection.protein) ? '+1,00 €' : 'Inclus';
    if (group === 'cheese') return option.id === 'chevre' && selection.protein === 'agneau' ? 'Inclus' : option.cents ? `+${euro(option.cents)}` : 'Inclus';
    if (group === 'sauces') return selected ? selection.sauces.indexOf(option.id) ? '+0,50 €' : 'Incluse' : selection.sauces.length ? '+0,50 €' : 'Incluse';
    if (group === 'crudites') return selected ? selection.crudites.indexOf(option.id) >= 5 ? '+0,50 €' : 'Incluse' : selection.crudites.length >= 5 ? '+0,50 €' : 'Incluse';
    return `+${euro(option.cents)}`;
  };
  const renderOption = (group, option) => {
    const selected = Array.isArray(selection[group]) ? selection[group].includes(option.id) : selection[group] === option.id;
    const disabled = blocked(group, option);
    return <Pressable key={option.id} accessibilityRole={['sauces', 'crudites', 'extras'].includes(group) ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => choose(group, option)} style={[s.option, selected && s.optionSelected, disabled && s.disabled]}>
      <View style={s.optionCopy}>
        <Text style={s.optionName}>{option.label}</Text>
        {disabled ? <Text style={s.optionNote}>{selection.halal && option.pork ? 'Contient du porc · non halal' : 'Actuellement indisponible'}</Text> : null}
      </View>
      <Text style={s.optionPrice}>{optionPrice(group, option, selected)}</Text>
      <Text style={s.check} accessibilityElementsHidden>{selected ? '✓' : ''}</Text>
    </Pressable>;
  };
  const renderList = (group, options) => options.map((option) => renderOption(group, option));
  const addBurger = () => {
    if (!canOrder) return;
    onAdd({
      product: { id: 'custom-burger', name: 'Burger à composer', price: BASE_CENTS / 100, emoji: '🍔' },
      total: price / 100,
      options: pricedOptions(selection).map((option) => option.label),
      selections: entries
    });
  };

  return <SafeAreaView style={s.safe}><ScrollView ref={scrollRef} contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Retour à la carte" onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
    <Text style={s.eyebrow}>TON BURGER, TES CHOIX</Text>
    <Text style={s.title}>Compose ton burger</Text>
    <View style={s.progressLabels}><Text style={s.progressText}>Étape {step + 1} sur 6</Text><Text style={s.progressText}>{steps[step]}</Text></View>
    <View style={s.progressTrack}><View style={[s.progressFill, { width: `${((step + 1) / 6) * 100}%` }]} /></View>

    {step === 0 && <>
      <Text style={s.question}>Que veux-tu dans ton burger ?</Text>
      <Text style={s.hint}>La base comprend le pain, le fromage, une sauce et jusqu’à cinq crudités. Choisis maintenant la garniture principale.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selection.halal, disabled: !!protein?.pork }} disabled={!!protein?.pork} onPress={toggleHalal} style={[s.halal, protein?.pork && s.disabled]}><Text style={s.halalCheck}>{selection.halal ? '☑' : '□'}</Text><Text style={s.halalText}>Version halal : aucun ingrédient au porc</Text></Pressable>
      {renderList('protein', PROTEINS)}
    </>}
    {step === 1 && <>
      <Text style={s.question}>Ton pain et ton fromage ?</Text><Text style={s.hint}>Choisis-en un de chaque. Le prix est indiqué à côté.</Text>
      <Text style={s.section}>Le pain</Text>{renderList('bread', BREADS)}
      <Text style={s.section}>Le fromage</Text>{renderList('cheese', CHEESES)}
    </>}
    {step === 2 && <>
      <Text style={s.question}>Quelle sauce ?</Text><Text style={s.hint}>Une sauce est comprise. Tu peux en ajouter d’autres à +0,50 € chacune.</Text>
      {renderList('sauces', SAUCES)}
    </>}
    {step === 3 && <>
      <Text style={s.question}>Quelles crudités ?</Text><Text style={s.hint}>Choisis jusqu’à cinq crudités comprises. Après, c’est +0,50 € chacune.</Text>
      {renderList('crudites', CRUDITES)}
    </>}
    {step === 4 && <>
      <Text style={s.question}>Un petit plus ?</Text><Text style={s.hint}>C’est facultatif : tu peux passer cette étape sans rien ajouter.</Text>
      <Text style={s.section}>Encore de la viande</Text>{renderList('extras', EXTRAS.slice(0, 7))}
      <Text style={s.section}>Encore du fromage</Text>{renderList('extras', EXTRAS.slice(7, 13))}
      <Text style={s.section}>Bacon et lard</Text>{renderList('extras', EXTRAS.slice(13))}
    </>}
    {step === 5 && <>
      <Text style={s.question}>Voilà ton burger !</Text><Text style={s.hint}>Vérifie ta recette. Tu peux revenir en arrière pour la changer.</Text>
      <View style={s.review}>
        <ReviewRow label="Garniture principale" value={protein?.label} />
        <ReviewRow label="Pain" value={nameOf(BREADS, selection.bread)} />
        <ReviewRow label="Fromage" value={nameOf(CHEESES, selection.cheese)} />
        <ReviewRow label="Sauce" value={selection.sauces.map((id) => nameOf(SAUCES, id)).join(', ') || 'Sans sauce'} />
        <ReviewRow label="Crudités" value={selection.crudites.map((id) => nameOf(CRUDITES, id)).join(', ') || 'Sans crudités'} />
        <ReviewRow label="Suppléments" value={selection.extras.map((id) => nameOf(EXTRAS, id)).join(', ') || 'Aucun'} />
      </View>
      {selection.halal && <Text style={s.reviewHalal}>Version halal sélectionnée · aucun ingrédient au porc</Text>}
      {!canOrder && <Text style={s.unavailable}>{!productStatus?.available ? 'Ce burger n’est pas disponible pour le moment.' : 'Un ingrédient choisi est momentanément indisponible. Modifie ta recette.'}</Text>}
    </>}

    <View style={s.bottom}>
      <View style={s.totalRow}><Text style={s.totalLabel}>Ton burger</Text><Text accessibilityLiveRegion="polite" style={s.totalPrice}>{euro(price)}</Text></View>
      <View style={s.actions}><Pressable accessibilityRole="button" disabled={step === 0} onPress={() => goTo(step - 1)} style={[s.previous, step === 0 && s.disabled]}><Text style={s.previousText}>Retour</Text></Pressable><Pressable accessibilityRole="button" disabled={step === 5 && !canOrder} onPress={() => step === 5 ? addBurger() : goTo(step + 1)} style={[s.next, step === 5 && !canOrder && s.disabled]}><Text style={s.nextText}>{step === 5 ? 'Ajouter au panier' : step === 4 ? 'Voir mon burger' : 'Continuer'}</Text></Pressable></View>
    </View>
  </ScrollView></SafeAreaView>;
}

function ReviewRow({ label, value }) {
  return <View style={s.reviewRow}><Text style={s.reviewLabel}>{label}</Text><Text style={s.reviewValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F3EB' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 54 },
  back: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#D9EEE5', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  backText: { color: '#315B4B', fontSize: 30, lineHeight: 34, fontWeight: '800' },
  eyebrow: { color: '#B66E52', fontSize: 12, letterSpacing: 1.2, fontWeight: '900' },
  title: { color: '#263D34', fontSize: 32, fontWeight: '900', marginTop: 7, marginBottom: 20 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  progressText: { color: '#315B4B', fontSize: 14, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 6, backgroundColor: '#DEDAD0', overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: '#315B4B', borderRadius: 6 },
  question: { color: '#263D34', fontSize: 24, fontWeight: '900', marginTop: 23 },
  hint: { color: '#594D45', fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 17 },
  halal: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, backgroundColor: '#E7EFE8', borderRadius: 12, marginBottom: 14 },
  halalCheck: { color: '#315B4B', fontSize: 23 },
  halalText: { color: '#315B4B', fontSize: 14, fontWeight: '800', flex: 1 },
  section: { color: '#315B4B', fontSize: 18, fontWeight: '900', marginTop: 17, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 59, backgroundColor: '#FFFDF8', borderWidth: 1.5, borderColor: '#D9D0C5', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  optionSelected: { backgroundColor: '#D9EEE5', borderColor: '#315B4B' },
  optionCopy: { flex: 1 },
  optionName: { color: '#263D34', fontSize: 15, fontWeight: '800' },
  optionNote: { color: '#A4442D', fontSize: 12, lineHeight: 17, marginTop: 3 },
  optionPrice: { color: '#315B4B', fontSize: 14, fontWeight: '900', textAlign: 'right', maxWidth: 105 },
  check: { color: '#315B4B', fontSize: 21, fontWeight: '900', width: 20, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  review: { marginTop: 3 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#DDD5C8' },
  reviewLabel: { color: '#5A5148', fontSize: 14, flex: 1 },
  reviewValue: { color: '#263D34', fontSize: 14, fontWeight: '800', flex: 1.7, textAlign: 'right' },
  reviewHalal: { color: '#315B4B', backgroundColor: '#D9EEE5', borderRadius: 12, padding: 12, marginTop: 16, fontSize: 13, fontWeight: '700' },
  unavailable: { color: '#A4442D', fontSize: 13, marginTop: 14 },
  bottom: { borderTopWidth: 1, borderTopColor: '#DDD5C8', paddingTop: 17, marginTop: 24 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  totalLabel: { color: '#263D34', fontSize: 17, fontWeight: '800' },
  totalPrice: { color: '#263D34', fontSize: 24, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10 },
  previous: { width: 100, minHeight: 51, borderColor: '#315B4B', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previousText: { color: '#315B4B', fontSize: 15, fontWeight: '800' },
  next: { flex: 1, minHeight: 51, backgroundColor: '#315B4B', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: '#FFFDF8', fontSize: 15, fontWeight: '900' }
});
