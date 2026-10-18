import { describe, expect, test } from 'vitest';
import { findAiModel } from '../ai-assistant/ai-assistant.models';
import { getAiCallCostUsdMicros } from './ai-usage.prices';

describe('ai usage prices', () => {
  test('a call costs its tokens at the model prices, in millionths of a dollar', () => {
    // Haiku 5.5: $0.10 input, $0.01 cache read, $0.125 cache write, $0.50 output per million tokens
    const cost = getAiCallCostUsdMicros({ model: findAiModel({ modelId: 'claude-haiku-5-5' }), tokens: { inputTokens: 10_000, cacheReadTokens: 20_000, cacheWriteTokens: 4_000, outputTokens: 2_000 } });

    expect(cost).to.eql(1_000 + 200 + 500 + 1_000);
  });

  test('a prompt above the long prompt threshold is billed entirely at the long prompt prices', () => {
    const cost = getAiCallCostUsdMicros({ model: findAiModel({ modelId: 'claude-haiku-5-5' }), tokens: { inputTokens: 90_000, cacheReadTokens: 20_000, cacheWriteTokens: 0, outputTokens: 1_000 } });

    expect(cost).to.eql(90_000 * 0.5 + 20_000 * 0.05 + 1_000 * 2.5);
  });

  test('without a cache write price the cache writes cost the input price, and an unknown model has no cost', () => {
    expect(getAiCallCostUsdMicros({ model: findAiModel({ modelId: 'grok-4-1-fast-non-reasoning' }), tokens: { inputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 1_000, outputTokens: 0 } })).to.eql(400);
    expect(getAiCallCostUsdMicros({ model: undefined, tokens: { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 } })).to.eql(null);
  });
});
