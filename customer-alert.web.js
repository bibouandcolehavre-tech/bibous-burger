// React Native Web's Alert.alert is a no-op. These brief notices must remain visible.
export const customerAlert = { alert: (title, message = '') => globalThis.alert?.(`${title}\n\n${message}`) };
