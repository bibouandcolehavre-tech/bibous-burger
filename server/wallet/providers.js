const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http2 = require('node:http2');
const { passAuth, publicOrigin } = require('./core');
const { VENUE, NEARBY_TEXT } = require('./venue');
const files = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png'];

function configFromEnv(env = process.env) {
  const origin = publicOrigin(env.WALLET_PUBLIC_ORIGIN, env.NODE_ENV === 'test');
  const config = { enabled: env.WALLET_ENABLED === 'true' && Boolean(origin), origin,
    previewOnly: env.WALLET_PREVIEW_ONLY === 'true',
    previewPhoneHashes: String(env.WALLET_PREVIEW_PHONE_HASHES || '').split(',').map(s => s.trim()).filter(s => /^[a-f0-9]{64}$/.test(s)),
    apple: { enabled: false, passType: env.WALLET_APPLE_PASS_TYPE || '', team: env.WALLET_APPLE_TEAM_ID || '',
      certFile: env.WALLET_APPLE_CERT_FILE, keyFile: env.WALLET_APPLE_KEY_FILE, wwdrFile: env.WALLET_APPLE_WWDR_FILE,
      certPem: env.WALLET_APPLE_CERT_PEM, keyPem: env.WALLET_APPLE_KEY_PEM, wwdrPem: env.WALLET_APPLE_WWDR_PEM },
    google: { enabled: false, issuer: env.WALLET_GOOGLE_ISSUER_ID || '', classId: env.WALLET_GOOGLE_CLASS_ID || '',
      credentialFile: env.WALLET_GOOGLE_CREDENTIAL_FILE, credentialJson: env.WALLET_GOOGLE_CREDENTIALS_JSON } };
  config.apple.enabled = config.enabled && env.WALLET_APPLE_ENABLED === 'true' && appleMaterialReady(config.apple);
  config.google.enabled = config.enabled && env.WALLET_GOOGLE_ENABLED === 'true' && /^\d{6,30}$/.test(config.google.issuer)
    && config.google.classId.startsWith(`${config.google.issuer}.`) && /^[\d]+\.[A-Za-z0-9_-]+$/.test(config.google.classId)
    && googleMaterialReady(config);
  return config;
}
const material = (apple, name) => apple[`${name}Pem`] ? Buffer.from(apple[`${name}Pem`]) : fs.readFileSync(apple[`${name}File`]);
function appleMaterialReady(apple) {
  try {
    if (!/^pass\.[A-Za-z0-9.-]+$/.test(apple.passType) || !/^[A-Z0-9]{10}$/.test(apple.team)) return false;
    const cert = new crypto.X509Certificate(material(apple, 'cert')), wwdr = new crypto.X509Certificate(material(apple, 'wwdr'));
    const subject = Object.fromEntries(cert.subject.split('\n').map(s => { const at = s.indexOf('='); return [s.slice(0, at), s.slice(at + 1)]; }));
    const now = Date.now();
    return subject.UID === apple.passType && subject.OU === apple.team && Date.parse(cert.validFrom) <= now && Date.parse(cert.validTo) > now
      && Date.parse(wwdr.validTo) > now && cert.checkIssued(wwdr) && cert.verify(wwdr.publicKey)
      && cert.checkPrivateKey(crypto.createPrivateKey(material(apple, 'key')));
  } catch { return false; }
}
function appleProperties(pass, config, secret) {
  return { formatVersion: 1, passTypeIdentifier: config.apple.passType, teamIdentifier: config.apple.team,
    serialNumber: pass.memberId, organizationName: "Bibou’s Burgers", description: 'Club Bibou — carte de fidélité',
    logoText: 'CLUB BIBOU', backgroundColor: 'rgb(39, 82, 66)', foregroundColor: 'rgb(251, 244, 230)', labelColor: 'rgb(232, 221, 198)',
    webServiceURL: `${config.origin}/api/wallet/apple`, authenticationToken: passAuth(pass.memberId, secret), voided: pass.voided,
    ...(pass.voided ? {} : { locations: [{ ...VENUE, relevantText: NEARBY_TEXT }] }) };
}
function applePass(pass, config, secret) {
  const { PKPass } = require('passkit-generator');
  const buffers = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(__dirname, 'assets', name))]));
  const properties = appleProperties(pass, config, secret);
  const pk = new PKPass(buffers, { signerCert: material(config.apple, 'cert'), signerKey: material(config.apple, 'key'),
    wwdr: material(config.apple, 'wwdr') }, properties);
  pk.type = 'storeCard';
  if (properties.locations) pk.setLocations(...properties.locations);
  pk.headerFields.push({ key: 'points', label: 'MES POINTS', value: pass.points, changeMessage: 'Ton solde est de %@ points.' });
  pk.primaryFields.push({ key: 'member', label: 'MEMBRE CLUB BIBOU', value: pass.firstName });
  if (!pass.voided && pass.paperCard) {
    pk.secondaryFields.push({ key: 'paper-stamps', label: 'ANCIENNE CARTE', value: pass.paperCard.stamps ? `${pass.paperCard.stamps} / 10 tampons` : 'Complétée' });
    pk.auxiliaryFields.push({ key: 'paper-burgers', label: 'BURGERS À RETIRER', value: pass.paperCard.availableBurgers,
      changeMessage: 'Ancienne carte : %@ burger(s) offert(s) à retirer.' });
    pk.backFields.push({ key: 'paper-card', label: 'Ta carte papier reprise', value: `Les anciens tampons restent séparés de tes points. Présente le code du cadeau à l’équipe avant le retrait. Retrouve le détail sur ${config.origin}/club` });
  }
  pk.backFields.push({ key: 'program', label: 'Ton programme Bibou', value: 'Les mêmes points et les mêmes récompenses que dans ton compte Bibou. Cette carte identifie ton compte ; elle ne permet pas de te connecter ni de dépenser une récompense.' },
    { key: 'app', label: 'Retrouve ton compte Bibou', value: 'https://bibousburgers.com/app' },
    { key: 'privacy', label: 'Données personnelles', value: `${config.origin}/privacy` });
  if (!pass.voided) pk.setBarcodes({ format: 'PKBarcodeFormatQR', message: pass.barcode, messageEncoding: 'iso-8859-1', altText: 'Carte Club Bibou' });
  return pk.getAsBuffer();
}
function googleClass(config) {
  return { id: config.google.classId, issuerName: "Bibou’s Burgers", programName: 'Club Bibou', reviewStatus: 'UNDER_REVIEW',
    programLogo: { sourceUri: { uri: `${config.origin}/club/google-logo.png` }, contentDescription: { defaultValue: { language: 'fr-FR', value: "Bibou’s Burgers" } } },
    hexBackgroundColor: '#275242', accountNameLabel: 'Membre', accountIdLabel: 'Carte Club Bibou',
    homepageUri: { uri: 'https://bibousburgers.com/app', description: 'Retrouver mon compte Bibou' },
    merchantLocations: [{ ...VENUE }] };
}
function googleObject(pass, config) {
  return { id: `${config.google.issuer}.${pass.memberId}`, classId: config.google.classId, state: pass.voided ? 'INACTIVE' : 'ACTIVE',
    accountName: pass.firstName, accountId: pass.memberId,
    loyaltyPoints: { label: 'Mes points', balance: { int: pass.points } },
    ...(!pass.voided && pass.paperCard ? {
      secondaryLoyaltyPoints: { label: 'Tampons', balance: { string: pass.paperCard.stamps ? `${pass.paperCard.stamps}/10` : '10/10' } },
      textModulesData: [{ id: 'paper-card', header: 'Burgers offerts à retirer', body: `${pass.paperCard.availableBurgers}. Présente le code du cadeau à l’équipe. Détail sur ${config.origin}/club` }]
    } : {}),
    ...(pass.voided ? {} : { barcode: { type: 'QR_CODE', value: pass.barcode, alternateText: 'Carte Club Bibou' } }) };
}
function signJwt(payload, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${body}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}
function googleCredentials(config) {
  const c = JSON.parse(config.google.credentialJson || fs.readFileSync(config.google.credentialFile, 'utf8'));
  if (c.type !== 'service_account' || !/@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(c.client_email) || !c.private_key) throw new Error('Configuration Wallet indisponible.');
  return c;
}
function googleMaterialReady(config) {
  try { return crypto.createPrivateKey(googleCredentials(config).private_key).asymmetricKeyType === 'rsa'; } catch { return false; }
}
function googleSaveLink(pass, config) {
  const c = googleCredentials(config);
  const token = signJwt({ iss: c.client_email, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000),
    origins: [config.origin], payload: { loyaltyObjects: [googleObject(pass, config)] } }, c.private_key);
  return `https://pay.google.com/gp/v/save/${token}`;
}
function createGoogleUpdater(config, transport = fetch) {
  let token, expiresAt = 0;
  return async pass => {
    const c = googleCredentials(config);
    if (!token || expiresAt < Date.now() + 60000) {
      const now = Math.floor(Date.now() / 1000);
      const assertion = signJwt({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, c.private_key);
      const res = await transport('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
      const body = await res.json();
      if (!res.ok || !body.access_token) throw new Error('Google Wallet indisponible.');
      token = body.access_token; expiresAt = Date.now() + Math.min(3600, Number(body.expires_in) || 3600) * 1000;
    }
    const object = googleObject(pass, config);
    const res = await transport(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(object.id)}`, {
      method: 'PATCH', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName: object.accountName, loyaltyPoints: object.loyaltyPoints, state: object.state,
        secondaryLoyaltyPoints: object.secondaryLoyaltyPoints || null, textModulesData: object.textModulesData || [],
        ...(pass.voided ? { barcode: { type: 'QR_CODE', value: 'BIBOU:DISABLED', alternateText: 'Carte désactivée' } } : {}) }) });
    // A Save link may never be used. Never create an object on a customer's behalf here.
    if (res.status === 404) return false;
    if (res.status === 401) { token = null; }
    if (!res.ok) throw new Error('Google Wallet indisponible.');
    return true;
  };
}
function applePush(config, device) {
  return new Promise((resolve, reject) => {
    const client = http2.connect('https://api.push.apple.com', { cert: material(config.apple, 'cert'), key: material(config.apple, 'key') });
    const timer = setTimeout(() => { client.destroy(); reject(new Error('Apple Wallet indisponible.')); }, 10000);
    const finish = (error, status) => { clearTimeout(timer); client.close(); error ? reject(new Error('Apple Wallet indisponible.')) : resolve(status); };
    client.on('error', error => finish(error));
    const req = client.request({ ':method': 'POST', ':path': `/3/device/${device.pushToken}`, 'apns-topic': config.apple.passType, 'apns-priority': '5' });
    let status;
    req.on('response', h => { status = Number(h[':status']); }); req.on('data', () => {});
    req.on('end', () => finish(null, status)); req.on('error', error => finish(error)); req.end('{}');
  });
}
module.exports = { configFromEnv, appleProperties, applePass, googleClass, googleObject, signJwt, googleSaveLink, createGoogleUpdater, applePush };
