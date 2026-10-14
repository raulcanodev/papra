import type { Component } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { useI18n } from './i18n.provider';

/** One click switches to the other available language, no menu. */
export const LanguageToggleButton: Component<{ class?: string }> = (props) => {
  const { getLocale, setLocale, locales, t } = useI18n();
  const next = () => locales.find(locale => locale.key !== getLocale()) ?? locales[0];

  return (
    <Button
      variant="outline"
      size="icon"
      class={cn('rounded-full bg-background/70 text-xs font-semibold uppercase', props.class)}
      aria-label={t('layout.language-switcher')}
      translate="no"
      lang={next().key}
      onClick={() => setLocale(next().key)}
    >
      {next().key}
    </Button>
  );
};
