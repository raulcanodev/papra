// @vitest-environment happy-dom
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

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function extractApiPaths(source: string) {
  const paths = new Set<string>();

  for (const match of source.matchAll(/['`](\/api\/[^'`?]+)/g)) {
    // Template parameters become a sample value, the router matches them as route parameters
    // A trailing unclosed ${...} is an optional query string (`${year ? `?year=...` : ''}`), not part of the path
    paths.add(match[1]!.replace(/\$\{[^}]*$/, '').replace(/\$\{[^}]*\}/g, 'sample').replace(/\/+$/, ''));
  }

  return paths;
}

describe('demo api coverage', () => {
  const clientPaths = [...new Set(Object.values(sources).flatMap(source => [...extractApiPaths(source)]))].toSorted();

  test('the app source is scanned', () => {
    expect(clientPaths.length).toBeGreaterThan(80);
  });

  test('every API call of the app has a demo handler or an explicit exemption, so the demo never falls behind', () => {
    const missing = clientPaths.filter((path) => {
      if (EXEMPTIONS.some(({ prefix }) => prefix.test(path))) {
        return false;
      }

      return !HTTP_METHODS.some(method => router.lookup(`/${method}${path}`) !== null);
    });

    expect(missing, 'Add a handler in modules/demo (with realistic data), or an exemption above with its reason').to.eql([]);
  });
});
