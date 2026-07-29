type OdooProductNameSource = {
  id: number;
  name?: unknown;
  display_name?: unknown;
};

export function getOdooProductName(product: OdooProductNameSource) {
  if (typeof product.name === 'string' && product.name.trim()) {
    return product.name.trim();
  }
  if (typeof product.display_name === 'string' && product.display_name.trim()) {
    return product.display_name.trim();
  }
  return String(product.id);
}
