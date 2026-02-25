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

function hsl(hue: number, s: number, l: number) {
  return `hsl(${hue}, ${s}%, ${l}%)`;
}

function TShirtSvg({ text, hue }: { text: string; hue: number }) {
  const fabric = hsl(hue, 45, 42);
  const fabricDark = hsl(hue, 40, 34);
  const shadow = hsl(hue, 30, 25);
  return (
    <svg viewBox="0 0 300 320" className="merch-svg">
      {/* Sleeves */}
      <path d="M60,55 L5,95 L25,155 L75,120 Z" fill={fabricDark} />
      <path d="M240,55 L295,95 L275,155 L225,120 Z" fill={fabricDark} />
      {/* Body */}
      <path
        d="M75,45 L75,310 Q75,315 80,315 L220,315 Q225,315 225,310 L225,45 Z"
        fill={fabric}
      />
      {/* Collar */}
      <path
        d="M105,40 Q150,75 195,40"
        fill="none"
        stroke={shadow}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Shoulder seams */}
      <line x1="75" y1="48" x2="105" y2="42" stroke={shadow} strokeWidth="2" opacity="0.5" />
      <line x1="225" y1="48" x2="195" y2="42" stroke={shadow} strokeWidth="2" opacity="0.5" />
      {/* Sleeve fold lines */}
      <line x1="35" y1="110" x2="65" y2="90" stroke={shadow} strokeWidth="1.5" opacity="0.3" />
      <line x1="265" y1="110" x2="235" y2="90" stroke={shadow} strokeWidth="1.5" opacity="0.3" />
      {/* Hem shadow */}
      <line x1="80" y1="312" x2="220" y2="312" stroke={shadow} strokeWidth="2" opacity="0.3" />
      {/* Print area */}
      <foreignObject x="90" y="100" width="120" height="140">
        <div className="merch-svg-text">{text}</div>
      </foreignObject>
    </svg>
  );
}

function HoodieSvg({ text, hue }: { text: string; hue: number }) {
  const fabric = hsl(hue, 40, 38);
  const fabricDark = hsl(hue, 35, 30);
  const shadow = hsl(hue, 25, 22);
  return (
    <svg viewBox="0 0 300 340" className="merch-svg">
      {/* Hood */}
      <path
        d="M105,50 Q100,5 150,0 Q200,5 195,50"
        fill={fabricDark}
      />
      <path
        d="M110,48 Q100,15 150,10 Q200,15 190,48"
        fill={fabric}
        opacity="0.6"
      />
      {/* Hood drawstrings */}
      <line x1="140" y1="55" x2="135" y2="100" stroke={shadow} strokeWidth="2" opacity="0.5" />
      <line x1="160" y1="55" x2="165" y2="100" stroke={shadow} strokeWidth="2" opacity="0.5" />
      {/* Sleeves */}
      <path d="M58,65 L0,110 L20,175 L72,135 Z" fill={fabricDark} />
      <path d="M242,65 L300,110 L280,175 L228,135 Z" fill={fabricDark} />
      {/* Body */}
      <path
        d="M72,55 L72,325 Q72,330 77,330 L223,330 Q228,330 228,325 L228,55 Z"
        fill={fabric}
      />
      {/* Kangaroo pocket */}
      <path
        d="M100,220 Q100,250 150,255 Q200,250 200,220"
        fill="none"
        stroke={shadow}
        strokeWidth="2.5"
        opacity="0.5"
      />
      {/* Center seam */}
      <line x1="150" y1="55" x2="150" y2="330" stroke={shadow} strokeWidth="1" opacity="0.15" />
      {/* Print area */}
      <foreignObject x="88" y="90" width="124" height="120">
        <div className="merch-svg-text">{text}</div>
      </foreignObject>
    </svg>
  );
}

function PosterSvg({ text, hue }: { text: string; hue: number }) {
  const bg = hsl(hue, 35, 88);
  const border = hsl(hue, 30, 70);
  const textColor = hsl(hue, 50, 18);
  return (
    <svg viewBox="0 0 240 320" className="merch-svg">
      {/* Shadow */}
      <rect x="12" y="12" width="220" height="300" rx="3" fill="rgba(0,0,0,0.15)" />
      {/* Paper */}
      <rect x="5" y="5" width="220" height="300" rx="2" fill={bg} />
      {/* Inner border */}
      <rect
        x="18" y="18" width="194" height="274" rx="1"
        fill="none" stroke={border} strokeWidth="1.5"
      />
      {/* Decorative line top */}
      <line x1="40" y1="50" x2="190" y2="50" stroke={border} strokeWidth="1" />
      {/* Print area */}
      <foreignObject x="30" y="70" width="170" height="180">
        <div className="merch-svg-text-poster" style={{ color: textColor }}>
          {text}
        </div>
      </foreignObject>
      {/* Decorative line bottom */}
      <line x1="40" y1="265" x2="190" y2="265" stroke={border} strokeWidth="1" />
      {/* Small accent */}
      <circle cx="115" cy="278" r="4" fill={border} />
    </svg>
  );
}

function ToteSvg({ text, hue }: { text: string; hue: number }) {
  const fabric = hsl(hue, 30, 85);
  const strap = hsl(hue, 25, 65);
  const textColor = hsl(hue, 45, 22);
  return (
    <svg viewBox="0 0 260 320" className="merch-svg">
      {/* Straps */}
      <path
        d="M80,85 Q80,20 130,15 Q180,20 180,85"
        fill="none" stroke={strap} strokeWidth="10" strokeLinecap="round"
      />
      {/* Shadow */}
      <path d="M42,90 L25,310 Q24,318 32,318 L232,318 Q240,318 239,310 L222,90 Z"
        fill="rgba(0,0,0,0.1)" transform="translate(3,3)"
      />
      {/* Bag body */}
      <path
        d="M40,88 L23,308 Q22,316 30,316 L230,316 Q238,316 237,308 L220,88 Z"
        fill={fabric}
      />
      {/* Top fold */}
      <path
        d="M40,88 L220,88"
        stroke={strap} strokeWidth="3" opacity="0.5"
      />
      {/* Stitch lines */}
      <path
        d="M38,95 L22,308" fill="none"
        stroke={strap} strokeWidth="1" strokeDasharray="4,4" opacity="0.3"
      />
      <path
        d="M222,95 L238,308" fill="none"
        stroke={strap} strokeWidth="1" strokeDasharray="4,4" opacity="0.3"
      />
      {/* Print area */}
      <foreignObject x="55" y="120" width="150" height="150">
        <div className="merch-svg-text-light" style={{ color: textColor }}>
          {text}
        </div>
      </foreignObject>
    </svg>
  );
}

function StickerSvg({ text, hue }: { text: string; hue: number }) {
  const bg = hsl(hue, 55, 50);
  const bgDark = hsl(hue, 50, 40);
  return (
    <svg viewBox="0 0 260 260" className="merch-svg">
      {/* Shadow */}
      <circle cx="134" cy="134" r="110" fill="rgba(0,0,0,0.12)" />
      {/* Outer ring */}
      <circle cx="130" cy="130" r="110" fill={bgDark} />
      {/* Inner circle */}
      <circle cx="130" cy="130" r="98" fill={bg} />
      {/* Dashed inner border */}
      <circle
        cx="130" cy="130" r="88"
        fill="none" stroke="rgba(255,255,255,0.25)"
        strokeWidth="1.5" strokeDasharray="6,4"
      />
      {/* Star accents */}
      <text x="60" y="80" fontSize="14" fill="rgba(255,255,255,0.4)">&#9733;</text>
      <text x="190" y="80" fontSize="14" fill="rgba(255,255,255,0.4)">&#9733;</text>
      {/* Print area */}
      <foreignObject x="55" y="65" width="150" height="130">
        <div className="merch-svg-text-sticker">{text}</div>
      </foreignObject>
    </svg>
  );
}

const SVG_COMPONENTS: Record<ProductType, React.FC<{ text: string; hue: number }>> = {
  tshirt: TShirtSvg,
  hoodie: HoodieSvg,
  poster: PosterSvg,
  tote: ToteSvg,
  sticker: StickerSvg,
};

function ProductCard({ product }: { product: Product }) {
  const SvgComponent = SVG_COMPONENTS[product.type];
  return (
    <div className="merch-card">
      <div className="merch-mockup">
        <SvgComponent text={product.text} hue={product.hue} />
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
