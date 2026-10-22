import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
function base64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    result += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
  }
  return result;
}
export async function saveInvoice(response, filename, isCurrent = () => true) {
  if (!/^(WEB-\d{4}-\d{6}|facture-commande-\d+-laddition)\.pdf$/.test(filename || '')) throw Error('Nom de facture invalide.');
  if (!await Sharing.isAvailableAsync()) throw Error('L’enregistrement des fichiers est indisponible sur ce téléphone.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 5000000 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw Error('Le document reçu n’est pas un PDF valide.');
  if (!isCurrent()) return false;
  if (!FileSystem.cacheDirectory) throw Error('Le dossier temporaire est indisponible.');
  const folder = FileSystem.cacheDirectory + 'bibou-invoices/';
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  // Remove stale temporary PDFs, never user-saved documents.
  for (const name of await FileSystem.readDirectoryAsync(folder)) if (/^(WEB-\d{4}-\d{6}|facture-commande-\d+-laddition)-\d+\.pdf$/.test(name)) {
    const old = folder + name, info = await FileSystem.getInfoAsync(old);
    if (info.exists && Date.now() - (info.modificationTime || 0) * 1000 > 86400000) await FileSystem.deleteAsync(old, { idempotent: true });
  }
  const file = folder + filename.replace(/\.pdf$/, '') + '-' + Date.now() + '.pdf';
  let shared = false;
  try {
    await FileSystem.writeAsStringAsync(file, base64(bytes), { encoding: FileSystem.EncodingType.Base64 });
    if (!isCurrent()) return false;
    // Android can return before the receiving app has finished reading the file.
    // Keep it in the app's private cache and remove it on a later cleanup.
    await Sharing.shareAsync(file, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Enregistrer ma facture Bibou' });
    shared = true;
    return true;
  } finally { if (!shared) await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {}); }
}
