import { XMLParser } from 'fast-xml-parser';

export type ParsedXmlRpcValue =
  | string
  | number
  | boolean
  | null
  | ParsedXmlRpcValue[]
  | { [key: string]: ParsedXmlRpcValue };

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function scalarText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && '#text' in value) {
    return String((value as { '#text': unknown })['#text'] ?? '');
  }
  return String(value);
}

function parseValueNode(node: unknown): ParsedXmlRpcValue {
  if (node === null || node === undefined) return '';
  if (typeof node !== 'object' || Array.isArray(node)) return scalarText(node);

  const value = node as Record<string, unknown>;
  if (hasOwn(value, 'nil')) return null;
  if (hasOwn(value, 'boolean')) {
    const text = scalarText(value.boolean).trim().toLowerCase();
    return text === '1' || text === 'true';
  }
  if (hasOwn(value, 'int')) return Number(scalarText(value.int).trim());
  if (hasOwn(value, 'i4')) return Number(scalarText(value.i4).trim());
  if (hasOwn(value, 'i8')) return Number(scalarText(value.i8).trim());
  if (hasOwn(value, 'double')) return Number(scalarText(value.double).trim());
  if (hasOwn(value, 'string')) return scalarText(value.string);
  if (hasOwn(value, 'dateTime.iso8601')) return scalarText(value['dateTime.iso8601']);
  if (hasOwn(value, 'base64')) return scalarText(value.base64);

  if (hasOwn(value, 'array')) {
    const arrayNode = value.array as { data?: { value?: unknown | unknown[] } } | undefined;
    return asArray(arrayNode?.data?.value).map(parseValueNode);
  }

  if (hasOwn(value, 'struct')) {
    const structNode = value.struct as { member?: unknown | unknown[] } | undefined;
    const result: Record<string, ParsedXmlRpcValue> = {};
    for (const rawMember of asArray(structNode?.member)) {
      if (!rawMember || typeof rawMember !== 'object') continue;
      const member = rawMember as { name?: unknown; value?: unknown };
      const name = scalarText(member.name);
      if (!name) continue;
      result[name] = parseValueNode(member.value);
    }
    return result;
  }

  if (hasOwn(value, '#text')) return scalarText(value['#text']);
  return '';
}

export function parseXmlRpcResponse(xml: string): {
  value: ParsedXmlRpcValue;
  fault: { code: number | null; message: string } | null;
} {
  let document: Record<string, unknown>;
  try {
    document = parser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid Odoo XML-RPC response: ${error instanceof Error ? error.message : String(error)}`);
  }

  const response = document.methodResponse as {
    params?: { param?: { value?: unknown } };
    fault?: { value?: unknown };
  } | undefined;
  if (!response) throw new Error('Invalid Odoo XML-RPC response: methodResponse is missing');

  if (response.fault) {
    const parsedFault = parseValueNode(response.fault.value);
    const fault = parsedFault && typeof parsedFault === 'object' && !Array.isArray(parsedFault)
      ? parsedFault as Record<string, ParsedXmlRpcValue>
      : {};
    const code = typeof fault.faultCode === 'number' ? fault.faultCode : null;
    const message = typeof fault.faultString === 'string'
      ? fault.faultString
      : 'Odoo XML-RPC fault';
    return { value: parsedFault, fault: { code, message } };
  }

  return {
    value: parseValueNode(response.params?.param?.value),
    fault: null,
  };
}
