/* eslint-disable style/max-statements-per-line */
import type { Database } from '../app/database/database.types';
import type { Context, RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { registerPricingImportRoutes } from './import/pricing-import.routes';
import { buildPriceListCsv } from './pricing.export';
import { createPricingRepository } from './pricing.repository';
import { contactPriceListSchema, duplicatePriceListSchema, priceListContactsSchema, priceListItemsSchema, priceListSchema, productCostsSchema, shippingRateSchema } from './pricing.schemas';

const organizationParams = z.object({ organizationId: organizationIdSchema });
const resourceParams = z.object({ organizationId: organizationIdSchema, resourceId: z.string().trim().min(1).max(64) });
const basePath = '/api/organizations/:organizationId/pricing';

export function registerPricingRoutes(context: RouteDefinitionContext) {
  setupCostRoutes(context);
  setupShippingRateRoutes(context);
  setupPriceListRoutes(context);
  setupContactPriceRoutes(context);
  registerPricingImportRoutes(context);
}

function setupCostRoutes({ app, db }: RouteDefinitionContext) {
  app.get(`${basePath}/cost-concepts`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).listCostConcepts({ organizationId }));
  });

  // The cost of every product that has a breakdown, for the catalog tables
  app.get(`${basePath}/product-costs`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).getProductCostTotals({ organizationId }));
  });

  app.get(`${basePath}/products/:resourceId/costs`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: productId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).getProductCosts({ organizationId, productId }));
  });

  app.put(`${basePath}/products/:resourceId/costs`, requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(productCostsSchema), async (context) => {
    const { organizationId, resourceId: productId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).saveProductCosts({ organizationId, productId, costs: context.req.valid('json') }));
  });
}

function setupShippingRateRoutes({ app, db }: RouteDefinitionContext) {
  app.get(`${basePath}/shipping-rates`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).listShippingRates({ organizationId }));
  });

  app.post(`${basePath}/shipping-rates`, requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(organizationParams), legacyValidateJsonBody(shippingRateSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).createShippingRate({ organizationId, shippingRate: context.req.valid('json') }), 201);
  });

  app.put(`${basePath}/shipping-rates/:resourceId`, requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(shippingRateSchema), async (context) => {
    const { organizationId, resourceId: shippingRateId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).updateShippingRate({ organizationId, shippingRateId, shippingRate: context.req.valid('json') }));
  });

  app.delete(`${basePath}/shipping-rates/:resourceId`, requireAuthentication({ apiKeyPermissions: ['products:delete'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: shippingRateId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    await createPricingRepository({ db }).archiveShippingRate({ organizationId, shippingRateId });
    return context.body(null, 204);
  });
}

function setupPriceListRoutes({ app, db }: RouteDefinitionContext) {
  app.get(`${basePath}/price-lists`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).listPriceLists({ organizationId }));
  });

  app.post(`${basePath}/price-lists`, requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(organizationParams), legacyValidateJsonBody(priceListSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).createPriceList({ organizationId, priceList: context.req.valid('json') }), 201);
  });

  app.get(`${basePath}/price-lists/:resourceId`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).getPriceList({ organizationId, priceListId }));
  });

  app.put(`${basePath}/price-lists/:resourceId`, requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(priceListSchema), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).updatePriceList({ organizationId, priceListId, priceList: context.req.valid('json') }));
  });

  app.delete(`${basePath}/price-lists/:resourceId`, requireAuthentication({ apiKeyPermissions: ['products:delete'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    await createPricingRepository({ db }).archivePriceList({ organizationId, priceListId });
    return context.body(null, 204);
  });

  app.post(`${basePath}/price-lists/:resourceId/duplicate`, requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(duplicatePriceListSchema), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).duplicatePriceList({ organizationId, priceListId, name: context.req.valid('json').name }), 201);
  });

  app.put(`${basePath}/price-lists/:resourceId/items`, requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(priceListItemsSchema), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).savePriceListItems({ organizationId, priceListId, items: context.req.valid('json').items }));
  });

  app.put(`${basePath}/price-lists/:resourceId/contacts`, requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(priceListContactsSchema), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).setPriceListContacts({ organizationId, priceListId, contactIds: context.req.valid('json').contactIds }));
  });

  // The document sent to a contact: products and prices, never costs nor margins
  app.get(`${basePath}/price-lists/:resourceId/export.csv`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(resourceParams), legacyValidateQuery(z.object({ lang: z.enum(['es', 'en']).default('es') })), async (context) => {
    const { organizationId, resourceId: priceListId } = context.req.valid('param'); const { lang } = context.req.valid('query'); await authorizeMember({ context, db, organizationId });
    const { priceList } = await createPricingRepository({ db }).getPublicPriceList({ organizationId, priceListId });
    return context.body(buildPriceListCsv({ priceList, lang }), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${priceList.name.replace(/[^\w.-]+/g, '-')}.csv"`,
      'Cache-Control': 'private, no-store',
    });
  });
}

function setupContactPriceRoutes({ app, db }: RouteDefinitionContext) {
  app.get(`${basePath}/contacts/:resourceId/prices`, requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: contactId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).getContactPrices({ organizationId, contactId }));
  });

  app.put(`${basePath}/contacts/:resourceId/price-list`, requireAuthentication({ apiKeyPermissions: ['contacts:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(contactPriceListSchema), async (context) => {
    const { organizationId, resourceId: contactId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createPricingRepository({ db }).setContactPriceList({ organizationId, contactId, priceListId: context.req.valid('json').priceListId }));
  });
}

async function authorizeMember({ context, db, organizationId }: { context: Context; db: Database; organizationId: string }) {
  const { userId } = getUser({ context });
  await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });
}
