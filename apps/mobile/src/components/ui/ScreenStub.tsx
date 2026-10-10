// Écran provisoire : indique le ticket à réaliser. À SUPPRIMER écran par écran au fil du développement.
import { Card } from './Card';
import { Screen } from './Screen';
import { Text } from './Text';

export function ScreenStub({
  title,
  ticket,
  description,
}: {
  title: string;
  ticket: string;
  description: string;
}) {
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Card variant="outlined">
        <Text variant="overline" tone="primary">
          À réaliser : {ticket}
        </Text>
        <Text tone="muted">{description}</Text>
      </Card>
    </Screen>
  );
}
