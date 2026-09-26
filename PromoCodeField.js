import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function PromoCodeField({ promotion, onChange, onPendingChange, onValidate, disabled }) {
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const changeDraft = value => {
    revision.current++;
    setDraft(value); setError(''); setChecking(false);
    onChange(null); onPendingChange(Boolean(value.trim()));
  };
  const apply = async () => {
    if (checking || disabled || !draft.trim()) return;
    const current = ++revision.current;
    setChecking(true); setError('');
    try {
      const result = await onValidate(draft.trim());
      if (current !== revision.current) return;
      onChange(result); onPendingChange(false); setDraft(result.code);
    } catch (failure) {
      if (current === revision.current) setError(failure.message || 'Impossible de vérifier ce code. Réessaie.');
    } finally { if (current === revision.current) setChecking(false); }
  };
  return <View style={s.card}>
    <Text style={s.title}>Tu as un code promo ?</Text>
    <TextInput accessibilityLabel="Code promo" value={draft} onChangeText={changeDraft} editable={!disabled}
      placeholder="Saisir mon code" placeholderTextColor="#76675E" autoCapitalize="characters" autoCorrect={false}
      maxLength={40} returnKeyType="done" onSubmitEditing={apply} style={s.input} />
    <Pressable accessibilityRole="button" disabled={disabled || checking || (!promotion && !draft.trim())}
      onPress={promotion ? () => changeDraft('') : apply} style={[s.button, (disabled || checking) && s.disabled]}>
      <Text style={s.buttonText}>{checking ? 'Vérification…' : promotion ? 'Retirer le code' : 'Appliquer le code'}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {promotion && <Text accessibilityLiveRegion="polite" style={s.success}>✓ Code {promotion.code} appliqué : commande et livraison offertes. Aucun paiement bancaire.</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#FFF7EB', borderColor: '#E2C394', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 18, gap: 10 },
  title: { color: '#2A211C', fontSize: 16, fontWeight: '800' },
  input: { backgroundColor: '#FFF', color: '#241C18', borderColor: '#C4AA90', borderWidth: 1, padding: 14, borderRadius: 10, fontSize: 16 },
  button: { backgroundColor: '#241C18', borderRadius: 10, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: .5 }, error: { color: '#9A2015', fontSize: 14 }, success: { color: '#235335', fontSize: 14, lineHeight: 21, fontWeight: '600' },
});
