import { getMovementById } from "@/lib/pulse/access";
import { notFound } from "next/navigation";
import Link from "next/link";
import { generateProducts, type Product, type ProductType } from "./products";

const TYPE_LABELS: Record<string, string> = {
  tshirt: "T-Shirt",
  hoodie: "Hoodie",
  poster: "Poster",
  tote: "Tote Bag",
  sticker: "Sticker",
};

const PRODUCT_PHOTOS: Record<ProductType, string | null> = {
  tshirt: "/merch/tshirt.jpg",
  hoodie: "/merch/hoodie.jpg",
  poster: "/merch/poster.jpg",
  tote: "/merch/tote.jpg",
  sticker: null,
};

function hsl(hue: number, s: number, l: number) {
  return `hsl(${hue}, ${s}%, ${l}%)`;
}

function StickerSvg({ text, hue }: { text: string; hue: number }) {
  const bg = hsl(hue, 55, 50);
  const bgDark = hsl(hue, 50, 40);
  return (
    <svg viewBox="0 0 260 260" className="merch-sticker-svg">
      <circle cx="134" cy="134" r="110" fill="rgba(0,0,0,0.12)" />
      <circle cx="130" cy="130" r="110" fill={bgDark} />
      <circle cx="130" cy="130" r="98" fill={bg} />
      <circle
        cx="130" cy="130" r="88"
        fill="none" stroke="rgba(255,255,255,0.25)"
        strokeWidth="1.5" strokeDasharray="6,4"
      />
      <text x="60" y="80" fontSize="14" fill="rgba(255,255,255,0.4)">&#9733;</text>
      <text x="190" y="80" fontSize="14" fill="rgba(255,255,255,0.4)">&#9733;</text>
      <foreignObject x="55" y="65" width="150" height="130">
        <div className="merch-svg-text-sticker">{text}</div>
      </foreignObject>
    </svg>
  );
}

function ProductCard({ product }: { product: Product }) {
  const photo = PRODUCT_PHOTOS[product.type];
  const overlayColor = hsl(product.hue, 60, 20);

  return (
    <div className="merch-card">
      <div className={`merch-photo-wrap merch-photo-${product.type}`}>
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={TYPE_LABELS[product.type]} />
            <div
              className="merch-print-overlay"
              style={{ color: overlayColor }}
            >
              {product.text}
            </div>
          </>
        ) : (
          <StickerSvg text={product.text} hue={product.hue} />
        )}
      </div>
      <div className="merch-card-info">
        <span className="merch-card-type">{TYPE_LABELS[product.type] || product.type}</span>
        <span className="merch-card-name">{product.name}</span>
        <span className="merch-card-price">${product.price}</span>
      </div>
    </div>
  );
}

export default async function MerchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movement = await getMovementById(id);

  if (!movement) notFound();

  const products = generateProducts(movement);

  return (
    <div className="merch-page">
      <Link href={`/pulse/${id}`} className="pulse-back-link">
        &larr; Back to Movement
      </Link>

      <header className="merch-header">
        <div>
          <h1>{movement.name}</h1>
          <p className="merch-header-sub">Merch Preview Collection</p>
        </div>
        <div className="pulse-score-box">
          <span className="pulse-score-value">
            {Math.round(movement.merch_potential_score)}
          </span>
          <span className="pulse-score-label">Merch Potential</span>
        </div>
      </header>

      <div className="merch-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
