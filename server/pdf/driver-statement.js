'use strict';
const {PDFDocument}=require('pdfkit');
const money=n=>Number.isSafeInteger(n)?`${(n/100).toFixed(2).replace('.',',')} EUR`:'A confirmer';
const day=value=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const clean=value=>String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,100);
function renderStatement(account,{now=new Date(),example=false}={}){
  return new Promise((resolve,reject)=>{
    const chunks=[],doc=new PDFDocument({size:'A4',margin:40,bufferPages:true,info:{Title:'Relevé hebdomadaire Krokli Driver',Author:'Krokli Driver',Subject:'Livraisons et rémunération - sans coordonnées clients'}});
    doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const left=40,width=515,green='#315B4B',muted='#526D60',cream='#FBF3E6';let y=0;
    function text(value,x,top,w,opts={}){doc.fillColor(opts.color||green).font(opts.bold?'Helvetica-Bold':'Helvetica').fontSize(opts.size||10).text(clean(value),x,top,{width:w,lineBreak:false,...opts});}
    function tableHeader(){doc.rect(left,y,width,24).fill('#E5EBE0');[['Livraison / n°',44,125],['Prénom',175,78],['Frais client',268,88],['Ton forfait',372,78],['Pourboire',466,85]].forEach(([v,x,w])=>text(v,x,y+7,w,{bold:true}));y+=30;}
    function page(first){if(!first)doc.addPage();text('Krokli Driver',left,38,width,{bold:true,size:22});text(example?'EXEMPLE - DONNÉES FICTIVES':'RELEVÉ HEBDOMADAIRE',left,70,width,{bold:true,size:10});text(clean(account.driver.name),left,94,width,{size:14,bold:true});text(`Semaine du ${account.week.startDate} au ${account.week.endDate} - heure de Paris`,left,119,width,{color:muted});
      y=148;if(first){doc.roundedRect(left,y,width,93,12).fill(green);text(`${account.summary.completedCount} livraison(s) terminée(s)`,left+15,y+13,width-30,{color:'#FFFFFF',bold:true,size:12});text(`Forfaits : ${money(account.summary.knownDriverPayCents)}   |   Pourboires : ${money(account.summary.tipCents)}`,left+15,y+38,width-30,{color:'#FFFFFF'});text(`Total : ${money(account.summary.totalEntitlementCents)}`,left+15,y+62,width-30,{color:'#FFFFFF',bold:true,size:15});y+=106;text(account.week.complete?'Semaine terminée - montants à rapprocher avec le restaurant.':'Semaine en cours - relevé provisoire.',left,y,width,{color:muted});y+=22;if(account.summary.unknownPayCount){text(`${account.summary.unknownPayCount} forfait(s) à confirmer : total incomplet.`,left,y,width,{color:'#9A3D25',bold:true});y+=22;}}
      tableHeader();
    }
    page(true);
    for(const [index,row] of account.history.entries()){const covered=row.bibouPlusDeliveryCovered===true&&row.deliveryFeeCents===0,height=covered?49:27;if(y+height>761)page(false);if(index%2===0)doc.rect(left,y-3,width,height-2).fill(cream);text(`${day(row.deliveredAt).slice(0,5)} ${day(row.deliveredAt).slice(-5)} · #${row.number}`,44,y+4,125);text(row.firstName,175,y+4,78,{ellipsis:true});text(money(row.deliveryFeeCents),268,y+4,88);text(money(row.driverPayCents),372,y+4,78);text(money(row.tipCents),466,y+4,85);if(covered)text('Bibou Plus : livraison offerte au client ; forfait pris en charge par le restaurant.',44,y+25,width-8,{size:9,bold:true});y+=height;}
    if(!account.history.length){text('Aucune livraison terminée cette semaine.',left,y+10,width,{color:muted});y+=40;}
    if(y>694)page(false);y+=18;doc.moveTo(left,y).lineTo(left+width,y).strokeColor('#D7DED0').stroke();y+=12;
    text('Frais client = frais de livraison réellement payés, sans le montant du panier.',left,y,width,{color:muted});y+=18;
    text('Une livraison offerte au client ne retire pas le forfait du livreur.',left,y,width,{color:muted});y+=18;
    text('Ce relevé ne confirme aucun versement bancaire et ne déclenche aucun paiement.',left,y,width,{color:muted,size:9});y+=17;
    text('Prénom uniquement : aucun nom de famille, téléphone, adresse ou trajet GPS.',left,y,width,{color:muted,size:9});
    const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const old=doc.page.margins.bottom;doc.page.margins.bottom=0;text(`Édité le ${day(now.toISOString())} - Page ${i+1}/${range.count}`,left,doc.page.height-29,width,{color:muted,size:8});doc.page.margins.bottom=old;}
    doc.end();
  });
}
module.exports={renderStatement};
