// Logo Afyabora (goutte rouge, cœur blanc, tracé de pouls) — même dessin que le mobile
// (apps/mobile/src/components/brand/Logo.tsx) et que public/favicon.svg.
import { useId } from 'react';
import { brand } from '@glyka/ui-tokens';
import { texts } from '@/i18n';

const DROP_PATH =
  'M 232 0 C 189 85 0 244 0 409 A 228.5 228.5 0 0 0 457 409 C 457 244 275 85 232 0 Z';
const HEART_PATH =
  'M 229 553 C 157 493 83 441 83 369 C 83 329 112 304 148 304 C 185 304 211 325 229 355 C 247 325 273 304 310 304 C 346 304 375 329 375 369 C 375 441 301 493 229 553 Z';
const PULSE_POINTS =
  '97,432 177,432 189,409 203,367 231,487 251,401 265,432 277,404 291,432 361,432';

/** La goutte seule ; `size` = hauteur en pixels. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  // Identifiant de dégradé unique : deux logos sur la page ne se disputent pas le même dégradé.
  const gradientId = `afyDrop${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  return (
    <svg
      role="img"
      aria-label={`Logo ${texts.app.name}`}
      viewBox="0 0 457 637"
      height={size}
      width={(size * 457) / 637}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0.08" y1="0.15" x2="0.95" y2="0.95">
          <stop offset="0" stopColor={brand.redLight} />
          <stop offset="0.45" stopColor={brand.red} />
          <stop offset="1" stopColor={brand.redDark} />
        </linearGradient>
      </defs>
      <path d={DROP_PATH} fill={`url(#${gradientId})`} />
      <path d={HEART_PATH} fill="#FFFFFF" />
      <polyline
        points={PULSE_POINTS}
        fill="none"
        stroke="#B3002A"
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo + nom (« Afya » marine, « bora » corail ; « Afya » clair en mode sombre) + mention de l'espace. */
export function Wordmark({ size = 34, showSpace = true }: { size?: number; showSpace?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[19px] font-extrabold tracking-[-0.4px]">
          <span className="text-[var(--afy-wordmark)]">Afya</span>
          <span style={{ color: brand.coral }}>bora</span>
        </span>
        {showSpace ? (
          <span className="mt-1 text-[11px] font-bold tracking-[1.2px] text-muted uppercase">
            {texts.app.space}
          </span>
        ) : null}
      </span>
    </span>
  );
}
