// Public, user-confirmed information only. Never put customer data in this file.
const RESTAURANT = {
  name: "Bibou's Burgers",
  origin: 'https://bibous-burger-app.onrender.com',
  page: '/restaurant-le-havre.html',
  heading: "Bibou's Burgers, restaurant de burgers au Havre",
  description: "Commandez chez Bibou's Burgers au Havre : burgers, menus, livraison dans un rayon de 5 km, click & collect et réservation de table au 153 quai Georges V.",
  introduction: "Retrouvez nos burgers dans un pain brioché maison, nos menus avec frites et boisson et nos petites faims. Commandez directement auprès du restaurant pour une livraison ou un retrait sur place, ou demandez une table.",
  street: '153 quai Georges V', postalCode: '76600', city: 'Le Havre', country: 'FR',
  hours: [
    { label: 'Du lundi au vendredi', text: '12 h – 14 h et 19 h – 22 h', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], periods: [['12:00', '14:00'], ['19:00', '22:00']] },
    { label: 'Samedi', text: '19 h – 22 h', days: ['Saturday'], periods: [['19:00', '22:00']] },
    { label: 'Dimanche', text: '19 h – 21 h', days: ['Sunday'], periods: [['19:00', '21:00']] },
  ],
  services: [
    { title: 'Livraison au Havre', text: 'Nous livrons nous-mêmes dans un rayon de 5 km autour du restaurant. Les frais sont de 3,99 € jusqu’à 1,5 km, 4,99 € au-delà de 1,5 km et jusqu’à 3 km, puis 5,99 € au-delà de 3 km et jusqu’à 5 km. L’adresse et les créneaux disponibles sont vérifiés avant le paiement.' },
    { title: 'Click & collect', text: 'Commandez en ligne et retirez votre repas au 153 quai Georges V. Choisissez une heure de retrait précise, toutes les 15 minutes, selon les disponibilités du service. Aucun frais de livraison pour le retrait.' },
    { title: 'Réservation de table', text: 'Demandez une table pour 1 à 4 personnes et choisissez votre heure d’arrivée. La réservation est confirmée lorsque le restaurant accepte la demande. Aucun paiement n’est demandé pour réserver.' },
  ],
  socials: [
    { name: 'Instagram', url: 'https://www.instagram.com/bibousburgers/' },
    { name: 'Facebook', url: 'https://www.facebook.com/p/Bibous-Burgers-61586807056617/' },
    { name: 'TikTok', url: 'https://www.tiktok.com/@bibouburgers' },
  ],
};
module.exports = { RESTAURANT };
