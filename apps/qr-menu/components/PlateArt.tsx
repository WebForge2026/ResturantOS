'use client';

import { memo, useId } from 'react';
import type { PlateArt as PlateArtSpec } from '@noar/types';

/**
 * Procedural top-down plated dish illustration.
 * DOCUMENTED PLACEHOLDER: replaces real food photography until the restaurant uploads
 * licensed photos (product.image_url). When image_url exists it is rendered inside the
 * same chrome-rimmed plate instead.
 */
type Props = { art: PlateArtSpec | null; imageUrl?: string | null; label: string; seed: number };

const rand = (seed: number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const PlateArtImpl = ({ art, imageUrl, label, seed }: Props) => {
  if (imageUrl) {
    // Real photo of the dish (plate cut out of the studio backdrop, transparent PNG/WebP).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={label} draggable={false} loading="lazy" decoding="async" className="pointer-events-none h-full w-full select-none rounded-2xl object-cover" />;
  }
  return <DrawnPlate art={art} label={label} seed={seed} />;
};

/** Drawn placeholder plate for products without a photo. */
const DrawnPlate = ({ art, label, seed }: Omit<Props, 'imageUrl'>) => {
  const imageUrl: string | null = null;
  const uid = useId().replace(/:/g, '');
  const style = art?.style ?? 'salad';
  const base = art?.base ?? '#6b8f3a';
  const accents = art?.accents?.length ? art.accents : ['#c0392b', '#f1c40f', '#ecf0f1'];
  const r = rand(seed * 7919 + 13);
  const isGlass = style === 'cocktail' || style === 'soda' || style === 'wine';

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`plate-${uid}`} cx="42%" cy="36%" r="70%">
          <stop offset="0%" stopColor={isGlass ? '#f3efe8' : '#ffffff'} />
          <stop offset="70%" stopColor={isGlass ? '#e6e0d6' : '#f6f2ec'} />
          <stop offset="100%" stopColor={isGlass ? '#d6cfc3' : '#e8e1d6'} />
        </radialGradient>
        <linearGradient id={`rim-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#efe9df" />
          <stop offset="100%" stopColor="#d8cfc1" />
        </linearGradient>
        <radialGradient id={`food-${uid}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={lighten(base, 0.35)} />
          <stop offset="60%" stopColor={base} />
          <stop offset="100%" stopColor={darken(base, 0.45)} />
        </radialGradient>
        <radialGradient id={`spec-${uid}`} cx="35%" cy="25%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id={`photo-${uid}`}>
          <circle cx="100" cy="100" r="94" />
        </clipPath>
        <clipPath id={`clip-${uid}`}>
          <circle cx="100" cy="100" r="74" />
        </clipPath>
        <filter id={`soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* plate body + liquid chrome rim */}
      <circle cx="100" cy="100" r="98" fill={`url(#rim-${uid})`} />
      <circle cx="100" cy="100" r="93" fill={`url(#plate-${uid})`} />
      <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(120,100,80,0.18)" strokeWidth="1" />

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <image href={imageUrl} x="6" y="6" width="188" height="188" clipPath={`url(#photo-${uid})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <g clipPath={`url(#clip-${uid})`}>{renderFood(style, uid, base, accents, r)}</g>
      )}

      <circle cx="100" cy="100" r="93" fill={`url(#spec-${uid})`} opacity="0.6" />
    </svg>
  );
};

export const PlateArt = memo(PlateArtImpl);

function renderFood(style: PlateArtSpec['style'], uid: string, base: string, accents: string[], r: () => number) {
  const a = (i: number) => accents[i % accents.length];
  const scatter = (count: number, radius: number, draw: (x: number, y: number, i: number) => React.ReactNode) =>
    Array.from({ length: count }, (_, i) => {
      const ang = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * radius;
      return draw(100 + Math.cos(ang) * dist, 100 + Math.sin(ang) * dist, i);
    });

  switch (style) {
    case 'salad':
      return (
        <g>
          {scatter(16, 46, (x, y, i) => (
            <ellipse key={`l${i}`} cx={x} cy={y} rx={14 + r() * 8} ry={7 + r() * 4} fill={i % 3 ? base : lighten(base, 0.25)} transform={`rotate(${r() * 180} ${x} ${y})`} opacity="0.95" />
          ))}
          {scatter(7, 40, (x, y, i) => (
            <circle key={`t${i}`} cx={x} cy={y} r={6 + r() * 3} fill={a(0)} stroke={darken(a(0), 0.3)} strokeWidth="1" />
          ))}
          {scatter(10, 44, (x, y, i) => (
            <rect key={`c${i}`} x={x} y={y} width={5 + r() * 4} height={4 + r() * 3} rx="1.5" fill={a(1)} transform={`rotate(${r() * 90} ${x} ${y})`} />
          ))}
          {scatter(18, 46, (x, y, i) => (
            <circle key={`s${i}`} cx={x} cy={y} r={1 + r() * 1.4} fill={a(2)} opacity="0.85" />
          ))}
        </g>
      );
    case 'steak':
    case 'burger':
      return (
        <g>
          {style === 'burger' ? (
            <>
              <circle cx="100" cy="100" r="50" fill={`url(#food-${uid})`} />
              {scatter(26, 40, (x, y, i) => <ellipse key={`se${i}`} cx={x} cy={y} rx="2.2" ry="1.2" fill="#f5e6c4" transform={`rotate(${r() * 180} ${x} ${y})`} />)}
              <path d="M52 108 Q100 128 148 108" stroke={a(0)} strokeWidth="6" fill="none" opacity="0.9" />
              {scatter(9, 30, (x, y, i) => <rect key={`f${i}`} x={x + 40} y={y - 40} width="22" height="5" rx="2" fill={a(1)} transform={`rotate(${r() * 60 - 30} ${x + 40} ${y - 40})`} />)}
            </>
          ) : (
            <>
              <path d="M58 88 Q70 58 112 62 Q150 68 146 104 Q140 138 100 140 Q62 138 58 112 Z" fill={`url(#food-${uid})`} />
              {[0, 1, 2, 3, 4].map((i) => (
                <line key={i} x1={68 + i * 16} y1="70" x2={58 + i * 16} y2="132" stroke={darken(base, 0.55)} strokeWidth="3" opacity="0.6" />
              ))}
              <path d="M70 120 Q104 104 140 118" stroke={a(0)} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.9" />
            </>
          )}
          {scatter(12, 70, (x, y, i) => <circle key={`h${i}`} cx={x} cy={y} r={1.2 + r()} fill={a(2)} opacity="0.8" />)}
        </g>
      );
    case 'fish':
    case 'shrimp':
      return (
        <g>
          <path d="M100 150 C60 150 50 100 64 86 C90 64 130 66 140 84 C152 108 136 150 100 150 Z" fill={a(1)} opacity="0.25" filter={`url(#soft-${uid})`} />
          {style === 'fish' ? (
            <>
              <path d="M48 100 Q90 60 140 92 L160 78 L156 106 L160 128 L140 112 Q90 140 48 100 Z" fill={`url(#food-${uid})`} />
              {[0, 1, 2, 3].map((i) => (
                <path key={i} d={`M${70 + i * 16} 86 Q${76 + i * 16} 100 ${70 + i * 16} 116`} stroke={darken(base, 0.35)} strokeWidth="2" fill="none" opacity="0.7" />
              ))}
            </>
          ) : (
            [0, 1, 2, 3, 4].map((i) => {
              const ang = (i / 5) * Math.PI * 2;
              const x = 100 + Math.cos(ang) * 28;
              const y = 100 + Math.sin(ang) * 28;
              return (
                <path key={i} d={`M${x - 14} ${y} a14 14 0 1 1 20 10`} stroke={base} strokeWidth="9" fill="none" strokeLinecap="round" transform={`rotate(${i * 72} ${x} ${y})`} />
              );
            })
          )}
          <circle cx="132" cy="62" r="11" fill={a(0)} />
          <circle cx="132" cy="62" r="7" fill={lighten(a(0), 0.4)} />
          {scatter(16, 58, (x, y, i) => <circle key={`g${i}`} cx={x} cy={y} r={1.4 + r() * 1.5} fill={a(2)} opacity="0.85" />)}
        </g>
      );
    case 'pizza':
      return (
        <g>
          <circle cx="100" cy="100" r="72" fill="#c88a45" />
          <circle cx="100" cy="100" r="62" fill={`url(#food-${uid})`} />
          {scatter(12, 50, (x, y, i) => <circle key={`p${i}`} cx={x} cy={y} r={6 + r() * 3} fill={a(0)} opacity="0.95" />)}
          {scatter(14, 52, (x, y, i) => <ellipse key={`m${i}`} cx={x} cy={y} rx={7} ry={5} fill="#f6efe0" opacity="0.9" transform={`rotate(${r() * 180} ${x} ${y})`} />)}
          {scatter(10, 50, (x, y, i) => <ellipse key={`b${i}`} cx={x} cy={y} rx={5} ry={2.6} fill={a(1)} transform={`rotate(${r() * 180} ${x} ${y})`} />)}
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="100" y1="100" x2={100 + Math.cos((i * Math.PI) / 4) * 72} y2={100 + Math.sin((i * Math.PI) / 4) * 72} stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <line key={`o${i}`} x1="100" y1="100" x2={100 - Math.cos((i * Math.PI) / 4) * 72} y2={100 - Math.sin((i * Math.PI) / 4) * 72} stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
          ))}
        </g>
      );
    case 'pasta':
    case 'soup':
      return (
        <g>
          <circle cx="100" cy="100" r="58" fill={`url(#food-${uid})`} />
          {style === 'pasta'
            ? Array.from({ length: 14 }, (_, i) => (
                <path key={i} d={`M${70 + r() * 20} ${70 + r() * 60} q${20 + r() * 20} ${-20 + r() * 40} ${40 + r() * 20} ${-10 + r() * 20}`} stroke={lighten(base, 0.35)} strokeWidth="3" fill="none" strokeLinecap="round" />
              ))
            : <circle cx="100" cy="100" r="40" fill="none" stroke={lighten(base, 0.3)} strokeWidth="2" opacity="0.6" />}
          {scatter(8, 40, (x, y, i) => <circle key={`x${i}`} cx={x} cy={y} r={3 + r() * 3} fill={a(0)} />)}
          {scatter(16, 46, (x, y, i) => <circle key={`h${i}`} cx={x} cy={y} r={1.2 + r()} fill={a(2)} />)}
        </g>
      );
    case 'dessert':
      return (
        <g>
          <path d="M60 92 L140 78 L146 118 L66 132 Z" fill={`url(#food-${uid})`} />
          <path d="M60 92 L140 78 L140 86 L60 100 Z" fill={lighten(base, 0.3)} />
          {scatter(9, 46, (x, y, i) => <circle key={`b${i}`} cx={x} cy={y} r={4 + r() * 2.5} fill={a(0)} />)}
          <path d="M44 150 Q100 120 156 150" stroke={a(1)} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
          {scatter(18, 60, (x, y, i) => <circle key={`d${i}`} cx={x} cy={y} r={0.9 + r() * 0.8} fill={a(2)} />)}
        </g>
      );
    case 'cocktail':
    case 'soda':
    case 'wine':
    default:
      return (
        <g>
          <circle cx="100" cy="100" r="56" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
          <circle cx="100" cy="100" r="52" fill={`url(#food-${uid})`} opacity="0.92" />
          {style !== 'wine' &&
            [0, 1, 2].map((i) => {
              const x = 82 + r() * 30;
              const y = 82 + r() * 30;
              return <rect key={i} x={x} y={y} width="18" height="18" rx="4" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.5)" transform={`rotate(${r() * 90} ${x + 9} ${y + 9})`} />;
            })}
          {style === 'cocktail' && (
            <>
              <circle cx="126" cy="76" r="15" fill={a(0)} />
              <circle cx="126" cy="76" r="11" fill={lighten(a(0), 0.35)} />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <line key={i} x1="126" y1="76" x2={126 + Math.cos((i * Math.PI) / 3) * 11} y2={76 + Math.sin((i * Math.PI) / 3) * 11} stroke={a(0)} strokeWidth="1" />
              ))}
              <ellipse cx="80" cy="120" rx="14" ry="6" fill={a(1)} transform="rotate(-35 80 120)" />
            </>
          )}
          {style === 'soda' && <line x1="70" y1="140" x2="128" y2="68" stroke={a(0)} strokeWidth="5" strokeLinecap="round" />}
          {scatter(14, 44, (x, y, i) => <circle key={`bb${i}`} cx={x} cy={y} r={0.8 + r() * 1.2} fill="rgba(255,255,255,0.6)" />)}
        </g>
      );
  }
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex: string, amt: number) {
  const [r, g, b] = parseHex(hex);
  return toHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
}

function darken(hex: string, amt: number) {
  const [r, g, b] = parseHex(hex);
  return toHex([r * (1 - amt), g * (1 - amt), b * (1 - amt)]);
}
