// Buying in the shop on screen, from the host panel or by clicking an item on the stage. One undoable step each.
import { app, toast } from '../../lib/app.svelte';
import type { Game, Session } from '../../lib/model';
import { blip, type Live } from '../../lib/live';
import { playerName } from '../../lib/session';
import { buy, formatPrice, itemDef, logged, shopPrice, stockLeft } from '../../lib/toolset';
import type { MenuEntry } from '../../lib/menustate.svelte';

type ShopOverlay = Extract<NonNullable<Live['overlay']>, { kind: 'shop' }>;

/** The buyer: the one chosen, else the first selected player, else the first player. */
export function shopBuyer(o: ShopOverlay, session: Session, selected: string[]): string | undefined {
  const here = (id?: string) => (id && session.players.some((p) => p.id === id) ? id : undefined);
  return here(o.buyer) ?? here(selected[0]) ?? session.players[0]?.id;
}

/** Buy one of an item for the buyer. Short of money, the host is asked (in the shop controls) what to do. */
export function shopBuy(
  game: Game,
  session: Session,
  o: ShopOverlay,
  selected: string[],
  item: string,
  opts: { price?: number; allowShort?: boolean } = {},
): void {
  const shop = game.shops?.find((s) => s.id === o.shopId);
  const buyer = shopBuyer(o, session, selected);
  if (!shop || !buyer) return;
  let result: ReturnType<typeof buy> | undefined;
  logged(session, `${playerName(session, buyer)} buys ${itemDef(game, item)?.name}`, () => (result = buy(game, session, shop, buyer, item, opts)));
  if (!result) return;
  if (result.ok) {
    o.short = undefined;
    blip(app.live, 'coin');
    toast(result.text, 3000);
  } else if (result.error === 'Sold out') toast(`${itemDef(game, item)?.name} is sold out`);
  else {
    o.short = { item, price: opts.price };
    toast(`${result.error}: choose in the shop controls`, 3000);
  }
}

/**
 * A ware's right-click menu in the shop on the stage (the host's window): 🛒 Buy for each player (the shop's buyer
 * changes to them, as its box's chip does), then 📦 Change the stock… (asked in the shop's box). One sold out can't be
 * bought.
 */
export function wareMenu(game: Game, session: Session, o: ShopOverlay, selected: string[], item: string, { stock }: { stock: () => void }): MenuEntry[] {
  const shop = game.shops?.find((s) => s.id === o.shopId);
  const def = itemDef(game, item);
  if (!shop || !def) return [];
  const left = stockLeft(session, shop, item, game);
  const out = left !== null && left <= 0;
  return [
    { heading: `${def.name} · ${formatPrice(game, shop, shopPrice(game, shop, item))}${left === null ? '' : out ? ' · sold out' : ` · ${left} left`}` },
    ...session.players.map(
      (p): MenuEntry => ({
        label: `🛒 Buy for ${p.name}`,
        disabled: out,
        onclick: () => {
          o.buyer = p.id;
          o.short = undefined;
          shopBuy(game, session, o, selected, item);
        },
      }),
    ),
    { sep: true },
    { label: '📦 Change the stock…', hint: 'How many are left (blank: unlimited), asked in the shop’s box', onclick: stock },
  ];
}
