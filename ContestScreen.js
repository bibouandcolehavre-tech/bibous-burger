import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

const prettyDate = value => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00Z`));
export default function ContestScreen({ apiBaseUrl, token, sponsorCode = '', onBack, onLogin }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [accepted, setAccepted] = useState(false), [adult, setAdult] = useState(false), [region, setRegion] = useState(false), [code, setCode] = useState(sponsorCode);
  const [reload, setReload] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    const id = ++epoch.current, controller = new AbortController();
    setData(null); setError(''); setBusy(false); setAccepted(false); setAdult(false); setRegion(false);
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${apiBaseUrl}/${token ? 'customer/contest' : 'contest'}?contestApi=2`, { signal: controller.signal, cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de charger le concours.');
      if (epoch.current === id) setData(token ? result : { contest: result });
    }).catch(err => { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Connexion trop lente. Réessaie.' : err.message); }).finally(() => clearTimeout(timer));
    return () => { epoch.current++; controller.abort(); clearTimeout(timer); };
  }, [apiBaseUrl, token, reload]);
  useEffect(() => {
    if (!token || !data?.participation || data.contest?.status !== 'active') return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      fetch(`${apiBaseUrl}/customer/contest?contestApi=2`, { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
        .then(response => response.ok ? response.json() : null)
        .then(result => { if (result && !controller.signal.aborted) setData(result); })
        .catch(() => {});
    }, 30000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [apiBaseUrl, token, data?.participation?.code, data?.contest?.status]);
  const join = async () => {
    if (busy) return;
    const id = epoch.current, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/customer/contest/join?contestApi=2`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contestId: data.contest.id, revision: data.contest.revision, acceptRules: accepted, confirmAdult: adult, confirmRegion: region, sponsorCode: code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Participation impossible.');
      if (epoch.current === id) setData(result);
    } catch (err) { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Réponse trop lente. Actualise pour vérifier ta participation avant de réessayer.' : err.message); }
    finally { clearTimeout(timer); if (epoch.current === id) setBusy(false); }
  };
  const shareLink = async () => {
    if (!data?.participation || shareBusy) return;
    const id = epoch.current;
    const { shareUrl } = data.participation;
    void Share.share({ message: `Rejoins le concours Bibou’s Burgers avec mon lien : ${shareUrl}` }).catch(() => setError('Le partage ne s’est pas ouvert. Tu peux copier le lien affiché ci-dessous.'));
    if (data.participation.sharedToday) return;
    setShareBusy(true); setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/customer/contest/share?contestApi=2`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contestId: data.contest.id, revision: data.contest.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Le point du jour n’a pas été enregistré.');
      if (epoch.current === id) setData(result);
    } catch (err) { if (epoch.current === id) setError(err.message); }
    finally { if (epoch.current === id) setShareBusy(false); }
  };
  const check = (label, value, change) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => change(!value)} style={s.check}><Text style={s.box}>{value ? '☑' : '☐'}</Text><Text style={s.checkText}>{label}</Text></Pressable>;
  const contest = data?.contest, participation = data?.participation;
  return <><ScrollView contentContainerStyle={s.page}><Pressable accessibilityRole="button" onPress={onBack} style={s.back}><Text style={s.backText}>‹ Retour à l’accueil</Text></Pressable><Text style={s.eyebrow}>LES ACTUALITÉS BIBOU</Text>
    <View style={s.hero}><Text style={s.star}>✦</Text><Text style={s.title}>{contest?.title || 'Les ambassadeurs Bibou'}</Text><Text style={s.intro}>{contest?.status === 'inactive' ? 'Le plaisir est encore meilleur quand il se partage.' : '24 menus pour la 1re place. Participe gratuitement, invite tes amis et suis ta place dans le classement.'}</Text></View>
    {!data && !error && <Text style={s.body}>Chargement…</Text>}
    {contest?.status === 'inactive' && <View style={s.panel}><Text style={s.h2}>Le concours se prépare</Text><Text style={s.body}>L’idée : participer gratuitement, partager ton lien personnel et suivre ta place dans un classement. Les commandes payées pourraient aussi rapporter des points.</Text><Text style={s.body}>Les règles, les dates et les lots seront annoncés ici avant l’ouverture. Aucun point de concours n’est encore comptabilisé.</Text><Text style={s.note}>Le parrainage habituel du Club Bibou reste séparé : 100 points fidélité après la première commande payée de ton filleul.</Text></View>}
    {contest && contest.status !== 'inactive' && <>
      <Text style={s.date}>{prettyDate(contest.startDate)} → {prettyDate(contest.endDate)} · heure de Paris</Text>
      <View style={s.panel}><Text style={s.h2}>Comment participer ?</Text><Text style={s.body}>1. Je m’inscris gratuitement avec mon numéro vérifié.</Text><Text style={s.body}>2. J’invite un nouvel ami : +20 points quand il crée son compte, vérifie son numéro et rejoint le concours.</Text><Text style={s.body}>3. J’appuie sur « Partager mon lien » : +1 point par jour maximum. L’application ne vérifie pas si un message a été publié.</Text><Text style={s.body}>4. Mes commandes réellement payées ajoutent 1 point par euro, sans plafond. Aucun achat n’est obligatoire.</Text></View>
      <View style={s.panel}><Text style={s.h2}>Les trois lots</Text><Text style={s.body}>1re place : {contest.firstPrize}</Text><Text style={s.body}>2e place : {contest.secondPrize}</Text><Text style={s.body}>3e place : {contest.thirdPrize}</Text><Text style={s.note}>Classement sans tirage au sort. Les points fidélité du Club Bibou restent séparés.</Text></View>
      {contest.status === 'scheduled' && <Text style={s.body}>Les participations ouvriront le {prettyDate(contest.startDate)}.</Text>}
      {contest.status === 'closed' && <Text style={s.body}>Les participations sont closes. Les résultats seront vérifiés par l’équipe.</Text>}
      {participation && <View style={s.panel}><Text style={s.h2}>Ta place provisoire : {participation.rank}{participation.rank === 1 ? 'er' : 'e'}</Text><Text style={s.count}>{participation.score} points</Text><Text style={s.body}>{participation.referrals} {participation.referrals === 1 ? 'nouvel inscrit vérifié' : 'nouveaux inscrits vérifiés'} · {participation.sharePoints || 0} points de partage · {participation.purchasePoints} points de commandes</Text><Text style={s.note}>{participation.alias} · Code : {participation.code}{participation.tied ? ' · ex æquo' : ''}</Text>{contest.status === 'active' && <><Pressable accessibilityRole="button" style={s.button} onPress={shareLink}><Text style={s.buttonText}>{shareBusy ? 'Enregistrement du point…' : 'Partager mon lien'}</Text></Pressable><Text style={s.note}>{participation.sharedToday ? 'Le point du jour est déjà compté. Tu peux toujours repartager ton lien.' : '+1 point au premier appui sur ce bouton aujourd’hui (heure de Paris).'}</Text><Text selectable style={s.link}>{participation.shareUrl}</Text><Text style={s.note}>Appui long sur le lien pour le copier-coller.</Text></>}</View>}
      {data?.leaderboard?.length > 0 && <View style={s.panel}><Text style={s.h2}>Classement provisoire</Text>{data.leaderboard.map(row => <Text key={row.alias} style={s.body}>{row.rank}. {row.alias} · {row.score} points{row.tied ? ' · ex æquo' : ''}</Text>)}<Text style={s.note}>Pseudonymes uniquement. Les résultats définitifs seront vérifiés après la clôture.</Text></View>}
      <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={s.rulesButton}><Text style={s.rulesButtonText}>Lire le règlement complet du concours ›</Text></Pressable>
      {contest.status === 'active' && !participation && (!token || data.needsPhoneVerification ? <Pressable accessibilityRole="button" style={s.button} onPress={onLogin}><Text style={s.buttonText}>{token ? 'Vérifier mon numéro par SMS' : 'Me connecter pour participer'}</Text></Pressable> : <View style={s.panel}>
        <Text style={s.h2}>Participer gratuitement</Text><Text style={s.body}>Code de ton ami (facultatif)</Text><TextInput accessibilityLabel="Code du parrain" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={40} style={s.input} />
        {check('J’ai lu et j’accepte le règlement du concours.', accepted, setAccepted)}{check('Je confirme avoir 18 ans ou plus.', adult, setAdult)}{check(`Je réside dans la zone : ${contest.region}.`, region, setRegion)}
        <Text style={s.note}>Aucun abonnement publicitaire. Tes données servent à gérer le concours ; pas de téléphone affiché au public. Les participations sont purgées de la base active par l’entretien horaire après 90 jours suivant la clôture ; les sauvegardes expirent ensuite selon leur rotation.</Text>
        <Pressable accessibilityRole="button" disabled={busy || !accepted || !adult || !region} style={[s.button, (busy || !accepted || !adult || !region) && { opacity: .45 }]} onPress={join}><Text style={s.buttonText}>{busy ? 'Enregistrement…' : 'Valider ma participation'}</Text></Pressable>
      </View>)}
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReload(value => value + 1)} style={s.back}><Text style={s.backText}>Actualiser le concours</Text></Pressable>
  </ScrollView><Modal visible={rulesOpen && !!contest?.rules} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}><View style={s.rulesBackdrop}><View style={s.rulesDialog}><View style={s.rulesHeader}><Text style={s.rulesTitle}>Règlement du concours</Text><Pressable accessibilityRole="button" accessibilityLabel="Fermer le règlement" onPress={() => setRulesOpen(false)} style={s.rulesClose}><Text style={s.rulesCloseText}>✕</Text></Pressable></View><ScrollView style={s.rulesScroll} contentContainerStyle={s.rulesContent}><Text style={s.body}>{contest?.rules}</Text></ScrollView></View></View></Modal></>;
}
const s = StyleSheet.create({ page: { padding: 22, paddingBottom: 60, backgroundColor: '#FBF3E6', minHeight: '100%', width: '100%', maxWidth: 720, alignSelf: 'center' }, back: { paddingVertical: 14 }, backText: { color: '#315B4B', fontWeight: '700' }, eyebrow: { color: '#315B4B', letterSpacing: 2, fontSize: 11, marginVertical: 10 }, hero: { backgroundColor: '#315B4B', borderRadius: 24, padding: 25 }, star: { fontSize: 38, color: '#D6EEE3' }, title: { fontSize: 31, fontWeight: '900', color: '#fff' }, intro: { fontSize: 16, lineHeight: 24, color: '#F8EEE2', marginTop: 12 }, panel: { backgroundColor: '#fff', padding: 20, borderRadius: 18, marginTop: 18, gap: 10 }, h2: { fontSize: 20, fontWeight: '800', color: '#315B4B' }, body: { fontSize: 15, lineHeight: 23, color: '#343B36' }, note: { color: '#52665A', fontSize: 12, lineHeight: 19 }, link: { color: '#315B4B', fontSize: 13, lineHeight: 20, textDecorationLine: 'underline' }, date: { fontSize: 15, fontWeight: '700', marginTop: 20 }, count: { fontSize: 44, color: '#BB7258', fontWeight: '900' }, button: { borderRadius: 14, backgroundColor: '#315B4B', padding: 17, alignItems: 'center', marginTop: 14 }, buttonText: { fontWeight: '800', color: '#fff', textAlign: 'center' }, rulesButton: { padding: 17, borderRadius: 14, borderWidth: 1, borderColor: '#9BC8B6', backgroundColor: '#D9EEE5', marginTop: 18 }, rulesButtonText: { color: '#315B4B', fontSize: 16, fontWeight: '800', textAlign: 'center' }, rulesBackdrop: { flex: 1, backgroundColor: 'rgba(19, 39, 31, 0.72)', justifyContent: 'center', padding: 18 }, rulesDialog: { width: '100%', maxWidth: 640, maxHeight: '84%', alignSelf: 'center', backgroundColor: '#FFF9EF', borderRadius: 20, padding: 20 }, rulesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }, rulesTitle: { color: '#203E33', fontSize: 22, fontWeight: '900', flexShrink: 1 }, rulesClose: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, rulesCloseText: { color: '#315B4B', fontSize: 23, fontWeight: '800' }, rulesScroll: { flexShrink: 1 }, rulesContent: { paddingBottom: 12 }, input: { borderWidth: 1, borderColor: '#B7DDD0', padding: 13, borderRadius: 9, fontSize: 16 }, check: { flexDirection: 'row', gap: 10, paddingVertical: 7 }, box: { fontSize: 23 }, checkText: { flex: 1, fontSize: 14, lineHeight: 21 }, error: { color: '#b42b20', fontSize: 14, marginTop: 18, lineHeight: 21 } });
