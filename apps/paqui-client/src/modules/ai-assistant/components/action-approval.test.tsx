// @vitest-environment happy-dom
import type { ToolConfirmation } from '../ai-assistant.services';
import { render } from 'solid-js/web';
import { describe, expect, test, vi } from 'vitest';
import { translations } from '@/locales/es.dictionary';
import { createTranslator } from '@/modules/i18n/i18n.models';
import { I18nProvider } from '@/modules/i18n/i18n.provider';
import { getActionDetails, PendingActionsBar } from './action-approval';

const supplier: ToolConfirmation = { toolCallId: 'call-1', toolName: 'create_contact', description: 'create_contact', status: 'pending', args: { name: 'Proveedor SL', taxId: 'B12345678', isSupplier: true, addressLine1: 'Calle Mayor 1', city: 'Yecla', contactId: 'internal-id' } };

describe('action approval', () => {
  test('shows the tax identifier and address without internal identifiers', () => {
    const t = createTranslator({ getDictionary: () => translations });
    const details = getActionDetails({ confirmation: supplier, t, locale: 'es' });
    expect(details.map(detail => detail.value)).toContain('B12345678');
    expect(details.map(detail => detail.value)).toContain('Calle Mayor 1, Yecla');
    expect(JSON.stringify(details)).not.toContain('internal-id');
  });

  test('offers human labels, approval, rejection and a way to write a different request', async () => {
    localStorage.setItem('paqui_locale', JSON.stringify('es'));
    const container = document.createElement('div');
    document.body.append(container);
    const approve = vi.fn();
    const reject = vi.fn();
    const other = vi.fn();
    const dispose = render(() => <I18nProvider><PendingActionsBar confirmations={[supplier]} busyIds={[]} errors={{}} onApprove={approve} onApproveAll={() => {}} onReject={reject} onSomethingElse={other} /></I18nProvider>, container);
    try {
      await vi.waitFor(() => expect(container.textContent).toContain('Crear proveedor'));
      expect(container.textContent).not.toContain('create_contact');
      expect(container.textContent).not.toContain('factura');
      const click = (text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))!.click();
      click('Aprobar');
      click('Rechazar');
      click('Otra cosa');
      expect(approve).toHaveBeenCalledWith(supplier);
      expect(reject).toHaveBeenCalledWith(supplier);
      expect(other).toHaveBeenCalledOnce();
    } finally {
      dispose();
      container.remove();
    }
  });
});
