const MIN_PASSWORD_LENGTH = 12;

export function getStaffPasswordChecks(password: string) {
  return {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export function validateStaffPassword(password: string): string | null {
  const checks = getStaffPasswordChecks(password);
  return Object.values(checks).every(Boolean) ? null : 'password_policy';
}
