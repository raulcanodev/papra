import type { TrackedModelUsage } from './ai-usage.tracking';
import { generateText, streamText } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { describe, expect, test } from 'vitest';
import { createUsageTrackedModel } from './ai-usage.tracking';

const usage = { inputTokens: { total: 1_200, noCache: 1_000, cacheRead: 150, cacheWrite: 50 }, outputTokens: { total: 300, text: 220, reasoning: 80 } };

function setup(model: MockLanguageModelV3) {
  const reports: TrackedModelUsage[] = [];
  const tracked = createUsageTrackedModel({
    resolve: async () => ({ provider: 'anthropic', modelId: 'claude-haiku-5-5', model, transformOptions: options => ({ ...options, providerOptions: { anthropic: { effort: 'high' } } }) }),
    onUsage: report => reports.push(report),
  });
  return { tracked, reports };
}

describe('usage tracked model', () => {
  test('a generated call reports its tokens and receives the options of the selection', async () => {
    const model = new MockLanguageModelV3({ doGenerate: { content: [{ type: 'text', text: 'Hola' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } });
    const { tracked, reports } = setup(model);

    const { text } = await generateText({ model: tracked, prompt: 'Hi' });

    expect(text).to.eql('Hola');
    expect(model.doGenerateCalls[0]?.providerOptions).to.eql({ anthropic: { effort: 'high' } });
    expect(reports.map(({ durationMs: _, ...report }) => report)).to.eql([{ provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1_000, cacheReadTokens: 150, cacheWriteTokens: 50, outputTokens: 300, reasoningTokens: 80, status: 'success' }]);
  });

  test('a streamed call reports its usage once the stream finishes, with the text untouched', async () => {
    const model = new MockLanguageModelV3({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Buenos ' },
            { type: 'text-delta', id: '1', delta: 'días' },
            { type: 'text-end', id: '1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
          ],
        }),
      },
    });
    const { tracked, reports } = setup(model);

    const result = streamText({ model: tracked, prompt: 'Hi' });

    expect(await result.text).to.eql('Buenos días');
    expect(reports.map(report => [report.status, report.outputTokens])).to.eql([['success', 300]]);
  });

  test('a failing call is reported as an error without tokens and the error reaches the caller', async () => {
    const model = new MockLanguageModelV3({ doGenerate: async () => {
      throw new Error('Provider down');
    } });
    const { tracked, reports } = setup(model);

    await expect(generateText({ model: tracked, prompt: 'Hi', maxRetries: 0 })).rejects.toThrow('Provider down');
    expect(reports.map(report => [report.status, report.inputTokens])).to.eql([['error', 0]]);
  });
});
