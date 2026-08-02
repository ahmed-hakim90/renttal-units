import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../src/lib/audit/catalog.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadMessages(locale) {
  return JSON.parse(readFileSync(join(root, `src/messages/${locale}/audit.json`), 'utf8'));
}

for (const locale of ['en', 'ar']) {
  test(`audit ${locale} messages cover catalog actions and entities`, () => {
    const messages = loadMessages(locale);
    for (const action of AUDIT_ACTIONS) {
      assert.equal(typeof messages.actions[action], 'string', `missing actions.${action}`);
      assert.ok(messages.actions[action].trim().length > 0, `empty actions.${action}`);
    }
    for (const entity of AUDIT_ENTITY_TYPES) {
      assert.equal(typeof messages.entities[entity], 'string', `missing entities.${entity}`);
      assert.ok(messages.entities[entity].trim().length > 0, `empty entities.${entity}`);
    }
  });
}

test('en and ar audit action keys match', () => {
  const en = loadMessages('en');
  const ar = loadMessages('ar');
  assert.deepEqual(Object.keys(en.actions).sort(), Object.keys(ar.actions).sort());
  assert.deepEqual(Object.keys(en.entities).sort(), Object.keys(ar.entities).sort());
});
