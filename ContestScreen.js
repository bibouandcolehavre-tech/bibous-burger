import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

const prettyDate = value => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00Z`));
export default function ContestScreen({ apiBaseUrl, token, sponsorCode = '', onBack, onLogin }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false), [adult, setAdult] = useState(false), [region, setRegion] = useState(false), [code, setCode] = useState(sponsorCode);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const id = ++epoch.current, controller = new AbortController();
    setData(null); setError(''); setBusy(false); setAccepted(false); setAdult(false); setRegion(false);
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${apiBaseUrl}/${token ? 'customer/contest' : 'contest'}`, { signal: controller.signal, cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de charger le concours.');
      if (epoch.current === id) setData(token ? result : { contest: result });
    }).catch(err => { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Connexion trop lente. Réessaie.' : err.message); }).finally(() => clearTimeout(timer));
    return () => { epoch.current++; controller.abort(); clearTimeout(timer); };
  }, [apiBaseUrl, token, reload]);
  const join = async () => {
    if (busy) return;
    const id = epoch.current, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/customer/contest/join`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contestId: data.contest.id, revision: data.contest.revision, acceptRules: accepted, confirmAdult: adult, confirmRegion: region, sponsorCode: code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Participation impossible.');
      if (epoch.current === id) setData(result);
    } catch (err) { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Réponse trop lente. Actualise pour vérifier ta participation avant de réessayer.' : err.message); }
    finally { clearTimeout(timer); if (epoch.current === id) setBusy(false); }
  };
  const check = (label, value, change) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => change(!value)} style={s.check}><Text style={s.box}>{value ? '☑' : '☐'}</Text><Text style={s.checkText}>{label}</Text></Pressable>;
  const contest = data?.contest, participation = data?.participation;
  return <ScrollView contentContainerStyle={s.page}><Pressable accessibilityRole="button" onPress={onBack} style={s.back}><Text style={s.backText}>‹ Retour à l’accueil</Text></Pressable><Text style={s.eyebrow}>LES ACTUALITÉS BIBOU</Text>
    <View style={s.hero}><Text style={s.star}>✦</Text><Text style={s.title}>{contest?.title || 'Les ambassadeurs Bibou'}</Text><Text style={s.intro}>Le plaisir est encore meilleur quand il se partage.</Text></View>
    {!data && !error && <Text style={s.body}>Chargement…</Text>}
    {contest?.status === 'inactive' && <View style={s.panel}><Text style={s.h2}>Le concours se prépare</Text><Text style={s.body}>L’idée : partager ton lien personnel avec tes amis et suivre les nouvelles inscriptions vérifiées qui viennent de toi.</Text><Text style={s.body}>Les dates, les lots et le règlement seront annoncés ici avant l’ouverture. Aucune participation n’est encore comptabilisée.</Text><Text style={s.note}>Le parrainage habituel du Club Bibou reste disponible : 100 points après la première commande payée de ton filleul.</Text></View>}
    {contest && contest.status !== 'inactive' && <>
      <Text style={s.date}>{prettyDate(contest.startDate)} → {prettyDate(contest.endDate)} · heure de Paris</Text>
      <View style={s.panel}><Text style={s.h2}>Deux façons de gagner</Text><Text style={s.body}>Meilleur parrain : {contest.leaderPrize}</Text><Text style={s.body}>Tirage au sort : {contest.drawPrize}</Text><Text style={s.note}>Une inscription vérifiée compte, pas un simple clic. Aucun achat nécessaire pour participer au concours. Les points fidélité restent séparés.</Text></View>
      {contest.status === 'scheduled' && <Text style={s.body}>Les participations ouvriront le {prettyDate(contest.startDate)}.</Text>}
      {contest.status === 'closed' && <Text style={s.body}>Les participations sont closes. Les résultats seront vérifiés par l’équipe.</Text>}
      {participation && <View style={s.panel}><Text style={s.h2}>Ta participation est enregistrée</Text><Text style={s.count}>{participation.referrals}</Text><Text style={s.body}>nouvelle(s) inscription(s) vérifiée(s) parrainée(s)</Text><Text style={s.note}>{participation.alias} · Code : {participation.code}</Text>{contest.status === 'active' && <Pressable accessibilityRole="button" style={s.button} onPress={() => Share.share({ message: `Rejoins le concours Bibou’s Burgers avec mon lien : ${participation.shareUrl}` }).catch(() => setError('Le partage n’a pas pu s’ouvrir. Tu peux communiquer ton code à ton ami.'))}><Text style={s.buttonText}>Partager mon lien</Text></Pressable>}</View>}
      <View style={s.panel}><Text style={s.h2}>Le règlement</Text><Text style={s.body}>{contest.rules}</Text></View>
      {contest.status === 'active' && !participation && (!token || data.needsPhoneVerification ? <Pressable accessibilityRole="button" style={s.button} onPress={onLogin}><Text style={s.buttonText}>{token ? 'Vérifier mon numéro par SMS' : 'Me connecter pour participer'}</Text></Pressable> : <View style={s.panel}>
        <Text style={s.h2}>Participer gratuitement</Text><Text style={s.body}>Code de ton ami (facultatif)</Text><TextInput accessibilityLabel="Code du parrain" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={40} style={s.input} />
        {check('J’ai lu et j’accepte le règlement du concours.', accepted, setAccepted)}{check('Je confirme avoir 18 ans ou plus.', adult, setAdult)}{check(`Je réside dans la zone : ${contest.region}.`, region, setRegion)}
        <Text style={s.note}>Aucun abonnement publicitaire. Tes données servent à gérer le concours ; pas de téléphone affiché au public. Les participations sont purgées de la base active par l’entretien horaire après 90 jours suivant la clôture ; les sauvegardes expirent ensuite selon leur rotation.</Text>
        <Pressable accessibilityRole="button" disabled={busy || !accepted || !adult || !region} style={[s.button, (busy || !accepted || !adult || !region) && { opacity: .45 }]} onPress={join}><Text style={s.buttonText}>{busy ? 'Enregistrement…' : 'Valider ma participation'}</Text></Pressable>
      </View>)}
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReload(value => value + 1)} style={s.back}><Text style={s.backText}>Actualiser le concours</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({ page: { padding: 22, paddingBottom: 60, backgroundColor: '#faf4e8', minHeight: '100%', width: '100%', maxWidth: 720, alignSelf: 'center' }, back: { paddingVertical: 14 }, backText: { color: '#27231d', fontWeight: '700' }, eyebrow: { color: '#6a5440', letterSpacing: 2, fontSize: 11, marginVertical: 10 }, hero: { backgroundColor: '#22261f', borderRadius: 24, padding: 25 }, star: { fontSize: 38, color: '#ffd07b' }, title: { fontSize: 31, fontWeight: '900', color: '#fff' }, intro: { fontSize: 16, lineHeight: 24, color: '#f4e6d1', marginTop: 12 }, panel: { backgroundColor: '#fff', padding: 20, borderRadius: 18, marginTop: 18, gap: 10 }, h2: { fontSize: 20, fontWeight: '800', color: '#24241f' }, body: { fontSize: 15, lineHeight: 23, color: '#363931' }, note: { color: '#626257', fontSize: 12, lineHeight: 19 }, date: { fontSize: 15, fontWeight: '700', marginTop: 20 }, count: { fontSize: 44, color: '#ad421d', fontWeight: '900' }, button: { borderRadius: 14, backgroundColor: '#25291f', padding: 17, alignItems: 'center', marginTop: 14 }, buttonText: { fontWeight: '800', color: '#fff', textAlign: 'center' }, input: { borderWidth: 1, borderColor: '#bcb9ad', padding: 13, borderRadius: 9, fontSize: 16 }, check: { flexDirection: 'row', gap: 10, paddingVertical: 7 }, box: { fontSize: 23 }, checkText: { flex: 1, fontSize: 14, lineHeight: 21 }, error: { color: '#b42b20', fontSize: 14, marginTop: 18, lineHeight: 21 } });
