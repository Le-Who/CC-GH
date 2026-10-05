const READ_ONLY_PREVIEW = {
 en: 'Read-only preview · changes disabled',
 ru: 'Предпросмотр · изменения отключены',
};

// This label belongs only to the isolated preview. Production save diagnostics
// and every mutation guard remain in the existing component/presentation code.
export function createPreviewTranslator(language, translate) {
 return (key, vars) => key === 'yard.persistent.status.readOnly'
  ? READ_ONLY_PREVIEW[language] || READ_ONLY_PREVIEW.en
  : translate(language, key, vars);
}
