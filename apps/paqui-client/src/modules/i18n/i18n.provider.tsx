import type { Accessor, ParentComponent, Setter } from 'solid-js';
import type { TranslationsDictionary } from './locales.types';
import { makePersisted } from '@solid-primitives/storage';
import { createContext, createEffect, createResource, createSignal, Show, useContext } from 'solid-js';
import { translations as defaultTranslations } from '../../locales/en.dictionary';
import { applyBrandMetadata } from '../config/branding';
import { locales } from './i18n.constants';
import { createDateFormatter, createFragmentTranslator, createRelativeTimeFormatter, createTranslator, findMatchingLocale } from './i18n.models';

export type Locale = typeof locales[number]['key'];

const I18nContext = createContext<{
  t: ReturnType<typeof createTranslator<TranslationsDictionary>>;
  te: ReturnType<typeof createFragmentTranslator<TranslationsDictionary>>;
  getLocale: Accessor<Locale>;
  setLocale: Setter<Locale>;
  locales: typeof locales;
  formatDate: ReturnType<typeof createDateFormatter>;
  formatRelativeTime: ReturnType<typeof createRelativeTimeFormatter>;
}>();

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('I18n context not found, useI18n must be used within I18nProvider');
  }

  return context;
}

async function fetchDictionary(locale: Locale): Promise<TranslationsDictionary> {
  const { translations } = await import(`../../locales/${locale}.dictionary.ts`);

  return {
    ...defaultTranslations,
    ...translations,
  };
}

export const I18nProvider: ParentComponent = (props) => {
  const browserLocale = findMatchingLocale({
    preferredLocales: navigator.languages.map(x => new Intl.Locale(x)),
    supportedLocales: locales.map(x => new Intl.Locale(x.key)),
  });
  const [getStoredLocale, setLocale] = makePersisted(createSignal<Locale>(browserLocale), { name: 'paqui_locale', storage: localStorage });
  // A locale saved before it was removed from the app falls back to the browser match.
  const getLocale = () => locales.some(locale => locale.key === getStoredLocale()) ? getStoredLocale() : browserLocale;

  const [dict] = createResource(getLocale, fetchDictionary);

  createEffect(() => {
    document.documentElement.lang = getLocale();
  });

  createEffect(() => {
    const dictionary = dict.latest;
    if (dictionary) {
      applyBrandMetadata({ tagline: dictionary['app.tagline'], description: dictionary['app.description'] });
    }
  });

  return (
    <Show when={dict.latest}>
      {getDictionary => (
        <I18nContext.Provider
          value={{
            t: createTranslator({ getDictionary }),
            te: createFragmentTranslator({ getDictionary }),
            getLocale,
            setLocale,
            locales,
            formatDate: createDateFormatter({ getLocale }),
            formatRelativeTime: createRelativeTimeFormatter({ getLocale }),
          }}
        >
          {props.children}
        </I18nContext.Provider>
      )}
    </Show>
  );
};
