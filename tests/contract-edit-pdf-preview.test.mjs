import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('contract edit loads and displays the latest existing PDF', () => {
  const editPage = read('src/app/[locale]/(dashboard)/contracts/[id]/edit/page.tsx');
  const editor = read('src/components/contracts/contract-editor.tsx');

  assert.match(editPage, /getContractPdfPreviewUrl/);
  assert.match(editPage, /initialPdf=\{initialPdf\}/);
  assert.match(editor, /pdfPreviewUrl \?\? initialPdf\?\.url/);
  assert.match(editor, /displayedPdfFilename/);
});
