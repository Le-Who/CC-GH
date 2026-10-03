import { useCallback } from 'react';
import { useAppI18n } from '../../app/i18n.jsx';
import { translateSettlement } from './settlementText.js';

export function useSettlementText() {
  const { language } = useAppI18n();
  return useCallback(value => translateSettlement(language, value), [language]);
}
