import type { Tool } from 'ai';
import type { z } from 'zod';
import type { ServerInstance } from '../../app/server.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { PageContext } from '../page-context/page-context.schemas';
import { createAssistantTools, CONFIRMABLE_TOOL_SCHEMAS as LEGACY_CONFIRMABLE_TOOL_SCHEMAS } from '../ai-assistant.tools';
import { createAttachmentsTools } from '../attachments/attachments.tools';
import { CATALOG_CONFIRMABLE_TOOL_SCHEMAS, createCatalogAssistantTools } from './catalog-tools';
import { createInProcessApiRequester } from './in-process-api';
import { createNavigationTool } from './navigation.tool';
import { createSpanishTaxSourcesTool } from './web-search';

// Every action that needs an approval card, whichever module defines it
export const CONFIRMABLE_TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  ...LEGACY_CONFIRMABLE_TOOL_SCHEMAS,
  ...CATALOG_CONFIRMABLE_TOOL_SCHEMAS,
};

type LegacyToolsParams = Parameters<typeof createAssistantTools>[0];

// The tools of one conversation: the finance and document tools of the assistant, the shared catalog
// (same definitions as the MCP server), reading any file and keeping what was understood of it,
// moving the user around the app, and the official Spanish sources search.
export function createAssistantToolset({ app, requestHeaders, env, pageContext, config, documentsStorageService, ...legacyParams }: LegacyToolsParams & {
  app: ServerInstance;
  requestHeaders: Headers;
  env: unknown;
  pageContext: PageContext | undefined;
  config: Config;
  documentsStorageService: DocumentStorageService;
}) {
  // The legacy tools already leave out what the capabilities forbid, for tools and executors alike
  const legacy = createAssistantTools(legacyParams);

  const catalog = createCatalogAssistantTools({
    context: {
      organizationId: legacyParams.organizationId,
      api: createInProcessApiRequester({ app, requestHeaders, env }),
    },
  });

  const tools: Record<string, Tool<any, any>> = {
    ...legacy.tools,
    ...catalog.tools,
    ...createAttachmentsTools({ db: legacyParams.db, organizationId: legacyParams.organizationId, config, documentsStorageService }),
    navigateToPage: createNavigationTool({ organizationId: legacyParams.organizationId, pageContext }),
    ...(legacyParams.tavilyApiKey === undefined || legacyParams.tavilyApiKey === ''
      ? {}
      : { searchSpanishTaxSources: createSpanishTaxSourcesTool({ tavilyApiKey: legacyParams.tavilyApiKey }) }),
  };

  return {
    tools,
    executors: { ...legacy.executors, ...catalog.executors } as Record<string, (args: any) => Promise<any>>,
  };
}
