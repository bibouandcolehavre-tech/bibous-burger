'use strict';
const { PDFDocument } = require('pdfkit');
const money = cents => (cents / 100).toFixed(2).replace('.', ',') + ' EUR';
const rate = value => String(value / 100).replace('.', ',') + ' %';
const day = value => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
function renderInvoice(invoice, { example = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [], doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: example ? 'Exemple fictif de facture Bibou' : `Facture ${invoice.number}`, Author: invoice.seller.name } });
    doc.on('data', b => chunks.push(b)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const green = '#315B4B', muted = '#626963', width = 511;
    const text = (value, x, y, w, size = 10, bold = false, color = green) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(String(value || ''), x, y, { width: w });
    let y = 42;
    function header() {
      text(invoice.seller.tradeName || invoice.seller.name, 42, y, width, 24, true); y += 36;
      text(example ? 'EXEMPLE FICTIF - NON VALABLE' : 'FACTURE ACQUITTEE', 42, y, width, 12, true); y += 24;
      text(`N° ${invoice.number}  |  Emise le ${day(invoice.issuedAt)}`, 42, y, width); y += 18;
      text(`Commande #${invoice.orderNumber}  |  Service du ${day(invoice.serviceDate + 'T12:00:00Z')}  |  ${invoice.method}`, 42, y, width); y += 31;
    }
    header();
    const sellerLines = [invoice.seller.name, invoice.seller.address, `SIRET ${invoice.seller.siret}`, `TVA ${invoice.seller.vatNumber}`].join('\n');
    text('VENDEUR', 42, y, 245, 9, true); text('CLIENT', 312, y, 241, 9, true); y += 16;
    const buyerLines = invoice.customerName + (invoice.customerAddress ? '\n' + invoice.customerAddress : '');
    doc.font('Helvetica').fontSize(10);
    const addressHeight = Math.max(doc.heightOfString(sellerLines, { width: 245 }), doc.heightOfString(buyerLines, { width: 241 }));
    text(sellerLines, 42, y, 245, 10); text(buyerLines, 312, y, 241, 10); y += Math.max(85, addressHeight + 24);
    function tableHeader() {
      doc.rect(42, y, width, 26).fill('#E6ECE0');
      text('DESIGNATION', 50, y + 8, 265, 9, true); text('QTE', 316, y + 8, 34, 9, true); text('P.U. HT', 354, y + 8, 73, 9, true); text('TVA', 431, y + 8, 44, 9, true); text('TOTAL TTC', 477, y + 8, 75, 9, true); y += 34;
    }
    const space = height => { if (y + height > 710) { doc.addPage(); y = 42; header(); tableHeader(); } };
    tableHeader();
    for (const item of invoice.items) {
      const label = item.name + (item.detail ? '\n' + item.detail : '');
      doc.font('Helvetica').fontSize(10); const height = Math.max(31, doc.heightOfString(label, { width: 260 }) + 15); space(height);
      text(label, 50, y, 260, 10); text(item.quantity, 316, y, 32, 10); text(money(Math.round(item.unitCents * 10000 / (10000 + item.rate))), 354, y, 74, 9); text(rate(item.rate), 431, y, 44, 9); text(money(item.grossCents), 477, y, 76, 9);
      y += height; doc.moveTo(42, y - 7).lineTo(553, y - 7).strokeColor('#E4E7DF').stroke();
    }
    space(285 + invoice.tax.length * 21);
    if (invoice.discountCents) { text(invoice.discountLabel, 50, y, 350); text('-' + money(invoice.discountCents), 455, y, 98, 10, true); y += 23; }
    if (invoice.deliveryCents) { text('Frais de livraison', 50, y, 350); text(money(invoice.deliveryCents), 455, y, 98, 10, true); y += 23; }
    y += 8;
    text('RECAPITULATIF TVA', 42, y, width, 10, true); y += 21;
    text('TAUX', 50, y, 70, 9, true); text('BASE HT', 177, y, 110, 9, true); text('TVA', 318, y, 90, 9, true); text('TOTAL TTC', 452, y, 101, 9, true); y += 19;
    for (const row of invoice.tax) {
      text(rate(row.rate), 50, y, 80); text(money(row.htCents), 177, y, 112); text(money(row.vatCents), 318, y, 95); text(money(row.ttcCents), 452, y, 101); y += 21;
    }
    y += 12; doc.roundedRect(42, y, width, 66, 9).fill(green);
    text('TOTAL REGLE', 58, y + 14, 260, 11, true, '#FFFFFF'); text(money(invoice.totalCents), 375, y + 11, 160, 21, true, '#FFFFFF');
    text(`Reglement : ${invoice.paymentMethod}  |  Reste a payer : 0,00 EUR`, 58, y + 41, width - 30, 10, false, '#FFFFFF'); y += 82;
    text('Prix unitaires HT avant remise. Totaux TTC et remise détaillés ci-dessus.', 42, y, width, 9, false, muted); y += 16;
    text('Paiement déjà encaissé pour la commande Bibou #' + invoice.orderNumber + '. Aucun nouveau paiement.', 42, y, width, 9, false, muted); y += 18;
    text('Cette facture documente la même vente. À rapprocher du journal des ventes et de la caisse : ne pas comptabiliser une seconde fois le règlement, le chiffre d’affaires ou la TVA.', 42, y, width, 9, false, muted);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i); doc.page.margins.bottom = 0;
      text(`${invoice.seller.name} - ${invoice.seller.legalForm} au capital de ${money(invoice.seller.capitalCents)} - ${invoice.seller.rcs}`, 42, 771, width, 8, false, muted);
      text(`Facture ${invoice.number} - Page ${i + 1}/${range.count}${example ? ' - EXEMPLE FICTIF' : ''}`, 42, 788, width, 8, false, muted);
    }
    doc.end();
  });
}
module.exports = { renderInvoice };
