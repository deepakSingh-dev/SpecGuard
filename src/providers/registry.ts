import type { Provider } from "./provider";

/**
 * Resolves a provider id (as configured in settings) to a concrete Provider
 * instance. Pipeline stages ask the registry for "the provider for stage X"
 * rather than constructing one directly.
 */
export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  resolve(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) {
      const known = [...this.providers.keys()].join(", ") || "(none registered)";
      throw new Error(`Unknown provider id "${id}". Known providers: ${known}`);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}
