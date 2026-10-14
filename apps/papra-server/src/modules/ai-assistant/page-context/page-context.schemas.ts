import { z } from 'zod';

// What the browser tells the assistant about where the user is and what is on screen.
// Everything is data captured as it is (labels, headings, rows): no intent is guessed on the client,
// the model reads it and decides.

const label = z.string().trim().max(160);

const controlSchema = z.object({
  kind: z.enum(['button', 'link', 'input', 'select', 'checkbox', 'switch']),
  label,
  disabled: z.boolean().optional(),
  /** Current value of a non sensitive field */
  value: z.string().max(160).optional(),
  checked: z.boolean().optional(),
});

const tableSchema = z.object({
  title: label.optional(),
  columns: z.array(label).max(20),
  rows: z.array(z.array(z.string().max(120)).max(20)).max(15),
  /** Rows on screen, the rows above are the first ones */
  totalRows: z.number().int().min(0),
});

export const pageSnapshotSchema = z.object({
  headings: z.array(label).max(20).default([]),
  tabs: z.array(z.object({ label, active: z.boolean() })).max(20).default([]),
  controls: z.array(controlSchema).max(60).default([]),
  tables: z.array(tableSchema).max(4).default([]),
  /** Visible text outside the structures above (cards, empty states, messages) */
  text: z.string().max(1_500).optional(),
});

export const pageContextSchema = z.object({
  /** Location path without query string, e.g. /organizations/org_x/invoicing/invoices */
  path: z.string().max(500),
  search: z.string().max(500).optional(),
  title: label.optional(),
  /** Route parameters of the current page: ids of the entity on screen (invoiceId, contactId...) */
  params: z.record(z.string().max(100)).default({}),
  snapshot: pageSnapshotSchema.optional(),
  /** Every page the user can open in this workspace, built from the actual navigation (capabilities included) */
  pages: z.array(z.object({ path: z.string().max(300), label, section: label.optional() })).max(80).default([]),
  /** Pages that open one entity, with :param placeholders */
  entityPages: z.array(z.object({ path: z.string().max(300), label })).max(20).default([]),
});

export type PageContext = z.infer<typeof pageContextSchema>;
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;
