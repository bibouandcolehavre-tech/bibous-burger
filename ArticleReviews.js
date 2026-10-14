import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
const { isReviewToken } = require('./review-client');
export default function ArticleReviews({ api, token, orderId, googleUrl, onBack }) {
  const [data, setData] = useState(null), [notes, setNotes] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0), working = useRef(false);
  async function request(body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${api}/customer/orders/${encodeURIComponent(orderId)}/ratings`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: controller.signal, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'Avis indisponibles.'); return result;
    } finally { clearTimeout(timer); }
  }
  async function load() {
    const id = generation.current;
    try { const result = await request(); if (id === generation.current) { setData(result); setNotes(Object.fromEntries(result.articles.filter(a => a.stars).map(a => [a.productId, a.stars]))); setMessage(''); } }
    catch (e) { if (id === generation.current) setMessage(e.message); }
  }
  useEffect(() => { generation.current++; setData(null); setNotes({}); setBusy(false); working.current = false; if (token && orderId) void load(); return () => { generation.current++; }; }, [api, token, orderId]);
  async function save() {
    if (working.current || !data?.eligible) return; working.current = true; setBusy(true); const id = generation.current;
    try { const result = await request({ ratings: Object.entries(notes).map(([productId, stars]) => ({ productId, stars })) }); if (id === generation.current) { setData(result); setMessage('Merci ! Tes notes sont enregistrées.'); } }
    catch (e) { if (id === generation.current) setMessage(e.message); }
    finally { if (id === generation.current) { setBusy(false); working.current = false; } }
  }
  return <ScrollView contentContainerStyle={s.page}><Pressable onPress={onBack} style={s.button}><Text style={s.white}>‹ Retour</Text></Pressable><Text style={s.title}>Comment était ton repas ?</Text><Text style={s.text}>Note chaque article après la dégustation. Aucun point ni cadeau n’est accordé pour un avis.</Text>{data && !data.eligible && <Text style={s.text}>Tu pourras noter les articles dès que le restaurant aura marqué la commande remise ou livrée.</Text>}{data?.articles.map(article => <View key={article.productId} style={s.card}><Text style={s.heading}>{article.name}</Text><View style={s.stars}>{[1, 2, 3, 4, 5].map(star => <Pressable key={star} accessibilityRole="button" accessibilityLabel={`${star} étoile${star > 1 ? 's' : ''} pour ${article.name}`} accessibilityState={{ selected: notes[article.productId] === star }} disabled={!data.eligible || busy} onPress={() => setNotes(current => ({ ...current, [article.productId]: star }))}><Text style={[s.star, notes[article.productId] >= star && s.selected]}>★</Text></Pressable>)}</View></View>)}{data?.eligible && <Pressable disabled={busy || !Object.keys(notes).length} onPress={save} style={s.button}><Text style={s.white}>{busy ? 'Enregistrement…' : 'Enregistrer mes notes'}</Text></Pressable>}{!!message && <Text accessibilityLiveRegion="polite" style={s.text}>{message}</Text>}{!data && token && orderId && <Pressable onPress={load} style={s.button}><Text style={s.white}>Recharger les articles</Text></Pressable>}<Text style={s.text}>Sur la carte, le pourcentage de satisfaction représente la part des avis de 4 ou 5 étoiles, parmi les avis vérifiés.</Text><View style={s.card}><Text style={s.heading}>Et ton expérience chez Bibou ?</Text><Text style={s.text}>Ton avis Google est indépendant de ces notes. Tu restes libre de publier l’avis de ton choix.</Text><Pressable accessibilityRole="link" onPress={() => isReviewToken(token) ? setMessage('Avis de test uniquement : aucun avis réel n’est envoyé à Google.') : Linking.openURL(googleUrl).catch(() => setMessage('Le lien Google ne s’est pas ouvert. Réessaie.'))} style={s.button}><Text style={s.white}>Laisser un avis sur Google ↗</Text></Pressable></View></ScrollView>;
}
const s = StyleSheet.create({ page: { flexGrow: 1, backgroundColor: '#FBF3E6', padding: 20, gap: 15 }, title: { color: '#25473B', fontSize: 26, fontWeight: '800' }, text: { color: '#405447', lineHeight: 22 }, heading: { color: '#25473B', fontWeight: '700', fontSize: 18 }, card: { backgroundColor: '#FFFCF7', borderRadius: 18, padding: 16, gap: 12 }, stars: { flexDirection: 'row', gap: 5 }, star: { color: '#B5BEB4', fontSize: 35, padding: 4 }, selected: { color: '#E95122' }, button: { backgroundColor: '#315B4B', minHeight: 48, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, white: { color: '#fff', fontWeight: '700' } });
