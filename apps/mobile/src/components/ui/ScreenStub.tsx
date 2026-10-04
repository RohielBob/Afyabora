// Écran provisoire : indique le ticket à réaliser. À SUPPRIMER écran par écran au fil du développement.
import { Screen } from './Screen';
import { Card } from './Card';
import { Text } from './Text';

export function ScreenStub({ title, ticket, description }: { title: string; ticket: string; description: string }) {
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Card>
        <Text variant="caption" muted>
          À réaliser : {ticket}
        </Text>
        <Text>{description}</Text>
      </Card>
    </Screen>
  );
}
