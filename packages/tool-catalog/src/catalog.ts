import type { ToolDefinition } from './tool-definition';
import { calendarTools } from './domains/calendar';
import { contactTools } from './domains/contacts';
import { documentTools } from './domains/documents';
import { fiscalProfileTools } from './domains/fiscal-profile';
import { invoiceTools } from './domains/invoices';
import { organizationTools } from './domains/organizations';
import { productTools } from './domains/products';
import { purchaseTools } from './domains/purchases';
import { searchTools } from './domains/search';
import { tagTools } from './domains/tags';
import { taxKnowledgeTools } from './domains/tax-knowledge';
import { taxRateTools } from './domains/tax-rates';
import { taxTools } from './domains/taxes';

export const toolCatalog: readonly ToolDefinition[] = [
  ...organizationTools,
  ...searchTools,
  ...documentTools,
  ...tagTools,
  ...contactTools,
  ...productTools,
  ...taxRateTools,
  ...invoiceTools,
  ...purchaseTools,
  ...fiscalProfileTools,
  ...taxTools,
  ...calendarTools,
  ...taxKnowledgeTools,
];

export function getToolByName({ name }: { name: string }): ToolDefinition | undefined {
  return toolCatalog.find(tool => tool.name === name);
}
