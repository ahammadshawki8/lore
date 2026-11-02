import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadLore(file = 'data/lore.json') {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function saveLore(entries, file = 'data/lore.json') {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}
