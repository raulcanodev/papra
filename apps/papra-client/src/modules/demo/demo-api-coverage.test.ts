import { describe, expect, test } from 'vitest';
import { router } from './demo-api-mock';

// Every source file of the app, as text, to find the API calls it makes
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../demo/**', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// API calls the demo deliberately does not serve, with the reason. Anything else must have a demo handler.
const EXEMPTIONS: Array<{ prefix: RegExp; reason: string }> = [
  { prefix: /^\/api\/admin\//, reason: 'back office, not reachable from the demo' },
  { prefix: /^\/api\/organizations\/[^/]+\/finances\//, reason: 'personal finances is behind a feature flag the demo user does not have' },
  { prefix: /^\/api\/organizations\/[^/]+\/ai\/chat$/, reason: 'the demo assistant streams from the browser (demoStreamChatMessage)' },
];

const METHOD_PATTERN = /method: '(GET|POST|PUT|PATCH|DELETE)'/;

// The HTTP method of the call the path belongs to: looked for inside that call only (between its `({` and `})`),
// GET when the call does not say
function findMethod({ source, index }: { source: string; index: number }) {
  const callStart = source.lastIndexOf('({', index);
  const callEnd = source.indexOf('})', index);
  const call = source.slice(callStart === -1 ? index : callStart, callEnd === -1 ? index : callEnd);

  return METHOD_PATTERN.exec(call)?.[1] ?? 'GET';
}

function extractApiCalls(source: string) {
  const calls = new Set<string>();

  for (const match of source.matchAll(/['`](\/api\/[^'`?]+)/g)) {
    // A trailing unclosed ${...} is an optional query string (`${year ? `?year=...` : ''}`), not part of the path
    const path = match[1]!.replace(/\$\{[^}]*$/, '').replace(/\$\{[^}]*\}/g, 'sample').replace(/\/+$/, '');
    calls.add(`${findMethod({ source, index: match.index })} ${path}`);
  }

  return calls;
}

describe('demo api coverage', () => {
  const clientCalls = [...new Set(Object.values(sources).flatMap(source => [...extractApiCalls(source)]))].toSorted();

  test('the app source is scanned', () => {
    expect(clientCalls.length).toBeGreaterThan(80);
  });

  test('every API call of the app (path and method) has a demo handler or an explicit exemption, so the demo never falls behind', () => {
    const missing = clientCalls.filter((call) => {
      const [method, path] = call.split(' ') as [string, string];

      if (EXEMPTIONS.some(({ prefix }) => prefix.test(path))) {
        return false;
      }

      return router.lookup(`/${method}${path}`) === null;
    });

    expect(missing, 'Add a handler in modules/demo (with realistic data), or an exemption above with its reason').to.eql([]);
  });
});
