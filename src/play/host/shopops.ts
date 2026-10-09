// Buying in the shop on screen, from the host panel or by clicking an item on the stage. One undoable step each.
import { app, toast } from '../../lib/app.svelte';
import type { Game, Session } from '../../lib/model';
import { blip, type Live } from '../../lib/live';
import { playerName } from '../../lib/session';
import { buy, itemDef, logged } from '../../lib/toolset';

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
    o.short = { item, error: result.error, price: opts.price };
    toast(`${result.error}: choose in the shop controls`, 3000);
  }
}
