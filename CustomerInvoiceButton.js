import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { saveInvoice } from './invoice-download';
import { createCustomerFetch } from './review-client';

export default function CustomerInvoiceButton({ api, token, orderId }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false), [billing, setBilling] = useState({ name: '', address: '', omitAddress: false });
  const generation = useRef(0), locked = useRef(false), active = useRef(null);
  const identity = useRef(''); identity.current = `${api}:${token}:${orderId}`;
  useEffect(() => {
    generation.current++; locked.current = false; setBusy(false); setMessage(''); setFormOpen(false);
    return () => { generation.current++; active.current?.abort(); };
  }, [api, token, orderId]);
  async function download(confirmedBilling) {
    if (locked.current || !token || !/^order-\d+$/.test(orderId || '')) return;
    locked.current = true; setBusy(true); setMessage('');
    const id = generation.current, selectedIdentity = identity.current, current = () => generation.current === id && identity.current === selectedIdentity;
    const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    const customerFetch = createCustomerFetch(api, (...args) => fetch(...args));
    const route = `${api}/customer/orders/${encodeURIComponent(orderId)}/invoice`;
    try {
      if (confirmedBilling === undefined) {
        const statusResponse = await customerFetch(route, { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
        const status = await statusResponse.json();
        if (!current()) return;
        if (!statusResponse.ok) throw Error(status.error || 'Facture indisponible.');
        if (status.status !== 'issued') {
          setBilling({ name: status.billing?.name || '', address: status.billing?.address || '', omitAddress: false }); setFormOpen(true); return;
        }
      }
      const response = await customerFetch(route, { method: 'POST', signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, ...(confirmedBilling ? { billing: confirmedBilling } : {}) }) });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok) throw Error(result.error || 'Facture indisponible. Réessaie plus tard.');
      if (result.status === 'requested') { setFormOpen(false); setMessage(result.message); return; }
      if (result.status !== 'issued' || !/^(WEB-\d{4}-\d{6}|facture-commande-\d+-laddition)\.pdf$/.test(result.filename || '')) throw Error('La facture doit être vérifiée par le restaurant.');
      const pdf = await customerFetch(route + '/pdf', { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      if (!pdf.ok) { const error = await pdf.json().catch(() => ({})); throw Error(error.error || 'Téléchargement indisponible.'); }
      if (!(pdf.headers.get('content-type') || '').startsWith('application/pdf')) throw Error('Le document reçu n’est pas un PDF.');
      if (!current()) return;
      setFormOpen(false);
      if (await saveInvoice(pdf, result.filename, current) && current()) setMessage('Ta facture PDF est prête à être enregistrée dans tes fichiers.');
    } catch (error) {
      if (current()) setMessage(error.name === 'AbortError' ? 'La demande met trop de temps. Réessaie : ta facture ne sera pas créée deux fois.' : error.message);
    } finally { clearTimeout(timeout); if (current()) { locked.current = false; setBusy(false); } }
  }
  if (!token || !/^order-\d+$/.test(orderId || '')) return null;
  return <View style={s.area}><Pressable accessibilityRole="button" accessibilityLabel="Télécharger ma facture PDF" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void download(); }} style={[s.button, busy && { opacity: .6 }]}>
    {busy ? <ActivityIndicator color="#315B4B" /> : null}<Text style={s.label}>{busy ? 'Préparation de la facture…' : 'Télécharger ma facture PDF'}</Text>
  </Pressable>{message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
    <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => { if (!busy) setFormOpen(false); }}>
      <View style={s.overlay}><ScrollView style={s.sheet} contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Ma facture</Text><Text style={s.message}>Vérifie tes coordonnées avant la première édition. Les prochains téléchargements reprendront exactement le même document.</Text>
        <Text style={s.label}>Nom complet</Text><TextInput accessibilityLabel="Nom complet sur la facture" value={billing.name} maxLength={180} editable={!busy} onChangeText={name => setBilling(v => ({ ...v, name }))} style={s.input}/>
        <Text style={s.label}>Adresse de facturation</Text><TextInput accessibilityLabel="Adresse de facturation" value={billing.address} maxLength={240} multiline editable={!busy && !billing.omitAddress} onChangeText={address => setBilling(v => ({ ...v, address }))} style={s.input}/>
        <View style={s.choice}><Switch accessibilityLabel="Ne pas faire figurer mon adresse, facture à mon nom de particulier" value={billing.omitAddress} disabled={busy} onValueChange={omitAddress => setBilling(v => ({ ...v, omitAddress }))}/><Text style={[s.message, { flex: 1, marginTop: 0 }]}>Je suis un particulier et je ne souhaite pas faire figurer mon adresse.</Text></View>
        <Text style={s.message}>Le montant est celui de ta commande déjà payée. Aucun nouveau paiement.</Text>
        <Pressable accessibilityRole="button" disabled={busy || billing.name.trim().length < 2 || (!billing.omitAddress && !billing.address.trim())} onPress={() => { void download(billing); }} style={[s.button, { marginTop: 15 }, (busy || billing.name.trim().length < 2 || (!billing.omitAddress && !billing.address.trim())) && { opacity: .5 }]}><Text style={s.label}>{busy ? 'Préparation…' : 'Confirmer et télécharger le PDF'}</Text></Pressable>
        {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setFormOpen(false)} style={[s.button, { backgroundColor: '#F4EEE5', marginTop: 10 }]}><Text style={s.label}>Annuler</Text></Pressable>
      </ScrollView></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({ area: { marginTop: 10, width: '100%' }, button: { backgroundColor: '#E5EBE0', borderRadius: 12, padding: 13, minHeight: 48, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' }, label: { color: '#315B4B', fontSize: 14, fontWeight: '800' }, message: { color: '#526D60', fontSize: 13, lineHeight: 20, marginTop: 8 }, overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', alignItems: 'center', padding: 18 }, sheet: { backgroundColor: '#FBF3E6', borderRadius: 22, maxHeight: '90%', width: '100%', maxWidth: 520 }, title: { color: '#315B4B', fontSize: 24, fontWeight: '900' }, input: { backgroundColor: '#fff', color: '#263D34', borderColor: '#C7D4C5', borderWidth: 1, borderRadius: 10, minHeight: 48, padding: 12, fontSize: 16, marginVertical: 10 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 } });
