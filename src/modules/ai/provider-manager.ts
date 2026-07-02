import logger from "../../config/logger.js";
import type {
  AIProvider,
  AIWordResult,
  AISentenceResult,
  GrammarAssistantInput,
  GrammarAssistantResult,
} from "./ai.types.js";
import { GeminiProvider } from "./providers/gemini.provider.js";

/**
 * AIProviderManager (Phase 26A) — the single entry point for all AI requests.
 *
 * Today it holds one provider (Gemini). Future providers (Claude, OpenAI, Groq)
 * are added by pushing them into `providers` — callers never change. Each
 * lookup tries available providers in order and returns the first valid result
 * along with the provider name (for cache attribution).
 */
class AIProviderManager {
  private readonly providers: AIProvider[] = [
    new GeminiProvider(),
    // Future: new ClaudeProvider(), new OpenAIProvider(), new GroqProvider(),
  ];

  /** True when at least one provider is configured. */
  isAvailable(): boolean {
    return this.providers.some((p) => p.isAvailable());
  }

  /** Name of the first configured provider, or null if none are — used by
   *  the AI health check so the extension can display which provider is
   *  actually active without making a real (quota-consuming) request. */
  activeProviderName(): string | null {
    return this.providers.find((p) => p.isAvailable())?.name ?? null;
  }

  async lookupWord(query: string): Promise<{ result: AIWordResult; provider: string } | null> {
    for (const p of this.providers) {
      if (!p.isAvailable()) continue;
      try {
        const result = await p.lookupWord(query);
        if (result && result.meaning) return { result, provider: p.name };
      } catch (err) {
        logger.warn("AI provider word lookup threw", { provider: p.name, error: (err as Error).message });
      }
    }
    return null;
  }

  async lookupSentence(query: string): Promise<{ result: AISentenceResult; provider: string } | null> {
    for (const p of this.providers) {
      if (!p.isAvailable()) continue;
      try {
        const result = await p.lookupSentence(query);
        if (result && result.translation) return { result, provider: p.name };
      } catch (err) {
        logger.warn("AI provider sentence lookup threw", { provider: p.name, error: (err as Error).message });
      }
    }
    return null;
  }

  async lookupGrammar(
    input: GrammarAssistantInput
  ): Promise<{ result: GrammarAssistantResult; provider: string } | null> {
    for (const p of this.providers) {
      if (!p.isAvailable() || !p.lookupGrammar) continue;
      try {
        const result = await p.lookupGrammar(input);
        if (result && result.explanation) return { result, provider: p.name };
      } catch (err) {
        logger.warn("AI provider grammar lookup threw", { provider: p.name, error: (err as Error).message });
      }
    }
    return null;
  }
}

export const aiProviderManager = new AIProviderManager();
