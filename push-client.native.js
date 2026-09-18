import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { pushRequest } from './push-api';

const KEY = 'bibousPushInstallationV1';
let identityPromise, queue = Promise.resolve(), epoch = 0, handledResponse = null;
const serial = task => { const next = queue.then(task, task); queue = next.catch(() => {}); return next; };
const usable = () => Device.isDevice && Constants.executionEnvironment !== 'storeClient' && ['ios', 'android'].includes(Platform.OS);
const granted = p => p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
async function tokenWithTimeout(projectId) {
  let timer;
  try {
    return await Promise.race([Notifications.getExpoPushTokenAsync({ projectId }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Push token timeout')), 12000); })]);
  } finally { clearTimeout(timer); }
}
const identity = () => identityPromise ||= (async () => {
  const saved = await SecureStore.getItemAsync(KEY);
  if (saved) return JSON.parse(saved);
  const value = { installationId: Crypto.randomUUID(), secret: Crypto.randomUUID() };
  await SecureStore.setItemAsync(KEY, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return value;
})().catch(error => { identityPromise = null; throw error; });

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

export async function pushDeviceStatus() {
  if (!usable()) return { supported: false, granted: false, message: 'Les notifications nécessitent la version installable sur un vrai téléphone (pas Expo Go).' };
  const permission = await Notifications.getPermissionsAsync();
  return { supported: true, platform: Platform.OS, granted: granted(permission), canAskAgain: permission.canAskAgain, message: granted(permission) ? 'Les notifications sont autorisées sur ce téléphone.' : 'Les notifications sont désactivées sur ce téléphone. Ton application reste utilisable.' };
}

export function syncPushDevice(api, authToken, { ask = false } = {}) {
  const generation = epoch;
  return serial(async () => {
    if (!usable()) return pushDeviceStatus();
    const state = await pushRequest(api, authToken);
    const id = await identity();
    if (generation !== epoch) return pushDeviceStatus();
    if (!state.preferences.service && !state.preferences.marketing) {
      await pushRequest(api, authToken, `/devices/${id.installationId}`, 'DELETE');
      return pushDeviceStatus();
    }
    // Android 13 requests permission only after a channel has been created.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('commandes', { name: 'Commandes et réservations', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' });
      await Notifications.setNotificationChannelAsync('promotions', { name: 'Promotions et actualités Bibou', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!granted(permission) && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    if (generation !== epoch) return pushDeviceStatus();
    if (!granted(permission)) {
      await pushRequest(api, authToken, `/devices/${id.installationId}`, 'DELETE');
      return pushDeviceStatus();
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('Les notifications doivent encore être configurées dans cette version.');
    let token;
    try { token = (await tokenWithTimeout(projectId)).data; }
    catch { throw new Error('Impossible d’associer ce téléphone aux notifications. Vérifie Internet et réessaie.'); }
    if (generation === epoch) await pushRequest(api, authToken, '/devices', 'POST', { ...id, token, platform: Platform.OS });
    return pushDeviceStatus();
  });
}

export function detachPushDevice(api, authToken) {
  epoch += 1;
  return serial(async () => {
    if (!usable()) return;
    const saved = await SecureStore.getItemAsync(KEY);
    if (!saved) return;
    const { installationId } = JSON.parse(saved);
    await pushRequest(api, authToken, `/devices/${installationId}`, 'DELETE');
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.clearLastNotificationResponseAsync();
  });
}

export function observePush(onOpen, onTokenChanged) {
  if (!usable()) return () => {};
  let stopped = false;
  const open = response => {
    const id = response?.notification?.request?.identifier;
    if (stopped || !id || handledResponse === id) return;
    handledResponse = id;
    onOpen(response.notification.request.content.data || {});
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  };
  const a = Notifications.addNotificationResponseReceivedListener(open);
  const b = Notifications.addPushTokenListener(() => onTokenChanged());
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  return () => { stopped = true; a.remove(); b.remove(); };
}
export const openPushSettings = () => Linking.openSettings();
