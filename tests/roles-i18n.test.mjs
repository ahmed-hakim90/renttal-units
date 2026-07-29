import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSION_KEYS } from '../src/lib/auth/permissions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadRoles(locale) {
  return JSON.parse(readFileSync(join(root, `src/messages/${locale}/roles.json`), 'utf8'));
}

function assertNoDotKeys(value, path = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(key.includes('.'), false, `Invalid dotted key at ${path}.${key}`);
      assertNoDotKeys(child, `${path}.${key}`);
    }
  }
}

function resolvePermission(messages, key) {
  const [module, action] = key.split('.');
  return messages.permissions?.[module]?.[action];
}

for (const locale of ['en', 'ar']) {
  test(`roles.${locale} has nested permission keys compatible with next-intl`, () => {
    const messages = loadRoles(locale);
    assertNoDotKeys(messages);
    for (const key of PERMISSION_KEYS) {
      const label = resolvePermission(messages, key);
      assert.equal(typeof label, 'string', `Missing translation for ${key} in ${locale}`);
      assert.ok(label.length > 0, `Empty translation for ${key} in ${locale}`);
    }
  });
}
