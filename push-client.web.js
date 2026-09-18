export const pushDeviceStatus = async () => ({ supported: false, granted: false, message: 'Les notifications push sont prévues pour l’application installée sur iPhone ou Android. Ce navigateur ne les reçoit pas. Tu peux déjà enregistrer tes préférences ci-dessous.' });
export const syncPushDevice = async () => pushDeviceStatus();
export const detachPushDevice = async () => {};
export const observePush = () => () => {};
export const openPushSettings = async () => {};
