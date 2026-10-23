import type { EmailsServices } from '../../emails/emails.services';
import type { LegalForm } from '../taxes.constants';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { contactsTable } from '../../contacts/contacts.table';
import { invoiceItemsTable, invoicesTable, invoicingProfilesTable } from '../../invoicing/invoicing.tables';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type SentEmail = Parameters<EmailsServices['sendEmail']>[0];

async function setupApp({ legalForm = 'self_employed' }: { legalForm?: LegalForm } = {}) {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Laura Diseño' }, { id: OTHER_ORG_ID, name: 'Other' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  await db.insert(invoicingProfilesTable).values({ organizationId: ORG_ID, legalName: 'Laura Ejemplo', taxId: '00000000T', email: 'laura@example.com', legalForm, accountantEmail: 'gestor@example.com' });
  await db.insert(contactsTable).values([
    { id: 'ctc_customer', organizationId: ORG_ID, name: 'Acme SL', taxId: 'B12345678', isCustomer: true },
    { id: 'ctc_supplier', organizationId: ORG_ID, name: 'Nube Hosting SL', taxId: 'B00000010', isSupplier: true },
  ]);

  // An issued professional invoice: 1.000 € + 21% VAT, 15% withholding
  await db.insert(invoicesTable).values({ id: 'inv_1', organizationId: ORG_ID, customerId: 'ctc_customer', status: 'sent', number: 'F-2026-0007', issueDate: new Date('2026-08-05T00:00:00.000Z'), dueDate: new Date('2026-09-05T00:00:00.000Z'), subtotalMinor: 100_000, taxMinor: 21_000, totalMinor: 121_000, withholdingRateBps: 1_500, withholdingMinor: 15_000 });
  await db.insert(invoiceItemsTable).values({ invoiceId: 'inv_1', description: 'Diseño de marca', quantityMillis: 1_000, unitPriceMinor: 100_000, taxRateBps: 2_100 });
  // A draft does not count
  await db.insert(invoicesTable).values({ id: 'inv_draft', organizationId: ORG_ID, customerId: 'ctc_customer', status: 'draft', issueDate: new Date('2026-08-06T00:00:00.000Z'), dueDate: new Date('2026-09-06T00:00:00.000Z'), subtotalMinor: 999_900, totalMinor: 999_900 });
  await db.insert(invoiceItemsTable).values({ invoiceId: 'inv_draft', description: 'Draft', quantityMillis: 1_000, unitPriceMinor: 999_900, taxRateBps: 2_100 });

  const sentEmails: SentEmail[] = [];
  const emailsServices: EmailsServices = { name: 'test', sendEmail: async (email) => {
    sentEmails.push(email);
  } };

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }), emailsServices }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  // A received invoice of 200 € + 21% VAT
  await request({ path: `/api/organizations/${ORG_ID}/purchases`, method: 'POST', body: { supplierId: 'ctc_supplier', number: 'NUBE-77', issueDate: '2026-09-10', category: 'software', items: [{ description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 20_000, taxRateBps: 2_100 }] } });

  const getReport = async (query = '') => {
    const response = await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3${query}` });
    return { response, report: (await response.json() as { report: Record<string, any> }).report };
  };

  return { db, request, getReport, sentEmails };
}

describe('taxes e2e', () => {
  test('the quarter report estimates the VAT return and the income tax instalment from the registered invoices', async () => {
    const { getReport } = await setupApp();

    const { report } = await getReport();

    expect(report.applicable).to.eql({ 303: true, 130: true, 111: false, 115: false, 202: false });
    // 210 € charged - 42 € deductible
    expect(report.vat303).to.include({ outputTaxMinor: 21_000, deductibleTaxMinor: 4_200, resultMinor: 16_800, outcome: 'pay' });
    // 1.000 - 200 = 800, minus 5% = 760, 20% = 152, minus the 150 € withheld by the customer = 2 €
    expect(report.incomeTax130).to.include({ incomeMinor: 100_000, expensesMinor: 20_000, difficultExpensesMinor: 4_000, grossInstalmentMinor: 15_200, withholdingsMinor: 15_000, resultMinor: 200 });
    expect(report.counts).to.eql({ issuedInvoices: 1, purchaseInvoices: 1 });
    expect((report.deadlines as { model: string; dueDate: string }[]).find(({ model }) => model === '303')?.dueDate).to.eql('2026-10-20T00:00:00.000Z');
  });

  test('a purchase being considered shows how much it lowers the taxes of the quarter', async () => {
    const { getReport } = await setupApp();

    const { report } = await getReport('?simulateBaseMinor=50000&simulateTaxRateBps=2100&simulateCategory=goods');

    // 105 € of deductible VAT, and the income tax goes down to 0 (it was 2 €)
    expect(report.simulation).to.include({ vat303SavingMinor: 10_500, incomeTax130SavingMinor: 200, incomeTax130ResultMinor: 0 });
  });

  test('a company has the corporate tax instalments and no income tax instalment', async () => {
    const { getReport } = await setupApp({ legalForm: 'company' });

    const { report } = await getReport();

    expect(report.applicable).to.include({ 130: false, 202: true });
    expect(report.corporateTax202).to.have.length(3);
  });

  test('the accountant pack holds the VAT books and the summary, and can be emailed as the organization', async () => {
    const { request, sentEmails } = await setupApp();

    const response = await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3/export` });
    expect(response.headers.get('content-type')).to.eql('application/zip');

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files).toSorted()).to.eql(['2026-3T-libro-facturas-emitidas.csv', '2026-3T-libro-facturas-recibidas.csv', '2026-3T-resumen.pdf']);

    const issuedBook = await zip.file('2026-3T-libro-facturas-emitidas.csv')!.async('string');
    expect(issuedBook.split('\r\n')[1]).to.eql('2026;3T;05/08/2026;F-2026-0007;B12345678;Acme SL;1000,00;21;210,00;;;15;150,00;1210,00');

    const receivedBook = await zip.file('2026-3T-libro-facturas-recibidas.csv')!.async('string');
    expect(receivedBook.split('\r\n')[1]).to.eql('2026;3T;10/09/2026;NUBE-77;B00000010;Nube Hosting SL;Software y suscripciones;200,00;21;42,00;42,00;0;0,00;242,00');

    const sendResponse = await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3/send`, method: 'POST', body: {} });
    expect(await sendResponse.json()).to.eql({ recipient: 'gestor@example.com', skippedDocumentsCount: 0 });
    expect(sentEmails).to.have.length(1);
    expect(sentEmails[0]).to.include({ to: 'gestor@example.com', from: '"Laura Ejemplo" <noreply@heypaqui.com>', replyTo: 'laura@example.com', subject: 'Documentación 3T 2026 - Laura Ejemplo' });
    expect(sentEmails[0]!.attachments?.[0]?.filename).to.eql('2026-3T-documentacion-gestor.zip');
  });

  test('the pack can be sent to another address, which is saved as the accountant email when asked', async () => {
    const { request, getReport, sentEmails } = await setupApp();

    const sendOnce = await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3/send`, method: 'POST', body: { to: 'otra@example.com' } });
    expect(await sendOnce.json()).to.include({ recipient: 'otra@example.com' });
    const { report: unchanged } = await getReport();
    expect(unchanged.profile).to.include({ accountantEmail: 'gestor@example.com' });

    await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3/send`, method: 'POST', body: { to: 'nueva@example.com', saveAsAccountantEmail: true } });
    const { report: saved } = await getReport();
    expect(saved.profile).to.include({ accountantEmail: 'nueva@example.com' });
    expect(sentEmails.map(email => email.to)).to.eql(['otra@example.com', 'nueva@example.com']);
  });

  test('the taxes of an organization are not readable from another one', async () => {
    const { request } = await setupApp();

    expect((await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3`, userId: OTHER_USER_ID })).status).to.eql(403);
    expect((await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/3/export`, userId: OTHER_USER_ID })).status).to.eql(403);
  });

  test('an invalid quarter is rejected', async () => {
    const { request } = await setupApp();

    expect((await request({ path: `/api/organizations/${ORG_ID}/taxes/2026/5` })).status).to.eql(400);
  });
});
