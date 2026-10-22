import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
export default function useExperienceMotion() {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const state = AppState.addEventListener('change', value => setActive(value === 'active'));
    const media = Platform.OS === 'web' && typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    const update = () => setReduced(Boolean(media?.matches));
    if (media) { update(); media.addEventListener('change', update); }
    return () => { alive = false; motion.remove(); state.remove(); media?.removeEventListener('change', update); };
  }, []);
  return active && !reduced;
}
