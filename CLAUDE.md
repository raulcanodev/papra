# Paqui

## AI calls

Every language model call gets its model from `getAiModel({ config, db, feature })` (`apps/paqui-server/src/modules/ai-assistant/ai-assistant.providers.ts`):

- It uses the provider, model and reasoning effort chosen in the admin panel (`/admin/ai`), falling back to `AI_MODEL` / `AI_REASONING_EFFORT`, and by default Claude Haiku 5.5 (high) when the Anthropic key is set.
- It records the tokens and cost of every call in `ai_usage`, attributed to the feature, the workspace and the member (taken from the request; background jobs pass `organizationId`).
- A new AI feature adds its id to `AI_FEATURES` (`ai-usage.constants.ts`) and its label under `admin.ai.feature.*` in the client locales.
- A new model goes in `AI_MODELS` (`ai-assistant.models.ts`) with its prices from the provider pricing page.

Never import `@ai-sdk/anthropic|openai|google|xai` or pass a model id string to `generateText`/`streamText`/`generateObject` elsewhere: `ai-usage.guard.test.ts` fails.

## Changelog: Novedades de Paqui

The changelog is [`apps/paqui-client/src/modules/changelog/changelog.md`](apps/paqui-client/src/modules/changelog/changelog.md). Users see what is new in a dialog when they enter the app, once, as if Paqui told them. Any new entry reaches everyone on the next deploy.

**After a change a user would notice (a new feature, a new option, a change in how something works), add it to that file in the same commit.** Bug fixes, small tweaks, refactors and back office or internal work do not go in.

- Newest first: `## YYYY-MM-DD` with today's date (reuse the heading if it is already there), then one `- ` line per novelty. Each line is one speech bubble.
- In Spanish, in Paqui's voice: a neighbour telling you the news. Easy to understand, with some humour, one or two short sentences, at most 200 characters. What it means for the user, never how it was built. `**bold**` for the name of the thing; no images, links or other markdown.

`changelog.test.ts` fails if the file does not follow this format.

## Layout: no cards

Content sits straight on the page background. Never wrap a form, a group of fields or a section in a card (`rounded-xl border bg-card p-4`, `<Card>`): it doubles the padding (the page already has its own, which costs the most on phones) and looks generated.

- Group with a heading and spacing, and separate sections with a hairline: `SettingsSections` / `SettingsSection` (`ui/components/settings-section.tsx`) in settings pages, `PageSections` / `PageSection` (`ui/components/page-section.tsx`) in workspace pages and editors.
- Repeated things (lines of an invoice or a delivery note, a list of contacts, menu entries) are rows separated by `divide-y`, not one box per item.
- A border is only for: tables (`CatalogTable`), previews of a document, an image or a PDF, the calendar grid, dashed empty states and drop zones, tinted callouts (a warning, an inbox, the reading of a document), choice tiles in a dialog, dashboard stat tiles, floating bars.
- Never put a bordered box inside another one.
