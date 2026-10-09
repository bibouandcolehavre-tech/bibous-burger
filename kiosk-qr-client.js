// QR data never contains the customer's login token. Only our pairing format is accepted.
function kioskQrEnabled(platform, flag) { return platform === 'android' && flag === 'true'; }
const PHONE_ORIGIN = 'https://bibous-burger-app.onrender.com';
function parseKioskQr(value) {
  if (typeof value !== 'string' || value.length > 512) throw new Error('Scanne le QR code de connexion affiché sur la borne Bibou’s Burgers.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Ce QR code n’est pas un code de connexion Bibou’s Burgers.'); }
  const web = url.origin === PHONE_ORIGIN && url.pathname === '/borne/connexion' && !url.search;
  const legacy = url.protocol === 'bibousburgers:' && url.hostname === 'borne' && url.pathname === '/connexion' && !url.hash;
  const params = web ? new URLSearchParams(url.hash.slice(1)) : url.searchParams;
  const keys = [...params.keys()];
  const session = params.get('session'), code = params.get('code');
  if ((!web && !legacy) || url.username || url.password || url.port || keys.length !== 2 || new Set(keys).size !== 2 || !keys.includes('session') || !keys.includes('code') || !/^[a-f0-9]{32}$/.test(session || '') || !/^[A-Za-z0-9_-]{43}$/.test(code || '')) throw new Error('Ce QR code n’est pas un code de connexion Bibou’s Burgers.');
  return { session, code };
}
function kioskPhoneUrl(qr) { const proof = parseKioskQr(qr); return `${PHONE_ORIGIN}/borne/connexion#session=${proof.session}&code=${proof.code}`; }
function kioskPairingFromLocation(value) { try { const url = new URL(value); return url.origin === PHONE_ORIGIN && url.pathname === '/borne/connexion' ? parseKioskQr(value) : null; } catch { return null; } }
async function kioskQrRequest(api, token, pairing, action, fetcher = fetch) {
  if (!token || token.startsWith('review.') || !['inspect', 'approve'].includes(action)) throw new Error('Connecte-toi à ton compte Bibou’s Burgers pour continuer.');
  // Revalidate even when the caller supplies a parsed object. Never fetch a scanned URL.
  const proof = parseKioskQr(`bibousburgers://borne/connexion?session=${encodeURIComponent(pairing.session)}&code=${encodeURIComponent(pairing.code)}`);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  try {
  const response = await fetcher(`${api}/kiosk-pairing/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(proof), signal: controller.signal });
  let result;
  try { result = await response.json(); } catch { throw new Error('La connexion à la borne est indisponible pour le moment.'); }
  if (!response.ok) throw new Error(response.status === 404 || response.status === 503 ? 'La connexion à la borne est encore en préparation.' : response.status === 401 ? 'Reconnecte-toi à ton compte avant de scanner.' : 'Ce code est expiré ou déjà utilisé. Affiche un nouveau QR code sur la borne.');
  if (action === 'inspect' && (result?.status !== 'pending' || typeof result.terminalName !== 'string' || !result.terminalName.trim() || result.terminalName.length > 100 || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now())) throw new Error('Ce code est expiré ou invalide.');
  if (action === 'approve' && result?.status !== 'approved') throw new Error('La connexion à la borne n’a pas été confirmée.');
  return result;
  } finally { clearTimeout(timeout); }
}
module.exports = { kioskQrEnabled, parseKioskQr, kioskQrRequest, kioskPhoneUrl, kioskPairingFromLocation };
