import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import SocialLinks from './SocialLinks';
const { DEFAULT_NEWS, safePublicUrl } = require('./news-config');

export default function NewsCarousel({ apiBaseUrl, onOpenContest }) {
  const [items, setItems] = useState(DEFAULT_NEWS);
  const [index, setIndex] = useState(0);
  const scroll = useRef(null);
  const selectedId = useRef(DEFAULT_NEWS[0].id);
  const { width } = useWindowDimensions();
  const available = Math.min(Math.max(280, width - 40), 1140);
  const cardWidth = width >= 900 ? Math.min(760, available * .72) : available;
  const step = cardWidth + 12;
  useEffect(() => {
    let alive = true, loading = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (loading) return;
      loading = true;
      const requestController = new AbortController();
      const cancel = () => requestController.abort();
      controller.signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, 12000);
      try {
        const response = await fetch(`${apiBaseUrl}/news`, { signal: requestController.signal, cache: 'no-store' });
        const data = await response.json();
        if (alive && response.ok && Array.isArray(data.items)) setItems(data.items);
      } catch { /* Keep the last successful cards; never block ordering. */ }
      finally { loading = false; clearTimeout(timeout); controller.signal.removeEventListener('abort', cancel); }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [apiBaseUrl]);
  useEffect(() => {
    const next = Math.max(0, items.findIndex(item => item.id === selectedId.current));
    setIndex(next);
    scroll.current?.scrollTo({ x: next * step, animated: false });
  }, [items, step]);
  const open = item => {
    if (item.kind === 'contest') return onOpenContest();
    if (safePublicUrl(item.url)) void Linking.openURL(item.url).catch(() => {});
  };
  if (!items.length) return null;
  return <View style={s.section}><Text style={s.heading}>Nos actualités</Text><Text style={s.intro}>La vie de Bibou, au fil des envies.</Text>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} snapToInterval={step} decelerationRate="fast" disableIntervalMomentum contentContainerStyle={{ gap: 12, paddingRight: Math.max(0, available - cardWidth) }} onScroll={event => { const next = Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / step))); setIndex(next); selectedId.current = items[next]?.id; }} scrollEventThrottle={16}>
      {items.map(item => {
        if (item.kind === 'social') return <SocialLinks key={item.id} style={{ width: cardWidth }} />;
        const source = item.imageUrl && safePublicUrl(item.imageUrl) ? { uri: item.imageUrl } : null;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} disabled={item.kind === 'note' && !item.url} onPress={() => open(item)} style={[s.card, { width: cardWidth }, item.kind === 'contest' && s.contest]}>
          {source && <><Image source={source} style={s.photo} /><View style={s.shade} /></>}
          {item.kind === 'contest' && <Text style={s.decor} importantForAccessibility="no">✦</Text>}
          {item.kind === 'video' && <Text style={s.play} importantForAccessibility="no">▶</Text>}
          <View style={s.copy}><Text style={s.tag}>{item.kind === 'contest' ? 'BIENTÔT ENSEMBLE' : item.kind === 'article' ? 'ON PARLE DE NOUS' : item.kind === 'video' ? 'LE HAVRE · EPICU' : 'À LA UNE'}</Text><Text style={s.title}>{item.title}</Text><Text style={s.subtitle}>{item.subtitle}</Text></View>
        </Pressable>;
      })}
    </ScrollView>
    <View style={s.dots}>{items.map((item, i) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: i === index }} accessibilityLabel={`Afficher ${item.title}, diapositive ${i + 1} sur ${items.length}`} onPress={() => scroll.current?.scrollTo({ x: i * step, animated: true })} style={s.dotButton}><View style={[s.dot, i === index && s.selected]} /></Pressable>)}</View>
  </View>;
}
const s = StyleSheet.create({
  section: { marginTop: 12 }, heading: { color: '#fff', fontSize: 27, fontWeight: '900' }, intro: { color: '#fff', fontSize: 14, marginTop: 3, marginBottom: 15 },
  card: { height: 190, borderRadius: 22, overflow: 'hidden', backgroundColor: '#171a19', justifyContent: 'flex-end' }, contest: { backgroundColor: '#26251e', borderColor: '#ffd07b', borderWidth: 1 },
  photo: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' }, shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.48)' },
  copy: { padding: 20 }, tag: { fontSize: 10, letterSpacing: 2, fontWeight: '800', color: '#ffd07b', marginBottom: 8 }, title: { fontSize: 24, fontWeight: '900', color: '#fff' }, subtitle: { fontSize: 13, lineHeight: 19, color: '#fff', marginTop: 8 },
  decor: { position: 'absolute', right: 14, top: -23, fontSize: 132, color: '#ffd07b', opacity: .17 },
  play: { position: 'absolute', right: 19, top: 16, fontSize: 27, color: '#ffd07b' },
  dots: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }, dotButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.4)' }, selected: { width: 23, backgroundColor: '#fff' },
});
