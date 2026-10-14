import type { CustomPropertyDefinition } from '../custom-properties.types';
import type { EntityCustomPropertyForApi } from '../entity-custom-properties.usecases';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { invoicingCustomersTable } from '../../invoicing/invoicing.tables';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { entityCustomPropertyValuesTable } from '../custom-properties.table';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type DefinitionWithOptions = CustomPropertyDefinition & { options: { id: string; name: string }[] };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const createDefinition = async ({ organizationId = ORG_ID, userId = USER_ID, ...definition }: Record<string, unknown> & { organizationId?: string; userId?: string }) => {
    const response = await request({ path: `/api/organizations/${organizationId}/custom-properties`, method: 'POST', body: definition, userId });
    const { propertyDefinition } = await response.json() as { propertyDefinition: CustomPropertyDefinition };
    const definitionResponse = await request({ path: `/api/organizations/${organizationId}/custom-properties/${propertyDefinition.id}`, userId });
    const { definition: withOptions } = await definitionResponse.json() as { definition: DefinitionWithOptions };

    return withOptions;
  };

  const getCustomerProperties = async ({ customerId, organizationId = ORG_ID, userId = USER_ID }: { customerId: string; organizationId?: string; userId?: string }) => {
    const response = await request({ path: `/api/organizations/${organizationId}/custom-properties/entities/customer/${customerId}`, userId });

    return { response, ...await response.json() as { customProperties: EntityCustomPropertyForApi[] } };
  };

  return { db, request, createDefinition, getCustomerProperties };
}

describe('entity custom properties e2e', () => {
  describe('definitions scoped to an entity type', () => {
    test('definitions are created for an entity type, documents being the default, and can be listed by entity type', async () => {
      const { request, createDefinition } = await setupApp();

      const customerDefinition = await createDefinition({ name: 'Segment', type: 'text', entityType: 'customer' });
      const documentDefinition = await createDefinition({ name: 'Reference', type: 'text' });

      expect(customerDefinition.entityType).to.eql('customer');
      expect(documentDefinition.entityType).to.eql('document');

      const customersResponse = await request({ path: `/api/organizations/${ORG_ID}/custom-properties?entityType=customer` });
      const { propertyDefinitions: customerDefinitions } = await customersResponse.json() as { propertyDefinitions: CustomPropertyDefinition[] };

      expect(customerDefinitions.map(({ name }) => name)).to.eql(['Segment']);

      const allResponse = await request({ path: `/api/organizations/${ORG_ID}/custom-properties` });
      const { propertyDefinitions: allDefinitions } = await allResponse.json() as { propertyDefinitions: CustomPropertyDefinition[] };

      expect(allDefinitions.map(({ name }) => name).toSorted()).to.eql(['Reference', 'Segment']);
    });

    test('the same property name can be used for different entity types, but not twice for the same one', async () => {
      const { request } = await setupApp();
      const create = async (entityType: string) => request({ path: `/api/organizations/${ORG_ID}/custom-properties`, method: 'POST', body: { name: 'Region', type: 'text', entityType } });

      expect((await create('customer')).status).to.eql(200);
      expect((await create('product')).status).to.eql(200);
      expect((await create('customer')).status).to.eql(409);
    });

    test('relation property types are not available for the generic entities', async () => {
      const { request } = await setupApp();

      const response = await request({ path: `/api/organizations/${ORG_ID}/custom-properties`, method: 'POST', body: { name: 'Owner', type: 'user_relation', entityType: 'customer' } });

      expect(response.status).to.eql(400);
      expect(await response.json()).to.eql({ error: { code: 'custom_property_definition.type_not_allowed_for_entity', message: 'This property type is not available for this entity type.' } });
    });

    test('an unknown entity type is rejected', async () => {
      const { request } = await setupApp();

      const response = await request({ path: `/api/organizations/${ORG_ID}/custom-properties`, method: 'POST', body: { name: 'Foo', type: 'text', entityType: 'spaceship' } });

      expect(response.status).to.eql(400);
    });
  });

  describe('values of the custom properties of a customer', () => {
    test('a customer is created and updated with its custom property values', async () => {
      const { request, createDefinition, getCustomerProperties } = await setupApp();

      const segment = await createDefinition({ name: 'Segment', type: 'select', entityType: 'customer', options: [{ name: 'SMB' }, { name: 'Enterprise' }] });
      const employees = await createDefinition({ name: 'Employees', type: 'number', entityType: 'customer' });
      const channels = await createDefinition({ name: 'Channels', type: 'multi_select', entityType: 'customer', options: [{ name: 'Email' }, { name: 'Phone' }] });
      const [smb, enterprise] = segment.options;
      const [email, phone] = channels.options;

      const createResponse = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers`,
        method: 'POST',
        body: { name: 'Acme', customProperties: { [segment.id]: smb!.id, [employees.id]: 42, [channels.id]: [email!.id, phone!.id] } },
      });

      expect(createResponse.status).to.eql(201);
      const { customer } = await createResponse.json() as { customer: { id: string; name: string } };
      expect(customer.name).to.eql('Acme');

      const { customProperties } = await getCustomerProperties({ customerId: customer.id });

      expect(customProperties).to.eql([
        { propertyDefinitionId: segment.id, key: segment.key, name: 'Segment', type: 'select', value: { optionId: smb!.id, name: 'SMB' } },
        { propertyDefinitionId: employees.id, key: employees.key, name: 'Employees', type: 'number', value: 42 },
        { propertyDefinitionId: channels.id, key: channels.key, name: 'Channels', type: 'multi_select', value: [{ optionId: email!.id, name: 'Email' }, { optionId: phone!.id, name: 'Phone' }] },
      ]);

      // Only the submitted properties are touched: the segment changes, employees is cleared, channels is kept
      const updateResponse = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers/${customer.id}`,
        method: 'PUT',
        body: { name: 'Acme Inc', customProperties: { [segment.id]: enterprise!.id, [employees.id]: null } },
      });

      expect(updateResponse.status).to.eql(200);

      const { customProperties: updatedProperties } = await getCustomerProperties({ customerId: customer.id });

      expect(updatedProperties.map(({ name, value }) => ({ name, value }))).to.eql([
        { name: 'Segment', value: { optionId: enterprise!.id, name: 'Enterprise' } },
        { name: 'Channels', value: [{ optionId: email!.id, name: 'Email' }, { optionId: phone!.id, name: 'Phone' }] },
      ]);
    });

    test('an invalid value rejects the whole request: the customer is not created', async () => {
      const { db, request, createDefinition } = await setupApp();

      const employees = await createDefinition({ name: 'Employees', type: 'number', entityType: 'customer' });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers`,
        method: 'POST',
        body: { name: 'Acme', customProperties: { [employees.id]: 'not a number' } },
      });

      expect(response.status).to.eql(400);
      expect(await db.select().from(invoicingCustomersTable)).to.eql([]);
    });

    test('a definition of another entity type cannot be used on a customer', async () => {
      const { db, request, createDefinition } = await setupApp();

      const productDefinition = await createDefinition({ name: 'Color', type: 'text', entityType: 'product' });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers`,
        method: 'POST',
        body: { name: 'Acme', customProperties: { [productDefinition.id]: 'red' } },
      });

      expect(response.status).to.eql(404);
      expect(await db.select().from(invoicingCustomersTable)).to.eql([]);
    });

    test('an option of another property cannot be selected', async () => {
      const { request, createDefinition } = await setupApp();

      const segment = await createDefinition({ name: 'Segment', type: 'select', entityType: 'customer', options: [{ name: 'SMB' }] });
      const tier = await createDefinition({ name: 'Tier', type: 'select', entityType: 'customer', options: [{ name: 'Gold' }] });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers`,
        method: 'POST',
        body: { name: 'Acme', customProperties: { [segment.id]: tier.options[0]!.id } },
      });

      expect(response.status).to.eql(400);
    });

    test('a customer definition cannot be used on a document', async () => {
      const { db, request, createDefinition } = await setupApp();

      const customerDefinition = await createDefinition({ name: 'Segment', type: 'text', entityType: 'customer' });
      const { documentsTable } = await import('../../documents/documents.table');
      await db.insert(documentsTable).values({ id: 'doc_111111111111111111111111', organizationId: ORG_ID, name: 'File', originalName: 'file.pdf', mimeType: 'application/pdf', originalSize: 1, originalStorageKey: 'key', originalSha256Hash: 'hash' });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/documents/doc_111111111111111111111111/custom-properties/${customerDefinition.id}`,
        method: 'PUT',
        body: { value: 'SMB' },
      });

      expect(response.status).to.eql(404);
    });
  });

  describe('organization isolation', () => {
    test('a user cannot write values with the definitions of another organization', async () => {
      const { db, request, createDefinition } = await setupApp();

      const otherOrgDefinition = await createDefinition({ organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, name: 'Segment', type: 'text', entityType: 'customer' });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers`,
        method: 'POST',
        body: { name: 'Acme', customProperties: { [otherOrgDefinition.id]: 'SMB' } },
      });

      expect(response.status).to.eql(404);
      expect(await db.select().from(entityCustomPropertyValuesTable)).to.eql([]);
    });

    test('a user cannot update the customer of another organization, nor attach values to it', async () => {
      const { db, request, createDefinition } = await setupApp();

      const otherCustomerResponse = await request({ path: `/api/organizations/${OTHER_ORG_ID}/invoicing/customers`, method: 'POST', body: { name: 'Other' }, userId: OTHER_USER_ID });
      const { customer: otherCustomer } = await otherCustomerResponse.json() as { customer: { id: string } };
      const definition = await createDefinition({ name: 'Segment', type: 'text', entityType: 'customer' });

      const response = await request({
        path: `/api/organizations/${ORG_ID}/invoicing/customers/${otherCustomer.id}`,
        method: 'PUT',
        body: { name: 'Hijacked', customProperties: { [definition.id]: 'SMB' } },
      });

      expect(response.status).to.eql(404);
      expect(await db.select().from(entityCustomPropertyValuesTable)).to.eql([]);

      const [customer] = await db.select().from(invoicingCustomersTable).where(eq(invoicingCustomersTable.id, otherCustomer.id));
      expect(customer?.name).to.eql('Other');
    });

    test('the values of a customer are not readable from another organization', async () => {
      const { request, createDefinition, getCustomerProperties } = await setupApp();

      const definition = await createDefinition({ name: 'Segment', type: 'text', entityType: 'customer' });
      const createResponse = await request({ path: `/api/organizations/${ORG_ID}/invoicing/customers`, method: 'POST', body: { name: 'Acme', customProperties: { [definition.id]: 'SMB' } } });
      const { customer } = await createResponse.json() as { customer: { id: string } };

      // Not a member of the organization
      const { response: forbiddenResponse } = await getCustomerProperties({ customerId: customer.id, userId: OTHER_USER_ID });
      expect(forbiddenResponse.status).to.eql(403);

      // Member of its own organization, asking for an entity of another organization
      const { customProperties } = await getCustomerProperties({ customerId: customer.id, organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID });
      expect(customProperties).to.eql([]);
    });
  });
});
