import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

export default function CustomerSmsPreferences({ api, authToken }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0), working = useRef(false);
  async function request(body) {
    const r = await fetch(api + '/customer/marketing-sms', { method: body ? 'PATCH' : 'GET', headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await r.json().catch(() => { throw Error('Le serveur ne répond pas correctement. Réessaie.'); });
    if (!r.ok) throw Error(result.error || 'Ton choix SMS n’a pas été enregistré.'); return result;
  }
  async function load() {
    const id = generation.current;
    try { const result = await request(); if (id === generation.current) { setData(result); setMessage(''); } }
    catch { if (id === generation.current) setMessage('Impossible de charger ton choix SMS. Aucun accord n’est ajouté.'); }
  }
  useEffect(() => { generation.current++; working.current = false; setData(null); setBusy(false); void load(); return () => { generation.current++; }; }, [api, authToken]);
  async function choose(accepted) {
    if (!data || working.current) return;
    const id = generation.current; working.current = true; setBusy(true); setMessage('Enregistrement…');
    try { const result = await request({ accepted }); if (id === generation.current) { setData(result); setMessage(accepted ? 'Tu as accepté les SMS promotionnels Bibou.' : 'Tu es désinscrit des SMS promotionnels.'); } }
    catch (e) { if (id === generation.current) { setMessage(e.message + ' Réessaie pour vérifier le choix enregistré.'); setData(null); } }
    finally { if (id === generation.current) { working.current = false; setBusy(false); } }
  }
  return <View style={s.card}><View style={s.row}><Text style={s.heading}>Les offres par SMS · facultatif</Text><Switch accessibilityLabel="Accepter les SMS promotionnels Bibou" disabled={!data || busy || !data.mobileSupported} value={data?.preferences.accepted === true} onValueChange={choose} trackColor={{ false: '#cbb8ae', true: '#397353' }} /></View><Text style={s.copy}>J’accepte de recevoir les promotions de Bibou’s Burgers par SMS sur mon numéro de téléphone. Ce choix est indépendant des offres personnalisées et des notifications de commande.</Text><Text style={s.note}>Désinscription ici ou via le lien STOP dans chaque SMS. Les SMS nécessaires à la connexion ne sont pas concernés. Sans accord, aucun SMS promotionnel n’est envoyé.</Text>{data && !data.mobileSupported && <Text style={s.note}>Ce canal est proposé aux numéros mobiles français.</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={s.feedback}>{message}</Text>}{!data && !busy && <Pressable accessibilityRole="button" onPress={load}><Text style={s.retry}>Recharger mon choix SMS</Text></Pressable>}</View>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#B7DDD0', padding: 20, borderRadius: 20, marginBottom: 16 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 }, heading: { flex: 1, fontSize: 18, fontWeight: '800', color: '#25473B' }, copy: { fontSize: 14, lineHeight: 22, color: '#405447' }, note: { fontSize: 12, lineHeight: 20, color: '#5E6F62', marginTop: 12 }, feedback: { color: '#25473B', lineHeight: 21, marginTop: 10 }, retry: { fontWeight: '800', color: '#315B4B', paddingVertical: 14 } });
