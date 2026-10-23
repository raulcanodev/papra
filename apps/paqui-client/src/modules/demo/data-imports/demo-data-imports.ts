import type { ContactRoles, DataImportEntity, DataImportProposal, DataImportResult, ImportedContact, ImportedProduct } from '../../data-imports/data-imports.types';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { documentStorage } from '../demo.storage';
import { getValues } from '../demo.storage.models';
import { listDemoContacts, saveDemoContact, saveDemoProduct } from '../invoicing/demo-invoicing';
import { getDemoPricingStorages } from '../pricing/demo-pricing';

type Stored = Record<string, any>;

// The demo has no model to read the file: whatever is uploaded, it answers with this sample export of another
// software, with its odd column names, a repeated row and a row without a name, so the review shows how each looks
const SAMPLES: Record<DataImportEntity, { sheetName: string; headerRow: number; headers: string[]; mapping: Array<string | null>; rows: string[][] }> = {
  contacts: {
    sheetName: 'Clientes',
    headerRow: 3,
    headers: ['Cód.', 'Razón social', 'C.I.F.', 'Domicilio', 'C.P.', 'Población', 'Provincia', 'Tfno.', 'E-mail', 'Saldo'],
    mapping: [null, 'name', 'taxId', 'addressLine1', 'postalCode', 'city', 'region', 'phone', 'email', null],
    rows: [
      ['000001', 'Ferretería Hermanos Ruiz SL', 'B30123456', 'C/ Mayor 12', '30001', 'Murcia', 'Murcia', '968 123 456', 'pedidos@ferreteriaruiz.es', '1.240,50'],
      ['000002', 'Construcciones Levante SA', 'A30654321', 'Av. Libertad 45', '30300', 'Cartagena', 'Murcia', '968 654 321', 'administracion@clevante.es', '0,00'],
      ['000003', 'María Sánchez Gil', '48123456K', 'C/ Huerta 3, 2ºB', '30800', 'Lorca', 'Murcia', '600 112 233', 'maria.sanchez@correo', '85,00'],
      ['000004', 'Reformas Costa Cálida SL', 'B30999888', 'Pol. Ind. Oeste, nave 7', '30169', 'San Ginés', 'Murcia', '968 777 888', 'info@reformascosta.es', '3.020,00'],
      ['000005', 'Ferretería Hermanos Ruiz SL', 'B-30123456', 'C/ Mayor 12', '30001', 'Murcia', 'Murcia', '968 123 456', '', '0,00'],
      ['000006', '', 'B30555444', '', '', '', '', '', '', '0,00'],
      ['000007', 'Almacenes del Segura SL', 'B30222111', 'Ctra. de Alicante km 4', '30110', 'Cabezo de Torres', 'Murcia', '968 222 111', 'compras@almacenessegura.es', '512,75'],
    ],
  },
  products: {
    sheetName: 'Artículos',
    headerRow: 1,
    headers: ['Ref.', 'Descripción', 'Familia', 'Ud.', 'P.V.P.', '% IVA', 'Stock'],
    mapping: [null, 'name', null, 'unit', 'unitPrice', 'taxRate', null],
    rows: [
      ['TOR-M6', 'Tornillo hexagonal M6 x 30', 'Tornillería', 'ud', '0,18', '21', '2500'],
      ['TOR-M8', 'Tornillo hexagonal M8 x 40', 'Tornillería', 'ud', '0,26', '21', '1800'],
      ['ARA-6', 'Arandela plana 6 mm', 'Tornillería', 'ud', '0,04', '21', '5000'],
      ['CEM-25', 'Cemento gris saco 25 kg', 'Construcción', 'saco', '6,95', '21', '120'],
      ['GUA-NIT', 'Guantes de nitrilo (caja 100)', 'Protección', 'caja', '9,90', '21', '40'],
      ['SIL-TR', 'Silicona transparente 280 ml', 'Química', 'ud', 'consultar', '21', '75'],
    ],
  },
};

const now = () => new Date().toISOString();

async function listExisting({ organizationId, entity }: { organizationId: string; entity: DataImportEntity }) {
  if (entity === 'contacts') {
    return (await listDemoContacts({ organizationId })).filter(contact => !contact.archivedAt).map(contact => ({ id: contact.id, name: contact.name, taxId: contact.taxId ?? null }));
  }
  return (await getValues(getDemoPricingStorages().products))
    .filter(product => product.organizationId === organizationId && !product.contactId && !product.archivedAt)
    .map(product => ({ id: product.id, name: product.name, taxId: null }));
}

async function buildSampleProposal({ organizationId, entity, fileName }: { organizationId: string; entity: DataImportEntity; fileName: string }): Promise<DataImportProposal> {
  const sample = SAMPLES[entity];

  return {
    entity,
    fileName,
    detectedWith: 'ai',
    warnings: [],
    sheets: [{ name: sample.sheetName, rowCount: sample.rows.length + sample.headerRow }],
    sheetName: sample.sheetName,
    headerRow: sample.headerRow,
    headers: sample.headers,
    rows: sample.rows,
    mapping: sample.mapping,
    existing: await listExisting({ organizationId, entity }),
  };
}

const withoutEmpty = (record: Stored) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== ''));

// Same rules as the server: existing records completed (never erased) and given the new roles, the others created
async function confirmContacts({ organizationId, roles, contacts }: { organizationId: string; roles: ContactRoles; contacts: ImportedContact[] }): Promise<DataImportResult> {
  const existingById = new Map((await listDemoContacts({ organizationId })).map(contact => [contact.id, contact]));
  let createdCount = 0;

  for (const { existingContactId, ...contact } of contacts) {
    const existing = existingContactId === null ? undefined : existingById.get(existingContactId);
    if (existing) {
      await saveDemoContact({ contact: {
        ...existing,
        ...withoutEmpty(contact),
        isCustomer: existing.isCustomer || roles.isCustomer,
        isSupplier: existing.isSupplier || roles.isSupplier,
        isSalesRepresentative: existing.isSalesRepresentative || roles.isSalesRepresentative,
        updatedAt: now(),
      } });
      continue;
    }
    await saveDemoContact({ contact: { ...withoutEmpty(contact), ...roles, id: createId({ prefix: 'ctc' }), organizationId, createdAt: now(), updatedAt: now() } });
    createdCount += 1;
  }

  return { createdCount, updatedCount: contacts.length - createdCount };
}

async function confirmProducts({ organizationId, products }: { organizationId: string; products: ImportedProduct[] }): Promise<DataImportResult> {
  const storage = getDemoPricingStorages().products;
  let createdCount = 0;

  for (const { existingProductId, ...product } of products) {
    const existing = existingProductId === null ? null : await storage.getItem(existingProductId);
    if (existing && existing.organizationId === organizationId) {
      await saveDemoProduct({ product: { ...existing, ...withoutEmpty(product), updatedAt: now() } });
      continue;
    }
    await saveDemoProduct({ product: { id: createId({ prefix: 'prd' }), organizationId, description: null, unit: 'unit', unitPriceMinor: 0, currency: 'EUR', taxRateBps: 2_100, icon: null, iconColor: null, contactId: null, imageDocumentId: null, archivedAt: null, createdAt: now(), updatedAt: now(), ...withoutEmpty(product) } });
    createdCount += 1;
  }

  return { createdCount, updatedCount: products.length - createdCount };
}

const base = '/api/organizations/:organizationId/data-imports';

export const dataImportsHandlers = {
  ...defineHandler({
    path: `${base}/analyze`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => {
      await new Promise(resolve => setTimeout(resolve, 1_200));
      const document = await documentStorage.getItem(`${organizationId}:${body.documentId}`);
      const entity = body.entity as DataImportEntity;
      return buildSampleProposal({ organizationId, entity, fileName: document?.name ?? (entity === 'contacts' ? 'clientes.xlsx' : 'articulos.xlsx') });
    },
  }),
  ...defineHandler({
    path: `${base}/contacts/confirm`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => confirmContacts({ organizationId, roles: body.roles, contacts: body.contacts }),
  }),
  ...defineHandler({
    path: `${base}/products/confirm`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => confirmProducts({ organizationId, products: body.products }),
  }),
};
