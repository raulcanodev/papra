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
  createdAt: Date;
  updatedAt: Date;
};

export type FiscalProfileInput = Omit<FiscalProfile, 'organizationId' | 'createdAt' | 'updatedAt'>;

export type InvoicingCustomer = {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  currency: string;
  paymentTermsDays: number;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerInput = Omit<InvoicingCustomer, 'id' | 'organizationId' | 'archivedAt' | 'createdAt' | 'updatedAt'>;

type CatalogEntity = { id: string; organizationId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null };
export type InvoicingProduct = CatalogEntity & { name: string; description: string | null; unit: string; unitPriceMinor: number; currency: string; taxRateBps: number };
export type ProductInput = Omit<InvoicingProduct, keyof CatalogEntity>;
export type InvoicingTaxRate = CatalogEntity & { name: string; rateBps: number; isDefault: boolean };
export type TaxRateInput = Omit<InvoicingTaxRate, keyof CatalogEntity>;
export type SalesRepresentative = CatalogEntity & { name: string; email: string | null; phone: string | null; taxId: string | null; notes: string | null };
export type SalesRepresentativeInput = Omit<SalesRepresentative, keyof CatalogEntity>;
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
  items: InvoiceItemInput[];
};

export type Invoice = {
  id: string;
  organizationId: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string | null;
  customer?: InvoicingCustomer | null;
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
  totalMinor: number;
  notes: string | null;
  terms: string | null;
  templateId: InvoiceTemplateId;
  items?: Array<InvoiceItemInput & { id: string; position: number }>;
  issuedAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
