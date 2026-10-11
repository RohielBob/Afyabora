// Choix du fournisseur de modèle de langage à partir de la configuration (L3-05).
//   LLM_PROVIDER=none   (défaut, ADR-0005) : aucun modèle, gabarits du moteur seulement.
//   LLM_PROVIDER=ollama : modèle LOCAL via Ollama (OLLAMA_URL, LLM_MODEL, LLM_TIMEOUT_MS).
import type { ConfigService } from '@nestjs/config';
import type { LlmProvider } from './llm-provider';
import { OllamaProvider } from './ollama.provider';

export function createLlmProvider(config: ConfigService): LlmProvider | null {
  const provider = config.get<string>('LLM_PROVIDER') ?? 'none';
  if (provider === 'ollama') {
    return new OllamaProvider({
      url: config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434',
      model: config.get<string>('LLM_MODEL') ?? 'mistral-nemo',
      timeoutMs: config.get<number>('LLM_TIMEOUT_MS') ?? 90_000,
    });
  }
  return null;
}
