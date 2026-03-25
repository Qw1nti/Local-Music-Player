export function buildImportSummary(sourceLabel, counts = {}, errors = []) {
  return {
    sourceLabel: String(sourceLabel || 'Import'),
    added: Math.max(0, Number(counts.added || 0)),
    merged: Math.max(0, Number(counts.merged || 0)),
    skipped: Math.max(0, Number(counts.skipped || 0)),
    errors: Array.isArray(errors) ? errors : []
  };
}

export function resolveDuplicateMode({ rememberedMode, selectedMode, rememberChoice }) {
  const mode = selectedMode || rememberedMode || 'skip';
  const nextRememberedMode = rememberChoice && mode !== 'cancel' ? mode : rememberedMode || null;
  return {
    mode,
    rememberedMode: nextRememberedMode
  };
}
