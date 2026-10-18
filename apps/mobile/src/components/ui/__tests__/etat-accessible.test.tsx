// Accessibilité sur le web : React Native Web ne traduit pas `accessibilityState` en `aria-checked`, si bien
// qu'un lecteur d'écran ne savait pas quelle case était cochée. Chaque composant donne donc aussi
// `aria-checked` (pour le web) tout en gardant `accessibilityState` (pour Android et iOS).
import type { ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '@/theme';
import { Checkbox } from '../Checkbox';
import { ChoiceGroup } from '../ChoiceGroup';
import { ColorSwatch } from '../ColorSwatch';
import { SegmentedControl } from '../SegmentedControl';
import { Toggle } from '../Toggle';

// Les icônes chargent leur police en arrière-plan, ce qui produit des avertissements sans rapport avec ces
// tests : on les remplace par un élément vide.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const noop = () => undefined;

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<ThemeProvider>{element}</ThemeProvider>);
  });
  return renderer as ReactTestRenderer;
}

/**
 * Éléments touchables qui portent le rôle demandé, tels que nos composants les écrivent. On garde le plus
 * haut de chaque branche : plus bas, React Native fusionne lui-même `aria-checked` dans `accessibilityState`.
 */
function byRole(renderer: ReactTestRenderer, role: string): ReactTestInstance[] {
  return renderer.root.findAll(
    (node) =>
      node.props.accessibilityRole === role && node.parent?.props.accessibilityRole !== role,
  );
}

/** Le seul élément qui porte ce rôle (le test échoue s'il y en a zéro ou plusieurs). */
function oneByRole(renderer: ReactTestRenderer, role: string): ReactTestInstance {
  const [only, ...others] = byRole(renderer, role);
  expect(only).toBeDefined();
  expect(others).toHaveLength(0);
  return only as ReactTestInstance;
}

describe('état exposé aux lecteurs d’écran (web et téléphone)', () => {
  it.each([true, false])('Checkbox cochée = %s', (checked) => {
    const box = oneByRole(
      render(
        <Checkbox
          checked={checked}
          onChange={noop}
          label="J’accepte"
          accessibilityLabel="J’accepte"
        />,
      ),
      'checkbox',
    );
    expect(box.props['aria-checked']).toBe(checked);
    expect(box.props.accessibilityState).toMatchObject({ checked });
  });

  it.each([true, false])('Toggle activé = %s', (value) => {
    const toggle = oneByRole(
      render(<Toggle value={value} onChange={noop} label="Rappels" />),
      'switch',
    );
    expect(toggle.props['aria-checked']).toBe(value);
    expect(toggle.props.accessibilityState).toMatchObject({ checked: value });
  });

  it.each([true, false])('ColorSwatch choisie = %s', (selected) => {
    const swatch = oneByRole(
      render(<ColorSwatch color="#E4002B" label="Rubis" selected={selected} onPress={noop} />),
      'radio',
    );
    expect(swatch.props['aria-checked']).toBe(selected);
    expect(swatch.props.accessibilityState).toMatchObject({ selected });
  });

  const options = [
    { value: 'mg', label: 'mg/dL' },
    { value: 'mmol', label: 'mmol/L' },
  ] as const;

  it('ChoiceGroup : seule l’option choisie est cochée', () => {
    const radios = byRole(
      render(<ChoiceGroup label="Unité" options={options} value="mmol" onChange={noop} />),
      'radio',
    );
    expect(radios.map((r) => r.props['aria-checked'])).toEqual([false, true]);
    expect(radios.map((r) => r.props.accessibilityState.selected)).toEqual([false, true]);
  });

  it('ChoiceGroup sans choix : aucune option cochée', () => {
    const radios = byRole(
      render(<ChoiceGroup label="Unité" options={options} value={null} onChange={noop} />),
      'radio',
    );
    expect(radios.map((r) => r.props['aria-checked'])).toEqual([false, false]);
  });

  it('SegmentedControl : seule l’option choisie est cochée', () => {
    const radios = byRole(
      render(
        <SegmentedControl
          options={options}
          value="mg"
          onChange={noop}
          accessibilityLabel="Unité"
        />,
      ),
      'radio',
    );
    expect(radios.map((r) => r.props['aria-checked'])).toEqual([true, false]);
    expect(radios.map((r) => r.props.accessibilityState.selected)).toEqual([true, false]);
  });
});
