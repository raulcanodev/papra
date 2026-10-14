// What the user is looking at, read from the DOM as plain facts: headings, tabs, tables, controls and their state.
// Nothing here decides what the user wants; the assistant reads it and judges. Mark an element with
// `data-agent-ignore` to keep it (and everything inside) out, e.g. the assistant panel itself.

export type SnapshotControl = {
  kind: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'switch';
  label: string;
  disabled?: boolean;
  value?: string;
  checked?: boolean;
};

export type SnapshotTable = { title?: string; columns: string[]; rows: string[][]; totalRows: number };

export type PageSnapshot = {
  headings: string[];
  tabs: Array<{ label: string; active: boolean }>;
  controls: SnapshotControl[];
  tables: SnapshotTable[];
  text?: string;
};

export const SNAPSHOT_LIMITS = {
  headings: 20,
  tabs: 20,
  controls: 60,
  tables: 4,
  tableRows: 15,
  tableColumns: 20,
  textChars: 1_500,
  labelChars: 120,
} as const;

// Fields whose value must never leave the browser
const SENSITIVE_INPUT_TYPES = new Set(['password', 'hidden', 'file']);
const SENSITIVE_AUTOCOMPLETE = /cc-|password|one-time-code/;

function normalize(text: string | null | undefined, max: number = SNAPSHOT_LIMITS.labelChars) {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isHidden(element: Element) {
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('data-agent-ignore')) {
      return true;
    }

    const style = current instanceof HTMLElement ? current.style : undefined;

    if (style?.display === 'none' || style?.visibility === 'hidden') {
      return true;
    }
  }

  return false;
}

function visible<T extends Element>(elements: Iterable<T>) {
  return [...elements].filter(element => !isHidden(element));
}

function getLabel(element: Element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  const labelledByText = labelledBy === null ? '' : labelledBy.split(' ').map(id => element.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');

  const associated = (element as HTMLInputElement).labels?.[0]?.textContent;

  return normalize(
    element.getAttribute('aria-label')
    || labelledByText
    || associated
    || element.textContent
    || element.getAttribute('placeholder')
    || element.getAttribute('title')
    || element.getAttribute('name'),
  );
}

function captureTables(root: ParentNode): SnapshotTable[] {
  return visible(root.querySelectorAll('table')).slice(0, SNAPSHOT_LIMITS.tables).map((table) => {
    const columns = visible(table.querySelectorAll('thead th')).map(cell => normalize(cell.textContent)).slice(0, SNAPSHOT_LIMITS.tableColumns);
    const bodyRows = visible(table.querySelectorAll('tbody tr'));

    return {
      title: normalize(table.querySelector('caption')?.textContent ?? table.getAttribute('aria-label')) || undefined,
      columns,
      rows: bodyRows.slice(0, SNAPSHOT_LIMITS.tableRows).map(row => visible(row.querySelectorAll('td, th')).map(cell => normalize(cell.textContent)).slice(0, SNAPSHOT_LIMITS.tableColumns)),
      totalRows: bodyRows.length,
    };
  });
}

function captureControls(root: ParentNode): SnapshotControl[] {
  const controls: SnapshotControl[] = [];
  const seen = new Set<string>();

  const add = (control: SnapshotControl) => {
    const key = `${control.kind}:${control.label}`;

    if (control.label === '' || seen.has(key) || controls.length >= SNAPSHOT_LIMITS.controls) {
      return;
    }

    seen.add(key);
    // Absent rather than undefined: the snapshot is sent as JSON and read as it is
    controls.push(Object.fromEntries(Object.entries(control).filter(([, value]) => value !== undefined)) as SnapshotControl);
  };

  // The menu and the table cells are not repeated here: the menu is the list of pages, the cells are the rows
  const candidates = visible(root.querySelectorAll('button, a[href], input, select, textarea, [role="switch"], [role="checkbox"]'))
    .filter(element => element.closest('nav, table, [role="tab"]') === null);

  for (const element of candidates) {
    const disabled = (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true' ? true : undefined;
    const label = getLabel(element);

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const type = element instanceof HTMLInputElement ? element.type : 'text';

      if (SENSITIVE_INPUT_TYPES.has(type)) {
        continue;
      }

      if (type === 'checkbox' || type === 'radio') {
        add({ kind: 'checkbox', label, disabled, checked: (element as HTMLInputElement).checked });
        continue;
      }

      const sensitive = SENSITIVE_AUTOCOMPLETE.test(element.getAttribute('autocomplete') ?? '');
      add({ kind: 'input', label, disabled, value: sensitive ? undefined : normalize(element.value) || undefined });
    } else if (element instanceof HTMLSelectElement) {
      add({ kind: 'select', label, disabled, value: normalize(element.selectedOptions[0]?.textContent) || undefined });
    } else if (element.getAttribute('role') === 'switch' || element.getAttribute('role') === 'checkbox') {
      add({ kind: element.getAttribute('role') === 'switch' ? 'switch' : 'checkbox', label, disabled, checked: element.getAttribute('aria-checked') === 'true' });
    } else if (element.tagName === 'A') {
      add({ kind: 'link', label });
    } else {
      add({ kind: 'button', label, disabled });
    }
  }

  return controls;
}

function captureText(root: ParentNode) {
  const text = visible(root.querySelectorAll('p, [role="status"], [role="alert"]'))
    .filter(element => element.closest('table, nav, button, a') === null)
    .map(element => normalize(element.textContent, 300))
    .filter(content => content !== '')
    .join(' · ');

  return text === '' ? undefined : text.slice(0, SNAPSHOT_LIMITS.textChars);
}

export function capturePageSnapshot({ root }: { root: ParentNode | null }): PageSnapshot | undefined {
  if (root === null) {
    return undefined;
  }

  return {
    headings: visible(root.querySelectorAll('h1, h2, h3')).map(heading => normalize(heading.textContent)).filter(Boolean).slice(0, SNAPSHOT_LIMITS.headings),
    tabs: visible(root.querySelectorAll('[role="tab"]')).map(tab => ({ label: normalize(tab.textContent), active: tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('data-selected') !== null })).slice(0, SNAPSHOT_LIMITS.tabs),
    controls: captureControls(root),
    tables: captureTables(root),
    text: captureText(root),
  };
}
