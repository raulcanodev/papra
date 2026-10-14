import type { PageContext } from '../page-context/page-context.schemas';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';

const navigateToPageParams = z.object({
  path: z.string().min(1).max(300).describe('Path of the page, copied from the list of pages in the page context (or an entity page with its :placeholders replaced by real ids).'),
  reason: z.string().max(200).optional().describe('Why you take the user there, in their language'),
});

export function isPathInsideOrganization({ path, organizationId }: { path: string; organizationId: string }) {
  const prefix = `/organizations/${organizationId}/`;

  // Same origin, inside this workspace, no way to reach an external URL or climb out with dot segments
  return path.startsWith(prefix) && !path.includes('//') && !path.split('/').includes('..') && !path.includes('\\') && !path.includes(':');
}

// Moves the user's browser to another page of the app. Harmless and reversible, so it needs no approval:
// the stream carries the destination to the client, which does the navigation.
export function createNavigationTool({ organizationId, pageContext }: { organizationId: string; pageContext: PageContext | undefined }) {
  return tool({
    description: 'Take the user to another page of the app (their browser navigates). Use it when the thing they want is on a different page, or to show them where something lives. Do it when it helps them, say in one short sentence where you took them and what to do there.',
    inputSchema: zodSchema(navigateToPageParams),
    execute: async ({ path, reason }) => {
      if (!isPathInsideOrganization({ path, organizationId })) {
        return { error: 'That path is not a page of this workspace. Use a path from the page context.' };
      }

      const knownPage = pageContext?.pages.find(page => page.path === path);

      return { navigation: { path, label: knownPage?.label ?? null, reason: reason ?? null } };
    },
  });
}
