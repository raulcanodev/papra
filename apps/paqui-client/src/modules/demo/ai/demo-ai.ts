import type { ChatMessage } from '../../ai-assistant/ai-assistant.services';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { storage } from '../demo.storage';
import { getValues } from '../demo.storage.models';
import { listDemoInvoices } from '../invoicing/demo-invoicing';

// A scripted assistant: no model, no network. Answers are computed from the invoices stored in the browser.

type StoredSession = { id: string; organizationId: string; title: string; model: string | null; createdAt: string; updatedAt: string };
type StoredMessage = { id: string; sessionId: string; role: string; content: string; metadata?: unknown; createdAt: string };

const sessionStorage_ = prefixStorage<StoredSession>(storage, 'ai:sessions');
const messageStorage = prefixStorage<StoredMessage>(storage, 'ai:messages');
const profileStorage = prefixStorage<string>(storage, 'ai:profile');

export const DEMO_AI_MODEL = 'demo';

type Language = 'es' | 'en';

function detectLanguage(text: string): Language {
  return /[¿¡áéíóúñ]|\b(?:factura|facturas|cliente|clientes|cuánto|cuanto|cuál|cuales|qué|que tengo|pendiente|pendientes|cobrar|hola|ayuda|crea|crear)\b/i.test(text) ? 'es' : 'en';
}

const money = (minor: number, locale: Language) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(minor / 100);
const day = (value: string, locale: Language) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));

// The demo has no model to read files: it says what the real assistant does with them
function buildAttachmentsReply({ question, names }: { question: string; names: string[] }) {
  const list = names.map(name => `**${name}**`).join(', ');

  return detectLanguage(question || 'hola') === 'es'
    ? `He recibido ${list}. En tu cuenta los leería sin plantilla: facturas, tickets y albaranes los registro como facturas recibidas (y creo el proveedor si no existe), un Excel de productos o clientes lo paso a tu catálogo o tus contactos, y cualquier otra cosa la guardo interpretada para consultarla después. En esta demo pública no hay IA conectada, así que no puedo leer el contenido.`
    : `I received ${list}. In your account I would read them without any template: invoices, tickets and delivery notes become received invoices (creating the supplier if needed), a spreadsheet of products or customers goes to your catalog or contacts, and anything else is kept interpreted to answer from later. This public demo has no AI connected, so I cannot read their content.`;
}

// The real assistant saves what the user tells about themselves to the AI memory (Settings). Without a model,
// the demo only picks up the common phrasings of a name, a business, a city and a team size.
function extractProfileFacts(text: string): Record<string, string> {
  const es = detectLanguage(text) === 'es';
  const facts: Record<string, string> = {};
  const capitalized = '([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)';

  const name = text.match(new RegExp(es ? `\\b(?:[Mm]e llamo|[Ss]oy) ${capitalized}` : `\\b(?:[Mm]y name is|I'm|I am) ${capitalized}`));
  if (name) {
    facts[es ? 'Nombre' : 'Name'] = name[1]!;
  }

  const business = text.match(es
    ? /\b(?:[Tt]engo|[Ll]levo) una? ([a-záéíóúñ ]{3,40}?)(?: en ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+))?(?= con |[,.;!?]|$)/
    : /\bI (?:run|own|have) an? ([a-z ]{3,40}?)(?: in ([A-Z][a-z]+))?(?= with |[,.;!?]|$)/);
  // "tengo una factura pendiente" is a question about the data, not a business
  if (business && !/factur|client|pedido|duda|pregunta|problema|error|invoice|customer|order|question/i.test(business[1]!)) {
    facts[es ? 'Negocio' : 'Business'] = business[1]!.charAt(0).toUpperCase() + business[1]!.slice(1);
    if (business[2]) {
      facts[es ? 'Ciudad' : 'City'] = business[2];
    }
  }

  const team = text.match(es ? /\bcon (\d+) (?:empleados|trabajadores)/i : /\bwith (\d+) (?:employees|people)/i);
  if (team) {
    facts[es ? 'Empleados' : 'Employees'] = team[1]!;
  }

  return facts;
}

async function buildReply(question: string): Promise<string> {
  const lang = detectLanguage(question);
  const es = lang === 'es';
  const text = question.toLowerCase();
  const invoices = (await listDemoInvoices()).filter(invoice => invoice.status !== 'void');
  const issued = invoices.filter(invoice => invoice.status !== 'draft');
  const open = issued.filter(invoice => invoice.status === 'issued' || invoice.status === 'sent');
  const now = Date.now();

  if (/pendient|cobrar|impag|vencid|unpaid|owed|overdue|outstanding|pending/.test(text)) {
    if (open.length === 0) {
      return es ? 'No tienes facturas pendientes de cobro. ¡Todo al día! 🎉' : 'You have no outstanding invoices. You\'re all caught up! 🎉';
    }

    const total = open.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
    const lines = open.map((invoice) => {
      const overdue = new Date(invoice.dueDate).getTime() < now;
      const tag = overdue ? (es ? ' · **vencida**' : ' · **overdue**') : '';
      return `- **${invoice.number}** · ${invoice.customerName} · ${money(invoice.totalMinor, lang)} · ${es ? 'vence' : 'due'} ${day(invoice.dueDate, lang)}${tag}`;
    });

    return `${es ? `Tienes **${open.length} facturas** pendientes de cobro por un total de **${money(total, lang)}**:` : `You have **${open.length} unpaid invoices** worth **${money(total, lang)}**:`}\n\n${lines.join('\n')}\n\n${es ? 'Puedes marcarlas como pagadas desde la lista de facturas.' : 'You can mark them as paid from the invoices list.'}`;
  }

  if (/cliente|customer|client/.test(text)) {
    const totals = new Map<string, number>();
    for (const invoice of issued) {
      totals.set(invoice.customerName, (totals.get(invoice.customerName) ?? 0) + invoice.totalMinor);
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const lines = top.map(([name, total], index) => `${index + 1}. **${name}** — ${money(total, lang)}`);

    return `${es ? 'Tus mejores clientes por facturación:' : 'Your top customers by billed amount:'}\n\n${lines.join('\n')}`;
  }

  if (/crea|nueva|emit|new invoice|draft|borrador/.test(text)) {
    return es
      ? 'En el modo demo no creo facturas por ti, pero es muy rápido: ve a **Facturas → Nueva factura**, elige un cliente, añade conceptos y pulsa **Emitir y enviar**. El PDF se genera en tu navegador.'
      : 'In demo mode I can\'t create invoices for you, but it\'s quick: go to **Invoices → New invoice**, pick a customer, add items and hit **Issue & send**. The PDF is generated in your browser.';
  }

  if (/factur|total|ingres|ventas|revenue|invoiced|income|sales|how much|cuánto|cuanto/.test(text)) {
    const billed = issued.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
    const paid = issued.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + invoice.totalMinor, 0);
    const drafts = invoices.length - issued.length;

    return es
      ? `Llevas **${money(billed, lang)}** facturados en **${issued.length} facturas emitidas**. De ellos, **${money(paid, lang)}** ya están cobrados y **${money(billed - paid, lang)}** siguen pendientes. Además tienes ${drafts} borradores sin emitir.`
      : `You've invoiced **${money(billed, lang)}** across **${issued.length} issued invoices**. **${money(paid, lang)}** is already paid and **${money(billed - paid, lang)}** is still outstanding. You also have ${drafts} drafts not yet issued.`;
  }

  const name = await profileStorage.getItem(es ? 'Nombre' : 'Name');
  const greeting = name ? (es ? `Encantado, ${name}. ` : `Nice to meet you, ${name}. `) : '';

  return greeting + (es
    ? 'Soy el asistente de **Paqui** en modo demo: respondo con los datos de ejemplo de **Acme SL** guardados en tu navegador. Prueba a preguntarme:\n\n- ¿Qué facturas tengo pendientes de cobro?\n- ¿Cuánto he facturado en total?\n- ¿Cuáles son mis mejores clientes?'
    : 'I\'m the **Paqui** assistant in demo mode: I answer using the sample data for **Acme SL** stored in your browser. Try asking:\n\n- Which invoices are unpaid?\n- How much have I invoiced in total?\n- Who are my top customers?');
}

function titleFrom(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export async function demoStreamChatMessage({ organizationId, messages, sessionId, onChunk, onSessionId, signal }: {
  organizationId: string;
  messages: ChatMessage[];
  sessionId?: string;
  onChunk: (text: string) => void;
  onSessionId?: (id: string) => void;
  signal?: AbortSignal;
}) {
  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
  const lastUser = lastUserMessage?.content ?? '';
  const attachments = lastUserMessage?.attachments ?? [];
  const now = new Date().toISOString();

  let session = sessionId ? await sessionStorage_.getItem(sessionId) : null;
  if (!session) {
    session = { id: createId({ prefix: 'ais' }), organizationId, title: titleFrom(lastUser) || attachments.map(attachment => attachment.name).join(', ') || 'Chat', model: DEMO_AI_MODEL, createdAt: now, updatedAt: now };
  }
  await sessionStorage_.setItem(session.id, { ...session, updatedAt: now });
  onSessionId?.(session.id);

  await messageStorage.setItem(`${session.id}:${now}:u`, { id: createId({ prefix: 'aim' }), sessionId: session.id, role: 'user', content: lastUser, createdAt: now, metadata: attachments.length > 0 ? { attachments } : undefined });

  for (const [key, value] of Object.entries(extractProfileFacts(lastUser))) {
    await profileStorage.setItem(key, value);
  }

  const reply = attachments.length > 0 ? buildAttachmentsReply({ question: lastUser, names: attachments.map(attachment => attachment.name) }) : await buildReply(lastUser);
  await sleep(450, signal);

  try {
    // Stream word by word so it feels like a real model.
    for (const part of reply.match(/\S+\s*/g) ?? [reply]) {
      await sleep(18 + Math.random() * 22, signal);
      onChunk(part);
    }
  } finally {
    const replyAt = new Date().toISOString();
    await messageStorage.setItem(`${session.id}:${replyAt}:a`, { id: createId({ prefix: 'aim' }), sessionId: session.id, role: 'assistant', content: reply, createdAt: replyAt });
  }
}

const notFound = () => Object.assign(new FetchError('Not found'), { status: 404 });

// The demo has no speech recognition: a dictation always gives this question, in the language of the interface
const DEMO_DICTATIONS: Record<string, string> = {
  es: '¿Cuánto IVA tengo que pagar este trimestre?',
  en: 'How much VAT do I have to pay this quarter?',
};

export const aiHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/transcriptions',
    method: 'POST',
    handler: async ({ query }) => ({ text: DEMO_DICTATIONS[String(query?.language)] ?? DEMO_DICTATIONS.en }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/sessions',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const sessions = (await getValues(sessionStorage_)).filter(session => session.organizationId === organizationId);
      return { sessions: sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/sessions/:sessionId',
    method: 'GET',
    handler: async ({ params: { sessionId } }) => {
      const session = await sessionStorage_.getItem(sessionId);
      if (!session) {
        throw notFound();
      }
      const messages = (await getValues(messageStorage)).filter(message => message.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { session, messages };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/sessions/:sessionId',
    method: 'PATCH',
    handler: async ({ params: { sessionId }, body }) => {
      const session = await sessionStorage_.getItem(sessionId);
      if (!session) {
        throw notFound();
      }
      await sessionStorage_.setItem(sessionId, { ...session, title: String((body as { title?: string })?.title ?? session.title), updatedAt: new Date().toISOString() });
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/sessions/:sessionId',
    method: 'DELETE',
    handler: async ({ params: { sessionId } }) => {
      await sessionStorage_.removeItem(sessionId);
      const keys = (await messageStorage.getKeys()).filter(key => key.startsWith(`${sessionId}:`));
      await Promise.all(keys.map(key => messageStorage.removeItem(key)));
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/sessions/:sessionId/messages/:messageId/metadata',
    method: 'PATCH',
    handler: async () => {},
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/tools/execute',
    method: 'POST',
    handler: async () => ({ ok: true }),
  }),
  ...defineHandler({
    path: '/api/ai/profile',
    method: 'GET',
    handler: async () => ({ profile: Object.fromEntries(await Promise.all((await profileStorage.getKeys()).map(async key => [key, await profileStorage.getItem(key)]))) }),
  }),
  ...defineHandler({
    path: '/api/ai/profile',
    method: 'PATCH',
    handler: async ({ body }) => {
      for (const [key, value] of Object.entries((body as { entries?: Record<string, string> })?.entries ?? {})) {
        await profileStorage.setItem(key, value);
      }
      return { profile: Object.fromEntries(await Promise.all((await profileStorage.getKeys()).map(async key => [key, await profileStorage.getItem(key)]))) };
    },
  }),
  ...defineHandler({
    path: '/api/ai/profile/:key',
    method: 'DELETE',
    handler: async ({ params: { key } }) => {
      await profileStorage.removeItem(decodeURIComponent(key));
      return { profile: Object.fromEntries(await Promise.all((await profileStorage.getKeys()).map(async key => [key, await profileStorage.getItem(key)]))) };
    },
  }),
};
