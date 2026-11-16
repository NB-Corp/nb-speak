import { createServer,                                                        } from 'node:http';
                                       
import {
  ADVERTISED_DSH_MODELS,
  BubbleStreamFormatter,
  formatCompleteBubbleText,
  resolveUpstreamModelSpec,
                      
                          
                         
} from './weights.js';
import {
  buildToolRemapTable,
  remapMessagesToUpstream,
  restoreOpenAIToolCalls,
                          
                     
                      
} from './tool-remap.js';
import {
  dispatchUpstreamChatCompletions,
  queryUpstreamHealth,
                 
                                  
} from './upstream.js';

const SPEAK_USER_TOOLS                                = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Deliver 1-4 short thumb-typed IM chat bubbles to the human user (with optional complementary voice_note on the final bubble). Do NOT use this for subagents; use agent_send_message for subagents.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['bubbles'],
        properties: {
          bubbles: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: { type: 'string', minLength: 1 },
          },
          voice_note: {
            type: 'object',
            additionalProperties: false,
            required: ['text'],
            properties: {
              text: { type: 'string' },
              emotion: { type: 'string' },
            },
          },
          reply_to: { type: 'string' },
          end_turn: { type: 'boolean', default: true },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_artifact',
      description:
        'Offload multi-line code, SQL queries, unified diffs, or Markdown comparison tables outside narrow chat bubbles.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'kind', 'content'],
        properties: {
          title: { type: 'string' },
          kind: { type: 'string', enum: ['code', 'markdown', 'diff', 'table'] },
          language: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
  },
];

const PERSONA_LAYER_TEXT                                                                  = {
  neutral_peer:
    'Speak as an equal-footing engineering peer: concise, direct, relaxed, zero corporate servility or unsolicited lectures.',
  sharp_lead:
    'Speak as a sharp, candid tech lead: lead with the ship/hold verdict, keep wit dry, and push all patches to send_artifact.',
  warm_companion:
    'Speak as an attentive everyday companion texting from a phone: natural spoken rhythm, zero RPG stage brackets (*sighs*) or robotic nanny checklists.',
  calm_sre:
    'Speak as a calm on-call SRE peer: report live error rate, latency, saturation, and next action in 1-2 short bubbles.',
};

function buildSkillSystemLayer(personaId                                       , customSoul         )         {
  const voice = customSoul?.trim() ? customSoul.trim() : PERSONA_LAYER_TEXT[personaId];
  return [
    '# nb-speak · DSH Mode A (chat-human + send_message)',
    '- Deliver every reply to the human user via `send_message({ bubbles, voice_note, end_turn: true })` (1-2 short bubbles default, max 4; omit trailing periods on short single-clause lines).',
    '- Offload code, SQL, diffs, and Markdown tables via `send_artifact`.',
    '- If subagent orchestration is needed, call `agent_send_message` (never `send_message` for subagents).',
    `- Active Persona: ${voice}`,
  ].join('\n');
}

function injectSkillSystemPrompt(
  messages                          ,
  personaId                                       ,
  customSoul         ,
)                  {
  const block = buildSkillSystemLayer(personaId, customSoul);
  if (messages.length > 0 && messages[0]?.role === 'system' && typeof messages[0].content === 'string') {
    if (messages[0].content.includes('nb-speak · DSH Mode A')) return [...messages];
    return [{ ...messages[0], content: `${messages[0].content}\n\n${block}` }, ...messages.slice(1)];
  }
  return [{ role: 'system', content: block }, ...messages];
}

                              
                                   
                             
                                                                                                 
                                                          
                                                  
 

function extractUserSpeakFromToolCalls(toolCalls                                       )                     {
  const bubbles           = [];
  const artifacts                                                                             = [];
  let voiceNote                                                ;
  const passthroughToolCalls                   = [];

  for (const tc of toolCalls ?? []) {
    const fnName = tc.function?.name;
    const rawArgs = tc.function?.arguments ?? '';
    if (fnName === 'send_message') {
      try {
        const parsed = JSON.parse(rawArgs)                           ;
        if (Array.isArray(parsed.bubbles)) {
          for (const b of parsed.bubbles) {
            const s = String(b ?? '').trim();
            if (s) bubbles.push(s);
          }
          if (typeof parsed.voice_note === 'object' && parsed.voice_note !== null) {
            const vn = parsed.voice_note                           ;
            const vnText = String(vn.text ?? '').trim();
            if (vnText) {
              voiceNote = { text: vnText, ...(typeof vn.emotion === 'string' ? { emotion: vn.emotion } : {}) };
            }
          }
          continue;
        }
      } catch {
        // Not a valid nb-speak user bubble call; fall through
      }
    } else if (fnName === 'send_artifact') {
      try {
        const parsed = JSON.parse(rawArgs)                           ;
        const content = String(parsed.content ?? '').trim();
        if (content) {
          artifacts.push({
            title: String(parsed.title ?? 'artifact'),
            kind: String(parsed.kind ?? 'code'),
            ...(typeof parsed.language === 'string' ? { language: parsed.language } : {}),
            content,
          });
          continue;
        }
      } catch {
        // Fall through
      }
    }
    passthroughToolCalls.push(tc);
  }

  const parts           = [];
  if (bubbles.length > 0) parts.push(bubbles.join('\n\n'));
  for (const art of artifacts) {
    if (art.kind === 'table' || art.kind === 'markdown') {
      parts.push(`<!-- artifact: ${art.title} -->\n${art.content}`);
    } else {
      const lang = art.language ?? (art.kind === 'diff' ? 'diff' : '');
      parts.push(`\`\`\`${lang}\n// ${art.title}\n${art.content}\n\`\`\``);
    }
  }
  if (voiceNote) {
    parts.push(`> [Voice Note${voiceNote.emotion ? ` · ${voiceNote.emotion}` : ''}] ${voiceNote.text}`);
  }

  return {
    renderedContent: parts.join('\n\n'),
    bubbles,
    artifacts,
    voiceNote,
    passthroughToolCalls,
  };
}

                                             
                                                    
                                                                            
                                                   
                                                    
                                 
 

                                      
                          
                        
                        
                           
                                      
 

function sendJson(res                , status        , payload         )       {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
  });
  res.end(body);
}

async function readJsonBody(req                 , maxBytes = 8 * 1024 * 1024)                                   {
  const chunks           = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      const err = new Error('Request body exceeds 8 MiB limit');
      (err                               ).status = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const parsed          = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Request JSON body must be an object');
  }
  return parsed                           ;
}

export async function startDshOpenAiBridge(options   
                         
                        
                                             
 )                               {
  const host = options.host ?? '127.0.0.1';
  const { state } = options;
  const sockets = new Set        ();

  const server = createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?', 1)[0] ?? '/';

    if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/status')) {
      const sliderCfg = state.getSliderConfig();
      const conn = await state.getUpstreamConnection();
      const resolved = resolveUpstreamModelSpec(
        undefined,
        sliderCfg,
        conn.mode,
        conn.defaultCloudModel,
        conn.defaultVoiceModel,
      );
      const health = await queryUpstreamHealth(conn, state.fetchImpl);
      sendJson(res, 200, {
        status: 'ok',
        runtimeMode: conn.mode,
        activeModel: resolved.upstreamModel,
        persona: resolved.personaId,
        weights: resolved.weights,
        upstream: health,
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/v1/models') {
      sendJson(res, 200, {
        object: 'list',
        data: ADVERTISED_DSH_MODELS.map((m) => ({
          id: m.id,
          object: 'model',
          created: 1763200000,
          owned_by: 'nb-corp',
          description: m.description,
        })),
      });
      return;
    }

    if (req.method !== 'POST' || urlPath !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: `Unsupported endpoint: ${urlPath}`, code: 'not_found' } });
      return;
    }

    let reqBody                         ;
    try {
      reqBody = await readJsonBody(req);
    } catch (err) {
      sendJson(res, (err                       )?.status ?? 400, {
        error: { message: err instanceof Error ? err.message : String(err), code: 'bad_request' },
      });
      return;
    }

    const reqAbort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) reqAbort.abort(new Error('client_disconnected'));
    };
    res.on('close', onClose);

    try {
      const sliderCfg = state.getSliderConfig();
      const bubbleMode = state.getBubbleJoinMode();
      const conn = await state.getUpstreamConnection();
      const requestedModel = typeof reqBody.model === 'string' ? reqBody.model : undefined;
      const { upstreamModel, personaId } = resolveUpstreamModelSpec(
        requestedModel,
        sliderCfg,
        conn.mode,
        conn.defaultCloudModel,
        conn.defaultVoiceModel,
      );

      // Step 1: Remap DSH internal colliding tools (`send_message` -> `agent_send_message`)
      const rawTools = Array.isArray(reqBody.tools) ? reqBody.tools : undefined;
      const remapTable = buildToolRemapTable(rawTools);
      const rawMessages = Array.isArray(reqBody.messages) ? (reqBody.messages                   ) : [];
      let mappedMessages = remapMessagesToUpstream(rawMessages, remapTable);

      // Step 2: In Mode A (`skill`), inject `chat-human` system layer + `send_message` & `send_artifact` user tools
      let outgoingTools                                            =
        rawTools !== undefined ? remapTable.tools : undefined;
      if (conn.mode === 'skill') {
        mappedMessages = injectSkillSystemPrompt(mappedMessages, personaId, state.getCustomSoul?.());
        outgoingTools = [...remapTable.tools, ...SPEAK_USER_TOOLS];
      }

      const stream = Boolean(reqBody.stream);
      const upstreamPayload                          = {
        ...reqBody,
        model: upstreamModel,
        messages: mappedMessages,
        stream,
      };
      if (outgoingTools !== undefined && outgoingTools.length > 0) {
        upstreamPayload.tools = outgoingTools;
      }

      const upstreamRes = await dispatchUpstreamChatCompletions({
        cfg: conn,
        payload: upstreamPayload,
        fetchImpl: state.fetchImpl,
        signal: reqAbort.signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        sendJson(res, upstreamRes.status, {
          error: { message: `Upstream returned HTTP ${upstreamRes.status}: ${errText.slice(0, 260)}` },
        });
        return;
      }

      const contentType = String(upstreamRes.headers.get('content-type') ?? '').toLowerCase();
      if (!stream || !contentType.includes('text/event-stream') || !upstreamRes.body) {
        const json = (await upstreamRes.json())                           ;
        const choices = Array.isArray(json.choices) ? json.choices : [];
        let speakMeta                                     ;

        const rewrittenChoices = choices.map((c) => {
          if (typeof c !== 'object' || c === null) return c;
          const choice = c                           ;
          const message =
            typeof choice.message === 'object' && choice.message !== null
              ? { ...(choice.message                           ) }
              : undefined;
          if (message) {
            const existingContent = typeof message.content === 'string'
              ? formatCompleteBubbleText(message.content, bubbleMode)
              : '';
            const rawCalls = Array.isArray(message.tool_calls) ? (message.tool_calls                    ) : undefined;

            if (conn.mode === 'skill' && rawCalls && rawCalls.length > 0) {
              const extracted = extractUserSpeakFromToolCalls(rawCalls);
              if (extracted.bubbles.length > 0 || extracted.artifacts.length > 0) {
                message.content = [existingContent, extracted.renderedContent].filter(Boolean).join('\n\n');
                speakMeta = {
                  bubbles: extracted.bubbles,
                  artifacts: extracted.artifacts,
                  ...(extracted.voiceNote ? { voice_note: extracted.voiceNote } : {}),
                };
              }
              const restoredSubagent = restoreOpenAIToolCalls(extracted.passthroughToolCalls, remapTable);
              if (restoredSubagent && restoredSubagent.length > 0) {
                message.tool_calls = restoredSubagent;
              } else {
                delete message.tool_calls;
                if (choice.finish_reason === 'tool_calls') {
                  return { ...choice, finish_reason: 'stop', message };
                }
              }
            } else {
              if (typeof message.content === 'string') {
                message.content = existingContent;
              }
              if (rawCalls) {
                message.tool_calls = restoreOpenAIToolCalls(rawCalls, remapTable);
              }
            }
          }
          return { ...choice, ...(message ? { message } : {}) };
        });

        sendJson(res, 200, {
          ...json,
          choices: rewrittenChoices,
          ...(speakMeta ? { nb_speak: speakMeta } : {}),
        });
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      const bubbleFormatter = new BubbleStreamFormatter(bubbleMode);
      const bufferedSkillCalls = new Map                                                         ();
      let sseBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split(/\r?\n/);
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith(':')) {
            res.write(`${trimmed}\n\n`);
            continue;
          }
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const chunkObj = JSON.parse(dataStr)                           ;
            if (Array.isArray(chunkObj.choices)) {
              chunkObj.choices = chunkObj.choices.map((c) => {
                if (typeof c !== 'object' || c === null) return c;
                const choice = { ...(c                           ) };
                if (typeof choice.delta === 'object' && choice.delta !== null) {
                  const delta = { ...(choice.delta                           ) };
                  if (typeof delta.content === 'string' && delta.content.length > 0) {
                    delta.content = bubbleFormatter.push(delta.content);
                  }
                  if (Array.isArray(delta.tool_calls)) {
                    if (conn.mode === 'skill') {
                      const passthroughDeltaCalls                   = [];
                      delta.tool_calls.forEach((rawTc, idx) => {
                        if (typeof rawTc !== 'object' || rawTc === null) return;
                        const tc = rawTc                  ;
                        const slotIdx = typeof tc.index === 'number' ? tc.index : idx;
                        const cur = bufferedSkillCalls.get(slotIdx) ?? { id: '', name: '', arguments: '' };
                        if (tc.id) cur.id = tc.id;
                        if (tc.function?.name) cur.name += tc.function.name;
                        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
                        bufferedSkillCalls.set(slotIdx, cur);

                        if (cur.name && cur.name !== 'send_message' && cur.name !== 'send_artifact') {
                          passthroughDeltaCalls.push(tc);
                        }
                      });
                      const restored = restoreOpenAIToolCalls(passthroughDeltaCalls, remapTable);
                      if (restored && restored.length > 0) {
                        delta.tool_calls = restored;
                      } else {
                        delete delta.tool_calls;
                      }
                    } else {
                      delta.tool_calls = restoreOpenAIToolCalls(delta.tool_calls                    , remapTable);
                    }
                  }
                  choice.delta = delta;
                }
                if (conn.mode === 'skill' && choice.finish_reason === 'tool_calls' && bufferedSkillCalls.size > 0) {
                  const allUserSpeak = [...bufferedSkillCalls.values()].every(
                    (s) => s.name === 'send_message' || s.name === 'send_artifact',
                  );
                  if (allUserSpeak) choice.finish_reason = 'stop';
                }
                return choice;
              });
            }
            res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
          } catch {
            res.write(`data: ${dataStr}\n\n`);
          }
        }
      }

      if (conn.mode === 'skill' && bufferedSkillCalls.size > 0) {
        const assembled                   = [...bufferedSkillCalls.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, slot]) => ({
            id: slot.id || 'call_speak',
            type: 'function',
            function: { name: slot.name, arguments: slot.arguments },
          }));
        const extracted = extractUserSpeakFromToolCalls(assembled);
        if (extracted.renderedContent) {
          const contentChunk = {
            id: 'chatcmpl-nb-speak',
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: extracted.renderedContent },
                finish_reason: 'stop',
              },
            ],
            nb_speak: {
              bubbles: extracted.bubbles,
              artifacts: extracted.artifacts,
              ...(extracted.voiceNote ? { voice_note: extracted.voiceNote } : {}),
            },
          };
          res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 502, { error: { message: err instanceof Error ? err.message : String(err) } });
      } else if (!res.writableEnded) {
        res.end();
      }
    } finally {
      res.off('close', onClose);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise      ((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr !== null ? addr.port : options.port;
  let closed = false;
  return {
    server,
    host,
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}/v1`,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise      ((resolve) => server.close(() => resolve()));
    },
  };
}
