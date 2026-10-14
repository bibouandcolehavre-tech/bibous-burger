import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
const monthLabel = month => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(`${month}-15T12:00:00Z`));
export default function ContestPrizes({ apiBaseUrl, token, onOrder }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [reload, setReload] = useState(0), [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const headers = { Authorization: `Bearer ${token}`, ...(Platform.OS === 'web' ? {} : { 'X-Bibou-Platform': Platform.OS }) };
  useEffect(() => {
    if (!token) return;
    const id = ++epoch.current, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    setData(null); setError(''); setBusy(false);
    fetch(`${apiBaseUrl}/customer/contest/prizes`, { signal: controller.signal, cache: 'no-store', headers })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Les menus gagnés ne sont pas disponibles pour le moment.'); return result; })
      .then(result => { if (epoch.current === id) setData(result); })
      .catch(err => { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Connexion trop lente. Actualise pour réessayer.' : err.message); })
      .finally(() => clearTimeout(timeout));
    return () => { epoch.current++; controller.abort(); clearTimeout(timeout); };
  }, [apiBaseUrl, token, reload]);
  const updateAlerts = async enabled => {
    if (busy) return;
    const id = epoch.current, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/customer/contest/prizes/alerts`, { method: 'PATCH', signal: controller.signal,
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’enregistrer ton choix.');
      if (epoch.current === id) setData(result);
    } catch (err) { if (epoch.current === id) setError(err.name === 'AbortError' ? 'Actualise pour vérifier ton choix avant de réessayer.' : err.message); }
    finally { clearTimeout(timeout); if (epoch.current === id) setBusy(false); }
  };
  if (!token) return null;
  const alerts = data?.grants.some(g => g.alertsEnabled), available = data?.vouchers.filter(v => v.status === 'available') || [];
  return <View style={s.card}>
    <Text style={s.title}>🎁 Mes menus gagnés</Text>
    {!data && !error && <Text style={s.text}>Chargement de tes codes personnels…</Text>}
    {data && !data.grants.length && <Text style={s.text}>Aucun lot confirmé sur ton compte. Les gagnants sont vérifiés après la clôture ; aucune activation n’a lieu depuis cet écran.</Text>}
    {data?.grants.map(grant => <View key={grant.id} style={s.plan}><Text style={s.strong}>{grant.rank === 1 ? '1re' : `${grant.rank}e`} place · {grant.menus} menu(s) {grant.months > 1 ? `par mois pendant ${grant.months} mois` : 'en une seule commande'}</Text><Text style={s.small}>Du mois de {monthLabel(grant.startMonth)} à {monthLabel(grant.lastMonth)}.</Text></View>)}
    {available.map(voucher => <View key={voucher.id} style={s.voucher}>
      <Text style={s.strong}>{monthLabel(voucher.month)} · {voucher.remaining} menu(s) disponible(s)</Text>
      {voucher.code ? <><Text selectable accessibilityLabel="Mon code personnel pour les menus gagnés" style={s.code}>{voucher.code}</Text><Text style={s.small}>Appui long pour copier. Applique ce code à l’étape de paiement de ta commande dans l’application.</Text>{onOrder && <Pressable accessibilityRole="button" style={s.button} onPress={onOrder}><Text style={s.buttonText}>Choisir mes menus ›</Text></Pressable>}</> : <Text style={s.text}>Ouvre l’application iPhone ou Android pour retrouver ton code et commander.</Text>}
      <Text style={s.warning}>Valable jusqu’à la fin du {voucher.lastDay.split('-').reverse().join('/')} (heure de Paris). Non utilisés = perdus, sans report.</Text>
      <Text style={s.small}>{voucher.singleOrder ? 'Les deux menus s’utilisent en une seule commande.' : 'Tu peux utiliser ton quota en une ou plusieurs commandes pendant ce mois.'} Choisis un créneau dans ce mois. Hors suppléments et frais de livraison éventuels.</Text>
      <Text style={s.small}>Menus éligibles : {voucher.eligibleMenus.map(p => p.name).join(' · ')}.</Text>
    </View>)}
    {data?.vouchers.filter(v => v.status !== 'available').map(voucher => <Text key={voucher.id} style={s.small}>{monthLabel(voucher.month)} : {voucher.status === 'expired' ? 'code expiré, menus non utilisés perdus' : 'menus utilisés ou réservés dans tes commandes'}.</Text>)}
    {!!data?.grants.length && <><Text style={s.warning}>Commande uniquement dans l’application. Ne te présente pas directement au restaurant pour utiliser ce lot.</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: Boolean(alerts), disabled: busy }} disabled={busy} style={s.preference} onPress={() => updateAlerts(!alerts)}><Text style={s.strong}>{alerts ? '☑' : '☐'} M’avertir pour mes menus gagnés</Text><Text style={s.small}>Code disponible et rappel dix jours avant la fin du mois, seulement s’il reste des menus. Notification si autorisée, sinon SMS si le service est configuré. Aucun SMS promotionnel ajouté.</Text></Pressable></>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReload(n => n + 1)} style={s.preference}><Text style={s.strong}>Actualiser mes menus gagnés</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#FFFDF8', borderRadius: 18, padding: 18, gap: 12, marginTop: 18 }, title: { fontSize: 21, fontWeight: '800', color: '#315B4B' }, text: { fontSize: 15, lineHeight: 23, color: '#243B31' }, strong: { fontSize: 15, fontWeight: '700', color: '#315B4B' }, small: { fontSize: 13, lineHeight: 20, color: '#52665A' }, plan: { gap: 5 }, voucher: { borderRadius: 15, padding: 15, backgroundColor: '#DCEBE2', gap: 10 }, code: { fontSize: 16, fontWeight: '800', color: '#25473B', backgroundColor: '#FFFDF8', padding: 13, borderRadius: 10 }, warning: { color: '#7C361F', fontSize: 14, lineHeight: 21, fontWeight: '600' }, button: { padding: 15, borderRadius: 12, backgroundColor: '#315B4B', alignItems: 'center' }, buttonText: { color: '#FFFDF8', fontWeight: '700' }, preference: { paddingVertical: 14, gap: 7 }, error: { color: '#9A2015', fontSize: 14, lineHeight: 21 } });
