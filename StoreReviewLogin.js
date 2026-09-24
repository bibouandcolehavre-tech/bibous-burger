import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export default function StoreReviewLogin({ api, onBack, onAuthenticated }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const login = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${api}/review/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode: code.trim() }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Connexion de test indisponible.');
      setCode('');
      await onAuthenticated(result);
    } catch (err) { setError(err.name === 'AbortError' ? 'Connexion trop lente. Réessaie.' : err.message); }
    finally { clearTimeout(timer); setBusy(false); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: '#fff', fontWeight: '700', paddingVertical: 15 }}>‹ Connexion client</Text></Pressable>
    <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>Accès de vérification</Text>
    <View style={{ padding: 20, backgroundColor: '#fff9eb', borderRadius: 16, gap: 18 }}>
      <Text style={{ fontSize: 16, lineHeight: 24 }}>Réservé à l’équipe de validation des boutiques. Utilise le code privé fourni dans les instructions d’accès.</Text>
      <Text style={{ lineHeight: 22 }}>Cet espace isolé utilise uniquement des données fictives. Les commandes, les réservations, les paiements et les récompenses y sont simulés, sans SMS ni débit bancaire. Aucun client réel n’est accessible. Les données de test expirent après 24 heures ; le même code permet de recommencer.</Text>
      <TextInput accessibilityLabel="Code d’accès de vérification" value={code} onChangeText={setCode} placeholder="Code privé de vérification" autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={128} style={{ borderWidth: 1, borderColor: '#8a786d', borderRadius: 8, padding: 14, fontSize: 16 }} />
      {!!error && <Text accessibilityRole="alert" style={{ color: '#a52217' }}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !code.trim()} onPress={login} style={{ backgroundColor: '#241a16', borderRadius: 12, padding: 18, opacity: busy || !code.trim() ? .5 : 1 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{busy ? 'Connexion…' : 'Ouvrir l’espace de test'}</Text></Pressable>
    </View>
  </ScrollView>;
}
