const test=require('node:test'),assert=require('node:assert/strict');
const {PRIVACY_POLICY}=require('../privacy-policy'),{publicPrivacyHtml}=require('./public-privacy');
test('privacy: native and public notice describe ratings, personal contest codes, opt-in alerts and deletion',()=>{
  const html=publicPrivacyHtml();
  for(const text of ['Confidentialité','Notes des articles et avis Google','Concours et menus gagnés','Rappels des menus gagnés','SMS promotionnels','13 octobre 2026'])assert(html.includes(text),text);
  assert(PRIVACY_POLICY.sections.find(s=>s.title==='Notes des articles et avis Google').text.includes('sans publier ton nom ni ton téléphone'));
  assert(!/<script|tracking|analytics\.js/i.test(html));
  assert(html.includes('?legal=delete-account'));
  const fs=require('node:fs'),path=require('node:path'),app=fs.readFileSync(path.join(__dirname,'../App.js'),'utf8');
  assert(app.includes("require('./privacy-policy')"));assert(app.includes('PRIVACY_POLICY.sections.map'));
});
test('privacy: section content is escaped instead of executing markup',()=>{
  const first=PRIVACY_POLICY.sections[0],previous=first.text;
  try{first.text='<script>not executable</script>';const html=publicPrivacyHtml();assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));}finally{first.text=previous;}
});
