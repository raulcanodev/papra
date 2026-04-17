export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'google';

export type AiModelDefinition = {
  id: string;
  provider: AiProvider;
  label: string;
};

export const AI_MODELS: AiModelDefinition[] = [
  // xAI (Grok)
  { id: 'grok-4-1-fast-non-reasoning', provider: 'xai', label: 'Grok 4.1 Fast' },

  // OpenAI
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o Mini' },
  { id: 'gpt-4.1', provider: 'openai', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', provider: 'openai', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1-nano', provider: 'openai', label: 'GPT-4.1 Nano' },
  { id: 'gpt-4.5-preview', provider: 'openai', label: 'GPT-4.5 Preview' },
  { id: 'o3', provider: 'openai', label: 'o3' },
  { id: 'o3-mini', provider: 'openai', label: 'o3-mini' },
  { id: 'o4-mini', provider: 'openai', label: 'o4-mini' },

  // Anthropic
  { id: 'claude-sonnet-4-20250514', provider: 'anthropic', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', provider: 'anthropic', label: 'Claude Opus 4' },
  { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', provider: 'anthropic', label: 'Claude 3.5 Haiku' },

  // Google
  { id: 'gemini-2.5-pro-preview-05-06', provider: 'google', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-preview-05-20', provider: 'google', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', provider: 'google', label: 'Gemini 2.0 Flash' },
];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  xai: 'grok-4-1-fast-non-reasoning',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash-preview-05-20',
};

export const PROVIDER_PRIORITY: AiProvider[] = ['xai', 'google', 'openai', 'anthropic'];
