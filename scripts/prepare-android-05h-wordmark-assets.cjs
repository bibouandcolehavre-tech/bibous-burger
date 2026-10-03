// Approved icon artwork for Android and Google Play. No store upload is done here.
const sharp = require('sharp');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const square = path.join(root, 'store-assets/android-icon-concepts/bicolor-palette/05h-logo-seul-carre.png');
const wordmark = path.join(root, 'assets/bibous-official-wordmark-preview.png');
const assetDir = path.join(root, 'assets');
const storeDir = path.join(root, 'store-assets/google-play');

async function main() {
  const icon = path.join(assetDir, 'android-icon-05h-logo-only.png');
  const foreground = path.join(assetDir, 'android-adaptive-foreground-05h-logo-only.png');
  const background = path.join(assetDir, 'android-adaptive-background-05h-logo-only.png');
  const playIcon = path.join(storeDir, 'icon-512-05h-logo-only.png');
  await sharp(square).png().toFile(icon);
  await sharp(square).resize(512, 512).png().toFile(playIcon);
  const backdrop = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#CC8066"/><path d="M0 1024 L1024 0 L1024 1024 Z" fill="#328D8B"/></svg>');
  await sharp(backdrop).png().toFile(background);
  // The transparent wordmark fits inside the Android adaptive icon safe zone.
  const logo = await sharp(wordmark).resize({ width: 625 }).png().toBuffer();
  const size = await sharp(logo).metadata();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input: logo, left: Math.round((1024 - size.width) / 2), top: Math.round((1024 - size.height) / 2) }])
    .png().toFile(foreground);
  const preview = path.join(root, 'store-assets/android-icon-concepts/bicolor-palette/05h-logo-seul-adaptatif.png');
  const circle = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="350" fill="white"/></svg>');
  const adaptive = await sharp(background).composite([{ input: await sharp(foreground).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  await sharp(adaptive).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(preview);
  for (const file of [icon, foreground, background, playIcon, preview]) console.log(file);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
