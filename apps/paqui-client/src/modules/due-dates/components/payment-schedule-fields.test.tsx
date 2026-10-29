// @vitest-environment happy-dom
import { render } from 'solid-js/web';
import { describe, expect, test, vi } from 'vitest';
import { I18nProvider } from '@/modules/i18n/i18n.provider';
import { PaymentScheduleFields } from './payment-schedule-fields';

describe('payment schedule fields', () => {
  test('keeps the payment method but removes due-date controls once the invoice is paid', async () => {
    localStorage.setItem('paqui_locale', JSON.stringify('es'));
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <I18nProvider>
        <PaymentScheduleFields
          paymentMethod="transfer"
          onPaymentMethodChange={() => {}}
          rows={[{ dueDate: '2026-10-27', amountMinor: 17_666, status: 'paid' }]}
          onRowsChange={() => {}}
          issueDate="2026-10-29"
          payableMinor={17_666}
          currency="EUR"
          isPaid
          paidControl={<span>Ya pagada</span>}
        />
      </I18nProvider>
    ), container);

    try {
      await vi.waitFor(() => expect(container.textContent).toContain('Ya pagada'));
      expect(container.textContent).toContain('Forma de pago');
      expect(container.textContent).toContain('no hace falta indicar vencimientos');
      expect(container.textContent).not.toContain('Plazos en días');
      expect(container.textContent).not.toContain('Vencimiento 1');
      expect(container.textContent).not.toContain('Añadir vencimiento');
    } finally {
      dispose();
      container.remove();
    }
  });
});
