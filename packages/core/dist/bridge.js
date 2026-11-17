import { createServer,                                                        } from 'node:http';
                                       
import {
  buildSpeakSystemPrompt,
  getOpenAISpeakTools,
  NB_SPEAK_PROTOCOL,
  NB_SPEAK_VERSION,
  PERSONA_PRESETS,
                       
} from './protocol.js';
import { lintTurn,                  } from './lint.js';
import {
  normalizeTurnOutput,
  SpeakStreamAccumulator,
  translateDraftViaSidecar,
  turnToEvents,
} from './parser.js';

                                    
                         
                         
                                    
                                   
                                 
                                     
                               
                                      
                                      
                                    
                                      
                                
                                    
 

                                     
                          
                        
                        
                           
                             
                                      
 

const CORS_HEADERS                                   = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'content-type, authorization, x-nb-speak-persona, x-nb-speak-events, x-nb-speak-inject, x-nb-speak-upstream, x-nb-speak-soul',
};

function writeJson(res                , status        , payload         , enableCors         )       {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
    ...(enableCors ? CORS_HEADERS : {}),
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
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  const parsed          = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Request JSON body must be an object.');
  }
  return parsed                           ;
}

function resolveChatCompletionsEndpoint(baseUrl        )         {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean) return '';
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

function mergeSpeakTools(existingTools                       , enableVoiceNotes = false)            {
  const speakTools = getOpenAISpeakTools({ enableVoiceNotes });
  if (!existingTools || existingTools.length === 0) return speakTools;
  const names = new Set        ();
  for (const item of existingTools) {
    if (typeof item === 'object' && item !== null) {
      const fn = (item                           ).function;
      if (typeof fn === 'object' && fn !== null && typeof (fn                           ).name === 'string') {
        names.add(String((fn                           ).name));
      }
    }
  }
  const merged = [...existingTools];
  for (const st of speakTools) {
    if (!names.has(st.function.name)) merged.push(st);
  }
  return merged;
}

function prependSpeakSystemMessage(
  messages           ,
  persona                 ,
  customSoul         ,
  enableVoiceNotes = false,
)            {
  const systemBlock = buildSpeakSystemPrompt({ persona, customSoul, enableVoiceNotes });
  if (messages.length > 0 && typeof messages[0] === 'object' && messages[0] !== null) {
    const first = messages[0]                           ;
    if (first.role === 'system' && typeof first.content === 'string') {
      if (first.content.includes('nb-speak · IM Delivery Contract')) return messages;
      return [{ ...first, content: `${first.content}\n\n${systemBlock}` }, ...messages.slice(1)];
    }
  }
  return [{ role: 'system', content: systemBlock }, ...messages];
}

export async function startSpeakBridge(config                    = {})                              {
  const host = config.host ?? '127.0.0.1';
  const requestedPort = config.port ?? 18090;
  const enableCors = config.enableCors ?? true;
  const enableVoiceNotes = config.enableVoiceNotes ?? false;
  const fetchFn = config.fetchImpl ?? fetch;
  const sockets = new Set        ();

  const server = createServer(async (req, res) => {
    if (enableCors && req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const urlPath = (req.url ?? '/').split('?', 1)[0] ?? '/';

    if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/status')) {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : requestedPort;
      writeJson(
        res,
        200,
        {
          status: 'ok',
          version: NB_SPEAK_VERSION,
          protocol: NB_SPEAK_PROTOCOL,
          bridgeUrl: `http://${host}:${port}`,
          persona: config.persona ?? 'neutral_peer',
          voiceNotesEnabled: enableVoiceNotes,
          upstreamConfigured: Boolean(config.upstreamBaseUrl),
          voiceSidecarConfigured: Boolean(config.voiceSidecarUrl),
        },
        enableCors,
      );
      return;
    }

    if (req.method === 'GET' && urlPath === '/v1/models') {
      const models = [
        { id: 'nb-speak/auto', object: 'model', created: 1763200000, owned_by: 'nb-corp' },
        ...Object.values(PERSONA_PRESETS).map((p) => ({
          id: `nb-speak/${p.id.replace(/_/g, '-')}`,
          object: 'model',
          created: 1763200000,
          owned_by: 'nb-corp',
          description: p.summary,
        })),
      ];
      writeJson(res, 200, { object: 'list', data: models }, enableCors);
      return;
    }

    if (req.method === 'POST' && urlPath === '/v1/speak/lint') {
      try {
        const body = await readJsonBody(req);
        const target = body.payload ?? body;
        const options = (typeof body.options === 'object' && body.options !== null ? body.options : {})               ;
        const report = lintTurn(target, options);
        writeJson(res, 200, report, enableCors);
      } catch (err) {
        writeJson(
          res,
          (err                       )?.status ?? 400,
          { error: { message: err instanceof Error ? err.message : String(err), code: 'bad_request' } },
          enableCors,
        );
      }
      return;
    }

    if (req.method === 'POST' && urlPath === '/v1/speak/parse') {
      try {
        const body = await readJsonBody(req);
        const turn = normalizeTurnOutput(body.input ?? body, {
          cleanHygiene: typeof body.cleanHygiene === 'boolean' ? body.cleanHygiene : true,
        });
        writeJson(res, 200, { turn, events: turnToEvents(turn) }, enableCors);
      } catch (err) {
        writeJson(
          res,
          (err                       )?.status ?? 400,
          { error: { message: err instanceof Error ? err.message : String(err), code: 'bad_request' } },
          enableCors,
        );
      }
      return;
    }

    if (req.method !== 'POST' || urlPath !== '/v1/chat/completions') {
      writeJson(res, 404, { error: { message: `Unsupported endpoint: ${urlPath}`, code: 'not_found' } }, enableCors);
      return;
    }

    let body                         ;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      writeJson(
        res,
        (err                       )?.status ?? 400,
        { error: { message: err instanceof Error ? err.message : String(err), code: 'bad_request' } },
        enableCors,
      );
      return;
    }

    const headerUpstream = typeof req.headers['x-nb-speak-upstream'] === 'string' ? req.headers['x-nb-speak-upstream'] : '';
    const upstreamBase = headerUpstream || config.upstreamBaseUrl || '';
    const endpoint = resolveChatCompletionsEndpoint(upstreamBase);
    if (!endpoint) {
      writeJson(
        res,
        503,
        {
          error: {
            message:
              'Upstream LLM URL is not configured. Pass --upstream-url <url> (or NB_SPEAK_UPSTREAM_URL) or send header x-nb-speak-upstream.',
            code: 'upstream_unconfigured',
          },
        },
        enableCors,
      );
      return;
    }

    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearer = authHeader || (config.upstreamApiKey ? `Bearer ${config.upstreamApiKey}` : '');
    const headerPersona = typeof req.headers['x-nb-speak-persona'] === 'string'
      ? (req.headers['x-nb-speak-persona']                   )
      : undefined;
    const headerSoul = typeof req.headers['x-nb-speak-soul'] === 'string'
      ? decodeURIComponent(req.headers['x-nb-speak-soul'])
      : undefined;
    const injectHeader = req.headers['x-nb-speak-inject'];
    const shouldInject = injectHeader === 'false' ? false : (config.injectSpeakLayer ?? true);
    const structuredEvents =
      req.headers['x-nb-speak-events'] === 'structured' || Boolean(body.speak_stream);

    const activePersona                  = headerPersona ?? config.persona ?? 'neutral_peer';
    const activeSoul = (typeof body.soul === 'string' ? body.soul : undefined) ?? headerSoul ?? config.customSoul;

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const outgoingMessages = shouldInject
      ? prependSpeakSystemMessage(rawMessages, activePersona, activeSoul, enableVoiceNotes)
      : rawMessages;
    const outgoingTools = shouldInject
      ? mergeSpeakTools(Array.isArray(body.tools) ? body.tools : undefined, enableVoiceNotes)
      : body.tools;

    const requestedModel = typeof body.model === 'string' && !body.model.startsWith('nb-speak/')
      ? body.model
      : (config.defaultModel ?? 'deepseek-chat');

    const streamRequested = Boolean(body.stream);
    const upstreamBody                          = {
      ...body,
      model: requestedModel,
      messages: outgoingMessages,
      stream: streamRequested,
    };
    delete upstreamBody.speak_stream;
    delete upstreamBody.soul;
    if (outgoingTools !== undefined) {
      upstreamBody.tools = outgoingTools;
    }

    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abortController.abort();
    };
    res.on('close', onClose);

    try {
      const upstreamHeaders                         = {
        'content-type': 'application/json',
        accept: streamRequested ? 'text/event-stream, application/json' : 'application/json',
      };
      if (bearer) upstreamHeaders.authorization = bearer;

      const upstreamRes = await fetchFn(endpoint, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: abortController.signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        writeJson(
          res,
          upstreamRes.status,
          { error: { message: `Upstream HTTP ${upstreamRes.status}: ${errText.slice(0, 280)}`, code: 'upstream_error' } },
          enableCors,
        );
        return;
      }

      const contentType = String(upstreamRes.headers.get('content-type') ?? '').toLowerCase();

      if (!streamRequested || !contentType.includes('text/event-stream') || !upstreamRes.body) {
        const rawJson = (await upstreamRes.json())                           ;
        let turn = normalizeTurnOutput(rawJson);
        if (turn.source === 'plain_fallback' && config.voiceSidecarUrl && turn.bubbles.length > 0) {
          turn = await translateDraftViaSidecar(turn.bubbles.join('\n\n'), {
            baseUrl: config.voiceSidecarUrl,
            apiKey: config.upstreamApiKey,
            model: config.voiceSidecarModel,
            fetchImpl: fetchFn,
          });
        }
        writeJson(res, 200, { ...rawJson, nb_speak: turn }, enableCors);
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        ...(enableCors ? CORS_HEADERS : {}),
      });

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      const accumulator = new SpeakStreamAccumulator();
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
            const parsedChunk = JSON.parse(dataStr)                           ;
            accumulator.pushOpenAIChunk(parsedChunk);
            if (!structuredEvents) {
              res.write(`data: ${JSON.stringify(parsedChunk)}\n\n`);
            }
          } catch {
            if (!structuredEvents) {
              res.write(`data: ${dataStr}\n\n`);
            }
          }
        }
      }

      let finalTurn = accumulator.finalize();
      if (finalTurn.source === 'plain_fallback' && config.voiceSidecarUrl && finalTurn.bubbles.length > 0) {
        finalTurn = await translateDraftViaSidecar(finalTurn.bubbles.join('\n\n'), {
          baseUrl: config.voiceSidecarUrl,
          apiKey: config.upstreamApiKey,
          model: config.voiceSidecarModel,
          fetchImpl: fetchFn,
        });
      }

      for (const evt of turnToEvents(finalTurn)) {
        res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        writeJson(
          res,
          502,
          { error: { message: err instanceof Error ? err.message : String(err), code: 'bridge_error' } },
          enableCors,
        );
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
    server.listen(requestedPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr !== null ? addr.port : requestedPort;
  let closed = false;

  return {
    server,
    host,
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}`,
    v1BaseUrl: `http://${host}:${actualPort}/v1`,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise      ((resolve) => server.close(() => resolve()));
    },
  };
}
