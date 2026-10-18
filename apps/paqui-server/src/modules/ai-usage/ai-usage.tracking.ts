import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';

export type TrackedModelUsage = {
  provider: string;
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
  status: 'success' | 'error';
};

type ResolvedModel = {
  provider: string;
  modelId: string;
  model: LanguageModelV3;
  // Options added to every call (the reasoning effort)
  transformOptions?: (options: LanguageModelV3CallOptions) => LanguageModelV3CallOptions;
};

export function getUsageTokens(usage: LanguageModelV3Usage | undefined) {
  const cacheReadTokens = usage?.inputTokens.cacheRead ?? 0;
  const cacheWriteTokens = usage?.inputTokens.cacheWrite ?? 0;
  const inputTokens = usage?.inputTokens.noCache ?? Math.max(0, (usage?.inputTokens.total ?? 0) - cacheReadTokens - cacheWriteTokens);

  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens: usage?.outputTokens.total ?? 0,
    reasoningTokens: usage?.outputTokens.reasoning ?? 0,
  };
}

// A language model that picks the real one when first called (so a model change from the admin panel applies to the
// next call) and reports the usage of every call, generated or streamed, without delaying it
export function createUsageTrackedModel({ resolve, onUsage }: { resolve: () => Promise<ResolvedModel>; onUsage: (usage: TrackedModelUsage) => void }): LanguageModelV3 {
  let resolved: Promise<ResolvedModel> | undefined;
  const getResolved = async () => (resolved ??= resolve());

  const report = ({ target, usage, startedAt, status }: { target: ResolvedModel; usage: LanguageModelV3Usage | undefined; startedAt: number; status: 'success' | 'error' }) => {
    onUsage({ provider: target.provider, model: target.modelId, ...getUsageTokens(usage), durationMs: Date.now() - startedAt, status });
  };

  return {
    specificationVersion: 'v3',
    provider: 'paqui',
    modelId: 'configured',
    get supportedUrls() {
      return getResolved().then(({ model }) => model.supportedUrls);
    },

    doGenerate: async (options) => {
      const target = await getResolved();
      const startedAt = Date.now();
      try {
        const result = await target.model.doGenerate(target.transformOptions?.(options) ?? options);
        report({ target, usage: result.usage, startedAt, status: 'success' });
        return result;
      } catch (error) {
        report({ target, usage: undefined, startedAt, status: 'error' });
        throw error;
      }
    },

    doStream: async (options) => {
      const target = await getResolved();
      const startedAt = Date.now();
      let result: Awaited<ReturnType<LanguageModelV3['doStream']>>;
      try {
        result = await target.model.doStream(target.transformOptions?.(options) ?? options);
      } catch (error) {
        report({ target, usage: undefined, startedAt, status: 'error' });
        throw error;
      }

      // The usage comes with the last part of the stream: reported as it passes, the parts flow unchanged
      let reported = false;
      const stream = result.stream.pipeThrough(new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform: (part, controller) => {
          if (!reported && (part.type === 'finish' || part.type === 'error')) {
            reported = true;
            report({ target, usage: part.type === 'finish' ? part.usage : undefined, startedAt, status: part.type === 'finish' ? 'success' : 'error' });
          }
          controller.enqueue(part);
        },
      }));

      return { ...result, stream };
    },
  };
}
