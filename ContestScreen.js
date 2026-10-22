import { useEffect, useRef, useState } from 'react';
const { GAME_ORGANIZER_NOTICE } = require('./game-organizer-notice');
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import ContestPrizes from './ContestPrizes';
import ContestRegistration from './ContestRegistration';
import { InstagramContestCard } from './ContestCampaignCards';
import ContestReferralPanel from './ContestReferralPanel';
const {shareReferral} = require('./referral-presentation');
const { isReviewToken } = require('./review-client');
const { CONTEST_PRIZE_RULES } = require('./contest-prize-policy');

const prettyDate = value => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00Z`));
export default function ContestScreen({ apiBaseUrl, token, sponsorCode = '', onBack, onLogin, onOrderPrize, referralMode = false }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const shareBusyRef = useRef(false);
  const [shareFeedback,setShareFeedback] = useState('');
  const [accepted, setAccepted] = useState(false), [adult, setAdult] = useState(false), [region, setRegion] = useState(false), [code, setCode] = useState(sponsorCode);
  const [reload, setReload] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prizeAlerts, setPrizeAlerts] = useState(false);
  const [joinedNow, setJoinedNow] = useState(false);
  const scroll = useRef(null);
  const epoch = useRef(0);
  useEffect(() => {
    const id = ++epoch.current, controller = new AbortController();
    setData(null); setError(''); setBusy(false); setAccepted(false); setAdult(false); setRegion(false); setPrizeAlerts(false); setJoinedNow(false); shareBusyRef.current=false;setShareBusy(false);setShareFeedback('');
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${apiBaseUrl}/${token ? 'customer/contest' : 'contest'}?contestApi=2`, { signal: controller.signal, cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de charger le concours.');
      if (epoch.current === id) setData(token ? result : { contest: result });
    }).catch(err => { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Connexion trop lente. Réessaie.' : err.message); }).finally(() => clearTimeout(timer));
    return () => { epoch.current++; controller.abort(); clearTimeout(timer); };
  }, [apiBaseUrl, token, reload]);
  useEffect(() => {
    if (joinedNow) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [joinedNow]);
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
      const response = await fetch(`${apiBaseUrl}/customer/contest/join?contestApi=2`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contestId: data.contest.id, revision: data.contest.revision, acceptRules: accepted, confirmAdult: adult, confirmRegion: region, sponsorCode: code, acceptPrizeAlerts: prizeAlerts }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Participation impossible.');
      if (epoch.current === id) { setData(result); setJoinedNow(Boolean(result.participation)); }
    } catch (err) { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Réponse trop lente. Actualise pour vérifier ta participation avant de réessayer.' : err.message); }
    finally { clearTimeout(timer); if (epoch.current === id) setBusy(false); }
  };
  const shareLink = async () => {
    if (!data?.participation || data.contest?.status!=='active' || shareBusyRef.current) return;
    const id = epoch.current;
    const {shareUrl,code} = data.participation;
    shareBusyRef.current=true;setShareBusy(true);setError('');setShareFeedback('');
    // Open the system share sheet before any network await. Never read contacts.
    const invitation = isReviewToken(token) ? Promise.resolve({status:'review'}) : shareReferral({platform:Platform.OS,navigator:typeof navigator!=='undefined'?navigator:null,nativeShare:content=>Share.share(content),url:shareUrl,code,inviteePoints:data.contest.scoring?.pointsPerVerifiedInvitee||0}).catch(()=>({status:'failed'}));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      if(!data.participation.sharedToday){
        try{
          const response = await fetch(`${apiBaseUrl}/customer/contest/share?contestApi=2`, { method: 'POST', signal:controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contestId: data.contest.id, revision: data.contest.revision }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Le point du jour n’a pas été enregistré.');
          if (epoch.current === id) setData(result);
        }catch(err){if(epoch.current===id)setError(err.name==='AbortError'?'Le point de partage est à vérifier. Actualise le concours.':err.message);}
      }
      const result=await invitation;
      if(epoch.current===id)setShareFeedback(result.status==='copied'?'Invitation copiée : colle-la dans Messages ou WhatsApp.':['unsupported','failed'].includes(result.status)?'Le partage ne s’est pas ouvert. Tu peux copier le lien affiché ci-dessous.':result.status==='review'?'Partage externe désactivé dans cet espace de test.':'');
    } finally { clearTimeout(timer);if (epoch.current === id) {shareBusyRef.current=false;setShareBusy(false);} }
  };
  const participation = data?.participation;
  const contest = data?.contest && { ...data.contest, rules: data.contest.rules ? `${data.contest.rules}\n\n${GAME_ORGANIZER_NOTICE}` : '' };
  const enrollment = contest?.status === 'active' && !participation;
  const accountStep = enrollment && (!token || data.needsPhoneVerification);
  return <><ScrollView ref={scroll} contentContainerStyle={s.page}>
    <Pressable accessibilityRole="button" onPress={onBack} style={s.back}><Text style={s.backText}>‹ Retour à l’accueil</Text></Pressable>
    {referralMode && !participation && <View style={s.introSection}><Text style={s.introTitle}>Parrainer un ami</Text><Text style={s.introCopy}>Inscris-toi au concours pour obtenir ton lien personnel. Tu pourras ensuite choisir un contact dans ta messagerie et l’inviter.</Text></View>}
    {!enrollment && contest?.rules && <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={s.rulesButton}><Text style={s.rulesButtonText}>Règles, conditions et lots du concours ›</Text></Pressable>}
    {enrollment && <ContestRegistration contest={contest} token={token} needsPhoneVerification={data.needsPhoneVerification} onLogin={onLogin} onRules={() => setRulesOpen(true)} accepted={accepted} adult={adult} region={region} prizeAlerts={prizeAlerts} onAccepted={setAccepted} onAdult={setAdult} onRegion={setRegion} onPrizeAlerts={setPrizeAlerts} code={code} onCode={setCode} busy={busy} onJoin={join} error={error} />}
    {joinedNow && participation && <View accessibilityRole="alert" style={s.success}><Text style={s.h2}>Tu es inscrit au concours !</Text><Text style={s.body}>Ta participation est confirmée. Retrouve ton classement et ton lien de parrainage ci-dessous.</Text></View>}
    <ContestReferralPanel contest={contest} participation={participation} onShare={shareLink} busy={shareBusy} message={shareFeedback} />
    {!enrollment && <View style={s.introSection}><Text style={s.introTitle}>{contest?.title || 'Les ambassadeurs Bibou'}</Text><Text style={s.introCopy}>{contest?.status === 'inactive' ? 'Le plaisir est encore meilleur quand il se partage.' : 'Jusqu’à 1 an de Bibou à gagner. Un classement commun sur iPhone, Android et web, jusqu’au 31 décembre.'}</Text></View>}
    {!data && !error && <Text style={s.body}>Chargement…</Text>}
    {contest?.status === 'inactive' && <View style={s.panel}><Text style={s.h2}>Le concours se prépare</Text><Text style={s.body}>L’idée : participer gratuitement, partager ton lien personnel et suivre ta place dans un classement. Les commandes payées pourraient aussi rapporter des points.</Text><Text style={s.body}>Les règles, les dates et les lots seront annoncés ici avant l’ouverture. Aucun point de concours n’est encore comptabilisé.</Text><Text style={s.note}>Le parrainage habituel du Club Bibou reste séparé : 100 points fidélité après la première commande payée de ton filleul.</Text></View>}
    {contest && contest.status !== 'inactive' && <>
      <Text style={s.date}>{prettyDate(contest.startDate)} → {prettyDate(contest.endDate)} · heure de Paris</Text>
      <InstagramContestCard contest={contest} />
      {participation && <View style={s.panel}><Text style={s.h2}>Ta place provisoire : {participation.rank}{participation.rank === 1 ? 'er' : 'e'}</Text><Text style={s.count}>{participation.score} points</Text><Text style={s.body}>{participation.referrals} {participation.referrals === 1 ? 'nouvel inscrit vérifié' : 'nouveaux inscrits vérifiés'} · {participation.sharePoints || 0} points de partage · {participation.purchasePoints} points de commandes{contest.scoring?.pointsPerAwardedWheelPoint > 0 ? ' · ' + (participation.wheelPoints || 0) + ' points de roue' : ''}</Text><Text style={s.note}>{contest.scoring?.pointsPerVerifiedInvitee > 0 ? '+' + (participation.inviteePoints || 0) + ' points de filleul · ' : ''}{participation.alias} · Code : {participation.code}{participation.tied ? ' · ex æquo' : ''}</Text></View>}
      <View style={s.panel}><Text style={s.h2}>Comment gagner des points ?</Text><Text style={s.body}>1. Je crée mon compte et vérifie mon numéro, puis je valide ma participation. Créer un compte ne suffit pas pour rejoindre le concours.</Text><Text style={s.body}>2. J’invite un nouvel ami : +20 points pour moi{contest.scoring?.pointsPerVerifiedInvitee > 0 ? ' et +20 points pour lui' : ''} quand il crée son compte, vérifie son numéro et rejoint le concours. Je peux parrainer plusieurs nouveaux amis le même jour.</Text><Text style={s.body}>3. J’appuie sur « Inviter un contact » : +1 point de partage par jour maximum. Les parrainages à 20 points ne sont pas limités par jour.</Text><Text style={s.body}>4. Mes commandes réellement payées ajoutent 1 point par euro, sans plafond. Aucun achat n’est obligatoire.</Text>{contest.scoring?.pointsPerAwardedWheelPoint > 0 && <Text style={s.body}>5. Les points réellement gagnés à la roue comptent aussi au classement et restent crédités au Club Bibou. Les cadeaux, remises et tours fictifs ne donnent pas de points au classement.</Text>}</View>
      {!accountStep && <View style={s.panel}><Text style={s.h2}>Les trois lots</Text><Text style={s.body}>1re place · 1 an de Bibou : {contest.firstPrize}</Text><Text style={s.body}>2e place · 6 mois de Bibou : {contest.secondPrize}</Text><Text style={s.body}>3e place : {contest.thirdPrize}</Text><Text style={s.note}>Classement sans tirage au sort. Les points fidélité habituels restent séparés. Seuls les points de roue valides sont aussi comptés au classement lorsque ce bonus est activé.</Text></View>}
      <View style={s.panel}><Text style={s.h2}>Utiliser les menus gagnés</Text><Text style={s.body}>{CONTEST_PRIZE_RULES}</Text></View>
      {contest.status === 'scheduled' && <Text style={s.body}>Les participations ouvriront le {prettyDate(contest.startDate)}.</Text>}
      {contest.status === 'closed' && <Text style={s.body}>Les participations sont closes. Les résultats seront vérifiés par l’équipe.</Text>}
      {data?.leaderboard?.length > 0 && <View style={s.panel}><Text style={s.h2}>Classement provisoire</Text>{data.leaderboard.map(row => <Text key={row.alias} style={s.body}>{row.rank}. {row.alias} · {row.score} points{row.tied ? ' · ex æquo' : ''}</Text>)}<Text style={s.note}>Pseudonymes uniquement. Les résultats définitifs seront vérifiés après la clôture.</Text></View>}
      <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={s.rulesButton}><Text style={s.rulesButtonText}>Lire le règlement complet du concours ›</Text></Pressable>
    </>}
    <ContestPrizes key={token || 'guest'} apiBaseUrl={apiBaseUrl} token={token} onOrder={onOrderPrize} />
    <Text style={s.note}>{GAME_ORGANIZER_NOTICE}</Text>
    {!!error && !enrollment && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReload(value => value + 1)} style={s.back}><Text style={s.backText}>Actualiser le concours</Text></Pressable>
  </ScrollView><Modal visible={rulesOpen && !!contest?.rules} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}><View style={s.rulesBackdrop}><View style={s.rulesDialog}><View style={s.rulesHeader}><Text style={s.rulesTitle}>Règlement du concours</Text><Pressable accessibilityRole="button" accessibilityLabel="Fermer le règlement" onPress={() => setRulesOpen(false)} style={s.rulesClose}><Text style={s.rulesCloseText}>✕</Text></Pressable></View><ScrollView style={s.rulesScroll} contentContainerStyle={s.rulesContent}><Text style={s.body}>{contest?.rules}</Text></ScrollView></View></View></Modal></>;
}
const s = StyleSheet.create({ introSection: { paddingVertical: 22, gap: 10 }, introTitle: { fontSize: 26, lineHeight: 32, fontWeight: '900', color: '#315B4B' }, introCopy: { fontSize: 15, lineHeight: 23, color: '#52665A' }, success: { backgroundColor: '#D9EEE5', borderRadius: 18, padding: 20, marginTop: 16, gap: 10 }, referral: { backgroundColor: '#D9EEE5', borderRadius: 14, padding: 16, gap: 8 }, page: { padding: 22, paddingBottom: 60, backgroundColor: '#FBF3E6', minHeight: '100%', width: '100%', maxWidth: 720, alignSelf: 'center' }, back: { paddingVertical: 14 }, backText: { color: '#315B4B', fontWeight: '700' }, eyebrow: { color: '#315B4B', letterSpacing: 2, fontSize: 11, marginVertical: 10 }, hero: { backgroundColor: '#315B4B', borderRadius: 24, padding: 25 }, star: { fontSize: 38, color: '#D6EEE3' }, title: { fontSize: 31, fontWeight: '900', color: '#fff' }, intro: { fontSize: 16, lineHeight: 24, color: '#F8EEE2', marginTop: 12 }, panel: { backgroundColor: '#fff', padding: 20, borderRadius: 18, marginTop: 18, gap: 10 }, h2: { fontSize: 20, fontWeight: '800', color: '#315B4B' }, body: { fontSize: 15, lineHeight: 23, color: '#343B36' }, note: { color: '#52665A', fontSize: 12, lineHeight: 19 }, link: { color: '#315B4B', fontSize: 13, lineHeight: 20, textDecorationLine: 'underline' }, date: { fontSize: 15, fontWeight: '700', marginTop: 20 }, count: { fontSize: 44, color: '#BB7258', fontWeight: '900' }, button: { borderRadius: 14, backgroundColor: '#315B4B', padding: 17, alignItems: 'center', marginTop: 14 }, buttonText: { fontWeight: '800', color: '#fff', textAlign: 'center' }, rulesButton: { padding: 17, borderRadius: 14, borderWidth: 1, borderColor: '#9BC8B6', backgroundColor: '#D9EEE5', marginTop: 18 }, rulesButtonText: { color: '#315B4B', fontSize: 16, fontWeight: '800', textAlign: 'center' }, rulesBackdrop: { flex: 1, backgroundColor: 'rgba(19, 39, 31, 0.72)', justifyContent: 'center', padding: 18 }, rulesDialog: { width: '100%', maxWidth: 640, maxHeight: '84%', alignSelf: 'center', backgroundColor: '#FFF9EF', borderRadius: 20, padding: 20 }, rulesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }, rulesTitle: { color: '#203E33', fontSize: 22, fontWeight: '900', flexShrink: 1 }, rulesClose: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, rulesCloseText: { color: '#315B4B', fontSize: 23, fontWeight: '800' }, rulesScroll: { flexShrink: 1 }, rulesContent: { paddingBottom: 12 }, input: { borderWidth: 1, borderColor: '#B7DDD0', padding: 13, borderRadius: 9, fontSize: 16 }, check: { flexDirection: 'row', gap: 10, paddingVertical: 7 }, box: { fontSize: 23 }, checkText: { flex: 1, fontSize: 14, lineHeight: 21 }, error: { color: '#b42b20', fontSize: 14, marginTop: 18, lineHeight: 21 } });
