# Paqui

## AI calls

Every language model call gets its model from `getAiModel({ config, db, feature })` (`apps/paqui-server/src/modules/ai-assistant/ai-assistant.providers.ts`):

- It uses the provider, model and reasoning effort chosen in the admin panel (`/admin/ai`), falling back to `AI_MODEL` / `AI_REASONING_EFFORT`, and by default Claude Haiku 5.5 (high) when the Anthropic key is set.
- It records the tokens and cost of every call in `ai_usage`, attributed to the feature, the workspace and the member (taken from the request; background jobs pass `organizationId`).
- A new AI feature adds its id to `AI_FEATURES` (`ai-usage.constants.ts`) and its label under `admin.ai.feature.*` in the client locales.
- A new model goes in `AI_MODELS` (`ai-assistant.models.ts`) with its prices from the provider pricing page.

Never import `@ai-sdk/anthropic|openai|google|xai` or pass a model id string to `generateText`/`streamText`/`generateObject` elsewhere: `ai-usage.guard.test.ts` fails.
