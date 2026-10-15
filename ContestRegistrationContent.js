import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function ContestRegistration({ contest, token, needsPhoneVerification, onLogin, onRules, accepted, adult, region, prizeAlerts, onAccepted, onAdult, onRegion, onPrizeAlerts, code, onCode, busy, onJoin, error }) {
  const [showCode, setShowCode] = useState(Boolean(code));
  const [showPrivacy, setShowPrivacy] = useState(false);
  const accountStep = !token || needsPhoneVerification;
  const check = (name, value, onChange) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} aria-checked={value} onPress={() => onChange(!value)} style={s.check}><Text style={s.box}>{value ? '☑' : '☐'}</Text><Text style={s.checkText}>{name}</Text></Pressable>;
  const end = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(contest.endDate + 'T12:00:00Z'));
  return <View testID="contest-registration" style={s.root}>
    <Text style={s.eyebrow}>{accountStep ? 'CONCOURS DANS L’APPLICATION' : 'DERNIÈRE ÉTAPE · CONCOURS BIBOU'}</Text>
    <Text accessibilityRole="header" style={s.title}>{accountStep ? 'S’inscrire au concours' : 'Confirme ta participation'}</Text>
    <Text style={s.lead}>{accountStep ? 'Deux étapes. Aucun achat obligatoire.' : 'Ton compte est prêt. Tu n’es pas encore inscrit au concours.'}</Text>
    <View testID="contest-account-step" style={s.card}>
      {accountStep ? <>
        <View style={s.step}><Text style={s.number}>1</Text><Text style={s.heading}>{needsPhoneVerification ? 'Je vérifie mon numéro' : 'Je me connecte à Bibou'}</Text></View>
        <Text style={s.body}>{needsPhoneVerification ? 'Ton numéro doit être vérifié par SMS pour participer.' : 'Crée ou retrouve ton compte avec ton numéro.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={needsPhoneVerification ? 'Vérifier mon numéro par SMS' : 'Créer mon compte ou me connecter'} onPress={onLogin} style={s.primary}><Text style={s.primaryText}>{needsPhoneVerification ? 'Vérifier mon numéro par SMS →' : 'Créer mon compte\nou me connecter →'}</Text></Pressable>
        <Text style={s.hint}>Ce bouton ne t’inscrit pas encore au concours.</Text>
        <View style={s.next}><Text style={[s.number, s.pendingNumber]}>2</Text><View style={s.nextCopy}><Text style={s.nextTitle}>Je confirme ma participation</Text><Text style={s.small}>Juste après la connexion.</Text></View></View>
      </> : <>
        <Pressable accessibilityRole="button" onPress={onRules} style={s.rulesInner}><Text style={s.rulesText}>Lire le règlement et les lots ›</Text></Pressable>
        {check('J’ai lu et j’accepte le règlement.', accepted, onAccepted)}
        {check('J’ai 18 ans ou plus.', adult, onAdult)}
        {check('Je réside en ' + contest.region + '.', region, onRegion)}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCode }} onPress={() => setShowCode(value => !value)} style={s.codeToggle}><Text style={s.codeToggleText}>{showCode ? '▾' : '▸'} J’ai un code de parrainage (facultatif)</Text></Pressable>
        {showCode && <><Text style={s.small}>Code de mon ami</Text><TextInput accessibilityLabel="Code du parrain" value={code} onChangeText={onCode} autoCapitalize="characters" maxLength={40} style={s.input} placeholder="Code de parrainage" /></>}
        <View style={s.optional}>{check('Me prévenir si je gagne (facultatif)', prizeAlerts, onPrizeAlerts)}<Text style={s.small}>Notification ou SMS pour le lot et son expiration, sans publicité.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Confirmer mon inscription au concours" disabled={busy || !accepted || !adult || !region} style={[s.primary, (busy || !accepted || !adult || !region) && s.disabled]} onPress={onJoin}><Text style={s.primaryText}>{busy ? 'Enregistrement…' : 'Confirmer mon inscription\nau concours →'}</Text></Pressable>
        <Text style={s.hint}>C’est ce bouton qui valide ta participation.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPrivacy }} onPress={() => setShowPrivacy(value => !value)} style={s.codeToggle}><Text style={s.privacyLink}>Confidentialité de ma participation</Text></Pressable>
        {showPrivacy && <Text style={s.small}>Tes données servent à gérer le concours ; ton téléphone n’est pas affiché au public. Les participations sont purgées de la base active par l’entretien horaire après 90 jours suivant la clôture ; les sauvegardes expirent ensuite selon leur rotation. Aucun abonnement publicitaire.</Text>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>
    {accountStep && <>
      <Pressable accessibilityRole="button" accessibilityLabel="Voir les règles et les lots" onPress={onRules} style={s.rules}><Text style={s.rulesText}>Voir les règles et les lots →</Text></Pressable>
      <View testID="contest-static-prizes" style={s.prizes}>
        <Text style={s.eyebrow}>LES AMBASSADEURS BIBOU</Text>
        <Text accessibilityRole="header" style={s.prizeTitle}>Jusqu’à 1 an de Bibou à gagner</Text>
        <Text style={s.small}>Classement jusqu’au {end}</Text>
        {[
          ['1re place · 1 an de Bibou', contest.firstPrize],
          ['2e place · 6 mois de Bibou', contest.secondPrize],
          ['3e place · 2 menus', contest.thirdPrize],
        ].map(([title, detail]) => <View key={title} style={s.prize}><Text style={s.prizeHeading}>{title}</Text><Text style={s.small}>{detail}</Text></View>)}
      </View>
    </>}
  </View>;
}
const s = StyleSheet.create({
  root: { width: '100%', maxWidth: 620, alignSelf: 'center', marginBottom: 20 },
  eyebrow: { color: '#315B4B', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, lineHeight: 17 },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '900', color: '#25473B', marginTop: 8 },
  lead: { fontSize: 15, lineHeight: 23, color: '#52665A', marginTop: 12, marginBottom: 22 },
  card: { backgroundColor: '#FFFDF8', borderColor: '#C1D7CB', borderWidth: 1, borderRadius: 20, padding: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { color: '#FFFDF8', backgroundColor: '#315B4B', width: 28, height: 28, borderRadius: 14, textAlign: 'center', lineHeight: 28, fontSize: 14, fontWeight: '800', overflow: 'hidden' },
  pendingNumber: { backgroundColor: '#D6EEE3', color: '#315B4B' },
  heading: { flex: 1, fontSize: 17, lineHeight: 24, fontWeight: '800', color: '#25473B' },
  body: { color: '#52665A', fontSize: 14, lineHeight: 22, marginTop: 12 },
  primary: { backgroundColor: '#315B4B', borderRadius: 14, minHeight: 60, justifyContent: 'center', padding: 15, marginTop: 18 },
  primaryText: { color: '#FFFDF8', fontSize: 16, fontWeight: '800', lineHeight: 22, textAlign: 'center' },
  disabled: { backgroundColor: '#8CA69A', opacity: .6 },
  hint: { color: '#52665A', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  next: { borderTopWidth: 1, borderTopColor: '#E4E9DE', marginTop: 20, paddingTop: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nextCopy: { flex: 1, gap: 4 }, nextTitle: { color: '#25473B', fontSize: 15, fontWeight: '800', lineHeight: 22 },
  small: { color: '#52665A', fontSize: 13, lineHeight: 20 },
  rules: { padding: 12, marginTop: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  rulesInner: { paddingBottom: 12, marginBottom: 8, minHeight: 44, justifyContent: 'center' },
  rulesText: { color: '#315B4B', fontSize: 14, lineHeight: 22, fontWeight: '700', textDecorationLine: 'underline' },
  prizes: { borderTopWidth: 1, borderTopColor: '#C1D7CB', marginTop: 28, paddingTop: 28, gap: 10 },
  prizeTitle: { color: '#25473B', fontSize: 24, fontWeight: '900', lineHeight: 29 },
  prize: { marginTop: 8, gap: 3 }, prizeHeading: { color: '#25473B', fontSize: 15, fontWeight: '800', lineHeight: 22 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, minHeight: 44 },
  box: { fontSize: 22, color: '#315B4B', lineHeight: 24 }, checkText: { flex: 1, color: '#25473B', fontSize: 14, lineHeight: 22 },
  codeToggle: { paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  codeToggleText: { color: '#315B4B', fontSize: 13, fontWeight: '700', lineHeight: 21 },
  input: { fontSize: 16, backgroundColor: '#FFFDF8', borderColor: '#C1D7CB', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 6, color: '#25473B' },
  optional: { borderTopWidth: 1, borderTopColor: '#C1D7CB', paddingTop: 6, marginTop: 14 },
  privacyLink: { color: '#52665A', fontSize: 12, lineHeight: 18, textDecorationLine: 'underline', textAlign: 'center' },
  error: { color: '#B42B20', fontSize: 14, lineHeight: 22, marginTop: 14 },
});
