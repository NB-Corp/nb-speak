import { startDshOpenAiBridge,                          } from './http-bridge.js';
                                                                           
import {
  resolveUpstreamModelSpec,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
                      
                          
                      
                         
} from './weights.js';

                                  
           
 

                                    
                                              
                                                          
 

export const name = 'nb-speak';
export const inject = ['credentials'];

                         
                                                                      
                                                                         
                                                  
                                                 
                                                    
                                                         
                                                          
                                                       
                                                            
                                                            
                                                            
                                                    
                                                     
                                                                         
                                  
                              
                              
 

/**
 * Lightweight Cordis-compatible config descriptor (uses `@deepseek-ai/schemastery` automatically
 * when loaded inside DSH, while staying importable in zero-dependency Node test/CLI environments).
 */
async function buildSchemaIfAvailable()                   {
  try {
    const mod = await import('@deepseek-ai/schemastery');
    const z = mod.default;
    const slider = (def        , desc        ) =>
      z.number().min(SLIDER_MIN).max(SLIDER_MAX).step(SLIDER_STEP).default(def).description(desc).volatile();
    return z.object({
      runtimeMode: z
        .union(['skill', 'voice-model']         )
        .default('skill')
        .description('Mode A (skill): standard cloud LLMs + chat-human + send_message; Mode B (voice-model): Split-Phase / 4B voice translator')
        .volatile(),
      preset: z
        .union(['neutral_peer', 'sharp_lead', 'warm_companion', 'calm_sre', 'custom']         )
        .default('neutral_peer')
        .description('Persona preset (select custom to blend the 5 continuous style sliders below)')
        .volatile(),
      clarity: slider(1.0, 'Axis 0: Direct factual clarity (w0)'),
      warmth: slider(0.2, 'Axis 1: Conversational warmth (w1)'),
      sharp_wit: slider(0.1, 'Axis 2: Candid understatement & dry wit (w2)'),
      calm_grounding: slider(0.2, 'Axis 3: Calm incident grounding (w3)'),
      concise_cadence: slider(0.3, 'Axis 4: Mobile thumb-typed brevity bias (w4)'),
      cloudBaseUrl: z.string().default('https://api.deepseek.com/v1').description('Mode A upstream OpenAI-compatible URL').volatile(),
      defaultCloudModel: z.string().default('deepseek-chat').description('Mode A upstream model ID').volatile(),
      voiceModelBaseUrl: z.string().default('http://127.0.0.1:18088/v1').description('Mode B Split-Phase / 4B voice-model URL').volatile(),
      defaultVoiceModel: z.string().default('nb-speak-voice-v1').description('Mode B base model prefix').volatile(),
      apiKeyRef: z.string().default('NB_SPEAK_API_KEY').description('Upstream credential env/store key').volatile(),
      customSoul: z.string().default('').description('Optional custom SOUL.md / persona prompt override').volatile(),
      bubbleJoinMode: z.union(['paragraph', 'newline']         ).default('paragraph').volatile(),
      bridgeEnabled: z.boolean().default(true),
      bridgeHost: z.string().default('127.0.0.1'),
      bridgePort: z.number().min(0).max(65535).default(18091),
    });
  } catch {
    return {
      type: 'object',
      defaults: {
        runtimeMode: 'skill',
        preset: 'neutral_peer',
        bridgeEnabled: true,
        bridgeHost: '127.0.0.1',
        bridgePort: 18091,
      },
    };
  }
}

export const Config = await buildSchemaIfAvailable();

function readVal   (field                                 , fallback   )    {
  if (field !== null && (typeof field === 'object' || typeof field === 'function') && 'get' in (field          )) {
    const val = (field                   ).get();
    return (val === undefined ? fallback : val)     ;
  }
  return (field                 ) ?? fallback;
}

export async function apply(
  ctx                   ,
  config                  = {},
  overrides                                                                                                  = {},
)                {
  const env = overrides.env ?? process.env;

  const getSliderConfig = ()                    => ({
    preset: readVal(config.preset, 'neutral_peer'),
    clarity: readVal(config.clarity, 1.0),
    warmth: readVal(config.warmth, 0.2),
    sharp_wit: readVal(config.sharp_wit, 0.1),
    calm_grounding: readVal(config.calm_grounding, 0.2),
    concise_cadence: readVal(config.concise_cadence, 0.3),
  });

  const getUpstreamConnection = async ()                                      => {
    const keyName = readVal(config.apiKeyRef, 'NB_SPEAK_API_KEY');
    const resolvedKey = String(env[keyName] ?? env.NB_SPEAK_API_KEY ?? env.DEEPSEEK_API_KEY ?? env.OPENAI_API_KEY ?? '');
    return {
      mode: readVal(config.runtimeMode, 'skill'),
      cloudBaseUrl: readVal(config.cloudBaseUrl, env.NB_SPEAK_UPSTREAM_URL ?? 'https://api.deepseek.com/v1'),
      cloudApiKey: resolvedKey,
      defaultCloudModel: readVal(config.defaultCloudModel, env.NB_SPEAK_MODEL ?? 'deepseek-chat'),
      voiceModelBaseUrl: readVal(config.voiceModelBaseUrl, env.NB_SPEAK_VOICE_URL ?? 'http://127.0.0.1:18088/v1'),
      voiceModelApiKey: String(env.NB_SPEAK_VOICE_API_KEY ?? resolvedKey),
      defaultVoiceModel: readVal(config.defaultVoiceModel, 'nb-speak-voice-v1'),
    };
  };

  let bridgeServer                                 ;
  if (config.bridgeEnabled ?? true) {
    bridgeServer = await startDshOpenAiBridge({
      host: config.bridgeHost ?? '127.0.0.1',
      port: config.bridgePort ?? 18091,
      state: {
        getSliderConfig,
        getUpstreamConnection,
        getBubbleJoinMode: () => readVal(config.bubbleJoinMode, 'paragraph'),
        getCustomSoul: () => readVal(config.customSoul, ''),
        fetchImpl: overrides.fetchImpl,
      },
    });
  }

  ctx.provide('nbSpeak', {
    ...(bridgeServer ? { bridgeBaseUrl: bridgeServer.baseUrl, bridgePort: bridgeServer.port } : {}),
    currentSpec: () =>
      resolveUpstreamModelSpec(
        undefined,
        getSliderConfig(),
        readVal(config.runtimeMode, 'skill'),
        readVal(config.defaultCloudModel, 'deepseek-chat'),
        readVal(config.defaultVoiceModel, 'nb-speak-voice-v1'),
      ),
  });

  ctx.effect(() => async () => {
    if (bridgeServer) {
      await bridgeServer.close();
      bridgeServer = undefined;
    }
  });
}
