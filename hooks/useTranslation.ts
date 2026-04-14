
import { useGlobalUiStore } from '../store/useGlobalUiStore.ts';
import { translations } from '../translations.ts';

export function useTranslation() {
  const language = useGlobalUiStore((state) => state.language);
  const t = translations[language];
  
  // Helper to handle layout direction based on language
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return { t, language, dir };
}
