import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSpeakSystemPrompt,
  NB_SPEAK_VERSION,
  PERSONA_PRESETS,
                       
} from './core.js';
import { lintTurn,                  } from './core.js';
import {
  formatTableForChannel,
  transformOutboundText,
                        
} from './core.js';

export const MCP_SERVER_NAME = '@nb-corp/nb-speak-mcp';
export const MCP_REGISTRY_ID = 'io.github.NB-Corp/nb-speak';
const DEFAULT_MCP_PROTOCOL_VERSION = '2024-11-05';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
]);

                                 
                          
                                       
                          
                                            
 

                                  
                          
                                      
                            
                    
                          
                             
                            
    
 

                                   
                                            
                                      
                                      
 

function resolveDefaultSkillPath()         {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.resolve(here, '..', 'skills', 'chat-human', 'SKILL.md');
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(here, '..', '..', '..', 'skills', 'chat-human', 'SKILL.md');
}

function normalizePersona(raw         , fallback                  = 'neutral_peer')                  {
  const s = String(raw ?? '').trim();
  if (
    s === 'neutral_peer' ||
    s === 'sharp_lead' ||
    s === 'warm_companion' ||
    s === 'calm_sre' ||
    s === 'custom'
  ) {
    return s;
  }
  return fallback;
}

function normalizeTableMode(raw         )                   {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'kv' || s === 'code' ? s : 'auto';
}

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'format_im_bubbles',
    description:
      'Convert a raw LLM draft, 250-word Markdown wall, or pipe table into paced thumb-typed IM bubbles, mobile key-value/monospace cards, typing delays, and a deterministic bubble_lint report.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'Raw assistant draft or Markdown message to split and format for mobile IM.',
        },
        channel: {
          type: 'string',
          description:
            'Target IM channel (e.g. telegram, whatsapp, discord, signal, wechat, qq, feishu, slack). Narrow channels automatically convert pipe tables to key-value cards.',
        },
        table_mode: {
          type: 'string',
          enum: ['auto', 'kv', 'code'],
          default: 'auto',
          description: 'Table rendering mode: auto (channel-aware), kv (compact key-value bullets), or code (<=40-col monospace).',
        },
        max_bubbles: {
          type: 'integer',
          minimum: 1,
          maximum: 6,
          default: 4,
          description: 'Maximum conversational text bubbles before moving overflow detail into a note card.',
        },
        max_monospace_width: {
          type: 'integer',
          minimum: 24,
          maximum: 120,
          default: 40,
          description: 'Maximum monospace display width before wide tables degrade to mobile key-value cards.',
        },
      },
    },
  },
  {
    name: 'lint_im_turn',
    description:
      'Run the deterministic 8-rule bubble_lint gate on a plain-text IM reply or structured { bubbles, voice_note } JSON turn.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['input'],
      properties: {
        input: {
          type: 'string',
          description: 'Plain-text IM reply (paragraphs separated by blank lines) or JSON string with { bubbles, voice_note }.',
        },
        surface: {
          type: 'string',
          enum: ['auto', 'plain', 'json'],
          default: 'auto',
        },
        max_bubbles: {
          type: 'integer',
          minimum: 1,
          maximum: 6,
          default: 4,
        },
        persona_emoji: {
          type: 'string',
          enum: ['deny', 'allow'],
          default: 'deny',
        },
      },
    },
  },
  {
    name: 'format_markdown_table',
    description:
      'Convert a raw Markdown pipe table (|---|---|) into a mobile-safe key-value card or <=40-column aligned monospace block.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['table_markdown'],
      properties: {
        table_markdown: {
          type: 'string',
          description: 'Raw Markdown pipe table to convert.',
        },
        channel: {
          type: 'string',
          description: 'Target IM surface (e.g. whatsapp, telegram, wechat, discord).',
        },
        table_mode: {
          type: 'string',
          enum: ['auto', 'kv', 'code'],
          default: 'auto',
        },
        title: {
          type: 'string',
          description: 'Optional compact heading label for key-value cards.',
        },
        max_monospace_width: {
          type: 'integer',
          minimum: 24,
          maximum: 120,
          default: 40,
          description: 'Maximum monospace display width before wide tables degrade to mobile key-value cards.',
        },
      },
    },
  },
]         ;

export function createMcpRequestHandler(options                   = {}) {
  const defaultPersona = options.defaultPersona ?? 'neutral_peer';
  // Voice notes strictly disabled by default unless explicitly opted in.
  const defaultEnableVoiceNotes = options.enableVoiceNotes === true;
  const skillPath = options.skillMarkdownPath ?? resolveDefaultSkillPath();

  return function handleRequest(req                )                              {
    if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      return {
        jsonrpc: '2.0',
        id: req?.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
      };
    }

    // JSON-RPC notifications carry no `id` and expect zero response frames
    if (req.id === undefined) {
      return undefined;
    }

    const id = req.id;
    const params = (req.params && typeof req.params === 'object' ? req.params : {})                           ;

    if (req.method === 'initialize') {
      const requestedVersion = String(params.protocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION);
      const negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
        ? requestedVersion
        : DEFAULT_MCP_PROTOCOL_VERSION;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: NB_SPEAK_VERSION,
          },
        },
      };
    }

    if (req.method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOL_DEFINITIONS,
        },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = String(params.name ?? '');
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {})           
               
               
       ;

      if (toolName === 'format_im_bubbles') {
        if (typeof args.text !== 'string') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: 'Missing required string argument: text' }],
            },
          };
        }
        const maxBubblesRaw = Number(args.max_bubbles ?? 4);
        const maxWidthRaw = Number(args.max_monospace_width ?? 40);
        const transformed = transformOutboundText(args.text, {
          channel: typeof args.channel === 'string' ? args.channel : undefined,
          tableMode: normalizeTableMode(args.table_mode),
          maxBubbles: Number.isFinite(maxBubblesRaw) ? Math.max(1, Math.min(6, Math.round(maxBubblesRaw))) : 4,
          maxMonospaceWidth: Number.isFinite(maxWidthRaw) ? Math.max(24, Math.min(120, Math.round(maxWidthRaw))) : 40,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: transformed.primaryText }],
            structuredContent: {
              changed: transformed.changed,
              primaryText: transformed.primaryText,
              bubbles: transformed.bubbles,
              artifactCards: transformed.artifactCards,
              schedule: transformed.schedule,
              lint: transformed.lint,
            },
          },
        };
      }

      if (toolName === 'lint_im_turn') {
        if (typeof args.input !== 'string') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: 'Missing required string argument: input' }],
            },
          };
        }
        const surfaceRaw = String(args.surface ?? 'auto');
        const surface              = surfaceRaw === 'plain' || surfaceRaw === 'json' ? surfaceRaw : 'auto';
        const personaEmoji = args.persona_emoji === 'allow' ? 'allow' : 'deny';
        const maxBubblesRaw = Number(args.max_bubbles ?? 4);
        const report = lintTurn(args.input, {
          surface,
          personaEmoji,
          maxBubbles: Number.isFinite(maxBubblesRaw) ? Math.max(1, Math.min(6, Math.round(maxBubblesRaw))) : 4,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
            structuredContent: report,
          },
        };
      }

      if (toolName === 'format_markdown_table') {
        if (typeof args.table_markdown !== 'string') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: 'Missing required string argument: table_markdown' }],
            },
          };
        }
        const maxWidthRaw = Number(args.max_monospace_width ?? 40);
        const card = formatTableForChannel(args.table_markdown, {
          channel: typeof args.channel === 'string' ? args.channel : undefined,
          tableMode: normalizeTableMode(args.table_mode),
          maxMonospaceWidth: Number.isFinite(maxWidthRaw) ? Math.max(24, Math.min(120, Math.round(maxWidthRaw))) : 40,
          title: typeof args.title === 'string' ? args.title : undefined,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: card }],
            structuredContent: { formatted: card },
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Tool ${toolName} not found` },
      };
    }

    if (req.method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'chat-human',
              description:
                'Universal IM bubble physics + pluggable persona layer (stops raw Markdown pipe tables, 250-word walls, stage brackets, and concierge sign-offs; voice notes off by default).',
              arguments: [
                {
                  name: 'persona',
                  description: `Tone preset (${Object.keys(PERSONA_PRESETS).join(' | ')})`,
                  required: false,
                },
                {
                  name: 'enable_voice_notes',
                  description: 'Set to "true" to enable optional voice_note guidance (default: "false").',
                  required: false,
                },
              ],
            },
          ],
        },
      };
    }

    if (req.method === 'prompts/get') {
      const promptName = String(params.name ?? '');
      if (promptName !== 'chat-human') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown prompt: ${promptName}` },
        };
      }
      const promptArgs = (params.arguments && typeof params.arguments === 'object'
        ? params.arguments
        : {})                           ;
      const persona = normalizePersona(promptArgs.persona, defaultPersona);
      const voiceEnabled =
        promptArgs.enable_voice_notes === undefined
          ? defaultEnableVoiceNotes
          : String(promptArgs.enable_voice_notes).trim().toLowerCase() === 'true';
      const systemLayer = buildSpeakSystemPrompt({
        persona,
        enableVoiceNotes: voiceEnabled,
      });
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: `chat-human IM bubble physics (${persona}, voiceNotes=${voiceEnabled})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: systemLayer,
              },
            },
          ],
        },
      };
    }

    if (req.method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'nb-speak://skills/chat-human',
              name: 'chat-human SKILL.md',
              description: 'Canonical Layer 1 IM bubble physics & Layer 2 persona skill specification.',
              mimeType: 'text/markdown',
            },
          ],
        },
      };
    }

    if (req.method === 'resources/read') {
      const uri = String(params.uri ?? '');
      if (uri !== 'nb-speak://skills/chat-human') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown resource URI: ${uri}` },
        };
      }
      const text = fs.existsSync(skillPath)
        ? fs.readFileSync(skillPath, 'utf8')
        : buildSpeakSystemPrompt({ persona: defaultPersona, enableVoiceNotes: defaultEnableVoiceNotes });
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text,
            },
          ],
        },
      };
    }

    if (req.method === 'resources/templates/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resourceTemplates: [],
        },
      };
    }

    if (req.method === 'completion/complete') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          completion: {
            values: [],
            total: 0,
            hasMore: false,
          },
        },
      };
    }

    if (req.method === 'logging/setLevel') {
      return {
        jsonrpc: '2.0',
        id,
        result: {},
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    };
  };
}

export function parseMcpCliOptions(argv                   )                   {
  let defaultPersona                  = 'neutral_peer';
  let enableVoiceNotes = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--persona' && argv[i + 1]) {
      defaultPersona = normalizePersona(argv[++i], 'neutral_peer');
    } else if (arg === '--voice-notes') {
      enableVoiceNotes = true;
    }
  }
  return { defaultPersona, enableVoiceNotes };
}

/**
 * Dual-framing stdio transport:
 * - Standard MCP newline-delimited JSON-RPC 2.0 (`JSON.stringify(msg) + "\n"`)
 * - Automatic fallback for legacy `Content-Length: <n>\r\n\r\n` LSP-framed hosts
 */
export function attachMcpStreams(
  input                       ,
  output                       ,
  options                   = {},
)                        {
  const handleRequest = createMcpRequestHandler(options);
  let buffer = Buffer.alloc(0);
  let framingMode                                         ;

  const sendResponse = (res                 )       => {
    const payload = JSON.stringify(res);
    if (framingMode === 'content-length') {
      const byteLen = Buffer.byteLength(payload, 'utf8');
      output.write(`Content-Length: ${byteLen}\r\n\r\n${payload}`);
    } else {
      output.write(`${payload}\n`);
    }
  };

  const dispatchJsonText = (rawJson        )       => {
    const trimmed = rawJson.trim();
    if (!trimmed) return;
    let parsed         ;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    if (Array.isArray(parsed)) {
      const batchReplies = parsed
        .map((item) => handleRequest(item                  ))
        .filter((r)                       => r !== undefined);
      for (const r of batchReplies) sendResponse(r);
      return;
    }

    const reply = handleRequest(parsed                  );
    if (reply !== undefined) sendResponse(reply);
  };

  const drainBuffer = ()       => {
    while (buffer.length > 0) {
      if (!framingMode) {
        const preview = buffer.subarray(0, Math.min(buffer.length, 32)).toString('utf8').trimStart();
        if (!preview) return;
        framingMode = /^content-length\s*:/i.test(preview) ? 'content-length' : 'ndjson';
      }

      if (framingMode === 'content-length') {
        const sepIdx = buffer.indexOf('\r\n\r\n');
        if (sepIdx === -1) return;
        const headerBlock = buffer.subarray(0, sepIdx).toString('utf8');
        const match = headerBlock.match(/content-length\s*:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.subarray(sepIdx + 4);
          continue;
        }
        const bodyLen = Number(match[1]);
        const totalLen = sepIdx + 4 + bodyLen;
        if (buffer.length < totalLen) return;
        const jsonText = buffer.subarray(sepIdx + 4, totalLen).toString('utf8');
        buffer = buffer.subarray(totalLen);
        dispatchJsonText(jsonText);
      } else {
        const nlIdx = buffer.indexOf(0x0a);
        if (nlIdx === -1) return;
        const line = buffer.subarray(0, nlIdx).toString('utf8');
        buffer = buffer.subarray(nlIdx + 1);
        dispatchJsonText(line);
      }
    }
  };

  const onData = (chunk                 )       => {
    const nextBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    buffer = buffer.length === 0 ? nextBuf : Buffer.concat([buffer, nextBuf]);
    drainBuffer();
  };

  const onEnd = ()       => {
    if (buffer.length > 0 && framingMode !== 'content-length') {
      const trailing = buffer.toString('utf8');
      buffer = Buffer.alloc(0);
      dispatchJsonText(trailing);
    }
  };

  input.on('data', onData);
  input.on('end', onEnd);
  return {
    close() {
      input.off('data', onData);
      input.off('end', onEnd);
    },
  };
}

export function startMcpStdioServer(params                               = {})                        {
  const opts = parseMcpCliOptions(params.argv ?? []);
  return attachMcpStreams(process.stdin, process.stdout, opts);
}
