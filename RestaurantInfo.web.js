import React from 'react';
const { RESTAURANT: info } = require('./restaurant-info');

// Keep the home page light; practical information lives on a crawlable public page.
export default function RestaurantInfo() {
  return <nav aria-label="Informations du restaurant" style={{ padding: '8px 0 0', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
    <a href={info.page} style={{ color: '#251914', fontSize: 13, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 12px' }}>Infos pratiques</a>
  </nav>;
}
