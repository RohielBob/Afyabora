// Menu « Langue et apparence » de l'en-tête (toutes les pages, connecté ou non) : langue du portail
// (8 langues, comme Réglages → Langue du mobile), thème Clair / Sombre / Automatique et couleur d'accent
// (comme Réglages → Apparence, ADR-0008). Le changement est immédiat et gardé dans ce navigateur
// (src/i18n/index.ts, src/theme/appearance.ts).
//  - Le bouton montre la langue affichée (globe + « Français ») : un médecin qui ne lit pas la langue
//    actuelle le reconnaît. Il ouvre un panneau ; Échap, un clic à côté ou « Fermer » le referment, et
//    le focus revient sur le bouton.
//  - Changer de langue redessine tout le portail (src/main.tsx) : le panneau se rouvre de lui-même, le
//    focus sur la liste des langues, pour que le médecin ne perde pas sa place.
//  - Un choix n'est jamais indiqué par la couleur seule : bouton surligné + coche + `aria-pressed`.
import { ACCENT_NAMES, buildTheme } from '@glyka/ui-tokens';
import { useEffect, useId, useRef, useState } from 'react';
import {
  LANGUAGES,
  browserLanguage,
  fill,
  languageInfo,
  setLanguagePreference,
  texts,
  useLanguage,
  useLanguagePreference,
  type LanguagePreference,
} from '@/i18n';
import { THEME_PREFERENCES, setAppearance, useAppearance } from '@/theme/appearance';
import { useResolvedMode } from '@/theme/theme';

const t = texts.appearance;

/** Rouvrir le panneau après le changement de langue (le portail vient d'être redessiné). */
let reopenAfterLanguageChange = false;

function GlobeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[18px] shrink-0">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M2.5 10h15" />
        <path d="M10 2.5c2.1 2.1 3.1 4.6 3.1 7.5s-1 5.4-3.1 7.5c-2.1-2.1-3.1-4.6-3.1-7.5s1-5.4 3.1-7.5Z" />
      </g>
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 ${className}`}>
      <path
        d="M5.5 10.4l3 3 6-6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppearanceMenu() {
  // Lu une seule fois : ce panneau est-il rouvert juste après un changement de langue ?
  const [reopened] = useState(() => {
    const reopen = reopenAfterLanguageChange;
    reopenAfterLanguageChange = false;
    return reopen;
  });
  const [open, setOpen] = useState(reopened);
  const { preference, accent } = useAppearance();
  const language = useLanguage();
  const languagePreference = useLanguagePreference();
  const languageSelectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const mode = useResolvedMode();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fermeture : Échap (le focus revient au bouton) ou clic en dehors du menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Panneau rouvert après un changement de langue : le focus revient sur la liste des langues (même si
  // la page, redessinée, a donné le focus à un autre champ).
  useEffect(() => {
    if (reopened) selectRef.current?.focus();
  }, [reopened]);

  const current = languageInfo(language);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={[
          'transition-afy inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[14px] font-semibold',
          open ? 'bg-surface-muted text-ink' : 'text-muted hover:bg-surface-muted hover:text-ink',
        ].join(' ')}
      >
        <GlobeIcon />
        <span aria-hidden="true" className="hidden sm:inline">
          {current.nativeName}
        </span>
        <span className="sr-only">{`${t.button} : ${current.nativeName}`}</span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t.title}
          className="animate-fade absolute top-full right-0 z-30 mt-2 flex max-h-[calc(100dvh-6rem)] w-[min(320px,calc(100vw-2rem))] flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_12px_40px_-12px_rgb(16_19_24/0.35)]"
        >
          <div className="flex flex-col gap-1">
            <p className="text-[16px] font-bold text-ink">{t.title}</p>
            <p className="text-[13px] text-muted">{t.intro}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={languageSelectId} className="text-[13px] font-semibold text-muted">
              {t.language}
            </label>
            <select
              id={languageSelectId}
              ref={selectRef}
              value={languagePreference}
              onChange={(event) => {
                reopenAfterLanguageChange = true;
                setLanguagePreference(event.target.value as LanguagePreference);
              }}
              className="transition-afy h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[14px] font-semibold text-ink hover:border-ink"
            >
              <option value="system">
                {fill(t.languageSystem, { name: languageInfo(browserLanguage()).nativeName })}
              </option>
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code} lang={option.code}>
                  {option.nativeName}
                </option>
              ))}
            </select>
            {current.reviewed ? null : <p className="text-[12px] text-subtle">{t.reviewing}</p>}
            {language === 'fr' ? null : <p className="text-[12px] text-subtle">{t.frenchOnly}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-muted">{t.theme}</p>
            <div
              role="group"
              aria-label={t.theme}
              className="grid grid-cols-3 rounded-xl border border-line bg-surface-muted p-0.5"
            >
              {THEME_PREFERENCES.map((value) => {
                const selected = preference === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAppearance({ preference: value })}
                    className={[
                      'transition-afy rounded-[10px] px-2 py-2 text-[13px] font-semibold',
                      selected
                        ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_19_24/0.12)]'
                        : 'text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {t[value]}
                  </button>
                );
              })}
            </div>
            {preference === 'system' ? (
              <p className="text-[12px] text-subtle">
                {fill(t.systemHint, { mode: mode === 'dark' ? t.systemDark : t.systemLight })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-muted">{t.accent}</p>
            <div role="group" aria-label={t.accent} className="grid grid-cols-4 gap-2">
              {ACCENT_NAMES.map((name) => {
                const selected = accent === name;
                // Pastille = couleur du bouton principal de ce thème, dans le mode affiché.
                const { primary, onPrimary } = buildTheme(mode, name).colors;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAppearance({ accent: name })}
                    className={[
                      'transition-afy flex flex-col items-center gap-1.5 rounded-xl px-1 py-2',
                      selected ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-9 items-center justify-center rounded-full',
                        selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface-raised' : '',
                      ].join(' ')}
                      style={{ backgroundColor: primary, color: onPrimary }}
                    >
                      {selected ? <CheckIcon /> : null}
                    </span>
                    <span
                      className={`text-[12px] ${selected ? 'font-bold text-ink' : 'font-medium text-muted'}`}
                    >
                      {t.accents[name]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            className="transition-afy self-end rounded-lg px-3 py-1.5 text-[13px] font-semibold text-primary-text hover:bg-primary-soft"
          >
            {t.close}
          </button>
        </div>
      ) : null}
    </div>
  );
}
