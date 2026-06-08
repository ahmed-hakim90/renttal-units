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
