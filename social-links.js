// Public profiles supplied by the restaurant owner. No social SDK or tracking pixel.
const SOCIAL_PROFILES = Object.freeze([
  { id: "instagram", label: "Instagram", icon: "instagram", color: "#B52965", url: "https://www.instagram.com/bibousburgers/?hl=fr" },
  { id: "facebook", label: "Facebook", icon: "facebook-f", color: "#0866FF", url: "https://www.facebook.com/p/Bibous-Burgers-61586807056617/" },
  { id: "tiktok", label: "TikTok", icon: "tiktok", color: "#191919", url: "https://www.tiktok.com/@bibouburgers" },
]);

const SOCIAL_HOSTS = {
  instagram: "www.instagram.com",
  facebook: "www.facebook.com",
  tiktok: "www.tiktok.com",
};

function isSocialProfileUrl(profile) {
  try {
    const url = new URL(profile.url);
    return url.protocol === "https:" && url.hostname === SOCIAL_HOSTS[profile.id]
      && !url.username && !url.password && !url.port && url.pathname !== "/";
  } catch { return false; }
}

async function openSocialProfile(profile, openURL, alert) {
  try {
    if (!isSocialProfileUrl(profile)) throw new Error("Invalid profile URL");
    await openURL(profile.url);
    return true;
  } catch {
    alert("Lien indisponible", `Impossible d’ouvrir ${profile.label} pour le moment. Réessaie dans quelques instants.`);
    return false;
  }
}

module.exports = { SOCIAL_PROFILES, isSocialProfileUrl, openSocialProfile };
