import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PaquiApiError } from '../api.js';

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: normalizeStructuredContent(data),
  };
}

export async function runTool(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(await operation());
  }
  catch (error) {
    const message = error instanceof PaquiApiError
      ? `Paqui API error (${error.status}): ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Unknown Paqui MCP error';

    return {
      isError: true,
      content: [{ type: 'text', text: message }],
    };
  }
}

export function apiPathSegment(value: string): string {
  return encodeURIComponent(value);
}

function normalizeStructuredContent(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return { result: data };
}
