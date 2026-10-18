import { createErrorFactory } from '../shared/errors/errors';

export const createPriceListNotFoundError = createErrorFactory({
  code: 'pricing.price_list_not_found',
  message: 'Price list not found',
  statusCode: 404,
});

export const createShippingRateNotFoundError = createErrorFactory({
  code: 'pricing.shipping_rate_not_found',
  message: 'Shipping rate not found',
  statusCode: 404,
});

export const createPricingProductNotFoundError = createErrorFactory({
  code: 'pricing.product_not_found',
  message: 'Product not found',
  statusCode: 404,
});
