// L8-07 : « tirer pour rafraîchir » sur téléphone seulement. Sur le web, React Native Web enveloppait la
// liste dans un conteneur sans hauteur et l'écran s'affichait vide.
import { Platform } from 'react-native';
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
});
