import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  buildSpeakSystemPrompt,
  computeBubbleSchedule,
  getSendMessageJsonSchema,
  PERSONA_PRESETS,
  SEND_ARTIFACT_DESCRIPTION,
  SEND_ARTIFACT_JSON_SCHEMA,
  SEND_MESSAGE_DESCRIPTION,
  SEND_MESSAGE_TEXT_ONLY_DESCRIPTION,
                       
                        
} from './core.js';
import { lintTurn } from './core.js';
import {
  formatArtifactForChannel,
  transformOutboundText,
                        
} from './format-gate.js';

export const OPENCLAW_PLUGIN_ID = 'nb-speak-openclaw';

                                      
                            
                                    
                              
                                  
                                 
                                 
                                      
                                       
                                     
                              
                                
                                       
                                     
                              
                             
                            
                            
 

export const OPENCLAW_CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean', default: true },
    persona: {
      type: 'string',
      enum: ['neutral_peer', 'sharp_lead', 'warm_companion', 'calm_sre', 'custom'],
      default: 'neutral_peer',
    },
    customSoul: { type: 'string', default: '' },
    registerTools: { type: 'boolean', default: true },
    injectPrompt: { type: 'boolean', default: true },
    outboundGate: { type: 'boolean', default: true },
    pacedToolDelivery: { type: 'boolean', default: true },
    tableMode: { type: 'string', enum: ['auto', 'kv', 'code'], default: 'auto' },
    maxMonospaceWidth: { type: 'integer', minimum: 24, maximum: 120, default: 40 },
    maxBubbles: { type: 'integer', minimum: 1, maximum: 6, default: 4 },
    cadenceSpeed: { type: 'number', minimum: 0.25, maximum: 50, default: 1 },
    channels: { type: 'array', items: { type: 'string' }, default: [] },
    enableVoiceNotes: { type: 'boolean', default: false },
    ttsBaseUrl: { type: 'string', default: '' },
    ttsApiKey: { type: 'string', default: '' },
    ttsModel: { type: 'string', default: 'tts-1' },
    ttsVoice: { type: 'string', default: 'alloy' },
  },
}         ;

                                           
                                                                                          
 

                                          
                                               
                              
                              
                                
    
                                    
                                      
                          
                               
                                     
 

                                           
                         
                             
                                         
                               
                             
                                 
                                        
                                      
                                    
                                  
 

                                                   
                                             
                         
                            
                               
                          
 

                                              
                            
                            
                                         
                                  
 

                                          
                            
                              
                               
                          
                                     
 

                                        
                                                  
     
                     
                                                                    
                                      
          
               
                  
                               
                                                                            
                                      
          
 

                                             
                                    
                                                                           
 

export function resolveOpenClawSpeakConfig(raw                                     )                      {
  const src = raw ?? {};
  const personaRaw = String(src.persona ?? 'neutral_peer');
  const persona                  =
    personaRaw === 'sharp_lead' ||
    personaRaw === 'warm_companion' ||
    personaRaw === 'calm_sre' ||
    personaRaw === 'custom'
      ? personaRaw
      : 'neutral_peer';
  const tableRaw = String(src.tableMode ?? 'auto');
  const tableMode                   = tableRaw === 'kv' || tableRaw === 'code' ? tableRaw : 'auto';
  const widthNum = Number(src.maxMonospaceWidth ?? 40);
  const maxMonospaceWidth = Number.isFinite(widthNum) ? Math.max(24, Math.min(120, Math.round(widthNum))) : 40;
  const bubblesNum = Number(src.maxBubbles ?? 4);
  const maxBubbles = Number.isFinite(bubblesNum) ? Math.max(1, Math.min(6, Math.round(bubblesNum))) : 4;
  const speedNum = Number(src.cadenceSpeed ?? 1);
  const cadenceSpeed = Number.isFinite(speedNum) && speedNum > 0 ? Math.min(50, speedNum) : 1;
  const channels = Array.isArray(src.channels)
    ? src.channels.map((c) => String(c ?? '').trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    enabled: src.enabled !== false,
    persona,
    customSoul: typeof src.customSoul === 'string' ? src.customSoul.trim() : '',
    registerTools: src.registerTools !== false,
    injectPrompt: src.injectPrompt !== false,
    outboundGate: src.outboundGate !== false,
    pacedToolDelivery: src.pacedToolDelivery !== false,
    tableMode,
    maxMonospaceWidth,
    maxBubbles,
    cadenceSpeed,
    channels,
    // Strictly disabled by default: pure text bubbles + clean code/table cards unless explicitly opted in.
    enableVoiceNotes: src.enableVoiceNotes === true,
    ttsBaseUrl: typeof src.ttsBaseUrl === 'string' ? src.ttsBaseUrl.trim() : '',
    ttsApiKey: typeof src.ttsApiKey === 'string' ? src.ttsApiKey.trim() : '',
    ttsModel: typeof src.ttsModel === 'string' && src.ttsModel.trim() ? src.ttsModel.trim() : 'tts-1',
    ttsVoice: typeof src.ttsVoice === 'string' && src.ttsVoice.trim() ? src.ttsVoice.trim() : 'alloy',
  };
}

function isChannelAllowed(cfg                     , channelRaw                    )          {
  if (cfg.channels.length === 0) return true;
  if (!channelRaw) return true;
  return cfg.channels.includes(channelRaw.trim().toLowerCase());
}

export function buildPlainSurfaceSystemContext(cfg                     )         {
  const presetKey = cfg.persona !== 'custom' ? cfg.persona : 'neutral_peer';
  const preset = PERSONA_PRESETS[presetKey] ?? PERSONA_PRESETS.neutral_peer;
  const personaGuidance = cfg.customSoul || preset.instructions;
  return [
    '## Mobile IM & Channel Delivery Physics (chat-human / nb-speak)',
    '- Write for narrow mobile IM screens (Telegram, WhatsApp, Discord, Signal, Slack): default to 1-2 short thumb-typed beats separated by a blank line (`\\n\\n`), never 200-word essay walls.',
    '- Never output raw Markdown pipe tables (`|---|---|`). Summarize comparisons as compact `- Item — Key: val` bullets or wrap narrow (`<=40` cols) aligned tables in a code block.',
    '- Keep multi-line code or SQL inside its own clean fenced block separated from conversational beats.',
    '- Omit trailing periods (`.` / `。`) on short single-clause beats and after copyable codes/IDs; cut `*sighs*` stage brackets and concierge sign-offs (`let me know if you need anything`, `hope this helps`).',
    `- Active tone baseline: ${personaGuidance}`,
  ].join('\n');
}

async function synthesizeOptionalOpenAiSpeech(
  text        ,
  cfg                     ,
  fetchImpl              ,
  signal              ,
)                              {
  if (!cfg.enableVoiceNotes || !cfg.ttsBaseUrl || !text.trim()) return undefined;
  const base = cfg.ttsBaseUrl.replace(/\/+$/, '');
  const endpoint = base.endsWith('/audio/speech')
    ? base
    : base.endsWith('/v1')
      ? `${base}/audio/speech`
      : `${base}/v1/audio/speech`;

  const headers                         = { 'content-type': 'application/json' };
  if (cfg.ttsApiKey) headers.authorization = `Bearer ${cfg.ttsApiKey}`;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.ttsModel,
      voice: cfg.ttsVoice,
      input: text.trim(),
      response_format: 'ogg',
    }),
    signal,
  });
  if (!response.ok) return undefined;

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) return undefined;
  const tmpFile = path.join(os.tmpdir(), `nb-speak-oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ogg`);
  await fs.writeFile(tmpFile, bytes);
  return tmpFile;
}

export function createOpenClawSpeakPlugin(runtimeOpts                             = {}) {
  const fetchImpl = runtimeOpts.fetchImpl ?? fetch;
  const sleepFn =
    runtimeOpts.sleepImpl ??
    (async (ms        , signal              ) => {
      if (ms > 0) await sleep(ms, undefined, signal ? { signal } : undefined);
    });

  return {
    id: OPENCLAW_PLUGIN_ID,
    name: 'NB Speak — Human IM Bubbles & Table Gate',
    description:
      'Stops OpenClaw from dumping raw Markdown pipe tables and 250-word essays on Telegram, WhatsApp, Discord, and Signal.',
    reload: { turnHandover: true },
    configSchema: OPENCLAW_CONFIG_SCHEMA,
    register(api                       )       {
      const cfg = resolveOpenClawSpeakConfig(api.pluginConfig);
      if (!cfg.enabled) return;

      // Bounded ring of recent runIds already delivered directly by `send_bubble`
      // so `reply_payload_sending` avoids duplicating a final text echo.
      const deliveredBubbleRuns = new Set        ();
      const rememberDeliveredRun = (runKey                    )       => {
        if (!runKey) return;
        deliveredBubbleRuns.add(runKey);
        if (deliveredBubbleRuns.size > 256) {
          const oldest = deliveredBubbleRuns.values().next().value;
          if (oldest) deliveredBubbleRuns.delete(oldest);
        }
      };

      if (cfg.registerTools) {
        const toolGuidance = buildSpeakSystemPrompt({
          persona: cfg.persona,
          customSoul: cfg.customSoul,
          enableVoiceNotes: cfg.enableVoiceNotes,
          allowVoiceNote: cfg.enableVoiceNotes,
          allowArtifacts: true,
          sendMessageName: 'send_bubble',
          sendArtifactName: 'send_artifact',
        });

        api.registerTool(
          (toolContext                         ) => ({
            name: 'send_bubble',
            description: cfg.enableVoiceNotes ? SEND_MESSAGE_DESCRIPTION : SEND_MESSAGE_TEXT_ONLY_DESCRIPTION,
            parameters: getSendMessageJsonSchema(cfg.enableVoiceNotes),
            async execute(_id        , params                         ) {
              const rawBubbles = Array.isArray(params.bubbles) ? params.bubbles : [];
              const cleanedBubbles = rawBubbles
                .map((item) => transformOutboundText(String(item ?? ''), { maxBubbles: 1 }).primaryText.trim())
                .filter(Boolean)
                .slice(0, cfg.maxBubbles);

              const schedule = computeBubbleSchedule(cleanedBubbles, { speedMultiplier: cfg.cadenceSpeed });
              const lint = lintTurn(
                {
                  bubbles: cleanedBubbles,
                  ...(cfg.enableVoiceNotes && typeof params.voice_note === 'object' && params.voice_note !== null
                    ? { voice_note: params.voice_note }
                    : {}),
                  end_turn: params.end_turn !== false,
                },
                { maxBubbles: cfg.maxBubbles },
              );

              let deliveredViaChannel = false;
              if (cfg.pacedToolDelivery && toolContext?.delivery?.send && schedule.length > 0) {
                for (const beat of schedule) {
                  await sleepFn(beat.delayMs, toolContext.abortSignal);
                  await toolContext.delivery.send({ text: beat.text });
                }
                deliveredViaChannel = true;

                if (cfg.enableVoiceNotes && typeof params.voice_note === 'object' && params.voice_note !== null) {
                  const vnText = String((params.voice_note                           ).text ?? '').trim();
                  if (vnText) {
                    try {
                      const audioPath = await synthesizeOptionalOpenAiSpeech(
                        vnText,
                        cfg,
                        fetchImpl,
                        toolContext.abortSignal,
                      );
                      if (audioPath) {
                        await toolContext.delivery.send({ mediaUrl: audioPath });
                      }
                    } catch {
                      // Silent fallback: never leak TTS backend diagnostics into user chat
                    }
                  }
                }

                if (toolContext.runId) {
                  rememberDeliveredRun(toolContext.runId);
                }
              }

              const summaryText = cleanedBubbles.join('\n\n');
              return {
                content: [{ type: 'text', text: deliveredViaChannel ? `[Delivered ${schedule.length} bubbles]` : summaryText }],
                details: {
                  deliveredViaChannel,
                  bubbles: cleanedBubbles,
                  schedule,
                  lint,
                },
              };
            },
          }),
          {
            name: 'send_bubble',
            optional: true,
            workspaceAccess: false,
            promptGuidance: toolGuidance,
          },
        );

        api.registerTool(
          (toolContext                         ) => ({
            name: 'send_artifact',
            description: SEND_ARTIFACT_DESCRIPTION,
            parameters: SEND_ARTIFACT_JSON_SCHEMA                                      ,
            async execute(_id        , params                         ) {
              const kindRaw = String(params.kind ?? 'code');
              const artifact                   = {
                title: String(params.title ?? 'snippet.txt'),
                kind:
                  kindRaw === 'code' || kindRaw === 'markdown' || kindRaw === 'diff' || kindRaw === 'table'
                    ? kindRaw
                    : 'code',
                ...(typeof params.language === 'string' && params.language.trim()
                  ? { language: params.language.trim() }
                  : {}),
                content: String(params.content ?? ''),
              };

              const activeChannel = toolContext?.deliveryContext?.channel;
              const formattedCard = formatArtifactForChannel(artifact, {
                channel: activeChannel,
                tableMode: cfg.tableMode,
                maxMonospaceWidth: cfg.maxMonospaceWidth,
              });

              let deliveredViaChannel = false;
              if (cfg.pacedToolDelivery && toolContext?.delivery?.send && formattedCard.trim()) {
                await toolContext.delivery.send({ text: formattedCard });
                deliveredViaChannel = true;
              }

              return {
                content: [{ type: 'text', text: deliveredViaChannel ? `[Delivered artifact ${artifact.title}]` : formattedCard }],
                details: {
                  deliveredViaChannel,
                  title: artifact.title,
                  kind: artifact.kind,
                  formattedCard,
                },
              };
            },
          }),
          {
            name: 'send_artifact',
            optional: true,
            workspaceAccess: false,
          },
        );
      }

      if (cfg.injectPrompt) {
        const staticSystemContext = buildPlainSurfaceSystemContext(cfg);
        api.on('before_prompt_build', () => ({
          appendSystemContext: staticSystemContext,
        }));
      }

      if (cfg.outboundGate) {
        api.on('reply_payload_sending', (event                                  , ctx                          ) => {
          const payload = event?.payload;
          if (!payload || typeof payload !== 'object') return undefined;

          // Never touch reasoning streams, status/compaction/fallback notices, error banners, or audio-only TTS transcripts
          if (
            payload.isReasoning ||
            payload.isCompactionNotice ||
            payload.isFallbackNotice ||
            payload.isStatusNotice ||
            payload.isError
          ) {
            return undefined;
          }

          const runId = event.runId ?? ctx?.runId;
          if (runId && deliveredBubbleRuns.has(runId)) {
            deliveredBubbleRuns.delete(runId);
            const residual = String(payload.text ?? '').trim();
            if (!residual || /^\[Delivered \d+ bubbles\]$/i.test(residual)) {
              return { cancel: true, reason: 'already_delivered_by_send_bubble' };
            }
          }

          if (typeof payload.text !== 'string' || !payload.text.trim()) {
            return undefined;
          }

          const channel = event.channel ?? ctx?.channel ?? ctx?.channelId;
          if (!isChannelAllowed(cfg, channel)) return undefined;

          const transformed = transformOutboundText(payload.text, {
            channel,
            tableMode: cfg.tableMode,
            maxMonospaceWidth: cfg.maxMonospaceWidth,
            maxBubbles: cfg.maxBubbles,
            cadence: { speedMultiplier: cfg.cadenceSpeed },
          });

          if (!transformed.changed) return undefined;
          return {
            payload: {
              ...payload,
              text: transformed.primaryText,
            },
          };
        });

        api.on('message_sending', (event                             , ctx                          ) => {
          if (!event || typeof event.content !== 'string' || !event.content.trim()) {
            return undefined;
          }
          // Skip audio-only hidden spoken transcripts (no visible caption rewrite)
          if (Array.isArray(event.mediaUrls) && event.mediaUrls.length > 0 && Boolean(event.audioAsVoice)) {
            return undefined;
          }

          const channel = event.channel ?? ctx?.channel ?? ctx?.channelId;
          if (!isChannelAllowed(cfg, channel)) return undefined;

          const transformed = transformOutboundText(event.content, {
            channel,
            tableMode: cfg.tableMode,
            maxMonospaceWidth: cfg.maxMonospaceWidth,
            maxBubbles: cfg.maxBubbles,
            cadence: { speedMultiplier: cfg.cadenceSpeed },
          });

          if (!transformed.changed) return undefined;
          return { content: transformed.primaryText };
        });
      }
    },
  };
}

const openClawSpeakPlugin = createOpenClawSpeakPlugin();
export default openClawSpeakPlugin;
