import React from 'react';
const { RESTAURANT: info } = require('./restaurant-info');

// Real, visible content and ordinary links: useful both to customers and crawlers.
export default function RestaurantInfo() {
  return <section aria-labelledby="restaurant-info-heading" style={{ padding: '24px 0', color: '#251914', fontFamily: 'system-ui, sans-serif', lineHeight: 1.65 }}>
    <h1 id="restaurant-info-heading" style={{ fontSize: 22, margin: '0 0 12px', color: '#fff' }}>{info.heading}</h1>
    <p>{info.introduction}</p>
    <address style={{ fontStyle: 'normal', fontWeight: 700 }}>{info.street}, {info.postalCode} {info.city}</address>
    <ul style={{ paddingLeft: 20 }}>{info.hours.map(hour => <li key={hour.label}>{hour.label} : {hour.text}</li>)}</ul>
    <a href={info.page} style={{ color: '#251914', fontWeight: 800, textDecoration: 'underline', display: 'inline-block', padding: '10px 0' }}>Le restaurant, les horaires et les informations de livraison →</a>
  </section>;
}
