// « Mon profil médical » : le résumé affiche le profil enregistré, et chaque « Modifier » ouvre la bonne étape.
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '@/theme';
import { ProfileSummary } from '../components/ProfileSummary';
import { profileToDraft } from '../wizard';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const draft = profileToDraft({
  firstName: 'Amani',
  lastName: 'Demo',
  birthDate: '1980-05-14',
  sex: 'F',
  diabetesType: 'TYPE_1',
  diagnosisYear: 2012,
  preferredUnit: 'G_L',
  thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
  thresholdsReviewedByClinician: false,
  emergencyContact: { name: 'Bisimwa', phone: '+243 81 000 0000' },
});

function render(onEdit: (step: string) => void, intro?: string): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <ThemeProvider>
        <ProfileSummary draft={draft} onEdit={onEdit} intro={intro} />
      </ThemeProvider>,
    );
  });
  return tree!;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string);

describe('ProfileSummary', () => {
  it('affiche les valeurs du profil enregistré', () => {
    const shown = texts(render(() => undefined));
    expect(shown).toContain('Amani Demo');
    expect(shown).toContain('14/05/1980');
    expect(shown).toContain('2012');
    expect(shown).toContain('0,70 – 1,80 g/L');
    expect(shown).toContain('Bisimwa · +243 81 000 0000');
  });

  it('chaque « Modifier » ouvre son étape (identité, diabète, seuils, contacts)', () => {
    const onEdit = jest.fn();
    const tree = render(onEdit);
    const buttons = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    // Un bouton par partie, dans l'ordre de l'assistant.
    const unique = buttons.filter(
      (b, i) => buttons.findIndex((o) => o.props.onPress === b.props.onPress) === i,
    );
    expect(unique).toHaveLength(4);
    act(() => unique.forEach((button) => button.props.onPress()));
    expect(onEdit.mock.calls.map(([step]) => step)).toEqual([
      'identity',
      'diabetes',
      'thresholds',
      'contacts',
    ]);
  });

  it('phrase d’introduction : seulement si elle est donnée (assistant), pas sur l’onglet Profil', () => {
    expect(texts(render(() => undefined, 'Vérifiez vos informations'))).toContain(
      'Vérifiez vos informations',
    );
    expect(texts(render(() => undefined))).not.toContain('Vérifiez vos informations');
  });
});
