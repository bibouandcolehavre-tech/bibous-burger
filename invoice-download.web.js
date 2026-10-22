// Authenticated blobs only: never put the customer's account token in a URL.
export async function saveInvoice(response, filename, isCurrent = () => true) {
  if (!/^(WEB-\d{4}-\d{6}|facture-commande-\d+-laddition)\.pdf$/.test(filename || '')) throw Error('Nom de facture invalide.');
  const blob = await response.blob();
  if (blob.size < 100 || blob.size > 5000000 || !blob.type.startsWith('application/pdf')) throw Error('Le document reçu n’est pas un PDF valide.');
  if (!isCurrent()) return false;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.rel = 'noopener';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
