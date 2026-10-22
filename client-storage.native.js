import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
const {createSessionStorage}=require('./session-storage-queue');

const SESSION_KEY = 'bibousCustomerSession';
const ATTEMPT_KEY = 'bibousPaymentAttempt';
const sessions=createSessionStorage({read:()=>SecureStore.getItemAsync(SESSION_KEY),write:token=>SecureStore.setItemAsync(SESSION_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),clear:()=>SecureStore.deleteItemAsync(SESSION_KEY)});
export const readSession = sessions.read;
export const saveSession = sessions.write;
export const clearSession = sessions.clear;
export const clearSessionIf = sessions.clearIf;
// This journal contains only product IDs, options and a service slot, never a token,
// card details, customer name, phone number or delivery address.
export const readAttempt = () => AsyncStorage.getItem(ATTEMPT_KEY);
export const saveAttempt = value => AsyncStorage.setItem(ATTEMPT_KEY, JSON.stringify(value));
export const clearAttempt = () => AsyncStorage.removeItem(ATTEMPT_KEY);
