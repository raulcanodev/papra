import { zodSchema } from 'ai';
import { describe, expect, test } from 'vitest';
import { invoiceExtractionSchema } from '../purchases/purchases.extraction.models';
import { countUnionParameters, withReasoningEffort } from './ai-assistant.providers';

describe('ai-assistant providers', () => {
  test('complex schemas explicitly use the JSON tool without thinking', () => {
    const options = withReasoningEffort({
      selection: { provider: 'anthropic', model: 'claude-haiku-5-5', reasoningEffort: 'high' },
      options: { prompt: [], responseFormat: { type: 'json', schema: { type: 'object', properties: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`field${index}`, { type: ['string', 'null'] }])) } } },
    });
    expect(options.providerOptions?.anthropic).toMatchObject({ thinking: { type: 'disabled' }, structuredOutputMode: 'jsonTool' });
  });

  describe('countUnionParameters', () => {
    test('nullable and anyOf parameters are counted at any depth', () => {
      expect(countUnionParameters({ schema: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          kind: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          lines: { type: 'array', items: { type: 'object', properties: { amount: { type: ['number', 'null'] }, label: { type: 'string' } } } },
        },
      } })).toBe(3);
    });

    // Over 16, Anthropic refuses the schema while thinking and the invoices are read without reasoning
    test('the invoice reading schema fits the limit of Anthropic structured outputs', async () => {
      const { jsonSchema } = zodSchema(invoiceExtractionSchema);

      expect(countUnionParameters({ schema: await jsonSchema })).toBeLessThanOrEqual(16);
    });
  });
});
