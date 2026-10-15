import React from 'react';
const { APP_STORE_LINKS } = require('./app-store-links');
const button = { flex: '1 1 125px', minHeight: 46, padding: '10px 12px', borderRadius: 12, background: '#315B4B', color: '#FFF9EF', fontSize: 14, fontWeight: 750, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' };
export default function AppDownloadLinks() {
  return <section aria-label="Télécharger l’application Bibou’s Burgers" data-bibou="app-downloads" style={{ width: '100%', maxWidth: 440, alignSelf: 'center', boxSizing: 'border-box', padding: '8px 18px 14px', textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
    <p style={{ margin: '0 0 8px', color: '#25473B', fontSize: 14, fontWeight: 700 }}>Bibou est aussi sur iPhone et Android</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <a href={APP_STORE_LINKS.ios} style={button}>Télécharger sur iPhone</a>
      <a href={APP_STORE_LINKS.android} style={button}>Télécharger sur Android</a>
    </div>
    <p style={{ margin: '7px 0 0', color: '#52665A', fontSize: 12 }}>Tu peux aussi continuer sur le site sans installer.</p>
  </section>;
}
