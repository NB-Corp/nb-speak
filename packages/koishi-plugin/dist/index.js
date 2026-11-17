import { setTimeout as sleep } from 'node:timers/promises';
import {
  buildSpeakSystemPrompt,
  computeBubbleSchedule,
                       
} from './core.js';
import {
  transformOutboundText,
                        
} from './core.js';

export const name = 'nb-speak';
export const inject = { optional: []             };

                                    
                             
                                     
                               
                                        
                                      
                               
                                   
                                 
                                         
                                      
 

                                            
                            
                                    
                              
                                       
                                     
                              
                                  
                                
                                        
                                     
 

                                    
               
                                 
                                 
 

                                    
                    
                     
                  
                                 
                   
                                                                                                      
 

                                    
                                                                          
                                    
             
                                                                                                  
                                  
    
 

// Optional host Koishi Schema discovery (works inside real Koishi v4 apps and zero-dep standalone tests)
let hostSchema     ;
try {
  const mod = await import('koishi');
  hostSchema = (mod                           ).Schema;
} catch {
  hostSchema = undefined;
}

function buildFallbackSchema() {
  const wrapField = (meta                         ) => {
    const node                      = { ...meta };
    node.default = (val         ) => wrapField({ ...node, defaultValue: val });
    node.description = (desc        ) => wrapField({ ...node, desc });
    node.min = (minVal        ) => wrapField({ ...node, minValue: minVal });
    node.max = (maxVal        ) => wrapField({ ...node, maxValue: maxVal });
    return node;
  };
  return {
    object: (dict                         ) => ({ type: 'object', dict }),
    boolean: () => wrapField({ type: 'boolean' }),
    number: () => wrapField({ type: 'number' }),
    string: () => wrapField({ type: 'string' }),
    union: (list                    ) => wrapField({ type: 'union', list }),
    array: (inner         ) => wrapField({ type: 'array', inner }),
  };
}

const S = hostSchema ?? buildFallbackSchema();

export const Config = S.object({
  enabled: S.boolean().default(true).description('Enable outbound IM bubble splitting & pipe-table conversion.'),
  persona: S.union(['neutral_peer', 'sharp_lead', 'warm_companion', 'calm_sre', 'custom'])
    .default('neutral_peer')
    .description('Active tone baseline exposed via ctx.nbSpeak.getSystemPrompt().'),
  customSoul: S.string().default('').description('Optional custom persona instructions when persona="custom".'),
  tableMode: S.union(['auto', 'kv', 'code'])
    .default('auto')
    .description('Convert raw Markdown pipe tables to mobile KV cards (OneBot/QQ/WeChat) or <=40-col monospace.'),
  maxMonospaceWidth: S.number().min(24).max(120).default(40).description('Maximum columns before tables degrade to KV cards.'),
  maxBubbles: S.number().min(1).max(6).default(4).description('Maximum conversational bubbles per turn.'),
  pacedDelivery: S.boolean().default(true).description('Deliver multi-bubble turns sequentially with natural typing delays.'),
  cadenceSpeed: S.number().min(0.25).max(50).default(1).description('Typing-delay speed multiplier (higher = faster).'),
  platforms: S.array(S.string()).default([]).description('Optional platform allowlist (empty = all adapters).'),
  enableVoiceNotes: S.boolean().default(false).description('Enable optional voice-note prompt rules (disabled by default).'),
});

export function resolveKoishiSpeakConfig(raw                    = {})                            {
  const p = String(raw.persona ?? 'neutral_peer');
  const persona                  =
    p === 'sharp_lead' || p === 'warm_companion' || p === 'calm_sre' || p === 'custom' ? p : 'neutral_peer';
  const tm = String(raw.tableMode ?? 'auto');
  const tableMode                   = tm === 'kv' || tm === 'code' ? tm : 'auto';
  const width = Number(raw.maxMonospaceWidth ?? 40);
  const maxBubbles = Number(raw.maxBubbles ?? 4);
  const speed = Number(raw.cadenceSpeed ?? 1);

  return {
    enabled: raw.enabled !== false,
    persona,
    customSoul: typeof raw.customSoul === 'string' ? raw.customSoul.trim() : '',
    tableMode,
    maxMonospaceWidth: Number.isFinite(width) ? Math.max(24, Math.min(120, Math.round(width))) : 40,
    maxBubbles: Number.isFinite(maxBubbles) ? Math.max(1, Math.min(6, Math.round(maxBubbles))) : 4,
    pacedDelivery: raw.pacedDelivery !== false,
    cadenceSpeed: Number.isFinite(speed) && speed > 0 ? Math.min(50, speed) : 1,
    platforms: Array.isArray(raw.platforms)
      ? raw.platforms.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
      : [],
    enableVoiceNotes: raw.enableVoiceNotes === true,
  };
}

function makeTextElement(text        )                    {
  return {
    type: 'text',
    attrs: { content: text },
    children: [],
  };
}

function extractPureTextElements(session                   )                     {
  if (Array.isArray(session.elements) && session.elements.length > 0) {
    // Leave rich media / quote / forward / audio segments untouched so native adapter elements never break
    const allText = session.elements.every((el) => el && el.type === 'text');
    if (!allText) return undefined;
    return session.elements.map((el) => String(el.attrs?.content ?? '')).join('');
  }
  if (typeof session.content === 'string' && session.content.trim()) {
    return session.content;
  }
  return undefined;
}

function writeSessionText(session                   , nextText        )       {
  if (Array.isArray(session.elements)) {
    session.elements.splice(0, session.elements.length, makeTextElement(nextText));
  }
  if (typeof session.content === 'string') {
    session.content = nextText;
  }
}

export function apply(
  ctx                   ,
  rawConfig                    = {},
  runtimeOpts                                                = {},
)       {
  const cfg = resolveKoishiSpeakConfig(rawConfig);
  const sleepFn =
    runtimeOpts.sleepImpl ??
    (async (ms        ) => {
      if (ms <= 0) return;
      if (typeof ctx.sleep === 'function') {
        await ctx.sleep(ms);
      } else {
        await sleep(ms);
      }
    });

  ctx.nbSpeak = {
    formatReply(rawText        , platform         ) {
      return transformOutboundText(rawText, {
        channel: platform,
        tableMode: cfg.tableMode,
        maxMonospaceWidth: cfg.maxMonospaceWidth,
        maxBubbles: cfg.maxBubbles,
        cadence: { speedMultiplier: cfg.cadenceSpeed },
      });
    },
    getSystemPrompt() {
      return buildSpeakSystemPrompt({
        persona: cfg.persona,
        customSoul: cfg.customSoul,
        enableVoiceNotes: cfg.enableVoiceNotes,
      });
    },
  };

  if (!cfg.enabled) return;

  // Re-entrancy bypass set for follow-up bubbles dispatched via `session.send(...)`
  const bypassSessions = new WeakSet        ();

  ctx.on('before-send', (session                   , options                          ) => {
    if (!session || typeof session !== 'object') return;
    if (options?.nbSpeakBypass === true || bypassSessions.has(session)) return;

    const platform = String(session.platform ?? '').trim().toLowerCase();
    if (cfg.platforms.length > 0 && platform && !cfg.platforms.includes(platform)) {
      return;
    }

    const rawText = extractPureTextElements(session);
    if (!rawText || !rawText.trim()) return;

    const transformed = transformOutboundText(rawText, {
      channel: platform || 'onebot',
      tableMode: cfg.tableMode,
      maxMonospaceWidth: cfg.maxMonospaceWidth,
      maxBubbles: cfg.maxBubbles,
      cadence: { speedMultiplier: cfg.cadenceSpeed },
    });

    if (!transformed.changed) return;

    const segments = [...transformed.bubbles, ...transformed.artifactCards].filter(Boolean);
    if (segments.length === 0) return;

    if (!cfg.pacedDelivery || segments.length === 1 || typeof session.send !== 'function') {
      writeSessionText(session, transformed.primaryText);
      return;
    }

    // Deliver segment[0] through the active send frame and pace segments[1..N-1] sequentially
    writeSessionText(session, segments[0] );
    const tailSegments = segments.slice(1);
    const fullSchedule = computeBubbleSchedule(segments, { speedMultiplier: cfg.cadenceSpeed });

    void (async () => {
      bypassSessions.add(session);
      try {
        for (let i = 0; i < tailSegments.length; i += 1) {
          const delayMs = fullSchedule[i + 1]?.delayMs ?? 420;
          await sleepFn(delayMs);
          await session.send (tailSegments[i] , { nbSpeakBypass: true });
        }
      } finally {
        bypassSessions.delete(session);
      }
    })();
  });
}

export default {
  name,
  inject,
  Config,
  apply,
};
