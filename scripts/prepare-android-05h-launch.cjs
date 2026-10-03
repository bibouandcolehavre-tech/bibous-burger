// Creates the approved Android launch illustration; the app renders it briefly
// after the native splash, while loyalty and Bibou+ remain on the home screen.
const sharp = require('sharp');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wordmark = path.join(root, 'assets/bibous-official-wordmark-preview.png');
const destination = path.join(root, 'assets/android-launch-05h.png');

async function main() {
  const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="2532" viewBox="0 0 1170 2532">
    <rect width="1170" height="2532" fill="#CC8066"/>
    <path d="M0 1730 L1170 600 L1170 2532 L0 2532 Z" fill="#328D8B"/>
    <circle cx="1092" cy="190" r="178" fill="#FFF3DB" opacity=".08"/>
    <circle cx="40" cy="2110" r="210" fill="#FFF3DB" opacity=".08"/>

    <text x="585" y="790" text-anchor="middle" font-family="Arial,sans-serif" font-size="35" font-weight="700" letter-spacing="7" fill="#FFF3DB">EN DIRECT DE CHEZ BIBOU’S</text>
    <text x="585" y="882" text-anchor="middle" font-family="Arial,sans-serif" font-size="59" font-weight="800" fill="#FFF3DB">Choisissez. Savourez.</text>

    <g font-family="Arial,sans-serif" fill="#173F3E">
      <rect x="66" y="1020" width="1038" height="185" rx="38" fill="#FFF6E8"/>
      <circle cx="157" cy="1112" r="57" fill="#EAC2A0"/>
      <path d="M131 1098 h51 l-5 42 h-41 z M143 1097 c0-21 27-21 27 0" fill="none" stroke="#173F3E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="245" y="1100" font-size="51" font-weight="800">Click &amp; Collect</text>
      <text x="245" y="1156" font-size="34" fill="#52635B">Retrait au restaurant</text>

      <rect x="66" y="1230" width="1038" height="185" rx="38" fill="#FFF6E8"/>
      <circle cx="157" cy="1322" r="57" fill="#EAC2A0"/>
      <path d="M127 1332 h57 M133 1307 h43 l-9-21 h-25 z" fill="none" stroke="#173F3E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="137" cy="1341" r="7" fill="#173F3E"/><circle cx="174" cy="1341" r="7" fill="#173F3E"/>
      <text x="245" y="1310" font-size="51" font-weight="800">Livraison</text>
      <text x="245" y="1366" font-size="34" fill="#52635B">Vos burgers chez vous</text>

      <rect x="66" y="1440" width="1038" height="185" rx="38" fill="#FFF6E8"/>
      <circle cx="157" cy="1532" r="57" fill="#EAC2A0"/>
      <circle cx="157" cy="1532" r="27" fill="none" stroke="#173F3E" stroke-width="7"/>
      <path d="M116 1501 v62 M125 1501 v62 M195 1501 v62" stroke="#173F3E" stroke-width="6" stroke-linecap="round"/>
      <text x="245" y="1520" font-size="51" font-weight="800">Réserver une table</text>
      <text x="245" y="1576" font-size="34" fill="#52635B">Un moment à partager</text>
    </g>

    <path d="M404 1818 H766" stroke="#FFF3DB" stroke-width="4" stroke-linecap="round" opacity=".7"/>
    <text x="585" y="1900" text-anchor="middle" font-family="Arial,sans-serif" font-size="43" font-weight="600" fill="#FFF3DB">Burgers faits maison · Le Havre</text>
    <circle cx="540" cy="2290" r="10" fill="#FFF3DB" opacity=".45"/>
    <circle cx="585" cy="2290" r="10" fill="#FFF3DB"/>
    <circle cx="630" cy="2290" r="10" fill="#FFF3DB" opacity=".45"/>
    <text x="585" y="2360" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" fill="#FFF3DB">Ouverture de l’application…</text>
  </svg>`);
  const logo = await sharp(wordmark).resize({ width: 900 }).png().toBuffer();
  await sharp(backdrop).composite([{ input: logo, left: 135, top: 220 }]).png().toFile(destination);
  console.log(destination);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
