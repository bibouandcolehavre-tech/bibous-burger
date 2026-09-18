const SESSION_KEY = 'bibousCustomerSession';
const ATTEMPT_KEY = 'bibousPaymentAttempt';
const storage = () => globalThis.localStorage;
export const readSession = async () => storage()?.getItem(SESSION_KEY) || null;
export const saveSession = async token => storage().setItem(SESSION_KEY, token);
export const clearSession = async () => storage()?.removeItem(SESSION_KEY);
export const readAttempt = async () => storage()?.getItem(ATTEMPT_KEY) || null;
export const saveAttempt = async value => storage().setItem(ATTEMPT_KEY, JSON.stringify(value));
export const clearAttempt = async () => storage()?.removeItem(ATTEMPT_KEY);
