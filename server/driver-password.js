'use strict';
const crypto = require('node:crypto');
const KDF = Object.freeze({ N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
function validatePassword(value, confirmation) {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128 || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value))
    throw Object.assign(Error('Choisis 15 à 128 caractères. Une phrase facile à retenir convient, sans espace au début ni à la fin.'), { statusCode: 400 });
  if (value !== confirmation) throw Object.assign(Error('Les deux nouveaux mots de passe ne correspondent pas.'), { statusCode: 400 });
  if (/^(.)\1+$/.test(value) || ['123456789012345', 'passwordpassword', 'motdepassemotdepasse'].includes(value.toLowerCase()))
    throw Object.assign(Error('Ce mot de passe est trop prévisible. Choisis une autre phrase personnelle.'), { statusCode: 400 });
}
function client() {
  'use strict';
  const form = document.querySelector('form'), message = document.querySelector('#message'), submit = document.querySelector('button[type="submit"]');
  document.querySelector('#show').addEventListener('change', event => {
    for (const input of document.querySelectorAll('[data-password]')) input.type = event.target.checked ? 'text' : 'password';
  });
  async function request(route, body, token) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/krokly-driver/' + route, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Modification indisponible.');
      return data;
    } finally { clearTimeout(timer); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submit.disabled) return;
    const username = document.querySelector('#username').value.trim(), currentPassword = document.querySelector('#current').value;
    const newPassword = document.querySelector('#new').value, confirmation = document.querySelector('#confirmation').value;
    message.textContent = '';
    if (newPassword !== confirmation) { message.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.'; return; }
    if (newPassword.length < 15 || newPassword.length > 128 || newPassword !== newPassword.trim()) { message.textContent = 'Choisis une phrase de 15 caractères minimum, sans espace au début ni à la fin.'; return; }
    submit.disabled = true; submit.textContent = 'Vérification…';
    try {
      const login = await request('login', { username, password: currentPassword });
      await request('change-password', { currentPassword, newPassword, confirmation }, login.token);
      form.reset(); form.hidden = true;
      message.textContent = 'Ton mot de passe a été modifié. Reconnecte-toi dans Krokli Driver avec ton identifiant habituel et le nouveau mot de passe. Tes courses et ton historique restent conservés.';
    } catch (error) {
      message.textContent = error.name === 'AbortError' ? 'La connexion a été interrompue. Ne répète pas à l’aveugle : essaie de te connecter avec le nouveau mot de passe pour vérifier si la modification a été enregistrée.' : error.message;
    } finally { submit.disabled = false; submit.textContent = 'Enregistrer mon nouveau mot de passe'; }
  });
}
const script = `(${client.toString()})();`;
const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-" + crypto.createHash('sha256').update(script).digest('base64') + "'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function page() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Changer mon mot de passe · Krokli Driver</title><style>body{margin:0;background:#FBF3E6;color:#274B3E;font:17px/1.6 system-ui,sans-serif}main{max-width:620px;margin:auto;padding:25px 20px 60px}h1{font-size:32px;line-height:1.2}form{display:grid;gap:20px;background:#FFFCF6;border:1px solid #D7DED0;border-radius:20px;padding:22px}label{display:grid;gap:7px;font-weight:700}input{min-width:0;box-sizing:border-box;width:100%;min-height:50px;border:1px solid #AAB9AD;border-radius:10px;padding:12px;font:inherit;color:#274B3E;background:white}input[type=checkbox]{width:23px;min-height:23px}label.toggle{display:flex;align-items:center;gap:10px;font-size:15px}button{border:0;border-radius:12px;padding:16px;min-height:52px;background:#315B4B;color:white;font:700 17px system-ui;cursor:pointer}button:disabled{opacity:.5}a{color:#315B4B}.notice{background:#E5EBE0;border-radius:14px;padding:16px}#message:empty{display:none}*:focus-visible{outline:3px solid #A65C3B;outline-offset:3px}</style></head><body><main><p><a href="/driver/">‹ Krokli Driver</a></p><h1>Changer mon mot de passe</h1><p>Choisis une phrase personnelle facile à retenir, de 15 caractères minimum. Pas besoin d’imposer des symboles ou un mélange de majuscules et de chiffres.</p><p class="notice">Fais cette modification hors livraison. Les anciennes connexions seront déconnectées et le partage GPS arrêté. Tes courses et ton historique ne sont pas supprimés.</p><form><label>Mon identifiant<input id="username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="32" required></label><label>Mon mot de passe actuel<input id="current" data-password name="current-password" type="password" autocomplete="current-password" maxlength="128" required></label><label>Mon nouveau mot de passe<input id="new" data-password name="new-password" type="password" autocomplete="new-password" minlength="15" maxlength="128" required></label><label>Confirmer le nouveau mot de passe<input id="confirmation" data-password name="confirm-password" type="password" autocomplete="new-password" minlength="15" maxlength="128" required></label><label class="toggle"><input id="show" type="checkbox">Afficher les mots de passe</label><button type="submit">Enregistrer mon nouveau mot de passe</button></form><p id="message" class="notice" role="status" aria-live="polite"></p><p>Cette page vérifie ton mot de passe actuel : elle ne remplace pas une récupération de mot de passe oublié. N’envoie aucun mot de passe par mail ou dans un message.</p><p><a href="/driver/support">Besoin d’aide ?</a></p></main><script>${script}</script></body></html>`;
}
module.exports = { KDF, validatePassword, page, csp };
