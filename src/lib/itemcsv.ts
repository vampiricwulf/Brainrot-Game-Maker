// 📊 Stats & items › 📥 Import CSV…: a table of items (name, price, stackable, wearable, description), saved by a
// spreadsheet with commas, semicolons (Excel where the decimal mark is a comma) or tabs.
import { parseTable, parseValue, tableSeparator } from './clueimport';

export const ITEM_COLUMNS = ['name', 'price', 'stackable', 'wearable', 'description'] as const;

export interface ItemCsvRow {
  name: string;
  /** Not in the file, or blank. */
  price?: number;
  /** Not in the file. */
  stackable?: boolean;
  slot?: 'head' | 'hand' | 'body' | 'badge';
  description?: string;
}

/** The items in a CSV's text, and the price cells that aren't a number ("8 gold"), as they are in the file. */
export function readItemsCsv(text: string): { items: ItemCsvRow[]; badPrices: string[] } {
  text = text.replace(/^﻿/, '');
  // (The separator is the header's: a tab inside a description doesn't make a comma file a tab one.)
  const rows = parseTable(text, tableSeparator(text.split(/\r?\n/).find((l) => l.trim()) ?? ''));
  const head = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const col = (name: string) => head.indexOf(name);
  // A header row is any first row naming a column the file can have (not only "name").
  const start = ITEM_COLUMNS.some((k) => col(k) >= 0) ? 1 : 0;
  const n = col('name') >= 0 ? col('name') : 0;
  const cell = (r: string[], name: string): string | undefined => (col(name) >= 0 ? r[col(name)] : undefined);
  const items: ItemCsvRow[] = [];
  const badPrices: string[] = [];
  for (const r of rows.slice(start)) {
    const name = r[n]?.trim();
    if (!name) continue;
    const it: ItemCsvRow = { name };
    const price = cell(r, 'price');
    if (price) {
      // (A plain number as ⬇ Export CSV writes it is read as it is: "1.125" is a price of 1.125, not 1125.)
      const v = /^-?\d+(\.\d+)?$/.test(price) ? Number(price) : parseValue(price);
      if (v === null) badPrices.push(price);
      else it.price = v;
    }
    if (col('stackable') >= 0) it.stackable = !/^(no|false|0)$/i.test(cell(r, 'stackable') ?? '');
    const slot = cell(r, 'wearable')?.toLowerCase();
    if (slot === 'head' || slot === 'hand' || slot === 'body' || slot === 'badge') it.slot = slot;
    const description = cell(r, 'description');
    if (description) it.description = description;
    items.push(it);
  }
  return { items, badPrices };
}
