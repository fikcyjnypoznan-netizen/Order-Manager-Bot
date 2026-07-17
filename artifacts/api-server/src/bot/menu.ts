export const MENU_ITEMS = [
  { id: "burger",     name: "Burger",     emoji: "🍔", price: 25 },
  { id: "rosol",      name: "Rosół",      emoji: "🍲", price: 30 },
  { id: "danie_dnia", name: "Danie dnia", emoji: "🍽️", price: 40 },
  { id: "muszynianka",name: "Muszynianka",emoji: "💧", price:  8 },
  { id: "bliskie",    name: "Bliskie",    emoji: "🍺", price: 10 },
] as const;

export type MenuItemId = (typeof MENU_ITEMS)[number]["id"];

export function getMenuItem(id: string) {
  return MENU_ITEMS.find((item) => item.id === id) ?? null;
}

export function buildOrderDescription(
  selectedIds: string[],
  quantities: number[],
): { description: string; totalPrice: number } {
  const lines: string[] = [];
  let totalPrice = 0;

  selectedIds.forEach((id, i) => {
    const item = getMenuItem(id);
    if (!item) return;
    const qty = quantities[i] ?? 1;
    const lineTotal = item.price * qty;
    totalPrice += lineTotal;
    lines.push(`${item.emoji} ${qty}x ${item.name} (${lineTotal} zł)`);
  });

  lines.push(`\n💵 Łącznie: **${totalPrice} zł**`);
  return { description: lines.join("\n"), totalPrice };
}
