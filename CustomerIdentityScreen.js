import { useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
const { validateIdentity, MAX_NAME_LENGTH } = require('./customer-identity');

export default function CustomerIdentityScreen({ api, registrationToken, authToken, customer = {}, onComplete, onExit, onPrivacy, onDelete, editing = false }) {
  const [firstName, setFirstName] = useState(customer.firstName || '');
  const [lastName, setLastName] = useState(customer.lastName || '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const working = useRef(false);
  const identity = validateIdentity({ firstName, lastName });
  const visibleError = message || (firstName.trim() && lastName.trim() ? identity.error : '');
  const save = async () => {
    if (working.current) return;
    if (identity.error) { setMessage(identity.error); return; }
    working.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const registering = Boolean(registrationToken);
      const response = await fetch(`${api}${registering ? '/auth/sms/register' : `/customers/${encodeURIComponent(customer.id)}`}`, {
        method: registering ? 'POST' : 'PATCH', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(!registering ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ firstName: identity.firstName, lastName: identity.lastName, ...(registering ? { registrationToken } : {}) }),
      });
      const result = await response.json();
      if (!response.ok || !result.customer) throw new Error(result.error || 'Impossible d’enregistrer tes informations.');
      await onComplete(result);
    } catch (error) { setMessage(error.name === 'AbortError' ? 'Connexion trop lente. Réessaie : aucun second compte ne sera créé.' : error.message); }
    finally { clearTimeout(timer); working.current = false; setBusy(false); }
  };
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>TON COMPTE BIBOU</Text>
    <Text accessibilityRole="header" style={s.title}>{registrationToken ? 'Faisons connaissance' : editing ? 'Mes coordonnées' : 'Complète ton profil'}</Text>
    <Text style={s.intro}>Ton prénom et ton nom sont nécessaires pour identifier tes commandes et tes réservations.</Text>
    <View style={s.card}>
      {!registrationToken && !!customer.name && <Text style={s.previous}>Nom actuellement enregistré : {customer.name}. Confirme ci-dessous ton prénom et ton nom séparément.</Text>}
      <Text style={s.label}>Prénom · obligatoire</Text>
      <TextInput accessibilityLabel="Prénom obligatoire" value={firstName} onChangeText={value => { setFirstName(value); setMessage(''); }} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" autoCorrect={false} maxLength={MAX_NAME_LENGTH} editable={!busy} placeholder="Ton prénom" placeholderTextColor="#77645A" style={s.input} />
      <Text style={s.label}>Nom de famille · obligatoire</Text>
      <TextInput accessibilityLabel="Nom de famille obligatoire" value={lastName} onChangeText={value => { setLastName(value); setMessage(''); }} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" autoCorrect={false} maxLength={MAX_NAME_LENGTH} editable={!busy} placeholder="Ton nom de famille" placeholderTextColor="#77645A" style={s.input} onSubmitEditing={save} />
      <Text style={s.note}>Les deux champs sont obligatoires. L’anniversaire restera facultatif.</Text>
      {!!visibleError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{visibleError}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !!identity.error} onPress={save} style={[s.button, (busy || !!identity.error) && s.dim]}><Text style={s.buttonText}>{busy ? 'Enregistrement…' : registrationToken ? 'Créer mon compte' : 'Enregistrer et continuer'}</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onExit} style={s.link}><Text style={s.linkText}>{registrationToken ? 'Annuler l’inscription' : editing ? 'Annuler' : 'Me déconnecter'}</Text></Pressable>
    {!!onPrivacy && <Pressable accessibilityRole="button" onPress={onPrivacy} style={s.link}><Text style={s.linkText}>Confidentialité</Text></Pressable>}
    {!!onDelete && <Pressable accessibilityRole="button" onPress={onDelete} style={s.link}><Text style={s.linkText}>Supprimer mon compte</Text></Pressable>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#E95122' }, content: { padding: 24, paddingTop: 40, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  eyebrow: { color: '#FFF5EF', fontWeight: '800', letterSpacing: 2, fontSize: 12 }, title: { color: '#FFF', fontSize: 31, fontWeight: '900', marginTop: 12 }, intro: { color: '#FFF', fontSize: 16, lineHeight: 24, marginVertical: 20 },
  card: { padding: 22, backgroundColor: '#FFFBF6', borderRadius: 22 }, label: { color: '#29201D', fontWeight: '800', fontSize: 15, marginBottom: 9 },
  input: { borderWidth: 1, borderColor: '#BBA69B', borderRadius: 12, padding: 14, fontSize: 17, color: '#211610', backgroundColor: '#FFF', marginBottom: 22 },
  previous: { color: '#514239', fontSize: 14, lineHeight: 21, marginBottom: 20 }, note: { color: '#514239', fontSize: 13, lineHeight: 20, marginBottom: 18 },
  button: { padding: 18, backgroundColor: '#241A16', borderRadius: 14 }, buttonText: { color: '#FFF', fontWeight: '800', textAlign: 'center', fontSize: 16 }, dim: { opacity: .45 },
  error: { color: '#A02416', lineHeight: 22, marginBottom: 16 }, link: { paddingVertical: 14, alignItems: 'center' }, linkText: { color: '#241A16', fontWeight: '700' },
});
