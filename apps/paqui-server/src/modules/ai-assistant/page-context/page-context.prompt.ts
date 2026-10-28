import type { PageContext, PageSnapshot } from './page-context.schemas';
import { findPageGuide } from './page-context.guide';

const MAX_PROMPT_CHARS = 9_000;

function isFilled(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function renderSnapshot({ snapshot }: { snapshot: PageSnapshot }) {
  const lines: string[] = [];

  if (snapshot.headings.length > 0) {
    lines.push(`Headings: ${snapshot.headings.join(' | ')}`);
  }

  if (snapshot.tabs.length > 0) {
    lines.push(`Tabs: ${snapshot.tabs.map(tab => tab.active ? `[${tab.label}] (selected)` : tab.label).join(' | ')}`);
  }

  for (const table of snapshot.tables) {
    lines.push(`Table${isFilled(table.title) ? ` "${table.title}"` : ''} (${table.totalRows} rows${table.totalRows > table.rows.length ? `, first ${table.rows.length} shown` : ''}): ${table.columns.join(' | ')}`);
    lines.push(...table.rows.map(row => `  - ${row.join(' | ')}`));
  }

  if (snapshot.controls.length > 0) {
    lines.push('Controls on screen:');
    lines.push(...snapshot.controls.map((control) => {
      const state = [control.disabled === true && 'disabled', control.checked !== undefined && (control.checked ? 'on' : 'off'), control.value !== undefined && control.value !== '' && `value "${control.value}"`].filter(Boolean).join(', ');
      return `  - ${control.kind}: ${control.label}${state === '' ? '' : ` (${state})`}`;
    }));
  }

  if (snapshot.text !== undefined && snapshot.text !== '') {
    lines.push(`Other visible text: ${snapshot.text}`);
  }

  return lines.join('\n');
}

// The page the user is on, as the model needs to reason about it: where they are, what they see, where else they can go.
// No rule here decides what the user wants: this is context, the model picks between answering, pointing, navigating or doing.
export function buildPageContextPrompt({ pageContext, organizationId }: { pageContext: PageContext | undefined; organizationId: string }) {
  if (pageContext === undefined) {
    return '';
  }

  const organizationPrefix = `/organizations/${organizationId}/`;
  const relativePath = pageContext.path.startsWith(organizationPrefix) ? pageContext.path.slice(organizationPrefix.length) : pageContext.path;
  const guide = findPageGuide({ relativePath });
  const currentPage = pageContext.pages.find(page => page.path === pageContext.path);

  const sections = [
    '## WHERE THE USER IS RIGHT NOW',
    'The user is looking at this screen while they write to you. Their message is very likely about it, but it can also be about anything else.',
    `- URL: ${pageContext.path}${pageContext.search ?? ''}`,
    ...(isFilled(pageContext.title) ? [`- Window title: ${pageContext.title}`] : []),
    ...(currentPage ? [`- Menu entry: ${[currentPage.section, currentPage.label].filter(Boolean).join(' › ')}`] : []),
    ...(guide ? [`- What this page is for: ${guide.description}`] : []),
    ...(Object.keys(pageContext.params).length > 0 ? [`- Ids in the URL (the entity on screen): ${Object.entries(pageContext.params).filter(([name]) => name !== 'organizationId').map(([name, value]) => `${name}=${value}`).join(', ') || 'none'}`] : []),
  ];

  if (pageContext.snapshot !== undefined) {
    sections.push('', '### What is on screen (captured in the browser just now)', renderSnapshot({ snapshot: pageContext.snapshot }));
  }

  if (pageContext.pages.length > 0) {
    sections.push(
      '',
      '### Every page of the app this user can open',
      ...pageContext.pages.map(page => `- ${isFilled(page.section) ? `${page.section} › ` : ''}${page.label}: ${page.path}${page.path === pageContext.path ? ' (current)' : ''}`),
    );
  }

  if (pageContext.entityPages.length > 0) {
    sections.push('', '### Pages that open one record (replace the :placeholders with real ids)', ...pageContext.entityPages.map(page => `- ${page.label}: ${page.path}`));
  }

  sections.push(
    '',
    '### How to use this context',
    '- Judge what the user needs from their words and this screen together. You are not following a script.',
    '- You can: answer using what you see; tell them what they are looking at; show them where to click, naming the control exactly as it is labelled above; take them to another page with navigateToPage; or do the work yourself with your tools. Choose what is most useful and least effort for them, and when two are reasonable, say what you would do and offer the other.',
    '- When you point at a control, use its on-screen label. Never invent buttons or pages that are not listed above.',
    '- The screen shows the first rows only: when the answer needs the real data, read it with a tool instead of trusting what is visible.',
    '- If the user asks about "this", "here" or "esta factura", the ids in the URL tell you which record, read it with a tool.',
  );

  const prompt = sections.join('\n');
  const pagePrompt = prompt.length <= MAX_PROMPT_CHARS ? prompt : `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[context truncated]`;

  return pageContext.screen === undefined ? pagePrompt : `${pagePrompt}\n\n${renderScreen({ screen: pageContext.screen })}`;
}

// Its own room, after the page: these are the exact values, the snapshot above only shows labels and the first rows
function renderScreen({ screen }: { screen: NonNullable<PageContext['screen']> }) {
  return [
    `### ${screen.subject}: the data on screen right now`,
    'Exact values as the user sees them, unsaved changes included. Money in cents, rates in basis points (2100 = 21 %), quantities in thousandths.',
    ...(screen.documentId === undefined ? [] : [`The document next to the form (documentId ${screen.documentId}) comes with the user's latest message: look at it yourself.`]),
    JSON.stringify(screen.data),
  ].join('\n');
}
