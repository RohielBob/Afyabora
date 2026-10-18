// Onglets du dossier (L5-12) : seuls les onglets des catégories partagées existent (tabsFor). Accessibles
// au clavier comme des onglets natifs : flèches gauche/droite, Début, Fin ; un seul onglet dans l'ordre de
// tabulation (le choisi), puis son contenu.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import type { RecordTab } from './view';

export const tabId = (tab: RecordTab) => `record-tab-${tab}`;
export const panelId = (tab: RecordTab) => `record-panel-${tab}`;

export function RecordTabs({
  tabs,
  current,
  onSelect,
}: {
  tabs: readonly RecordTab[];
  current: RecordTab;
  onSelect: (tab: RecordTab) => void;
}) {
  const refs = useRef(new Map<RecordTab, HTMLButtonElement>());

  const move = (event: KeyboardEvent, index: number) => {
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    const tab = tabs[target] as RecordTab;
    onSelect(tab);
    refs.current.get(tab)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={fr.record.tabsA11y}
      className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {tabs.map((tab, index) => {
        const selected = tab === current;
        return (
          <button
            key={tab}
            ref={(node) => {
              if (node) refs.current.set(tab, node);
              else refs.current.delete(tab);
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-selected={selected}
            aria-controls={panelId(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => move(event, index)}
            className={[
              'transition-afy -mb-px shrink-0 border-b-2 px-3 py-3 text-[14px] font-semibold whitespace-nowrap',
              selected
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            {fr.record.tabs[tab]}
          </button>
        );
      })}
    </div>
  );
}

/** Contenu de l'onglet choisi, relié à son onglet pour les lecteurs d'écran. */
export function TabPanel({ tab, children }: { tab: RecordTab; children: ReactNode }) {
  return (
    <section
      role="tabpanel"
      id={panelId(tab)}
      aria-labelledby={tabId(tab)}
      tabIndex={0}
      className="animate-fade flex flex-col gap-6 rounded-sm focus-visible:outline-offset-4"
    >
      {children}
    </section>
  );
}
