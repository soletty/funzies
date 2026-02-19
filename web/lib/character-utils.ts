import type { Character } from "@/lib/types";

const AVATAR_COLORS = [
  "#0969da", "#8250df", "#bf3989", "#0e8a16", "#e16f24",
  "#cf222e", "#1a7f37", "#6639ba", "#953800", "#0550ae",
  "#7c3aed", "#d1242f",
];

export function buildCharacterMaps(characters: Character[]): {
  colorMap: Record<string, string>;
  avatarUrlMap: Record<string, string>;
} {
  const colorMap: Record<string, string> = {};
  const avatarUrlMap: Record<string, string> = {};
  characters.forEach((char, i) => {
    colorMap[char.name] = AVATAR_COLORS[i % AVATAR_COLORS.length];
    if (char.avatarUrl) avatarUrlMap[char.name] = char.avatarUrl;
  });
  return { colorMap, avatarUrlMap };
}

export function findColor(name: string, colorMap: Record<string, string>): string {
  if (colorMap[name]) return colorMap[name];
  const lower = name.toLowerCase();
  for (const fullName of Object.keys(colorMap)) {
    const firstName = fullName.split(/\s+/)[0].toLowerCase();
    if (firstName === lower || fullName.toLowerCase().includes(lower))
      return colorMap[fullName];
  }
  return "var(--color-accent)";
}

export function findAvatarUrl(name: string, avatarUrlMap: Record<string, string>): string | undefined {
  if (avatarUrlMap[name]) return avatarUrlMap[name];
  const lower = name.toLowerCase();
  for (const fullName of Object.keys(avatarUrlMap)) {
    const firstName = fullName.split(/\s+/)[0].toLowerCase();
    if (firstName === lower || fullName.toLowerCase().includes(lower))
      return avatarUrlMap[fullName];
  }
  return undefined;
}

export function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Colonel|Col\.)?\s*/i, "").split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isSocrate(name: string): boolean {
  return name.toLowerCase().includes("socrate");
}
