import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { pushRequest } from './push-api';
import { openPushSettings, pushDeviceStatus, syncPushDevice } from './push-client';

export default function NotificationSettings({ api, authToken, onBack }) {
  const [data, setData] = useState(null), [device, setDevice] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(true), working = useRef(false);
  const refresh = async () => {
    const [state, status] = await Promise.all([pushRequest(api, authToken), pushDeviceStatus()]);
    if (alive.current) { setData(state); setDevice(status); }
  };
  useEffect(() => {
    alive.current = true;
    void refresh().catch(e => { if (alive.current) setMessage(e.message); });
    const sub = AppState.addEventListener('change', s => { if (s === 'active' && !working.current) void refresh().catch(() => {}); });
    return () => { alive.current = false; sub.remove(); };
  }, [authToken]);
  const perform = async task => {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage('');
    try { await task(); }
    catch (e) { if (alive.current) setMessage(e.message || 'Réessaie dans un instant.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const change = (key, value) => perform(async () => {
    const result = await pushRequest(api, authToken, '', 'PATCH', { [key]: value });
    if (alive.current) { setData(result); setMessage('Ton choix est enregistré.'); }
    // OS permission is requested only after an explicit opt-in, never at app startup.
    await syncPushDevice(api, authToken, { ask: value });
    await refresh();
  });
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={s.back}><Text style={s.backText}>‹ Mon compte</Text></Pressable>
    <Text style={s.eyebrow}>À TON RYTHME</Text><Text style={s.title}>Mes notifications</Text>
    <Text style={s.intro}>Les nouvelles de Bibou, seulement si tu le souhaites.</Text>
    <View style={s.info}><Text style={s.infoTitle}>{device?.supported ? 'Sur ce téléphone' : 'Version iPhone et Android'}</Text><Text style={s.copy}>{device?.message || 'Vérification des notifications…'}</Text>{data && !(device?.platform ? data.enabledPlatforms.includes(device.platform) : data.enabledPlatforms.length) && <Text style={s.notice}>Les envois sur téléphone sont encore en préparation. Tes choix sont conservés, aucun envoi n’est actif pour le moment.</Text>}</View>
    {[['service', 'Commandes et réservations', 'Commande acceptée, prête ou en livraison, confirmation de ta table.'], ['marketing', 'Promotions et actualités', 'Burger du mois, offres et nouvelles de Bibou’s Burgers. Facultatif et désactivable à tout moment.']].map(([key, title, description]) => <View key={key} style={s.card}><View style={s.row}><Text style={s.cardTitle}>{title}</Text><Switch accessibilityLabel={title} disabled={busy || !data} value={data?.preferences[key] || false} onValueChange={v => change(key, v)} trackColor={{ false: '#D9CBC2', true: '#17664C' }} /></View><Text style={s.copy}>{description}</Text><Text style={s.choice}>{data?.preferences[key] ? 'Choix : activé' : 'Choix : désactivé'}</Text></View>)}
    {!!device?.supported && <Pressable disabled={busy || !data || (!data.preferences.service && !data.preferences.marketing)} accessibilityRole="button" style={[s.button, busy && s.dim]} onPress={() => perform(async () => { await syncPushDevice(api, authToken, { ask: true }); await refresh(); setMessage('État du téléphone actualisé.'); })}><Text style={s.buttonText}>{busy ? 'Enregistrement…' : 'Associer / actualiser ce téléphone'}</Text></Pressable>}
    {!!device?.supported && !device.granted && <Pressable accessibilityRole="button" style={s.back} onPress={() => perform(openPushSettings)}><Text style={s.backText}>Ouvrir les réglages du téléphone</Text></Pressable>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.feedback}>{message}</Text>}
    {!data && <Pressable accessibilityRole="button" style={s.back} onPress={() => perform(refresh)}><Text style={s.backText}>Réessayer</Text></Pressable>}
    {data?.devices?.length > 0 && <View style={s.info}><Text style={s.infoTitle}>Appareils associés ({data.devices.length})</Text>{data.devices.map((d, i) => <View key={d.installationId} style={s.device}><Text style={s.copy}>{d.platform === 'ios' ? 'iPhone' : 'Android'} · appareil {i + 1}</Text><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Retirer l’appareil ${i + 1}`} onPress={() => perform(async () => { await pushRequest(api, authToken, `/devices/${d.installationId}`, 'DELETE'); await refresh(); setMessage('Appareil retiré. Il pourra se réassocier lors d’une prochaine ouverture si tes choix restent activés.'); })}><Text style={s.backText}>Retirer</Text></Pressable></View>)}</View>}
    <Text style={s.footer}>Tu peux toujours commander sans notifications. Les promotions ne conditionnent aucun avantage fidélité. Aucun numéro de téléphone ni adresse n’est affiché dans les messages de suivi. La réception dépend aussi d’Internet et des réglages de ton téléphone.</Text>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: '#E95122' }, content: { padding: 22, paddingBottom: 50, maxWidth: 680, width: '100%', alignSelf: 'center' }, back: { paddingVertical: 14 }, backText: { color: '#231711', fontWeight: '800', fontSize: 15 }, eyebrow: { color: '#321A11', fontWeight: '800', letterSpacing: 2, marginTop: 22, fontSize: 11 }, title: { fontSize: 32, fontWeight: '900', color: '#FFF', marginTop: 8 }, intro: { fontSize: 16, lineHeight: 24, color: '#FFF', marginTop: 10, marginBottom: 22 }, info: { padding: 18, backgroundColor: '#FFF0DD', borderRadius: 18, marginBottom: 16 }, infoTitle: { fontWeight: '800', color: '#32231B', marginBottom: 8 }, copy: { fontSize: 14, lineHeight: 22, color: '#4E3B30' }, notice: { marginTop: 12, fontSize: 13, lineHeight: 20, color: '#734011' }, card: { backgroundColor: '#FFFBF6', padding: 18, borderRadius: 20, marginBottom: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }, cardTitle: { flex: 1, fontWeight: '800', fontSize: 17, color: '#2C201B' }, choice: { color: '#17664C', fontSize: 12, fontWeight: '700', marginTop: 12 }, button: { backgroundColor: '#241A16', borderRadius: 15, padding: 18, marginTop: 8 }, buttonText: { color: '#FFF', fontWeight: '800', textAlign: 'center' }, feedback: { color: '#2C201B', backgroundColor: '#FFF0DD', padding: 15, borderRadius: 12, lineHeight: 21, marginVertical: 12 }, footer: { color: '#331C12', lineHeight: 21, fontSize: 12, marginTop: 15 }, device: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: 10 }, dim: { opacity: 0.65 } });
