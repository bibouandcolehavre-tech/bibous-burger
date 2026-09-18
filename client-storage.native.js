import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'bibousCustomerSession';
const ATTEMPT_KEY = 'bibousPaymentAttempt';
export const readSession = () => SecureStore.getItemAsync(SESSION_KEY);
export const saveSession = token => SecureStore.setItemAsync(SESSION_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export const clearSession = () => SecureStore.deleteItemAsync(SESSION_KEY);
// This journal contains only product IDs, options and a service slot, never a token,
// card details, customer name, phone number or delivery address.
export const readAttempt = () => AsyncStorage.getItem(ATTEMPT_KEY);
export const saveAttempt = value => AsyncStorage.setItem(ATTEMPT_KEY, JSON.stringify(value));
export const clearAttempt = () => AsyncStorage.removeItem(ATTEMPT_KEY);
