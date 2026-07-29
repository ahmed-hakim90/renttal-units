import 'server-only';

import { parseXmlRpcResponse } from '@/lib/odoo/xml-rpc-parser';

export type XmlRpcValue = string | number | boolean | null | Date | XmlRpcValue[] | { [key: string]: XmlRpcValue };

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encodeValue(value: XmlRpcValue): string {
  if (value === null || value === undefined) return '<value><nil/></value>';
  if (typeof value === 'boolean') return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? `<value><int>${value}</int></value>`
      : `<value><double>${value}</double></value>`;
  }
  if (typeof value === 'string') return `<value><string>${escapeXml(value)}</string></value>`;
  if (value instanceof Date) return `<value><dateTime.iso8601>${value.toISOString()}</dateTime.iso8601></value>`;
  if (Array.isArray(value)) {
    return `<value><array><data>${value.map(encodeValue).join('')}</data></array></value>`;
  }
  return `<value><struct>${Object.entries(value).map(([key, item]) => (
    `<member><name>${escapeXml(key)}</name>${encodeValue(item)}</member>`
  )).join('')}</struct></value>`;
}

export async function xmlRpcCall<T = unknown>(endpoint: string, methodName: string, params: XmlRpcValue[]): Promise<T> {
  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${escapeXml(methodName)}</methodName>
  <params>${params.map((param) => `<param>${encodeValue(param)}</param>`).join('')}</params>
</methodCall>`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body,
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Odoo XML-RPC HTTP ${response.status}: ${text.slice(0, 300)}`);
  const parsed = parseXmlRpcResponse(text);
  if (parsed.fault) {
    const prefix = parsed.fault.code == null ? '' : `Odoo XML-RPC fault ${parsed.fault.code}: `;
    throw new Error(`${prefix}${parsed.fault.message}`);
  }
  return parsed.value as T;
}
