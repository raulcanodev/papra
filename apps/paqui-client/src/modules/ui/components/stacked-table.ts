import { onCleanup, onMount } from 'solid-js';

// On phones a table never scrolls sideways: the `stacked-table` class (app.css) turns each row into a card where every
// cell shows the title of its column. The titles are copied from the header into a data-label of each cell, and kept in
// sync when rows come and go or the header changes (language switch, sorting).

export const STACKED_TABLE_CLASS = 'stacked-table';

function labelCells(table: HTMLTableElement) {
  const headerCells = table.tHead?.rows[0]?.cells;

  if (!headerCells) {
    return;
  }

  for (const body of table.tBodies) {
    for (const row of body.rows) {
      for (const cell of row.cells) {
        const label = headerCells[cell.cellIndex]?.textContent?.trim() ?? '';
        // Only icon buttons, no text: the row actions, shown in the corner of the card
        const isActions = !cell.textContent?.trim() && cell.querySelector('button, [role="button"]') !== null;

        if (cell.dataset.label !== label) {
          cell.dataset.label = label;
        }

        if ((cell.dataset.stackActions !== undefined) !== isActions) {
          cell.toggleAttribute('data-stack-actions', isActions);
        }
      }
    }
  }
}

export function useStackedTableLabels(getTable: () => HTMLTableElement | undefined) {
  onMount(() => {
    const table = getTable();

    if (!table) {
      return;
    }

    let isScheduled = false;
    const observer = new MutationObserver(() => {
      if (isScheduled) {
        return;
      }

      isScheduled = true;
      queueMicrotask(() => {
        isScheduled = false;
        labelCells(table);
      });
    });

    labelCells(table);
    // Attributes are not observed: writing the labels must not wake the observer up again
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    onCleanup(() => observer.disconnect());
  });
}
