import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportSummary, resolveDuplicateMode } from '../src/renderer/services/import-ux-service.js';

test('buildImportSummary returns normalized counts and errors', () => {
  const summary = buildImportSummary('Folder', { added: 4, merged: 1, skipped: 2 }, [{ path: '/a', reason: 'bad' }]);
  assert.equal(summary.sourceLabel, 'Folder');
  assert.equal(summary.added, 4);
  assert.equal(summary.merged, 1);
  assert.equal(summary.skipped, 2);
  assert.equal(summary.errors.length, 1);
});

test('resolveDuplicateMode respects remember-choice flow', () => {
  const first = resolveDuplicateMode({ rememberedMode: null, selectedMode: 'merge', rememberChoice: true });
  assert.equal(first.mode, 'merge');
  assert.equal(first.rememberedMode, 'merge');

  const second = resolveDuplicateMode({ rememberedMode: first.rememberedMode, selectedMode: null, rememberChoice: false });
  assert.equal(second.mode, 'merge');
  assert.equal(second.rememberedMode, 'merge');
});
