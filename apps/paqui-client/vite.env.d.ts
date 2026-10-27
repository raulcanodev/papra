declare module '*.yml' {
  import type { LocaleKeys } from './types'; // Adjust the import path as needed

  const value: Record<LocaleKeys, string>;
  export default value;
}

declare module 'virtual:entity-icon-set' {
  const set: Array<[name: string, body: string, keywords: string]>;
  export default set;
}
