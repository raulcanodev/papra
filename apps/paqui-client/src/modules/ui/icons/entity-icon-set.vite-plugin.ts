import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { icons } from '@phosphor-icons/core';
import { ENTITY_ICON_SPANISH_KEYWORDS } from './entity-icon-set.es-keywords';

const VIRTUAL_MODULE_ID = 'virtual:entity-icon-set';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

// The filled weight of every Phosphor icon (the look of iOS icons), built into one module the app imports lazily:
// a few hundred kilobytes that only load when a tile shows an icon or the picker opens, then stay cached.
// Each entry is [name, svg inner markup, search keywords in English and Spanish].
export function entityIconSetPlugin(): Plugin {
  return {
    name: 'entity-icon-set',
    resolveId(id) {
      return id === VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return undefined;
      }

      // JSON.parse of a string literal is faster to evaluate than the same object literal
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(buildEntityIconSet()))});`;
    },
  };
}

function buildEntityIconSet() {
  const assetsDirectory = path.join(path.dirname(createRequire(import.meta.url).resolve('@phosphor-icons/core')), '../assets/fill');

  return icons.map((icon) => {
    const svg = readFileSync(path.join(assetsDirectory, `${icon.name}-fill.svg`), 'utf8');
    const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

    // Tags like "*new*" are release notes, not words
    const words = [...icon.name.split('-'), ...icon.tags.filter(tag => !tag.startsWith('*')).flatMap(tag => tag.toLowerCase().split(/[\s-]+/))];
    const keywords = [...new Set(words.flatMap(word => [word, ...(ENTITY_ICON_SPANISH_KEYWORDS[word]?.split(' ') ?? [])]))].join(' ');

    return [icon.name, body, keywords] as const;
  });
}
