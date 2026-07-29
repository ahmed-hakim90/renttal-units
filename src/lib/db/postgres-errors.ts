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
