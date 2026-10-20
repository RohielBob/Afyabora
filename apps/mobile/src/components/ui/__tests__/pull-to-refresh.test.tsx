// L8-07 : « tirer pour rafraîchir » sur téléphone seulement. Sur le web, React Native Web enveloppait la
// liste dans un conteneur sans hauteur et l'écran s'affichait vide.
// Correctif Android (2026-10-20) : React Native place la LISTE DANS l'indicateur (recopie avec `children`
// et `style`) ; l'indicateur doit les transmettre, sinon l'écran entier est vide sur le téléphone.
import { cloneElement, type ReactElement } from 'react';
import { Platform, RefreshControl, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '@/theme';
import { PullToRefresh, pullToRefresh } from '../PullToRefresh';

const props = { refreshing: true, onRefresh: () => undefined };

describe('pullToRefresh', () => {
  afterEach(() => jest.restoreAllMocks());

  it('téléphone : l’indicateur, avec l’état et l’action donnés', () => {
    const element = pullToRefresh(props);
    expect(element?.type).toBe(PullToRefresh);
    expect(element?.props).toEqual(props);
  });

  it('web : rien (sinon l’écran est vide)', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    expect(pullToRefresh(props)).toBeUndefined();
  });

  it('écran sans « tirer pour rafraîchir » : rien', () => {
    expect(pullToRefresh(undefined)).toBeUndefined();
  });

  it('Android : la liste placée DANS l’indicateur reste affichée, avec sa taille', () => {
    // Ce que fait la ScrollView de React Native sur Android avec `refreshControl`.
    const element = pullToRefresh(props) as ReactElement;
    const wrapped = cloneElement(
      element,
      { style: { flex: 1 } } as object,
      <Text testID="contenu">Contenu de l’écran</Text>,
    );
    let tree: ReactTestRenderer | undefined;
    act(() => {
      tree = create(<ThemeProvider>{wrapped}</ThemeProvider>);
    });
    const control = tree!.root.findByType(RefreshControl);
    expect(control.props.style).toEqual({ flex: 1 });
    expect(control.props.refreshing).toBe(true);
    // La liste est bien transmise à l'indicateur natif (c'est lui qui l'affiche sur le téléphone).
    expect((control.props.children as ReactElement<{ testID: string }>).props.testID).toBe(
      'contenu',
    );
  });
});
