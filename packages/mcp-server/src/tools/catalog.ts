import type { ToolDefinition, ToolRisk } from '@papra/tool-catalog';
import type { ToolRegistrar } from './types.js';
import { toolCatalog } from '@papra/tool-catalog';
import { z } from 'zod';
import { runTool } from './shared.js';

const ANNOTATIONS_BY_RISK: Record<ToolRisk, Record<string, boolean>> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

const organizationIdShape = {
  organizationId: z.string().min(1).describe('Papra organization ID. Use list_organizations when it is not known.'),
};

function getInputShape(tool: ToolDefinition) {
  return tool.scope === 'organization' ? { ...organizationIdShape, ...tool.input } : tool.input;
}

// The catalog is shared with the in-app assistant: this adapter only turns a definition into an MCP tool,
// talking to Papra through the API key client.
export const registerCatalogTools: ToolRegistrar = ({ server, client }) => {
  for (const tool of toolCatalog) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: getInputShape(tool),
      annotations: ANNOTATIONS_BY_RISK[tool.risk],
    }, async (input: Record<string, unknown>) => runTool(() => {
      if (tool.scope === 'global') {
        return tool.run(input, { api: client });
      }

      const { organizationId, ...toolInput } = input as { organizationId: string } & Record<string, unknown>;
      return tool.run(toolInput, { api: client, organizationId });
    }));
  }
};
