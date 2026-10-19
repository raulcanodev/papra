import type { Contact } from '../contacts/contacts.types';
import type { PaymentMethod } from '../due-dates/due-dates.types';
import type { IncomeTaxMethod, LegalForm, VatRegime } from '../taxes/taxes.types';
import type { EntityIconColor } from '../ui/components/entity-icon.constants';

export type InvoiceStatus = 'draft' | 'issuing' | 'issued' | 'sent' | 'paid' | 'void';
export type InvoiceTemplateId = 'minimal' | 'classic';
export type VerifactuMode = 'disabled' | 'test' | 'production' | 'not_applicable';

export type VerifactuConfiguration = {
  organizationId: string;
  mode: VerifactuMode;
  applicabilityReason: string | null;
  legalName: string | null;
  taxId: string | null;
  certificateConfigured: boolean;
  aeatValidationPassedAt: Date | null;
  responsibleDeclarationAcceptedAt: Date | null;
  activatedAt: Date | null;
  lockedUntil: Date | null;
  transmissionsPaused: boolean;
  pauseReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VerifactuRecord = {
  id: string;
  invoiceId: string;
  recordType: string;
  status: string;
  hash: string;
  qrUrl: string;
  attemptCount: number;
  generatedAt: Date;
  acceptedAt: Date | null;
  aeatCsv: string | null;
  aeatErrorDescription: string | null;
  createdAt: Date;
};

export type FiscalProfile = {
  organizationId: string;
  legalName: string;
  taxId: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  currency: string;
  locale: string;
  paymentTermsDays: number;
  defaultNotes: string | null;
  defaultTerms: string | null;
  templateId: InvoiceTemplateId;
  defaultWithholdingRateBps: number;
  legalForm: LegalForm | null;
  vatRegime: VatRegime;
  incomeTaxMethod: IncomeTaxMethod;
  lastCorporateTaxQuotaMinor: number | null;
  accountantEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FiscalProfileInput = Omit<FiscalProfile, 'organizationId' | 'createdAt' | 'updatedAt'>;

type CatalogEntity = { id: string; organizationId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null };
// contactId: the supplier or customer it belongs to, null for our own catalog
export type InvoicingProduct = CatalogEntity & { name: string; description: string | null; unit: string; unitPriceMinor: number; currency: string; taxRateBps: number; icon: string | null; iconColor: EntityIconColor | null; contactId: string | null; contactName: string | null; imageDocumentId: string | null };
export type ProductInput = Omit<InvoicingProduct, keyof CatalogEntity | 'icon' | 'iconColor' | 'contactName' | 'imageDocumentId'> & Partial<Pick<InvoicingProduct, 'icon' | 'iconColor' | 'imageDocumentId'>>;
export type InvoicingTaxRate = CatalogEntity & { name: string; rateBps: number; isDefault: boolean };
export type TaxRateInput = Omit<InvoicingTaxRate, keyof CatalogEntity>;
export type InvoiceSeries = CatalogEntity & { name: string; prefix: string; nextNumber: number; padding: number; isDefault: boolean };
export type InvoiceSeriesInput = Omit<InvoiceSeries, keyof CatalogEntity>;
export type InvoiceBranding = { organizationId: string; accentColor: string; footerText: string | null; paymentDetails: string | null; createdAt: Date; updatedAt: Date };
export type InvoiceBrandingInput = Omit<InvoiceBranding, 'organizationId' | 'createdAt' | 'updatedAt'>;

export type InvoiceItemInput = {
  productId?: string | null;
  description: string;
  quantityMillis: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountRateBps: number;
};

export type InvoiceDraftInput = {
  customerId: string;
  seriesId?: string | null;
  salesRepresentativeId?: string | null;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  templateId: InvoiceTemplateId;
  /** IRPF withholding on the taxable base, in basis points (1500 = 15%) */
  withholdingRateBps: number;
  items: InvoiceItemInput[];
  /** How the customer pays; the due dates are collected in the due dates page */
  paymentMethod?: PaymentMethod | null;
  /** The delivery notes of the customer the invoice covers; absent leaves them as they are */
  deliveryNoteIds?: string[];
};

export type InvoiceDeliveryNote = { id: string; number: string | null; date: Date };

export type Invoice = {
  id: string;
  organizationId: string;
  customerId: string;
  customerName?: string;
  customerIcon?: string | null;
  customerIconColor?: EntityIconColor | null;
  customerEmail?: string | null;
  customer?: Contact | null;
  seriesId: string | null;
  salesRepresentativeId: string | null;
  documentId: string | null;
  status: InvoiceStatus;
  number: string | null;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  /** Taxes included, the amount declared to VERI*FACTU (the withholding is not subtracted) */
  totalMinor: number;
  withholdingRateBps: number;
  withholdingMinor: number;
  notes: string | null;
  terms: string | null;
  templateId: InvoiceTemplateId;
  items?: Array<InvoiceItemInput & { id: string; position: number }>;
  deliveryNotes?: InvoiceDeliveryNote[];
  issuedAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  paymentMethod?: PaymentMethod | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
