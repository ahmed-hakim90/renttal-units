import { headers } from 'next/headers';

const CORRELATION_HEADER = 'x-correlation-id';

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

export async function getCorrelationId(): Promise<string> {
  const headersList = await headers();
  return headersList.get(CORRELATION_HEADER) ?? generateCorrelationId();
}

export function correlationIdHeader(id: string): Record<string, string> {
  return { [CORRELATION_HEADER]: id };
}
