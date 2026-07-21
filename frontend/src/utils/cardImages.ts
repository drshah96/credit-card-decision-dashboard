// Auto-discovers every file in assets/cards/ — filename (minus extension) is
// the card id. Drop a new image in that folder and it's wired up automatically,
// no import list to maintain by hand.
const modules = import.meta.glob<{ default: string }>(
  "../assets/cards/*.{png,avif,jpg,jpeg,webp}",
  { eager: true },
);

export const CARD_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const id = path.match(/\/([^/]+)\.[^.]+$/)![1];
    return [id, mod.default];
  }),
);
