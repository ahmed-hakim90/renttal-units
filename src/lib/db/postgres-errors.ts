export function readErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const record = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [record.message, record.details, record.hint]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
    if (typeof record.code === 'string' && record.code.trim()) return record.code;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function readErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code;
  }

  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { code?: string };
      return parsed.code;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function isUniqueViolation(error: unknown) {
  return readErrorCode(error) === '23505';
}

export function readUniqueViolationConstraint(error: unknown): string | undefined {
  if (!isUniqueViolation(error)) return undefined;

  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : error instanceof Error
      ? error.message
      : '';

  return message.match(/unique constraint "([^"]+)"/i)?.[1];
}
