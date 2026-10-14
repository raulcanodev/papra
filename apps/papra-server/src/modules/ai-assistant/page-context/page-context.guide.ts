// What each page of the app is for. Keyed by the path relative to the organization, the same paths the client
// navigation declares (organization-navigation.ts); the live controls and rows come from the page snapshot,
// so this only explains purpose and which tools act on the same data.
export const PAGE_GUIDE: Record<string, string> = {
  'home': 'Dashboard: key figures of the business (income, expenses, pending invoices) for a date range.',
  'documents': 'The archive of uploaded documents: upload, search, filter by tag, open one. Tools: list_documents, get_document, search_workspace.',
  'documents/deleted': 'Documents in the trash, which can be restored.',
  'ai-assistant': 'The full-screen version of this assistant.',
  'calendar': 'Fiscal calendar: Spanish tax deadlines (AEAT) and regional holidays. Tool: get_calendar.',
  'invoicing/invoices': 'Issued invoices (facturas emitidas): list by status, create a new one, open one to edit (drafts), issue, send or mark as paid. Received invoices are the "received" tab. Tools: list_invoices, create_invoice_draft, issue_invoice.',
  'invoicing/invoices/received': 'Invoices received from suppliers (expenses): register one by hand or from an uploaded file read by AI. Tools: list_purchase_invoices, create_purchase_invoice, extract_purchase_from_document.',
  'contacts/customers': 'Address book filtered to customers, the people and companies that receive invoices. Tools: list_contacts, create_contact, update_contact.',
  'contacts/suppliers': 'Address book filtered to suppliers, who send invoices to the organization. Tools: list_contacts, create_contact.',
  'contacts/sales-representatives': 'Address book filtered to sales representatives (commerciales) who sell on behalf of the organization.',
  'invoicing/products': 'Catalog of products and services with price and VAT rate, used as invoice lines. Tools: list_products, create_product, update_product.',
  'taxes': 'Quarterly taxes estimate (modelos 303, 130, 111, 115, 202) with deadlines, a what-if purchase simulator and the accountant pack. Tool: get_quarterly_taxes.',
  'finances/overview': 'Personal finances overview: balances, income and expenses.',
  'finances/transactions': 'Bank transactions: classify them as income, expense or transfer, tag them.',
  'finances/subscriptions': 'Recurring payments detected from transactions.',
  'finances/goals': 'Budget goals: target percentages per bucket (needs, wants, savings).',
  'settings': 'Organization general settings.',
  'settings/members': 'Members of the organization and their roles; invitations.',
  'settings/modules': 'Modules (invoicing, personal finances...) enabled for the organization.',
  'settings/documents/tags': 'Tags used to organize documents.',
  'settings/documents/custom-properties': 'Custom fields added to documents, transactions, customers, products or sales representatives.',
  'settings/documents/automations': 'Rules that tag documents automatically.',
  'settings/documents/intake-emails': 'Email addresses that turn received emails into documents.',
  'settings/invoicing/fiscal-profile': 'Fiscal identity of the organization (legal name, NIF, address, legal form, VAT regime, income tax method, accountant email). It decides which taxes apply. Tools: get_fiscal_profile, update_fiscal_profile.',
  'settings/invoicing/series': 'Invoice numbering series (prefix, next number, padding).',
  'settings/invoicing/taxes': 'VAT rates available when invoicing. Tools: list_tax_rates, create_tax_rate.',
  'settings/invoicing/verifactu': 'Verifactu configuration: sending every issued invoice to the AEAT and the status of each record.',
  'settings/invoicing/branding': 'Look of the invoice PDF: accent color, footer, payment details.',
  'settings/integrations/webhooks': 'Webhooks that notify other systems of events.',
  'settings/account/usage': 'Plan usage and storage.',
};

export function findPageGuide({ relativePath }: { relativePath: string }) {
  const key = Object.keys(PAGE_GUIDE)
    .filter(candidate => relativePath === candidate || relativePath.startsWith(`${candidate}/`))
    .toSorted((left, right) => right.length - left.length)[0];

  return key === undefined ? undefined : { key, description: PAGE_GUIDE[key]! };
}
