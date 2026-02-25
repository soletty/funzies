export type ProductType = "tshirt" | "hoodie" | "poster" | "tote" | "sticker";

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  text: string;
  price: number;
  hue: number;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const HUE_OFFSETS: Record<ProductType, number> = {
  tshirt: 0,
  hoodie: 25,
  poster: 50,
  tote: 75,
  sticker: 100,
};

function deriveHue(name: string, type: ProductType): number {
  return (hashString(name) + HUE_OFFSETS[type]) % 360;
}

function derivePrice(seed: string, min: number, max: number): number {
  const h = hashString(seed);
  const range = max - min;
  return min + (h % (range + 1));
}

interface MovementData {
  name: string;
  key_slogans?: string[];
  key_phrases?: string[];
}

export function generateProducts(movement: MovementData): Product[] {
  const products: Product[] = [];
  const slogans = movement.key_slogans ?? [];
  const phrases = movement.key_phrases ?? [];

  for (const slogan of slogans) {
    products.push({
      id: `tshirt-${hashString(slogan)}`,
      type: "tshirt",
      name: "Classic Tee",
      text: slogan,
      price: derivePrice(`tshirt-${slogan}`, 24, 32),
      hue: deriveHue(movement.name, "tshirt"),
    });
    products.push({
      id: `hoodie-${hashString(slogan)}`,
      type: "hoodie",
      name: "Pullover Hoodie",
      text: slogan,
      price: derivePrice(`hoodie-${slogan}`, 38, 54),
      hue: deriveHue(movement.name, "hoodie"),
    });
  }

  for (const phrase of phrases.slice(0, 3)) {
    products.push({
      id: `poster-${hashString(phrase)}`,
      type: "poster",
      name: "Wall Poster",
      text: phrase,
      price: derivePrice(`poster-${phrase}`, 18, 28),
      hue: deriveHue(movement.name, "poster"),
    });
  }

  products.push({
    id: `tote-${hashString(movement.name)}`,
    type: "tote",
    name: "Tote Bag",
    text: movement.name,
    price: derivePrice(`tote-${movement.name}`, 22, 30),
    hue: deriveHue(movement.name, "tote"),
  });

  products.push({
    id: `sticker-${hashString(movement.name)}`,
    type: "sticker",
    name: "Die-Cut Sticker",
    text: movement.name,
    price: derivePrice(`sticker-${movement.name}`, 4, 8),
    hue: deriveHue(movement.name, "sticker"),
  });

  return products;
}
