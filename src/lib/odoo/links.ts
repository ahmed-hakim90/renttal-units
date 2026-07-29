export function buildOdooInvoiceUrl(baseUrl: string, invoiceId: number | null) {
  if (!Number.isSafeInteger(invoiceId) || Number(invoiceId) <= 0) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;

    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/web') ? path : `${path}/web`;
    url.search = '';
    url.hash = new URLSearchParams({
      id: String(invoiceId),
      model: 'account.move',
      view_type: 'form',
    }).toString();
    return url.toString();
  } catch {
    return null;
  }
}
