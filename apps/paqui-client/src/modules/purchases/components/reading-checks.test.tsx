// @vitest-environment happy-dom
import { render } from 'solid-js/web';
import { describe, expect, test, vi } from 'vitest';
import { I18nProvider } from '@/modules/i18n/i18n.provider';
import { ReadingChecks } from './reading-checks';

describe('purchase reading checks', () => {
  test('removes due-date notices from a paid invoice while keeping unrelated notices', async () => {
    localStorage.setItem('paqui_locale', JSON.stringify('es'));
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <I18nProvider>
        <ReadingChecks
          checks={[{ code: 'due_date_before_issue_date', severity: 'warning' }]}
          warnings={[
            'La fecha de vencimiento (27-10-2026) es anterior a la fecha de emisión.',
            'El número junto al importe parece una referencia de recibo.',
          ]}
          ignoreDueDate
        />
      </I18nProvider>
    ), container);

    try {
      await vi.waitFor(() => expect(container.textContent).toContain('referencia de recibo'));
      expect(container.textContent).not.toContain('vencimiento');
      expect(container.textContent).toContain('1 aviso para revisar');
      expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
    } finally {
      dispose();
      container.remove();
    }
  });

  test('keeps a blocking error expanded so it is not hidden from the user', async () => {
    localStorage.setItem('paqui_locale', JSON.stringify('es'));
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <I18nProvider>
        <ReadingChecks checks={[{ code: 'invalid_tax_id', severity: 'error', params: { taxId: 'B26906172' } }]} warnings={[]} />
      </I18nProvider>
    ), container);

    try {
      await vi.waitFor(() => expect(container.textContent).toContain('B26906172'));
      expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
    } finally {
      dispose();
      container.remove();
    }
  });
});
