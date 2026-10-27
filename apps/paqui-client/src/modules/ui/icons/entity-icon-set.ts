import { createSignal } from 'solid-js';

export type EntityIconSetEntry = { name: string; body: string; keywords: string };

type EntityIconSet = { entries: EntityIconSetEntry[]; bodies: Map<string, string> };

const [entityIconSet, setEntityIconSet] = createSignal<EntityIconSet>();
let loading: Promise<void> | undefined;

/** Loads the icon set once, in its own chunk; every tile and picker shares it */
export function loadEntityIconSet() {
  loading ??= import('virtual:entity-icon-set')
    .then(({ default: set }) => {
      const entries = set.map(([name, body, keywords]) => ({ name, body, keywords }));
      setEntityIconSet({ entries, bodies: new Map(entries.map(entry => [entry.name, entry.body])) });
    })
    .catch(() => {
      // A failed chunk (new deploy, offline) is retried on the next render that needs it
      loading = undefined;
    });

  return loading;
}

export { entityIconSet };
