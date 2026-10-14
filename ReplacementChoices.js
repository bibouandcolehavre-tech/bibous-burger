import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
const { consumerRecipeGroup } = require('./customer-journey');
const { kioskRecipeChoices } = require('./consumer-recipe');
const money = n => Number(n).toFixed(2).replace('.', ',') + ' €';
const titles = { protein: 'Choisis ta protéine', 'meat-type': 'Type de viande', salad: 'Crudités', sauces: 'Sauce', drink: 'Boisson', 'menu-fries': 'Frites', extras: 'Suppléments', sides: 'Accompagnements', desserts: 'Dessert', 'menu-desserts': 'Dessert du menu', 'solo-fries': 'Frites', 'solo-dessert': 'Dessert' };
export default function ReplacementChoices({ order, api, token, onUpdated, onCancel }) {
  const [data, setData] = useState(null), [selected, setSelected] = useState({}), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [refusing, setRefusing] = useState(false);
  const generation = useRef(0), working = useRef(false);
  async function request(action, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(`${api}/customer/orders/${encodeURIComponent(order.apiId)}/${action}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: controller.signal, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await r.json(); if (!r.ok) throw Error(result.error || 'Remplacements indisponibles.'); return result;
    } finally { clearTimeout(timer); }
  }
  async function load() {
    const id = generation.current;
    try { const result = await request('replacement-options'); if (id === generation.current) { setData(result); setMessage(''); } }
    catch (e) { if (id === generation.current) setMessage(e.message); }
  }
  useEffect(() => { generation.current++; setData(null); setSelected({}); setRefusing(false); void load(); return () => { generation.current++; }; }, [api, token, order.apiId, order.amendment.revision, order.amendment.phase]);
  function choose(target, alternative) {
    const choices = alternative.definition?.fixedSauce ? { sauces: [alternative.definition.fixedSauce] } : {};
    setSelected(current => ({ ...current, [target.key]: target.groupId ? { target: target.key, id: alternative.id } : { target: target.key, productId: alternative.id, choices } }));
  }
  function toggle(target, group, option, max) {
    setSelected(current => {
      const value = current[target.key], choices = value.choices || {}, old = choices[group] || [];
      const next = old.includes(option.id) ? old.filter(id => id !== option.id) : max === 1 || option.exclusive ? [option.id] : [...old.filter(id => !['sans-crudites', 'sans-sauce'].includes(id)), option.id];
      return { ...current, [target.key]: { ...value, choices: kioskRecipeChoices(choices, group, next) } };
    });
  }
  async function send() {
    if (working.current || !data) return; working.current = true; setBusy(true); const id = generation.current;
    try {
      const choices = data.choices.map(target => {
        const value = selected[target.key]; if (!value) throw Error('Choisis un remplacement pour chaque article.');
        if (target.groupId) return value;
        const definition = target.alternatives.find(p => p.id === value.productId).definition;
        return { target: value.target, productId: value.productId, selections: Object.entries(value.choices).filter(([group]) => definition.groups.some(g => g.id === group)).flatMap(([groupId, ids]) => ids.map(id => ({ groupId, id }))) };
      });
      await request('replacement-choice', { revision: data.revision, choices });
      if (id === generation.current) { setMessage('Tes choix sont envoyés. Le restaurant doit maintenant les confirmer.'); await onUpdated(); }
    } catch (e) { if (id === generation.current) setMessage(e.message); }
    finally { if (id === generation.current) { setBusy(false); working.current = false; } }
  }
  return <View style={s.card}><Text style={s.title}>{order.id} · Article indisponible</Text><Text style={s.text}>{order.amendment.proposal.reason}</Text><Text style={s.text}>Ta commande initiale reste inchangée jusqu’à la confirmation du restaurant. Aucun supplément ne sera débité sans un parcours de paiement distinct.</Text>{data?.phase === 'submitted' ? <><Text style={s.title}>Confirmation du restaurant attendue</Text>{data.proposal.items.map((item, i) => <Text key={i} style={s.text}>{item.quantity} × {item.name} · {item.options.map(o => o.label).join(', ')}</Text>)}<Text style={s.text}>Nouveau total : {money(data.proposal.total)}{data.proposal.refundAmount > 0 ? ` · ${money(data.proposal.refundAmount)} à rembourser par le restaurant dans SumUp.` : ''}</Text></> : data?.choices.map(target => <View key={target.key} style={s.panel}><Text style={s.title}>Remplacer : {target.label}</Text>{target.alternatives.map(p => <View key={p.id}><Pressable disabled={busy} onPress={() => choose(target, p)} style={[s.button, (selected[target.key]?.productId || selected[target.key]?.id) === p.id && s.chosen]}><Text style={s.text}>{p.name || p.label} · {target.groupId ? '+' : 'dès '}{money(p.price || 0)}</Text></Pressable>{selected[target.key]?.productId === p.id && p.definition.kind !== 'naan' && p.definition.groups.map(raw => {
    const value = selected[target.key], group = raw.id === 'sauces' && p.definition.fixedSauce ? raw : consumerRecipeGroup(raw, value.choices, p);
    if (group.id === 'meat-type' && value.choices.protein?.some(id => ['vegetarian', 'galette-base'].includes(id))) return null;
    return <View key={group.id} style={s.group}><Text style={s.text}>{titles[group.id] || group.id}</Text>{group.options.map(o => <Pressable key={o.id} disabled={busy} onPress={() => toggle(target, group.id, o, group.max)} style={[s.button, value.choices[group.id]?.includes(o.id) && s.chosen]}><Text style={s.text}>{value.choices[group.id]?.includes(o.id) ? '✓ ' : ''}{o.label}{o.price > 0 ? ` + ${money(o.price)}` : ''}</Text></Pressable>)}</View>;
  })}</View>)}{!target.alternatives.length && <Text style={s.text}>Aucun remplacement disponible. Tu peux annuler la commande et demander son remboursement.</Text>}</View>)}{data?.phase === 'choosing' && <Pressable disabled={busy} style={s.submit} onPress={send}><Text style={s.white}>{busy ? 'Enregistrement…' : 'Envoyer mes nouveaux choix'}</Text></Pressable>}{!!message && <Text style={s.text} accessibilityLiveRegion="polite">{message}</Text>}{!data && <Pressable style={s.button} onPress={load}><Text style={s.text}>Recharger les choix</Text></Pressable>}{refusing ? <><Text style={s.text}>Toute la commande sera annulée. Le restaurant devra rembourser le montant payé.</Text><Pressable disabled={busy} style={s.button} onPress={onCancel}><Text style={s.text}>Confirmer l’annulation et demander le remboursement</Text></Pressable><Pressable onPress={() => setRefusing(false)}><Text style={s.text}>Garder ma commande</Text></Pressable></> : <Pressable disabled={busy} onPress={() => setRefusing(true)} style={s.button}><Text style={s.text}>Aucun choix ne me convient · annuler la commande</Text></Pressable>}</View>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#DCEBE2', padding: 18, borderRadius: 18, gap: 12, marginBottom: 15 }, panel: { backgroundColor: '#FFFDF8', padding: 14, borderRadius: 14, gap: 8 }, title: { color: '#25473B', fontWeight: '800', fontSize: 18 }, text: { color: '#405447', lineHeight: 22 }, button: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#B6C8BD', marginVertical: 4, minHeight: 48 }, chosen: { backgroundColor: '#C6E1D1', borderColor: '#315B4B' }, group: { paddingLeft: 10, marginVertical: 8 }, submit: { backgroundColor: '#315B4B', borderRadius: 14, padding: 16 }, white: { color: '#fff', textAlign: 'center', fontWeight: '700' } });
