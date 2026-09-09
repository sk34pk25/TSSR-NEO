import type { WorldState } from '@tssr/contracts';
import type { VariantParams } from './variants.ts';

export interface ScenarioContext {
  seed: number;
  params: VariantParams;
}

export interface ScenarioFactory {
  id: string;
  /** Construit un monde neuf et deterministe pour cette graine et ces parametres. */
  build(context: ScenarioContext): WorldState;
}

/** Registre des scenarios techniques fournis par le Core et par les modules. */
export class ScenarioRegistry {
  private readonly factories = new Map<string, ScenarioFactory>();

  register(factory: ScenarioFactory): this {
    if (this.factories.has(factory.id)) {
      throw new Error(`Scenario deja enregistre : ${factory.id}`);
    }
    this.factories.set(factory.id, factory);
    return this;
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  get(id: string): ScenarioFactory | undefined {
    return this.factories.get(id);
  }

  ids(): string[] {
    return [...this.factories.keys()].sort();
  }

  build(id: string, context: ScenarioContext): WorldState {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Scenario inconnu : ${id}`);
    return factory.build(context);
  }
}
