import type { OrganizationToolRunContext, ToolDefinition, ToolRunContext } from '@paqui/tool-catalog';
import type { Tool } from 'ai';
import type { z } from 'zod';
import { toolCatalog } from '@paqui/tool-catalog';
import { tool, zodSchema } from 'ai';
import { z as zod } from 'zod';
import { createConfirmationResult } from './confirmation';
import { InProcessApiError } from './in-process-api';

// Tools the assistant already has natively (they also cover transactions, which the catalog does not know about).
// Left out so the model never sees two tools doing the same thing.
const NATIVELY_PROVIDED_TOOLS = new Set([
  'list_organizations',
  'list_documents',
  'get_document',
  'get_document_statistics',
  'list_tags',
  'create_tag',
  'add_tag_to_document',
  'remove_tag_from_document',
]);

export const ASSISTANT_CATALOG_TOOLS: readonly ToolDefinition[] = toolCatalog.filter(definition => !NATIVELY_PROVIDED_TOOLS.has(definition.name));

function requiresApproval(definition: ToolDefinition) {
  return definition.risk !== 'read';
}

// The schemas of the actions that need an approval, to validate what comes back from the approved card
export const CATALOG_CONFIRMABLE_TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = Object.fromEntries(
  ASSISTANT_CATALOG_TOOLS.filter(requiresApproval).map(definition => [definition.name, zod.object(definition.input)]),
);

function describeAction({ definition, args }: { definition: ToolDefinition; args: Record<string, unknown> }) {
  const details = Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');

  const summary = `${definition.title}${details === '' ? '' : ` — ${details}`}`;

  return definition.risk === 'destructive' ? `${summary} (cannot be undone)` : summary;
}

async function runDefinition({ definition, args, context }: { definition: ToolDefinition; args: unknown; context: OrganizationToolRunContext }) {
  const run = definition.run as (input: unknown, context: ToolRunContext & { organizationId: string }) => Promise<unknown>;

  return run(args, context);
}

function toErrorResult(error: unknown) {
  if (error instanceof InProcessApiError || error instanceof Error) {
    return { success: false, error: error.message };
  }

  return { success: false, error: 'Unknown error' };
}

// The same tools the MCP server exposes, as tools of the in-app assistant: reads run right away,
// writes and destructive actions become approval cards and run through `executors` once approved.
export function createCatalogAssistantTools({ context }: { context: OrganizationToolRunContext }) {
  const tools: Record<string, Tool<any, any>> = {};
  const executors: Record<string, (args: unknown) => Promise<unknown>> = {};

  for (const definition of ASSISTANT_CATALOG_TOOLS) {
    const inputSchema = zodSchema(zod.object(definition.input));

    if (requiresApproval(definition)) {
      tools[definition.name] = tool({
        description: `${definition.description} Needs the user's approval: calling it shows an approval card, it does not act by itself.`,
        inputSchema,
        execute: async args => createConfirmationResult({
          toolName: definition.name,
          description: describeAction({ definition, args: args as Record<string, unknown> }),
          args: args as Record<string, unknown>,
        }),
      });

      executors[definition.name] = async (args) => {
        try {
          const result = await runDefinition({ definition, args, context });
          return { success: true, message: `${definition.title}: done.`, result };
        } catch (error) {
          return toErrorResult(error);
        }
      };

      continue;
    }

    tools[definition.name] = tool({
      description: definition.description,
      inputSchema,
      execute: async (args) => {
        try {
          return await runDefinition({ definition, args, context });
        } catch (error) {
          // Handed back to the model so it can fix its call (a wrong id, a missing field) instead of failing the turn
          return toErrorResult(error);
        }
      },
    });
  }

  return { tools, executors };
}
