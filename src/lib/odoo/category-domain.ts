import type { XmlRpcValue } from '@/lib/odoo/xml-rpc';

export function buildOdooCategoryDomain(categoryIds: number[]): XmlRpcValue[] {
  const uniqueIds = [...new Set(categoryIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return [];

  const conditions: XmlRpcValue[] = uniqueIds.map((id) => ['categ_id', 'child_of', id]);
  if (conditions.length === 1) return conditions;

  return [
    ...Array.from({ length: conditions.length - 1 }, () => '|' as XmlRpcValue),
    ...conditions,
  ];
}
