// Build the launcher layers and store artwork from the approved gradient wordmark.
const sharp = require('sharp');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wordmark = path.join(root, 'assets/bibous-official-wordmark.png');
const icon = path.join(root, 'assets/android-icon-gradient.png');
const foreground = path.join(root, 'assets/android-adaptive-foreground-gradient.png');
const background = path.join(root, 'assets/android-adaptive-background-gradient.png');
const playIcon = path.join(root, 'store-assets/google-play/icon-512-gradient.png');

async function main() {
  const backdrop = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="colors" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse"><stop offset="34%" stop-color="#CC8066"/><stop offset="58%" stop-color="#328D8B"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#colors)"/></svg>');
  await sharp(backdrop).png().toFile(background);
  const logo = await sharp(wordmark).resize({ width: 625 }).png().toBuffer();
  const { width, height } = await sharp(logo).metadata();
  const alpha = await sharp(logo).extractChannel(3).blur(9).raw().toBuffer();
  const shadow = await sharp({ create: { width, height, channels: 3, background: '#42231E' } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const left = Math.round((1024 - width) / 2);
  const top = Math.round((1024 - height) / 2);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input: shadow, left: left + 4, top: top + 7 }, { input: logo, left, top }])
    .png().toFile(foreground);
  await sharp(icon).resize(512, 512).png().toFile(playIcon);
  console.log([icon, foreground, background, playIcon].join('\n'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
