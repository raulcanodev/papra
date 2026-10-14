import type { z } from 'zod';
import type { ApiKeyPermission } from './permissions';

// read: nothing changes. write: creates or edits data. destructive: removes data or sends something outside.
// Clients decide what to do with it: the MCP server turns it into annotations, the assistant asks for approval.
export type ToolRisk = 'read' | 'write' | 'destructive';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// The only door a tool has to the application: the same Papra REST API whatever the transport
// (HTTP with an API key for the MCP server, in-process with the user session for the assistant)
export type ApiRequester = {
  request: <T = unknown>(method: HttpMethod, path: string, body?: unknown) => Promise<T>;
};

export type ToolRunContext = {
  api: ApiRequester;
};

export type OrganizationToolRunContext = ToolRunContext & {
  organizationId: string;
};

type ToolBase<Shape extends z.ZodRawShape> = {
  /** snake_case, stable: clients and prompts reference it */
  name: string;
  title: string;
  /** Written for a language model: when to use it, what it needs, what it returns */
  description: string;
  risk: ToolRisk;
  /** API key permission required, null when the tool does not call the API */
  permission: ApiKeyPermission | null;
  input: Shape;
};

export type OrganizationToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> = ToolBase<Shape> & {
  /** The organization is supplied by the transport (an argument for MCP, the current workspace for the assistant) */
  scope: 'organization';
  run: (input: z.infer<z.ZodObject<Shape>>, context: OrganizationToolRunContext) => Promise<unknown>;
};

export type GlobalToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> = ToolBase<Shape> & {
  scope: 'global';
  run: (input: z.infer<z.ZodObject<Shape>>, context: ToolRunContext) => Promise<unknown>;
};

// Heterogeneous lists lose the per-tool input type on purpose: adapters validate the input with the tool own schema
// before calling run, so the erased signature accepts it as it is
export type ToolDefinition
  = | (ToolBase<z.ZodRawShape> & { scope: 'organization'; run: (input: any, context: OrganizationToolRunContext) => Promise<unknown> })
    | (ToolBase<z.ZodRawShape> & { scope: 'global'; run: (input: any, context: ToolRunContext) => Promise<unknown> });

export function defineOrganizationTool<Shape extends z.ZodRawShape = Record<string, never>>(
  definition: Omit<OrganizationToolDefinition<Shape>, 'scope' | 'input'> & { input?: Shape },
): OrganizationToolDefinition<Shape> {
  return { ...definition, input: definition.input ?? ({} as Shape), scope: 'organization' };
}

export function defineGlobalTool<Shape extends z.ZodRawShape = Record<string, never>>(
  definition: Omit<GlobalToolDefinition<Shape>, 'scope' | 'input'> & { input?: Shape },
): GlobalToolDefinition<Shape> {
  return { ...definition, input: definition.input ?? ({} as Shape), scope: 'global' };
}
