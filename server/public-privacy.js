const { PRIVACY_POLICY } = require('../privacy-policy');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
function publicPrivacyHtml() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confidentialité — Bibou’s Burgers</title><style>body{font:16px/1.65 system-ui;background:#fbf3e6;color:#25473b;margin:0}main{max-width:760px;margin:40px auto;padding:24px}h1{font-size:32px}h2{font-size:21px}section{background:#fffdf8;border:1px solid #dcebe2;border-radius:18px;margin:20px 0;padding:18px}a{color:#315b4b}</style></head><body><main><h1>Confidentialité</h1><p>Politique mise à jour le ${escape(PRIVACY_POLICY.updated)}</p><p>${escape(PRIVACY_POLICY.intro)}</p>${PRIVACY_POLICY.sections.map(section=>`<section><h2>${escape(section.title)}</h2><p>${escape(section.text)}</p></section>`).join('')}<p><a href="https://bibous-burger-app.onrender.com/?legal=delete-account">Demander la suppression de mon compte</a></p></main></body></html>`;
}
module.exports = { publicPrivacyHtml };
