import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

// Keeps every language model call measured: models only come from getAiModel (ai-assistant.providers.ts),
// which records the usage. A feature creating its own model would call the provider unmeasured and unpaid for.
const SOURCE_ROOT = join(__dirname, '..', '..');
const PROVIDERS_FILE = 'modules/ai-assistant/ai-assistant.providers.ts';

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

const sources = listSourceFiles(SOURCE_ROOT).map(path => ({ file: relative(SOURCE_ROOT, path), content: readFileSync(path, 'utf8') }));

describe('ai usage guard', () => {
  test('the provider SDKs are only used in the providers file, where getAiModel wraps every model with the usage tracking', () => {
    const offenders = sources
      .filter(({ file, content }) => file !== PROVIDERS_FILE && /from '@ai-sdk\/(?!provider')[\w-]+'/.test(content))
      .map(({ file }) => file);

    expect(offenders, 'Get the model with getAiModel({ config, db, feature }) instead of creating it').to.eql([]);
  });

  test('no AI call names its model as a string, which would go through the AI SDK global provider unmeasured', () => {
    const offenders = sources
      .filter(({ content }) => /from 'ai'/.test(content) && (/\bmodel:\s*['"`]/.test(content) || /\bgateway\b/.test(content)))
      .map(({ file }) => file);

    expect(offenders, 'Get the model with getAiModel({ config, db, feature }) instead').to.eql([]);
  });

  test('every file calling a model gets it from getAiModel or receives it from its caller', () => {
    const offenders = sources
      .filter(({ file, content }) => file !== PROVIDERS_FILE && /\b(?:generateText|streamText|generateObject|streamObject)\(/.test(content) && !/getAiModel/.test(content))
      .map(({ file }) => file);

    expect(offenders, 'Get the model with getAiModel({ config, db, feature })').to.eql([]);
  });
});
