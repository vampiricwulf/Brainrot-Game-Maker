import { describe, expect, it } from 'vitest';
import { readItemsCsv } from './itemcsv';

describe('readItemsCsv', () => {
  it('reads a comma file with a header', () => {
    const { items, badPrices } = readItemsCsv('name,price,stackable,wearable,description\nSword,10,no,hand,"A sharp, shiny blade"\nPotion,5,yes,,Heals 3 HP\n');
    expect(items).toEqual([
      { name: 'Sword', price: 10, stackable: false, slot: 'hand', description: 'A sharp, shiny blade' },
      { name: 'Potion', price: 5, stackable: true, description: 'Heals 3 HP' },
    ]);
    expect(badPrices).toEqual([]);
  });

  it('reads a semicolon file (Excel where the decimal mark is a comma), with its BOM and CRLF', () => {
    const { items } = readItemsCsv('﻿name;price;stackable;wearable;description\r\nSword;10;no;hand;A sharp blade\r\nPotion;2,5;yes;;Heals 3 HP\r\n');
    expect(items.map((i) => [i.name, i.price, i.slot])).toEqual([
      ['Sword', 10, 'hand'],
      ['Potion', 2.5, undefined],
    ]);
  });

  it('keeps a comma file one when a description holds a tab', () => {
    const { items } = readItemsCsv('name,price,description\nRope,3,long\tand strong\n');
    expect(items).toEqual([{ name: 'Rope', price: 3, description: 'long\tand strong' }]);
  });

  it('reads "$12" as a price, and lists the prices it can’t read', () => {
    const { items, badPrices } = readItemsCsv('Name,Price\nShield,$12\nHelmet,8 gold\nCap,\n');
    expect(items).toEqual([{ name: 'Shield', price: 12 }, { name: 'Helmet' }, { name: 'Cap' }]);
    expect(badPrices).toEqual(['8 gold']);
  });

  it('takes a column of names with no header', () => {
    expect(readItemsCsv('Sword\nPotion\n').items).toEqual([{ name: 'Sword' }, { name: 'Potion' }]);
  });
});
