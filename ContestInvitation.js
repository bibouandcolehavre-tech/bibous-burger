import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { supportsRankingContest } from './customer-experience-policy';

export default function ContestInvitation({ apiBaseUrl, token, onOpenContest, afterPayment = false }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!supportsRankingContest(Platform.OS)) return;
    const controller = new AbortController();
    setData(null);
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${apiBaseUrl}/${token ? 'customer/contest' : 'contest'}?contestApi=2`, {
      signal: controller.signal, cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (!controller.signal.aborted) setData(token ? result : { contest: result });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [apiBaseUrl, token]);
  if (data?.contest?.status !== 'active') return null;
  const joined = Boolean(data.participation);
  return <View style={{ width: '100%', backgroundColor: '#D9EEE5', borderRadius: 18, padding: 20, marginVertical: 16 }}>
    <Text style={{ color: '#315B4B', fontSize: 20, fontWeight: '800' }}>{joined ? 'Ton classement au concours' : afterPayment ? 'Tes achats peuvent compter au concours' : token ? 'Ton compte est prêt. Rejoins aussi le concours !' : 'Participe gratuitement au concours Bibou'}</Text>
    <Text style={{ color: '#315B4B', fontSize: 15, lineHeight: 23, marginTop: 8 }}>{joined
      ? 'Ta participation est enregistrée. Consulte tes points et ta place provisoire.'
      : 'Créer un compte ou payer une commande ne t’inscrit pas au concours. Ouvre le concours, accepte le règlement et valide ta participation. C’est gratuit et facultatif.'}</Text>
    {!joined && <Text style={{ color: '#315B4B', fontSize: 15, lineHeight: 23, marginTop: 8 }}>Après validation, tes commandes éligibles payées depuis l’ouverture sont reprises automatiquement : 31,80 € donnent 31 points d’achat. Les centimes se cumulent.</Text>}
    <Pressable accessibilityRole="button" onPress={onOpenContest} style={{ backgroundColor: '#315B4B', padding: 16, borderRadius: 12, marginTop: 14 }}>
      <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>{joined ? 'Voir mes points et mon classement' : 'Rejoindre le concours'}</Text>
    </Pressable>
  </View>;
}
