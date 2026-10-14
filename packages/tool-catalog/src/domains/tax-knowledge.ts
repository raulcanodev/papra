import { z } from 'zod';
import { getTaxKnowledge, TAX_TOPICS } from '../knowledge/spain-tax-knowledge';
import { defineGlobalTool } from '../tool-definition';

export const taxKnowledgeTools = [
  defineGlobalTool({
    name: 'get_spanish_tax_reference',
    title: 'Spanish tax reference',
    description: 'Orientation map of Spanish taxes and invoicing: IVA, IRPF for autónomos, retenciones, impuesto de sociedades, calendar of models, invoice rules, Verifactu, Seguridad Social, deductible expenses, EU operations, record keeping. Each entry says which rules are stable, which law backs them and what MUST be verified online before stating it as current. Call it BEFORE answering any Spanish tax or invoicing question, then verify the volatile parts with a web search on the official domains.',
    risk: 'read',
    permission: null,
    input: {
      topics: z.array(z.enum(TAX_TOPICS)).optional().describe('Topics to load. Omit to load all of them.'),
    },
    run: async ({ topics }) => getTaxKnowledge({ topics }),
  }),
];
