import type { AiModelDefinition } from '../ai-assistant/ai-assistant.models';

export type AiCallTokens = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

// Cost of one call in millionths of a dollar: prices are dollars per million tokens, so tokens × price is micro-dollars.
// A request whose prompt is above the long prompt threshold is billed entirely at those prices.
export function getAiCallCostUsdMicros({ model, tokens }: { model: AiModelDefinition | undefined; tokens: AiCallTokens }) {
  if (!model) {
    return null;
  }

  const promptTokens = tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
  const { longPrompt, ...basePrices } = model.prices;
  const prices = longPrompt && promptTokens > longPrompt.aboveTokens ? longPrompt : basePrices;

  return Math.round(
    tokens.inputTokens * prices.input
    + tokens.cacheReadTokens * prices.cacheRead
    + tokens.cacheWriteTokens * (prices.cacheWrite ?? prices.input)
    + tokens.outputTokens * prices.output,
  );
}
