// Format the owner's approved artwork without regenerating or retouching it.
// Requires sharp (can be supplied through NODE_PATH by the build workstation).
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  const source = path.join(root, 'assets/bibous-blue-original.png');
  const out = path.join(root, 'store-assets/google-play');
  await fs.mkdir(out, { recursive: true });
  const icon = await sharp(source).resize(1024, 1024).removeAlpha().png().toBuffer();
  await Promise.all(['icon.png', 'app-icon-master.png'].map(name =>
    fs.writeFile(path.join(root, 'assets', name), icon)));
  // Android's adaptive mask shows the central 72/108 area. Inset the original
  // artwork to keep the burger and lettering inside round and squircle masks.
  // Edge-copy padding preserves the existing blue border, without a new design.
  const adaptive = await sharp(source).resize(768, 768).removeAlpha()
    .extend({ top: 128, bottom: 128, left: 128, right: 128, extendWith: 'copy' })
    .png().toBuffer();
  await Promise.all(['adaptive-icon.png', 'adaptive-icon-master.png'].map(name =>
    fs.writeFile(path.join(root, 'assets', name), adaptive)));
  await sharp(icon).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
  const picture = await sharp(source).resize(500, 500).png().toBuffer();
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
    <defs><linearGradient id="bg"><stop stop-color="#071b69"/><stop offset="1" stop-color="#0342d4"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <text x="58" y="105" fill="#b7caff" font-family="Arial,sans-serif" font-weight="700" font-size="22" letter-spacing="4">LE HAVRE</text>
    <g fill="white" font-family="Arial,sans-serif" font-size="51" font-weight="700">
      <text x="55" y="196">Vos burgers.</text><text x="55" y="259">Votre créneau.</text>
    </g>
    <path d="M58 298H132" stroke="#ffc668" stroke-width="5"/>
    <g fill="white" font-family="Arial,sans-serif" font-size="24">
      <text x="58" y="352">Livraison · Click &amp; Collect</text>
      <text x="58" y="391">Réservation · Fidélité</text>
    </g>
  </svg>`);
  await sharp(svg).composite([{ input: picture, left: 524, top: 0 }])
    .removeAlpha().png().toFile(path.join(out, 'feature-1024x500.png'));
  const circle = Buffer.from('<svg width="1024" height="1024"><circle cx="512" cy="512" r="341" fill="white"/></svg>');
  const masked = await sharp(adaptive).ensureAlpha()
    .composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  await sharp(masked).trim().resize(256, 256).png()
    .toFile(path.join(out, 'adaptive-preview.png'));
  console.log('Approved artwork formatted: native icons, Play icon, feature graphic and mask preview.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
