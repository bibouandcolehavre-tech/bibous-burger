import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
const { kioskQrRequest } = require('./kiosk-qr-client');
export default function KioskPhoneApproval({ api, authToken, pairing, onBack }) {
  const [terminal, setTerminal] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    kioskQrRequest(api, authToken, pairing, 'inspect').then(result => { if (active) setTerminal(result); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [api, authToken, pairing]);
  const confirm = async () => {
    if (busy) return; setBusy(true);
    try { await kioskQrRequest(api, authToken, pairing, 'approve'); setDone(true); setTerminal(null); }
    catch (error) { setMessage(error.message); setTerminal(null); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={s.page}>
    <Text style={s.title}>{done ? 'Connexion autorisée' : 'Connecter mon compte à la borne'}</Text>
    {done ? <Text style={s.copy}>Reviens à la borne pour poursuivre ta commande. Ton compte sera déconnecté à la fin de ta session.</Text> : terminal && <>
      <Text style={s.title}>{terminal.terminalName}</Text>
      <Text style={s.copy}>Confirme uniquement si tu es devant cette borne. Elle retrouvera tes points et tes avantages. Cette connexion n’effectue aucun paiement.</Text>
      <Pressable disabled={busy} onPress={confirm} style={s.button}><Text style={s.label}>{busy ? 'Confirmation…' : 'Connecter cette borne'}</Text></Pressable>
    </>}
    {!!message && <Text style={s.copy}>{message}</Text>}
    <Pressable onPress={onBack} style={s.button}><Text style={s.label}>{done ? 'Terminer' : 'Annuler'}</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({ page: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: '#FBF3E6' }, title: { fontSize: 28, color: '#315B4B', fontWeight: '800', marginVertical: 16 }, copy: { fontSize: 18, color: '#315B4B', lineHeight: 28, marginVertical: 16 }, button: { backgroundColor: '#315B4B', padding: 20, borderRadius: 18, marginVertical: 12 }, label: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: '#fff' } });
