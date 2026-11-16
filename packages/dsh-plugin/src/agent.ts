import {
  registerSpeakToolsAndPrompt,
  type DshSystemPromptServiceLike,
  type DshToolsServiceLike,
} from './dsh-tools.ts';
import type { StyleSliderConfig } from './weights.ts';

export interface NbSpeakHostServiceLike {
  getSliderConfig(): StyleSliderConfig;
  getCustomSoul(): string;
}

export interface AgentContextLike {
  readonly tools: DshToolsServiceLike;
  readonly systemPrompt: DshSystemPromptServiceLike;
  readonly nbSpeak?: NbSpeakHostServiceLike;
  effect(factory: () => () => void): void;
}

export const name = 'nb-speak-agent';
export const inject = {
  tools: { required: true },
  systemPrompt: { required: true },
  nbSpeak: { required: false },
};

export function apply(ctx: AgentContextLike): void {
  ctx.effect(() =>
    registerSpeakToolsAndPrompt(ctx.tools, ctx.systemPrompt, {
      getSliderConfig: () => ctx.nbSpeak?.getSliderConfig() ?? { preset: 'neutral_peer' },
      getCustomSoul: () => ctx.nbSpeak?.getCustomSoul() ?? '',
    }),
  );
}
