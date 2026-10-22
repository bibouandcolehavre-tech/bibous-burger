import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import SocialLinks from './SocialLinks';
import useExperienceMotion from './useExperienceMotion';
const { DEFAULT_NEWS, safePublicUrl } = require('./news-config');
const covers = { histoire: require('./assets/experience/histoire.jpg'), epicu: require('./assets/experience/epicu.png'), 'paris-normandie': require('./assets/experience/paris-normandie.png') };
const story = { id: 'histoire', kind: 'local-video', title: 'Pourquoi Bibou’s Burgers ?', subtitle: 'Notre histoire, racontée par Arnaud.' };
function LocalStory({ onClose }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(require('./assets/experience/histoire-hd.mp4'), value => { value.loop = false; });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    player.play();
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    return () => { listener.remove(); try { player.pause(); } catch { /* The native hook may already have released the player during unmount. */ } };
  }, [player]);
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={[s.playerPage, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fermer la vidéo" onPress={onClose} style={s.close}><Text style={s.link}>‹ Retour à Bibou</Text></Pressable>
    <Text style={s.title}>Pourquoi Bibou’s Burgers ?</Text><VideoView testID="bibou-local-story-player" player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} style={s.player} />
    {status === 'error' ? <Text accessibilityRole="alert" style={s.body}>La vidéo ne se charge pas. Tu peux revenir à ta commande sans perdre ton panier.</Text> : status === 'loading' ? <Text style={s.body}>Chargement de la vidéo…</Text> : null}
    <Pressable accessibilityRole="button" onPress={onClose} style={s.action}><Text style={s.actionText}>Revenir à ma commande</Text></Pressable>
  </View></Modal>;
}
export default function ExperienceNews({ apiBaseUrl, compact = true, onOpenContest }) {
  const [serverItems, setServerItems] = useState(DEFAULT_NEWS), [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const selectedId = useRef('histoire'), allowed = useExperienceMotion();
  const items = [story, ...serverItems.filter(item => item.enabled !== false && (!compact || item.kind !== 'contest') && item.id !== 'histoire')];
  useEffect(() => { if (items[index]) selectedId.current = items[index].id; }, [index]);
  useEffect(() => {
    let live = true, busy = false, controller;
    const refresh = async () => {
      if (busy) return; busy = true; controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
      try { const response = await fetch(`${apiBaseUrl}/news?contestApi=2`, { signal: controller.signal, cache: 'no-store' }); const data = await response.json(); if (live && response.ok && Array.isArray(data.items)) setServerItems(data.items); }
      catch { /* Public defaults remain usable; ordering never waits for news. */ }
      finally { clearTimeout(timer); busy = false; }
    };
    void refresh(); const timer = setInterval(refresh, 60000);
    return () => { live = false; controller?.abort(); clearInterval(timer); };
  }, [apiBaseUrl]);
  useEffect(() => { setIndex(Math.max(0, items.findIndex(item => item.id === selectedId.current))); }, [serverItems]);
  useEffect(() => {
    if (!compact || paused || playing || !allowed || items.length < 2) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % items.length), 5500);
    return () => clearInterval(timer);
  }, [compact, paused, playing, allowed, items.length]);
  const open = async item => {
    setPaused(true); setError('');
    if (item.kind === 'local-video') { setPlaying(true); return; }
    if (item.kind === 'contest') { onOpenContest?.(); return; }
    if (safePublicUrl(item.url)) try { await Linking.openURL(item.url); } catch { setError('Le lien ne s’est pas ouvert. Réessaie sans quitter ta commande.'); }
  };
  const card = item => item.kind === 'social' ? <SocialLinks key={item.id} compact style={s.social} /> : <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.kind === 'local-video' ? 'Lire la vidéo Pourquoi Bibou’s Burgers dans l’application' : item.title} disabled={item.kind === 'note' && !item.url} onPress={() => void open(item)} style={s.card}>
    <View style={s.copy}><Text style={s.tag}>{item.kind === 'local-video' ? 'NOTRE HISTOIRE' : item.id === 'epicu' ? 'LE REPORTAGE ÉPICU' : item.id === 'paris-normandie' ? 'PARIS-NORMANDIE' : item.kind === 'contest' ? 'LE CONCOURS BIBOU' : 'À LA UNE'}</Text><Text style={s.title}>{item.title}</Text>{!compact && <Text style={s.body}>{item.subtitle}</Text>}<Text style={s.link}>{item.kind === 'local-video' ? '▶ Regarder ici' : item.kind === 'video' ? item.id === 'epicu' ? '▶ Lire sur Instagram' : '▶ Lire sur Facebook' : 'Découvrir →'}</Text></View>
    {(covers[item.id] || safePublicUrl(item.imageUrl)) && <View style={s.cover}><Image source={covers[item.id] || { uri: item.imageUrl }} style={s.image} resizeMode="cover" />{['video', 'local-video'].includes(item.kind) && <View style={s.play}><Text style={s.playText}>▶</Text></View>}</View>}
  </Pressable>;
  return <View testID="experience-news-carousel" style={s.section}><Text style={s.heading}>Nos actualités</Text>{compact ? card(items[Math.min(index, items.length - 1)]) : <View style={s.stack}>{items.map(card)}</View>}
    {compact && <View style={s.controls}><Pressable accessibilityRole="button" accessibilityLabel="Actualité précédente" onPress={() => { setPaused(true); setIndex(current => (current - 1 + items.length) % items.length); }} style={s.control}><Text style={s.link}>‹</Text></Pressable><View style={s.dots}>{items.map((item, i) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Afficher ${item.title}`} accessibilityState={{ selected: i === index }} onPress={() => { selectedId.current = item.id; setIndex(i); setPaused(true); }} style={s.control}><View style={[s.dot, i === index && s.selected]} /></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Actualité suivante" onPress={() => { setPaused(true); setIndex(current => (current + 1) % items.length); }} style={s.control}><Text style={s.link}>›</Text></Pressable></View>}
    {compact && <Pressable accessibilityRole="button" onPress={() => setPaused(value => !value)} style={s.pause}><Text style={s.link}>{paused ? 'Reprendre le défilement' : 'Mettre en pause'}</Text></Pressable>}
    {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}{playing && <LocalStory onClose={() => setPlaying(false)} />}
  </View>;
}
const s = StyleSheet.create({
  section: { marginVertical: 14 }, heading: { color: '#315B4B', fontSize: 18, fontWeight: '700', marginBottom: 8 }, card: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#D9DCCD', borderRadius: 16, padding: 13, minHeight: 126 }, copy: { flex: 1, minWidth: 0 }, tag: { color: '#315B4B', fontSize: 11, fontWeight: '700', letterSpacing: .4 }, title: { color: '#315B4B', fontSize: 17, lineHeight: 21, fontWeight: '700', marginVertical: 6 }, body: { color: '#52665A', fontSize: 14, lineHeight: 21 }, link: { color: '#315B4B', fontSize: 13, fontWeight: '700' }, cover: { width: 54, height: 96, borderRadius: 9, overflow: 'hidden' }, image: { width: '100%', height: '100%' }, play: { position: 'absolute', top: 35, left: 12, width: 30, height: 30, borderRadius: 20, backgroundColor: '#FFFDF8', justifyContent: 'center', alignItems: 'center' }, playText: { color: '#315B4B', fontSize: 15 }, stack: { gap: 14 }, social: { borderWidth: 1, borderColor: '#D9DCCD' }, controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, control: { minWidth: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, dots: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 6, backgroundColor: '#BDCEBF' }, selected: { width: 21, backgroundColor: '#315B4B' }, pause: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' }, playerPage: { flex: 1, backgroundColor: '#FBF3E6', paddingHorizontal: 18, gap: 8 }, player: { flex: 1, width: '100%', backgroundColor: '#315B4B', borderRadius: 16 }, close: { minHeight: 48, justifyContent: 'center' }, action: { backgroundColor: '#315B4B', padding: 16, borderRadius: 14, minHeight: 48, alignItems: 'center' }, actionText: { color: '#FFFDF8', fontWeight: '700' },
});
