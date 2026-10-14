import { readFile, writeFile } from 'node:fs/promises';
import { toolCatalog } from '../src/catalog';

const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';

function firstSentence(text: string) {
  return text.split(/(?<=\.)\s/)[0]!.replace(/\|/g, '\\|');
}

const rows = toolCatalog.map(tool => `| \`${tool.name}\` | ${tool.risk} | ${tool.permission === null ? '—' : `\`${tool.permission}\``} | ${firstSentence(tool.description)} |`);
const table = ['| Tool | Risk | API key permission | What it does |', '| --- | --- | --- | --- |', ...rows].join('\n');

const readmePath = new URL('../README.md', import.meta.url);
const readme = await readFile(readmePath, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);

await writeFile(readmePath, `${readme.slice(0, start + START.length)}\n\n${table}\n\n${readme.slice(end)}`);
