// Fournisseur Ollama (L3-05) : un modèle de langage qui tourne EN LOCAL (https://ollama.com), sans clé ni
// service externe payant. Appel HTTP avec le `fetch` de Node 20 : aucune dépendance ajoutée.
// Les phrases envoyées ne contiennent que des faits agrégés (« 2 mesures sous le seuil bas… »), jamais de
// nom, d'email ni d'identifiant. OLLAMA_URL ne doit pointer que vers un serveur que vous contrôlez.
import { LlmError, type LlmProvider, type LlmRequest } from './llm-provider';

export interface OllamaOptions {
  /** Adresse du serveur Ollama, ex. http://localhost:11434 */
  url: string;
  /** Modèle installé (`ollama pull llama3.1`). */
  model: string;
  /** Temps maximal d'une génération, en millisecondes. */
  timeoutMs: number;
}

/** Réponse de POST /api/generate (seul le champ utile est lu). */
interface GenerateResponse {
  response?: unknown;
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly model: string;

  constructor(
    private readonly options: OllamaOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.model = options.model;
  }

  async generate({ system, prompt, signal }: LlmRequest): Promise<string> {
    // Délai propre au fournisseur, et arrêt demandé par l'appelant s'il y en a un (le premier des deux).
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(new URL('/api/generate', this.options.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          system,
          prompt,
          format: 'json', // Ollama garantit un JSON valide
          stream: false,
          // Peu de créativité : on veut une reformulation fidèle, pas une invention.
          options: { temperature: 0.2 },
        }),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new LlmError('timeout');
      throw new LlmError('unreachable'); // serveur arrêté, mauvaise adresse…
    }
    if (!res.ok) throw new LlmError('http', `statut ${res.status}`);
    let body: GenerateResponse;
    try {
      body = (await res.json()) as GenerateResponse;
    } catch {
      throw new LlmError('format', 'réponse illisible');
    }
    if (typeof body.response !== 'string')
      throw new LlmError('format', 'champ « response » absent');
    return body.response;
  }
}
