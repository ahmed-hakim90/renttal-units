import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('global search links locations and units to their detail pages', () => {
  const searchAction = readFileSync(join(root, 'src/lib/actions/search.ts'), 'utf8');

  assert.match(searchAction, /href: `\/locations\/\$\{location\.id\}`/);
  assert.match(searchAction, /href: `\/units\/\$\{unit\.id\}`/);
  assert.doesNotMatch(searchAction, /href: `\/locations\?search=/);
  assert.doesNotMatch(searchAction, /href: `\/units\?search=/);
});
