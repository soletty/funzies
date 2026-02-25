import { getMovementById } from "@/lib/pulse/access";
import { notFound } from "next/navigation";
import Link from "next/link";
import { generateProducts, type Product } from "./products";

const TYPE_LABELS: Record<string, string> = {
  tshirt: "T-Shirt",
  hoodie: "Hoodie",
  poster: "Poster",
  tote: "Tote Bag",
  sticker: "Sticker",
};

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="merch-card">
      <div
        className={`merch-mockup merch-mockup-${product.type}`}
        style={{ "--merch-hue": product.hue } as React.CSSProperties}
      >
        <span className="merch-mockup-text">{product.text}</span>
      </div>
      <div className="merch-card-info">
        <span className="merch-card-type">{TYPE_LABELS[product.type] || product.type}</span>
        <span className="merch-card-name">{product.name}</span>
        <span className="merch-card-price">${product.price.toFixed(2)}</span>
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
