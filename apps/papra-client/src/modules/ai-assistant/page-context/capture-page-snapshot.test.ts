// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { capturePageSnapshot, SNAPSHOT_LIMITS } from './capture-page-snapshot';

function render(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;

  return capturePageSnapshot({ root: document.querySelector('main') });
}

describe('capturePageSnapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('reads headings, tabs and the selected tab', () => {
    const snapshot = render(`
      <h1>Invoices</h1><h2>Pending</h2>
      <div role="tab" aria-selected="true">Issued</div><div role="tab" aria-selected="false">Received</div>
    `);

    expect(snapshot?.headings).to.eql(['Invoices', 'Pending']);
    expect(snapshot?.tabs).to.eql([{ label: 'Issued', active: true }, { label: 'Received', active: false }]);
  });

  test('reads a table: columns, the first rows and how many there are', () => {
    const rows = Array.from({ length: 20 }, (_, index) => `<tr><td>INV-${index}</td><td>Acme</td></tr>`).join('');
    const snapshot = render(`<table><thead><tr><th>Number</th><th>Customer</th></tr></thead><tbody>${rows}</tbody></table>`);

    expect(snapshot?.tables[0]).to.include({ totalRows: 20 });
    expect(snapshot?.tables[0]?.columns).to.eql(['Number', 'Customer']);
    expect(snapshot?.tables[0]?.rows).to.have.length(SNAPSHOT_LIMITS.tableRows);
    expect(snapshot?.tables[0]?.rows[0]).to.eql(['INV-0', 'Acme']);
  });

  test('reads the controls with their state, labelled the way the user sees them', () => {
    const snapshot = render(`
      <button>New invoice</button>
      <button disabled>Export</button>
      <button aria-label="Close panel"><svg></svg></button>
      <a href="/x">Calendar</a>
      <label for="q">Search</label><input id="q" value="acme" />
      <select aria-label="Status"><option>All</option><option selected>Paid</option></select>
      <input type="checkbox" aria-label="Only mine" checked />
    `);

    expect(snapshot?.controls).to.deep.include({ kind: 'button', label: 'New invoice' });
    expect(snapshot?.controls).to.deep.include({ kind: 'button', label: 'Export', disabled: true });
    expect(snapshot?.controls).to.deep.include({ kind: 'button', label: 'Close panel' });
    expect(snapshot?.controls).to.deep.include({ kind: 'link', label: 'Calendar' });
    expect(snapshot?.controls).to.deep.include({ kind: 'input', label: 'Search', value: 'acme' });
    expect(snapshot?.controls).to.deep.include({ kind: 'select', label: 'Status', value: 'Paid' });
    expect(snapshot?.controls).to.deep.include({ kind: 'checkbox', label: 'Only mine', checked: true });
  });

  test('never reads passwords, card data or file inputs', () => {
    const snapshot = render(`
      <input type="password" aria-label="Password" value="hunter2" />
      <input aria-label="Card number" autocomplete="cc-number" value="4242424242424242" />
      <input type="file" aria-label="Attachment" />
    `);

    expect(JSON.stringify(snapshot)).not.to.include('hunter2');
    expect(JSON.stringify(snapshot)).not.to.include('4242');
    expect(snapshot?.controls.map(({ label }) => label)).to.eql(['Card number']);
  });

  test('leaves out what is hidden, marked to ignore, or in the menu', () => {
    const snapshot = render(`
      <button>Visible</button>
      <button hidden>Hidden attribute</button>
      <div style="display:none"><button>Hidden by style</button></div>
      <div data-agent-ignore><button>Assistant panel button</button></div>
      <nav><a href="/home">Menu link</a></nav>
    `);

    expect(snapshot?.controls.map(({ label }) => label)).to.eql(['Visible']);
  });

  test('keeps the snapshot inside its budget', () => {
    const snapshot = render(`${Array.from({ length: 200 }, (_, index) => `<button>Button ${index}</button>`).join('')}<p>${'a'.repeat(5_000)}</p>`);

    expect(snapshot?.controls).to.have.length(SNAPSHOT_LIMITS.controls);
    expect(snapshot?.text?.length).toBeLessThanOrEqual(SNAPSHOT_LIMITS.textChars);
  });

  test('without a root there is nothing to read', () => {
    expect(capturePageSnapshot({ root: null })).to.eql(undefined);
  });
});
