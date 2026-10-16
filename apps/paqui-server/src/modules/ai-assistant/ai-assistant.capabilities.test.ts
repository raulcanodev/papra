import type { DocumentSearchServices } from '../documents/document-search/document-search.types';
import type { AssistantCapabilities } from './ai-assistant.capabilities';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { PERSONAL_FINANCES_TOOL_NAMES } from './ai-assistant.capabilities';
import { buildSystemPrompt } from './ai-assistant.prompt';
import { createAiAssistantRepository } from './ai-assistant.repository';
import { createAssistantTools } from './ai-assistant.tools';

async function createTools({ capabilities }: { capabilities: AssistantCapabilities }) {
  const { db } = await createInMemoryDatabase();

  return createAssistantTools({
    db,
    organizationId: 'org_1',
    userId: 'usr_1',
    authSecret: 'secret',
    documentSearchServices: {} as DocumentSearchServices,
    tavilyApiKey: 'tavily',
    aiAssistantRepository: createAiAssistantRepository({ db }),
    capabilities,
  });
}

function buildPrompt({ capabilities }: { capabilities: AssistantCapabilities }) {
  return buildSystemPrompt({ now: new Date('2026-10-14T10:00:00Z'), providerLabel: 'Anthropic', modelLabel: 'Claude', profile: {}, pageContext: undefined, organizationId: 'org_1', capabilities });
}

// Words that would reveal the personal finances module to someone who does not have it
const FINANCES_VOCABULARY = /transac|classification rule|bank|budget|spending|owner_transfer/i;

describe('assistant capabilities', () => {
  describe('without the personal finances feature flag', () => {
    test('no personal finances tool exists, neither for the model nor behind an approval card', async () => {
      const { tools, executors } = await createTools({ capabilities: { personalFinances: false } });

      for (const toolName of PERSONAL_FINANCES_TOOL_NAMES) {
        expect(tools).not.to.have.property(toolName);
        expect(executors).not.to.have.property(toolName);
      }
    });

    test('no remaining tool talks about transactions, banks or budgets', async () => {
      const { tools } = await createTools({ capabilities: { personalFinances: false } });

      for (const [toolName, tool] of Object.entries(tools)) {
        const schema = JSON.stringify((tool.inputSchema as { jsonSchema?: unknown }).jsonSchema ?? {});

        expect(`${tool.description} ${schema}`, toolName).not.to.match(FINANCES_VOCABULARY);
      }
    });

    test('the system prompt never mentions them', () => {
      expect(buildPrompt({ capabilities: { personalFinances: false } })).not.to.match(FINANCES_VOCABULARY);
    });
  });

  describe('with the personal finances feature flag', () => {
    test('every personal finances tool is available', async () => {
      const { tools } = await createTools({ capabilities: { personalFinances: true } });

      for (const toolName of PERSONAL_FINANCES_TOOL_NAMES) {
        expect(tools, toolName).to.have.property(toolName);
      }
    });

    test('the system prompt explains them', () => {
      const prompt = buildPrompt({ capabilities: { personalFinances: true } });

      expect(prompt).to.include('PERSONAL FINANCES');
      expect(prompt).to.include('analyzeUnclassifiedTransactions');
    });
  });

  test('the shared catalog tools are there either way', async () => {
    for (const personalFinances of [true, false]) {
      expect(buildPrompt({ capabilities: { personalFinances } })).to.include('create_invoice_draft');
    }
  });
});
