// Auto-generated from @nb-corp/nb-speak packages/core/src/{protocol,lint,parser,format}.ts — DO NOT HAND-EDIT

// --- protocol.ts ---
export const NB_SPEAK_VERSION = '0.2.0';
export const NB_SPEAK_PROTOCOL = 'nb-speak/1';

                                                                  

                          
             
          
          
         
              
             
              

                                   
                        
                                           
 

                                  
                                      
                                         
                             
                              
 

                                   
                         
                              
                             
                           
 

                                     
                         
                        
                            
                           
                           
                                    
                                
 

                             
                  
                
                    
              
             

                                
                                                  
                        
                          
                           
                                         
                                
 

export const PERSONA_PRESETS                                                                      = {
  neutral_peer: {
    id: 'neutral_peer',
    name: 'Neutral Engineer Peer',
    zhName: '平等技术搭档',
    summary: 'Relaxed, equal-footing teammate. Direct facts, zero corporate servility or uninvited roleplay.',
    emojiPolicy: 'deny',
    instructions:
      'Speak as an equal-footing engineering teammate. Give live numbers and direct calls without textbook explanations, corporate boilerplate, or unsolicited nanny reminders.',
  },
  sharp_lead: {
    id: 'sharp_lead',
    name: 'Sharp Tech Lead',
    zhName: '干练技术负责人',
    summary: 'Crisp judgment, dry wit, high signal-to-noise ratio. Cuts straight to the blocker or ship call.',
    emojiPolicy: 'deny',
    instructions:
      'Speak as a candid, high-trust tech lead. Lead with the ship/hold verdict, trim hedges, allow dry understatement when something is over-engineered, and offload all patches to send_artifact.',
  },
  warm_companion: {
    id: 'warm_companion',
    name: 'Warm Companion',
    zhName: '熟稔日常伙伴',
    summary: 'Attentive, natural close friend in 1-on-1 DMs. Spoken rhythm without stage brackets or clingy clichés.',
    emojiPolicy: 'deny',
    instructions:
      'Speak like a close everyday companion texting from a phone. Keep beats lively and warm through verb choice and natural spoken rhythm, never RPG stage brackets (*sighs*) or robotic eat/sleep checklists.',
  },
  calm_sre: {
    id: 'calm_sre',
    name: 'Calm SRE Relay',
    zhName: '沉稳值班 SRE',
    summary: 'Zero-panic incident & canary relay. Pure metrics, action status, and next gate in <=2 beats.',
    emojiPolicy: 'deny',
    instructions:
      'Speak as an on-call SRE peer during live operations. State error rate, latency, saturation, and immediate action in 1-2 short bubbles with zero hypothetical lectures.',
  },
};

export const SEND_MESSAGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bubbles'],
  properties: {
    bubbles: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'string',
        minLength: 1,
        description:
          'One short thumb-typed IM bubble (4-28 CJK chars or 4-22 English words). Omit trailing periods on short single-clause beats. Never embed Markdown tables, headers, or code fences.',
      },
      description:
        'Ordered 1-4 short chat bubbles delivered sequentially with natural typing cadence. Default to 1-2 bubbles; use 1 crisp bubble for quick acknowledgments.',
    },
    voice_note: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description:
            'Optional complementary ear-side voice note attached strictly after the final bubble (4-10s; 15-40 CJK chars or 12-30 English words). Never read the text bubble aloud; spell numbers/times in spoken words and omit raw URLs or paths.',
        },
        emotion: {
          type: 'string',
          enum: ['neutral', 'warm', 'calm', 'dry', 'relieved', 'playful', 'serious'],
          description: 'Subtle acoustic register hint for downstream TTS synthesis.',
        },
      },
      description: 'Optional single voice note attached to the final bubble only.',
    },
    reply_to: {
      type: 'string',
      description: 'Optional message ID to quote-reply in multi-party or threaded IM channels.',
    },
    end_turn: {
      type: 'boolean',
      default: true,
      description: 'Set true on the final user-facing message of this turn so no duplicate plain text follows.',
    },
  },
}         ;

export const SEND_MESSAGE_TEXT_ONLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bubbles'],
  properties: {
    bubbles: SEND_MESSAGE_JSON_SCHEMA.properties.bubbles,
    reply_to: SEND_MESSAGE_JSON_SCHEMA.properties.reply_to,
    end_turn: SEND_MESSAGE_JSON_SCHEMA.properties.end_turn,
  },
}         ;

export function getSendMessageJsonSchema(enableVoiceNotes = false)                          {
  return (enableVoiceNotes ? SEND_MESSAGE_JSON_SCHEMA : SEND_MESSAGE_TEXT_ONLY_JSON_SCHEMA)                                      ;
}

export const SEND_ARTIFACT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'kind', 'content'],
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      description: 'Concise artifact card title (e.g. "canary-rollback.sql" or "Latency Breakdown").',
    },
    kind: {
      type: 'string',
      enum: ['code', 'markdown', 'diff', 'table'],
      description: 'Structured artifact surface kind rendered outside the narrow chat bubble stream.',
    },
    language: {
      type: 'string',
      description: 'Programming or query language tag when kind is "code" or "diff" (e.g. "sql", "ts", "python").',
    },
    content: {
      type: 'string',
      minLength: 1,
      description: 'Complete code, unified diff, Markdown table, or longform note content.',
    },
  },
}         ;

                                       
                            
                      
                          
                                 
                                                 
    
 

                                          
                        
                               
                                                 
 

                                            
                        
                               
                                               
 

export const SEND_MESSAGE_DESCRIPTION =
  'Deliver 1-4 paced, thumb-typed IM chat bubbles to the human user, with an optional complementary voice note on the final bubble. Use this instead of raw Markdown paragraphs.';

export const SEND_MESSAGE_TEXT_ONLY_DESCRIPTION =
  'Deliver 1-4 paced, thumb-typed IM chat bubbles to the human user. Use this instead of raw Markdown paragraphs.';

export const SEND_ARTIFACT_DESCRIPTION =
  'Deliver multi-line code, SQL queries, unified diffs, or Markdown comparison tables as a clean slide-out artifact card outside chat bubbles.';

export function getOpenAISpeakTools(options    
                                     
                                      
                                    
                                     
 )                         {
  const msgName = options?.sendMessageName ?? 'send_message';
  const artName = options?.sendArtifactName ?? 'send_artifact';
  const enableVoiceNotes = options?.enableVoiceNotes ?? false;
  const tools                         = [
    {
      type: 'function',
      function: {
        name: msgName,
        description: enableVoiceNotes ? SEND_MESSAGE_DESCRIPTION : SEND_MESSAGE_TEXT_ONLY_DESCRIPTION,
        parameters: getSendMessageJsonSchema(enableVoiceNotes),
      },
    },
  ];
  if (options?.includeArtifact !== false) {
    tools.push({
      type: 'function',
      function: {
        name: artName,
        description: SEND_ARTIFACT_DESCRIPTION,
        parameters: SEND_ARTIFACT_JSON_SCHEMA                                      ,
      },
    });
  }
  return tools;
}

export function getAnthropicSpeakTools(options    
                                     
                                      
 )                            {
  return getOpenAISpeakTools(options).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export function getGeminiSpeakTools(options    
                                     
                                      
 )                                                                 {
  return {
    functionDeclarations: getOpenAISpeakTools(options).map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  };
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const EN_WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g;

export function countTextUnits(text        )                                                          {
  const cjkMatches = text.match(CJK_RE);
  const cjkChars = cjkMatches ? cjkMatches.length : 0;
  const stripped = text.replace(CJK_RE, ' ');
  const enMatches = stripped.match(EN_WORD_RE);
  const enWords = enMatches ? enMatches.length : 0;
  return { cjkChars, enWords };
}

                                 
                                       
                                     
                                     
                                    
 

export function computeBubbleSchedule(
  bubbles                   ,
  options                 = {},
)                       {
  const firstDelay = options.firstBubbleDelayMs ?? 240;
  const minDelay = options.minInterBubbleMs ?? 360;
  const maxDelay = options.maxInterBubbleMs ?? 2100;
  const speed = options.speedMultiplier && options.speedMultiplier > 0 ? options.speedMultiplier : 1.0;

  let cumulativeMs = 0;
  return bubbles.map((rawText, index) => {
    const text = String(rawText ?? '').trim();
    const { cjkChars, enWords } = countTextUnits(text);
    const clauseBreaks = (text.match(/[，,、；;：:—–-]/g) ?? []).length;
    const rawTyping = Math.round((190 + cjkChars * 42 + enWords * 56 + clauseBreaks * 75) / speed);
    const typingDurationMs = Math.max(minDelay, Math.min(maxDelay, rawTyping));
    const delayMs = index === 0 ? Math.round(firstDelay / speed) : typingDurationMs;
    cumulativeMs += delayMs;
    return {
      index,
      text,
      cjkChars,
      enWords,
      delayMs,
      typingDurationMs,
      cumulativeMs,
    };
  });
}

                                           
                                     
                               
                                      
                                    
                                    
                                    
                                     
 

export function buildSpeakSystemPrompt(options                           = {})         {
  const msgTool = options.sendMessageName ?? 'send_message';
  const artTool = options.sendArtifactName ?? 'send_artifact';
  const presetKey = options.persona && options.persona !== 'custom' ? options.persona : 'neutral_peer';
  const preset = PERSONA_PRESETS[presetKey] ?? PERSONA_PRESETS.neutral_peer;
  const personaGuidance = options.customSoul?.trim() ? options.customSoul.trim() : preset.instructions;
  const voiceEnabled = options.enableVoiceNotes ?? options.allowVoiceNote ?? false;
  const voiceLines = voiceEnabled
    ? [
        '- Optional `voice_note` attaches ONLY to the final bubble (4-10s). Never read the text bubble aloud; put numbers/IDs/URLs in text and use `voice_note.text` for a spoken aside with numbers spelled as words.',
      ]
    : options.allowVoiceNote === false
      ? ['- Do not attach `voice_note` on this channel.']
      : [];
  const artifactLine =
    options.allowArtifacts === false
      ? '- Keep answers concise without code blocks or tables inside bubbles.'
      : `- Offload multi-line code, SQL, diffs, and Markdown tables via \`${artTool}\`, then summarize the verdict in 1-2 short bubbles via \`${msgTool}\`.`;

  return [
    `# nb-speak · IM Delivery Contract (${NB_SPEAK_PROTOCOL})`,
    `Deliver user-facing replies by calling \`${msgTool}\` with \`end_turn: true\` instead of dumping raw Markdown essays.`,
    '- Default to 1-2 thumb-typed bubbles (4-28 CJK chars or 4-22 English words total); send 1 crisp bubble on simple acknowledgments or closings, and never exceed 4 bubbles.',
    '- Omit trailing periods (`。` / `.`) on short single-clause bubbles and never glue a period after copyable codes or IDs.',
    '- Ban RPG stage brackets (`*sighs*`, `（叹气）`), subordinate concierge clichés (`向你汇报`, `for your review`, `let me know if you need anything`), and unrequested risk lectures.',
    artifactLine,
    ...voiceLines,
    '',
    '## Active Persona Layer',
    personaGuidance,
  ].join('\n');
}

// --- lint.ts ---
const MD_HEADER_RE = /^\s*#{1,6}\s+\S/m;
const MD_TABLE_RE = /^\s*\|.*\|\s*\r?\n^\s*\|[\s:\-|]+\|\s*$/m;
const MD_CODE_FENCE_RE = /```/;
const MD_BOLD_BULLET_RE = /^\s*[-*]\s+\*\*[^*\n]+\*\*/m;
const NUMBERED_WALL_RE = /(?:^|\n)\s*1[.)]\s+.+(?:\n\s*2[.)]\s+.+)/s;
const RAW_URL_RE = /https?:\/\/\S+/i;
const WIN_OR_UNIX_PATH_RE = /(?:[A-Za-z]:\\[A-Za-z0-9_.\-\\]+|\/(?:usr|etc|var|opt|home|Users|tmp)\/[A-Za-z0-9_.\-/]+)/;
const RAW_DECIMAL_OR_TIME_RE = /(?<!\d)(?:\d+\.\d+|\d{1,2}:\d{2})(?!\.\d)/;
const LA_ENDING_CLAUSE_RE = /啦(?=(?:[\s\u{1F300}-\u{1FAFF}\u2600-\u27BF！!？?~～。，,]|$))/u;

const PLAIN_META_LEAK_RE = /(?:\{\s*"(?:messages|bubbles)"\s*:|(?:^|\n)\s*(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]|```json)/i;
const PLACEHOLDER_LEAK_RE = /\{\{\s*(?:user|char)\s*\}\}/i;
const SYSTEM_ERROR_LEAK_RE =
  /(?:语音合成插件|语音服务没启用|未配置.{0,8}(?:TTS|语音)|media\s+provider|tts\s+(?:plugin|provider)\s+(?:not|is\s+not|missing))/i;

const STAGE_BRACKET_RE =
  /(?:\*[a-zA-Z][a-zA-Z\s-]{1,28}\*|[（(](?:叹气|笑|微笑|苦笑|歪头|叉腰|双手叉腰|气鼓鼓|摸头|摸摸头|捂脸|扶额|耸肩|小声|轻声|皱眉|眨眼|挑眉|擦汗|深呼吸|sighs?|smiles?|laughs?|giggles?|tilts\s+head|shrugs?|whispers?|grins?|rolls\s+eyes)[）)])/i;

const STEWARD_CLICHE_RE =
  /(?:向你汇报|请(?:随时)?检阅|顺手替你|乖乖(?:去)?(?:睡觉|补觉)|希望(?:这)?(?:对您|对你)?有帮助|reporting\s+back\s+to\s+you|for\s+your\s+(?:kind\s+)?review|hope\s+this\s+helps|let\s+me\s+know\s+if\s+you\s+need\s+anything\s+else)/i;

const EMOJI_RE =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/u;

const ABBREV_END_RE = /\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$/i;
const CODE_PERIOD_END_RE = /[A-Za-z0-9]{4,}[。.]$/;

                                 
                        
                              
                                  
 

                                 
                                                     
                                        
                                      
                                 
                                  
                                   
 

function endsWithFormalPeriod(text        )          {
  const s = text.trim();
  if (!s) return false;
  if (s.endsWith('。')) return true;
  if (s.endsWith('.') && !s.endsWith('..') && !ABBREV_END_RE.test(s)) return true;
  return false;
}

function isShortSingleClauseWithPeriod(text        )          {
  const s = text.trim();
  if (!endsWithFormalPeriod(s)) return false;
  if (CODE_PERIOD_END_RE.test(s)) return true;
  const body = s.slice(0, -1).trim();
  if (/[。！？!?；;]/.test(body)) return false;
  const { cjkChars, enWords } = countTextUnits(body);
  if (cjkChars > 0 && cjkChars <= 22 && enWords <= 6) return true;
  if (cjkChars === 0 && enWords > 0 && enWords <= 12) return true;
  return false;
}

export function charBigrams(text        )              {
  const cleaned = text.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
  if (cleaned.length < 2) {
    return cleaned ? new Set([cleaned]) : new Set();
  }
  const grams = new Set        ();
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    grams.add(cleaned.slice(i, i + 2));
  }
  return grams;
}

export function computeVoiceOverlap(bubbleTexts                   , ttsText        )         {
  const bGrams = charBigrams(bubbleTexts.join(' '));
  const tGrams = charBigrams(ttsText);
  if (bGrams.size === 0 || tGrams.size === 0) return 0;
  let shared = 0;
  for (const g of tGrams) {
    if (bGrams.has(g)) shared += 1;
  }
  return shared / tGrams.size;
}

export function splitPlainBeats(raw        , explicitPlainSurface         )           {
  const stripped = raw.trim();
  if (!stripped) return [];
  if (/\n\s*\n/.test(stripped)) {
    return stripped
      .split(/\n\s*\n+/)
      .map((blk) => blk.trim())
      .filter(Boolean);
  }
  if (MD_TABLE_RE.test(stripped) || MD_CODE_FENCE_RE.test(stripped) || NUMBERED_WALL_RE.test(stripped)) {
    return [stripped];
  }
  const lines = stripped
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);
  if (explicitPlainSurface && lines.length <= 2) {
    return [lines.join('\n')];
  }
  return lines;
}

function normalizeInputToPayload(
  input         ,
  surface             ,
  explicitTtsText         ,
)                        {
  let obj                         ;
  let plainMetaLeak = false;

  if (typeof input === 'string') {
    const stripped = input.trim();
    if (surface === 'plain') {
      plainMetaLeak = PLAIN_META_LEAK_RE.test(stripped);
      const beats = splitPlainBeats(stripped, true);
      obj = { messages: beats.map((b) => ({ text: b })) };
    } else if (surface === 'json' || (surface === 'auto' && (stripped.startsWith('{') || stripped.startsWith('[')))) {
      const parsed          = JSON.parse(stripped);
      if (Array.isArray(parsed)) {
        obj = { messages: parsed };
      } else if (typeof parsed === 'object' && parsed !== null) {
        obj = { ...(parsed                           ) };
      } else {
        throw new Error('JSON input must be an object or array of messages.');
      }
    } else {
      plainMetaLeak = PLAIN_META_LEAK_RE.test(stripped);
      const beats = splitPlainBeats(stripped, false);
      obj = { messages: beats.map((b) => ({ text: b })) };
    }
  } else if (Array.isArray(input)) {
    obj = { messages: input };
  } else if (typeof input === 'object' && input !== null) {
    obj = { ...(input                           ) };
  } else {
    return {
      entries: [],
      usedBubblesProtocol: false,
      usedMessagesArray: false,
      batchRootTts: false,
      plainMetaLeak: false,
      schemaError: { code: 'input.parse_error', level: 'error', message: 'Unsupported payload type.' },
    };
  }

  const rawBubbles = obj.bubbles;
  const rawMessages = obj.messages;
  const usedBubblesProtocol = rawBubbles !== undefined && rawMessages === undefined;

  let entries                          = [];
  let usedMessagesArray = false;

  if (usedBubblesProtocol) {
    if (!Array.isArray(rawBubbles)) {
      return {
        entries: [],
        usedBubblesProtocol: true,
        usedMessagesArray: false,
        batchRootTts: false,
        plainMetaLeak,
        schemaError: { code: 'schema.invalid_bubbles', level: 'error', message: '`bubbles` must be an array.' },
      };
    }
    entries = rawBubbles.map((item) =>
      typeof item === 'object' && item !== null
        ? { text: String((item                           ).text ?? '') }
        : { text: String(item ?? '') },
    );
    const vn = obj.voice_note ?? obj.voiceNote;
    if (typeof vn === 'object' && vn !== null) {
      const vnText = String((vn                           ).text ?? '').trim();
      const emotion = typeof (vn                           ).emotion === 'string'
        ? String((vn                           ).emotion)
        : undefined;
      if (vnText) {
        if (entries.length > 0) {
          const last = entries[entries.length - 1] ;
          entries[entries.length - 1] = { ...last, voiceMode: 'append', tts: { text: vnText, emotion } };
        } else {
          entries = [{ text: '', voiceMode: 'only', tts: { text: vnText, emotion } }];
        }
      }
    }
  } else if (rawMessages !== undefined) {
    if (!Array.isArray(rawMessages)) {
      return {
        entries: [],
        usedBubblesProtocol: false,
        usedMessagesArray: true,
        batchRootTts: false,
        plainMetaLeak,
        schemaError: { code: 'schema.invalid_messages', level: 'error', message: '`messages` must be an array.' },
      };
    }
    usedMessagesArray = true;
    entries = rawMessages.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const rec = item                           ;
        const ttsObj = typeof rec.tts === 'object' && rec.tts !== null ? (rec.tts                           ) : undefined;
        return {
          text: String(rec.text ?? ''),
          voiceMode: typeof rec.voice_mode === 'string' ? rec.voice_mode : undefined,
          tts: ttsObj ? { text: String(ttsObj.text ?? '') } : undefined,
        };
      }
      return { text: String(item ?? '') };
    });
  } else {
    const ttsObj = typeof obj.tts === 'object' && obj.tts !== null ? (obj.tts                           ) : undefined;
    entries = [
      {
        text: String(obj.text ?? ''),
        voiceMode: typeof obj.voice_mode === 'string' ? obj.voice_mode : undefined,
        tts: ttsObj ? { text: String(ttsObj.text ?? '') } : undefined,
      },
    ];
  }

  if (explicitTtsText && explicitTtsText.trim()) {
    if (entries.length > 0) {
      const last = entries[entries.length - 1] ;
      entries[entries.length - 1] = { ...last, voiceMode: 'append', tts: { text: explicitTtsText.trim() } };
    } else {
      entries = [{ text: '', voiceMode: 'only', tts: { text: explicitTtsText.trim() } }];
    }
  }

  const topVoiceMode = typeof obj.voice_mode === 'string' ? obj.voice_mode : undefined;
  const batchRootTts =
    usedMessagesArray &&
    entries.length > 1 &&
    ((Boolean(topVoiceMode) && topVoiceMode !== 'none') || obj.tts !== undefined);

  return {
    entries,
    usedBubblesProtocol,
    usedMessagesArray,
    batchRootTts,
    plainMetaLeak,
  };
}

export function lintTurn(input         , options              = {})             {
  const surface = options.surface ?? 'auto';
  const maxCjkChars = options.maxCjkChars ?? 55;
  const maxEnWords = options.maxEnWords ?? 45;
  const personaEmoji = options.personaEmoji ?? 'deny';
  const maxTtsOverlap = options.maxTtsOverlap ?? 0.5;

  let normalized                       ;
  try {
    normalized = normalizeInputToPayload(input, surface, options.explicitTtsText);
  } catch (err) {
    const issue            = {
      code: 'input.parse_error',
      level: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    return {
      ok: false,
      issueCount: 1,
      errorCount: 1,
      warningCount: 0,
      stats: { bubbleCount: 0, totalCjkChars: 0, totalEnWords: 0, hasVoiceNote: false, ttsOverlap: 0 },
      issues: [issue],
    };
  }

  if (normalized.schemaError) {
    return {
      ok: false,
      issueCount: 1,
      errorCount: 1,
      warningCount: 0,
      stats: { bubbleCount: 0, totalCjkChars: 0, totalEnWords: 0, hasVoiceNote: false, ttsOverlap: 0 },
      issues: [normalized.schemaError],
    };
  }

  const issues              = [];
  if (normalized.plainMetaLeak) {
    issues.push({
      code: 'plain.meta_leak',
      level: 'error',
      message: 'Plain-reply output leaked raw `{"messages": ...}` / `{"bubbles": ...}` JSON or `Bubble 1:` labels.',
    });
  }

  const { entries } = normalized;
  const maxBubbles = options.maxBubbles ?? (normalized.usedBubblesProtocol ? 4 : 3);
  const nonEmptyTexts = entries.map((e) => e.text.trim()).filter(Boolean);
  const hasAnyTts =
    entries.some((e) => e.voiceMode === 'append' || e.voiceMode === 'only' || Boolean(e.tts)) ||
    normalized.batchRootTts;

  if (entries.length === 0 || (nonEmptyTexts.length === 0 && !hasAnyTts)) {
    issues.push({ code: 'bubble.empty', level: 'error', message: 'No chat bubbles found in payload.' });
    return {
      ok: false,
      issueCount: issues.length,
      errorCount: issues.filter((i) => i.level === 'error').length,
      warningCount: issues.filter((i) => i.level === 'warning').length,
      stats: { bubbleCount: 0, totalCjkChars: 0, totalEnWords: 0, hasVoiceNote: false, ttsOverlap: 0 },
      issues,
    };
  }

  if (entries.length > maxBubbles) {
    issues.push({
      code: 'bubble.too_many',
      level: 'error',
      message: `Found ${entries.length} bubbles (max ${maxBubbles}); consolidate or offload long detail via send_artifact.`,
    });
  }

  if (normalized.batchRootTts) {
    issues.push({
      code: 'tts.batch_root_duplication',
      level: 'error',
      message:
        'Top-level `voice_mode`/`tts` on a multi-bubble `messages[]` call duplicates voice notes; attach TTS only on the final bubble.',
    });
  }

  const bubbleTexts           = [];
  const ttsEntries                                                           = [];
  let laEndings = 0;
  let formalPeriodBubbles = 0;
  let shortPeriodFlagged = false;

  entries.forEach((entry, idx) => {
    const text = entry.text.trim();
    bubbleTexts.push(text);

    if (!normalized.plainMetaLeak && PLAIN_META_LEAK_RE.test(text)) {
      issues.push({
        code: 'plain.meta_leak',
        level: 'error',
        message: `Bubble ${idx + 1} contains \`Bubble 1:\` labels or raw JSON markup.`,
      });
    }

    if (
      MD_HEADER_RE.test(text) ||
      MD_TABLE_RE.test(text) ||
      MD_CODE_FENCE_RE.test(text) ||
      MD_BOLD_BULLET_RE.test(text) ||
      NUMBERED_WALL_RE.test(text)
    ) {
      issues.push({
        code: 'bubble.markdown_structure',
        level: 'error',
        message: `Bubble ${idx + 1} contains Markdown headers, tables, code fences, or structured list walls; offload via send_artifact.`,
      });
    }

    if (STAGE_BRACKET_RE.test(text)) {
      issues.push({
        code: 'style.stage_brackets',
        level: 'error',
        message: `Bubble ${idx + 1} contains RPG stage-direction brackets (\`*sighs*\` / \`（叹气）\`).`,
      });
    }

    if (PLACEHOLDER_LEAK_RE.test(text)) {
      issues.push({
        code: 'style.placeholder_leak',
        level: 'error',
        message: `Bubble ${idx + 1} contains unrendered \`{{user}}\` / \`{{char}}\` template placeholders.`,
      });
    }

    if (SYSTEM_ERROR_LEAK_RE.test(text)) {
      issues.push({
        code: 'style.system_error_leak',
        level: 'error',
        message: `Bubble ${idx + 1} leaks backend TTS/plugin diagnostics into user-facing chat text.`,
      });
    }

    if (STEWARD_CLICHE_RE.test(text)) {
      issues.push({
        code: 'style.steward_cliche',
        level: 'warning',
        message: `Bubble ${idx + 1} uses subordinate/concierge boilerplate (\`向你汇报\` / \`顺手替你\` / \`for your review\`).`,
      });
    }

    if (personaEmoji === 'deny' && EMOJI_RE.test(text)) {
      issues.push({
        code: 'style.unicode_emoji',
        level: 'warning',
        message: `Bubble ${idx + 1} contains Unicode emoji while \`personaEmoji: "deny"\` is active.`,
      });
    }

    if (LA_ENDING_CLAUSE_RE.test(text)) {
      laEndings += 1;
    }

    if (endsWithFormalPeriod(text)) {
      formalPeriodBubbles += 1;
    }
    if (isShortSingleClauseWithPeriod(text) && !shortPeriodFlagged) {
      shortPeriodFlagged = true;
      issues.push({
        code: 'style.trailing_period',
        level: 'warning',
        message: `Bubble ${idx + 1} ends a short single-clause beat or copyable code with a formal period (\`。\` / \`.\`).`,
      });
    }

    const hasVoice = entry.voiceMode === 'append' || entry.voiceMode === 'only' || Boolean(entry.tts);
    if (hasVoice) {
      const ttsText = entry.tts?.text?.trim() || (entry.voiceMode ? text : '');
      ttsEntries.push({ index: idx, text: ttsText });
    }
  });

  if (!shortPeriodFlagged && nonEmptyTexts.length >= 2 && formalPeriodBubbles === nonEmptyTexts.length) {
    issues.push({
      code: 'style.trailing_period',
      level: 'warning',
      message: `All ${nonEmptyTexts.length} beats end with formal periods (\`。\` / \`.\`); omit trailing periods on mobile chat beats.`,
    });
  }

  let totalCjkChars = 0;
  let totalEnWords = 0;
  for (const t of bubbleTexts) {
    const units = countTextUnits(t);
    totalCjkChars += units.cjkChars;
    totalEnWords += units.enWords;
  }

  if (totalCjkChars > maxCjkChars) {
    issues.push({
      code: 'bubble.over_cjk_budget',
      level: 'warning',
      message: `Total CJK length is ${totalCjkChars} chars (budget <= ${maxCjkChars}); trim filler or offload details.`,
    });
  }
  if (totalEnWords > maxEnWords) {
    issues.push({
      code: 'bubble.over_en_budget',
      level: 'warning',
      message: `Total English word count is ${totalEnWords} words (budget <= ${maxEnWords}); tighten clauses.`,
    });
  }

  if (entries.length >= 2 && laEndings / entries.length > 0.5) {
    issues.push({
      code: 'style.particle_spam',
      level: 'warning',
      message: `${laEndings}/${entries.length} bubbles end with \`啦\`; vary bare verb endings and natural particles.`,
    });
  }

  let ttsOverlap = 0;
  if (ttsEntries.length > 1) {
    issues.push({
      code: 'tts.multiple_clips',
      level: 'error',
      message: `Found ${ttsEntries.length} voice notes in one turn; send at most 1 voice note.`,
    });
  } else if (ttsEntries.length === 1) {
    const clip = ttsEntries[0] ;
    if (normalized.usedMessagesArray && entries.length > 1 && clip.index !== entries.length - 1) {
      issues.push({
        code: 'tts.not_on_final_bubble',
        level: 'warning',
        message: `Voice note is attached to bubble ${clip.index + 1} instead of final bubble ${entries.length}.`,
      });
    }
    if (clip.text) {
      ttsOverlap = Math.round(computeVoiceOverlap(bubbleTexts, clip.text) * 1000) / 1000;
      if (ttsOverlap > maxTtsOverlap && bubbleTexts.some((t) => t.length > 0)) {
        issues.push({
          code: 'tts.verbatim_overlap',
          level: 'error',
          message: `Voice note overlaps ${Math.round(ttsOverlap * 100)}% with text bubbles; write a complementary aside instead of reading the text bubble aloud.`,
        });
      }
      if (RAW_URL_RE.test(clip.text) || WIN_OR_UNIX_PATH_RE.test(clip.text)) {
        issues.push({
          code: 'tts.raw_path_or_url',
          level: 'error',
          message: 'Voice note contains a raw URL or filesystem path; keep identifiers in text bubbles only.',
        });
      }
      const withoutUrls = clip.text.replace(RAW_URL_RE, ' ');
      if (RAW_DECIMAL_OR_TIME_RE.test(withoutUrls)) {
        issues.push({
          code: 'tts.unnormalized_numbers',
          level: 'warning',
          message: 'Voice note contains raw decimals or clock colons (`19.9`, `14:30`); spell them as spoken words.',
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warningCount = issues.filter((i) => i.level === 'warning').length;

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    errorCount,
    warningCount,
    stats: {
      bubbleCount: entries.length,
      totalCjkChars,
      totalEnWords,
      hasVoiceNote: ttsEntries.length > 0,
      ttsOverlap,
    },
    issues,
  };
}

// --- parser.ts ---
const DEFAULT_MSG_NAMES = new Set(['send_message', 'nb_send_message', 'SendMessage']);
const DEFAULT_ART_NAMES = new Set(['send_artifact', 'nb_send_artifact', 'send_code_or_doc']);

function cleanBubbleText(raw        , cleanHygiene         )         {
  let s = raw.trim();
  if (!s) return '';
  if (cleanHygiene) {
    s = s.replace(/^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*/i, '').trim();
    const { cjkChars, enWords } = countTextUnits(s);
    const hasInternalStops = /[。！？!?；;]/.test(s.slice(0, -1));
    if (!hasInternalStops) {
      if (s.endsWith('。') && cjkChars > 0 && cjkChars <= 22 && enWords <= 6) {
        s = s.slice(0, -1).trim();
      } else if (
        s.endsWith('.') &&
        !s.endsWith('..') &&
        !/\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$/i.test(s) &&
        cjkChars === 0 &&
        enWords > 0 &&
        enWords <= 12
      ) {
        s = s.slice(0, -1).trim();
      }
    }
  }
  return s;
}

function inferArtifactTitle(kind              , language                    , content        , index        )         {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const commentMatch = firstLine.match(/^(?:\/\/|#|--|\/\*+)\s*([A-Za-z0-9_.\-/]+\.[A-Za-z0-9]+)\b/);
  if (commentMatch?.[1]) return commentMatch[1];
  if (kind === 'diff') return `patch-${index + 1}.diff`;
  if (kind === 'table') return `comparison-table-${index + 1}.md`;
  if (kind === 'code') {
    const ext = language ? language.toLowerCase().replace(/[^a-z0-9]+/g, '') : 'txt';
    return `snippet-${index + 1}.${ext || 'txt'}`;
  }
  return `notes-${index + 1}.md`;
}

export function extractPlainReplyArtifactsAndBeats(
  rawText        ,
  options                                                                    = {},
)                                                                         {
  const cleanHygiene = options.cleanHygiene ?? true;
  const maxBubbles = options.maxBubbles ?? 4;
  const artifacts                     = [];

  // 1. Extract fenced code blocks out of narrow chat bubbles
  let working = rawText.replace(/\r\n/g, '\n');
  working = working.replace(/```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g, (_match, langRaw        , bodyRaw        ) => {
    const lang = String(langRaw ?? '').trim() || undefined;
    const content = String(bodyRaw ?? '').replace(/\n+$/, '');
    if (!content.trim()) return '';
    const kind               = lang === 'diff' || lang === 'patch' ? 'diff' : 'code';
    artifacts.push({
      title: inferArtifactTitle(kind, lang, content, artifacts.length),
      kind,
      ...(lang ? { language: lang } : {}),
      content,
    });
    return '\n\n';
  });

  // 2. Extract Markdown pipe tables (header + separator + >=1 row)
  working = working.replace(
    /(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:\-|]+\|\s*\n(?:\|[^\n]+\|\s*(?:\n|$))+)/g,
    (_match, tableBlock        ) => {
      const content = tableBlock.trim();
      if (content) {
        artifacts.push({
          title: inferArtifactTitle('table', 'markdown', content, artifacts.length),
          kind: 'table',
          language: 'markdown',
          content,
        });
      }
      return '\n\n';
    },
  );

  // 3. Split remaining text into conversational micro-beats
  const rawBeats = splitPlainBeats(working, true)
    .map((b) => cleanBubbleText(b, cleanHygiene))
    .filter(Boolean);

  if (rawBeats.length === 0 && artifacts.length > 0) {
    return {
      bubbles: [`Put the ${artifacts[0] .kind} details in ${artifacts[0] .title}`],
      artifacts,
    };
  }

  // 4. Offload essay walls (>maxBubbles or huge structured Markdown blocks) into a markdown artifact
  const hasHeavyMarkdown = rawBeats.some((b) => /^\s*#{1,6}\s+\S/m.test(b) || /(?:^|\n)\s*1[.)]\s+.+\n\s*2[.)]\s+/s.test(b));
  const totalUnits = rawBeats.reduce(
    (acc, b) => {
      const u = countTextUnits(b);
      return { cjk: acc.cjk + u.cjkChars, en: acc.en + u.enWords };
    },
    { cjk: 0, en: 0 },
  );

  if (rawBeats.length > maxBubbles || hasHeavyMarkdown || totalUnits.cjk > 110 || totalUnits.en > 85) {
    const fullNote = rawBeats.join('\n\n');
    artifacts.push({
      title: inferArtifactTitle('markdown', 'markdown', fullNote, artifacts.length),
      kind: 'markdown',
      language: 'markdown',
      content: fullNote,
    });
    const lead = rawBeats[0] 
      .replace(/^\s*#{1,6}\s+/, '')
      .split(/\n/)[0] 
      .slice(0, 72)
      .trim();
    const leadClean = cleanBubbleText(lead, cleanHygiene) || 'Details are in the attached note';
    return {
      bubbles: [leadClean, `Full breakdown moved to ${artifacts[artifacts.length - 1] .title}`].slice(0, maxBubbles),
      artifacts,
    };
  }

  return { bubbles: rawBeats.slice(0, maxBubbles), artifacts };
}

                                
                        
                                         
 

function safeParseJsonObject(raw         )                                      {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw                           ;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed          = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed                           ;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractToolCallsFromCompletion(input         )   
                                         
                               
  {
  if (typeof input === 'string') {
    const asObj = safeParseJsonObject(input);
    if (!asObj) return { calls: [], contentText: input };
    return extractToolCallsFromCompletion(asObj);
  }
  if (typeof input !== 'object' || input === null) {
    return { calls: [], contentText: '' };
  }

  const rec = input                           ;

  // Direct `send_message` payload passed directly
  if (Array.isArray(rec.bubbles)) {
    return { calls: [{ name: 'send_message', args: rec }], contentText: '' };
  }

  const calls                         = [];
  let contentText = '';

  // OpenAI Chat Completion envelope (`choices[0].message`) or Assistant message directly
  const msgObj =
    Array.isArray(rec.choices) &&
    rec.choices.length > 0 &&
    typeof rec.choices[0] === 'object' &&
    rec.choices[0] !== null &&
    typeof (rec.choices[0]                           ).message === 'object'
      ? ((rec.choices[0]                           ).message                           )
      : rec;

  if (typeof msgObj.content === 'string') {
    contentText = msgObj.content;
  } else if (Array.isArray(msgObj.content)) {
    // Anthropic `content` blocks (`text` + `tool_use`)
    for (const blk of msgObj.content) {
      if (typeof blk !== 'object' || blk === null) continue;
      const b = blk                           ;
      if (b.type === 'text' && typeof b.text === 'string') {
        contentText += (contentText ? '\n\n' : '') + b.text;
      } else if (b.type === 'tool_use' && typeof b.name === 'string') {
        const parsed = safeParseJsonObject(b.input);
        if (parsed) calls.push({ name: b.name, args: parsed });
      }
    }
  }

  if (Array.isArray(msgObj.tool_calls)) {
    for (const tc of msgObj.tool_calls) {
      if (typeof tc !== 'object' || tc === null) continue;
      const t = tc                           ;
      const fn = typeof t.function === 'object' && t.function !== null ? (t.function                           ) : t;
      if (typeof fn.name === 'string') {
        const parsed = safeParseJsonObject(fn.arguments ?? fn.input);
        if (parsed) calls.push({ name: fn.name, args: parsed });
      }
    }
  }

  // Gemini `candidates[0].content.parts`
  if (Array.isArray(rec.candidates) && rec.candidates.length > 0) {
    const cand = rec.candidates[0]                           ;
    const content = typeof cand?.content === 'object' && cand.content !== null ? (cand.content                           ) : undefined;
    if (content && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (typeof part !== 'object' || part === null) continue;
        const p = part                           ;
        if (typeof p.text === 'string') {
          contentText += (contentText ? '\n\n' : '') + p.text;
        }
        if (typeof p.functionCall === 'object' && p.functionCall !== null) {
          const fc = p.functionCall                           ;
          if (typeof fc.name === 'string') {
            const parsed = safeParseJsonObject(fc.args);
            if (parsed) calls.push({ name: fc.name, args: parsed });
          }
        }
      }
    }
  }

  return { calls, contentText };
}

export function normalizeTurnOutput(input         , options                       = {})                  {
  const msgNames = options.sendMessageNames ? new Set(options.sendMessageNames) : DEFAULT_MSG_NAMES;
  const artNames = options.sendArtifactNames ? new Set(options.sendArtifactNames) : DEFAULT_ART_NAMES;
  const cleanHygiene = options.cleanHygiene ?? false;
  const maxBubbles = options.maxBubbles ?? 4;

  const { calls, contentText } = extractToolCallsFromCompletion(input);

  const bubbles           = [];
  const artifacts                     = [];
  let voiceNote                              ;
  let replyTo                    ;
  let endTurn = true;
  let matchedSpeakTool = false;

  for (const call of calls) {
    if (artNames.has(call.name)) {
      matchedSpeakTool = true;
      const kindRaw = String(call.args.kind ?? 'code');
      const kind               =
        kindRaw === 'code' || kindRaw === 'markdown' || kindRaw === 'diff' || kindRaw === 'table' ? kindRaw : 'code';
      const content = String(call.args.content ?? '');
      if (content.trim()) {
        artifacts.push({
          title: String(call.args.title ?? inferArtifactTitle(kind, String(call.args.language ?? ''), content, artifacts.length)),
          kind,
          ...(typeof call.args.language === 'string' && call.args.language.trim() ? { language: call.args.language.trim() } : {}),
          content,
        });
      }
    } else if (msgNames.has(call.name)) {
      matchedSpeakTool = true;
      if (Array.isArray(call.args.bubbles)) {
        for (const item of call.args.bubbles) {
          const text = cleanBubbleText(String(item ?? ''), cleanHygiene);
          if (text) bubbles.push(text);
        }
      } else if (Array.isArray(call.args.messages)) {
        for (const item of call.args.messages) {
          if (typeof item === 'object' && item !== null) {
            const rec = item                           ;
            const text = cleanBubbleText(String(rec.text ?? ''), cleanHygiene);
            if (text) bubbles.push(text);
            if (typeof rec.tts === 'object' && rec.tts !== null) {
              const ttsText = String((rec.tts                           ).text ?? '').trim();
              if (ttsText) voiceNote = { text: ttsText };
            }
          } else {
            const text = cleanBubbleText(String(item ?? ''), cleanHygiene);
            if (text) bubbles.push(text);
          }
        }
      }
      if (typeof call.args.voice_note === 'object' && call.args.voice_note !== null) {
        const vn = call.args.voice_note                           ;
        const vnText = String(vn.text ?? '').trim();
        if (vnText) {
          voiceNote = {
            text: vnText,
            ...(typeof vn.emotion === 'string' ? { emotion: vn.emotion } : {}),
          };
        }
      }
      if (typeof call.args.reply_to === 'string' && call.args.reply_to.trim()) {
        replyTo = call.args.reply_to.trim();
      }
      if (typeof call.args.end_turn === 'boolean') {
        endTurn = call.args.end_turn;
      }
    }
  }

  let source                                  = 'tool_calls';
  if (!matchedSpeakTool) {
    source = 'plain_fallback';
    const fallback = extractPlainReplyArtifactsAndBeats(contentText, {
      cleanHygiene: options.cleanHygiene ?? true,
      maxBubbles,
    });
    bubbles.push(...fallback.bubbles);
    artifacts.push(...fallback.artifacts);
  } else if (bubbles.length === 0 && artifacts.length > 0) {
    bubbles.push(`Attached ${artifacts[0] .title}`);
  }

  const schedule = computeBubbleSchedule(bubbles, options.cadence);
  const lintPayload = {
    bubbles,
    ...(voiceNote ? { voice_note: voiceNote } : {}),
    end_turn: endTurn,
  };
  const lint = lintTurn(lintPayload, { maxBubbles, ...options.lint });

  return {
    source,
    bubbles,
    artifacts,
    ...(voiceNote ? { voice_note: voiceNote } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    end_turn: endTurn,
    schedule,
    lint,
  };
}

export function turnToEvents(turn                 )                     {
  const events                     = [];
  turn.artifacts.forEach((artifact, index) => {
    events.push({ type: 'nb.artifact', index, artifact });
  });
  turn.schedule.forEach((item) => {
    events.push({
      type: 'nb.bubble',
      index: item.index,
      text: item.text,
      delayMs: item.delayMs,
      typingDurationMs: item.typingDurationMs,
      cumulativeMs: item.cumulativeMs,
    });
  });
  if (turn.voice_note) {
    events.push({ type: 'nb.voice_note', voice_note: turn.voice_note });
  }
  events.push({ type: 'nb.lint', lint: turn.lint });
  events.push({ type: 'nb.done', turn });
  return events;
}

export class SpeakStreamAccumulator {
          content = '';
                   toolCallSlots = new Map                                                         ();

  pushOpenAIChunk(chunk                         )       {
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      if (typeof choice !== 'object' || choice === null) continue;
      const delta = (choice                           ).delta;
      if (typeof delta !== 'object' || delta === null) continue;
      const d = delta                           ;
      if (typeof d.content === 'string') {
        this.content += d.content;
      }
      if (Array.isArray(d.tool_calls)) {
        d.tool_calls.forEach((rawTc, idx) => {
          if (typeof rawTc !== 'object' || rawTc === null) return;
          const tc = rawTc                           ;
          const slotIndex = typeof tc.index === 'number' ? tc.index : idx;
          const existing = this.toolCallSlots.get(slotIndex) ?? { id: '', name: '', arguments: '' };
          if (typeof tc.id === 'string' && tc.id) existing.id = tc.id;
          if (typeof tc.function === 'object' && tc.function !== null) {
            const fn = tc.function                           ;
            if (typeof fn.name === 'string' && fn.name) existing.name += fn.name;
            if (typeof fn.arguments === 'string') existing.arguments += fn.arguments;
          }
          this.toolCallSlots.set(slotIndex, existing);
        });
      }
    }
  }

  finalize(options                       = {})                  {
    const toolCalls = [...this.toolCallSlots.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, slot]) => ({
        id: slot.id || undefined,
        type: 'function',
        function: { name: slot.name, arguments: slot.arguments },
      }));
    return normalizeTurnOutput(
      {
        role: 'assistant',
        content: this.content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      options,
    );
  }
}

                                      
                           
                           
                          
                            
                                    
 

export async function translateDraftViaSidecar(
  draftContent        ,
  sidecar                     ,
)                           {
  const fetchFn = sidecar.fetchImpl ?? fetch;
  const cleanBase = sidecar.baseUrl.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : cleanBase.endsWith('/v1')
      ? `${cleanBase}/chat/completions`
      : `${cleanBase}/v1/chat/completions`;

  const headers                         = { 'content-type': 'application/json' };
  if (sidecar.apiKey) headers.authorization = `Bearer ${sidecar.apiKey}`;

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: sidecar.model ?? 'nb-speak-translator',
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the assistant draft into 1-3 natural thumb-typed IM beats separated by blank lines (\\n\\n). Omit trailing periods on short single-clause lines and keep exact numbers intact.',
        },
        { role: 'user', content: draftContent },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Voice sidecar returned HTTP ${res.status}`);
  }
  const json          = await res.json();
  return normalizeTurnOutput(json, { cleanHygiene: true });
}

// --- format.ts ---
const NARROW_KV_CHANNELS = new Set([
  'whatsapp',
  'signal',
  'imessage',
  'bluebubbles',
  'sms',
  'wechat',
  'weixin',
  'feishu',
  'lark',
  'dingtalk',
  'qq',
  'onebot',
  'satori',
  'line',
]);

const STAGE_BRACKET_STRIP_RE =
  /(?:\*[a-zA-Z][a-zA-Z\s-]{1,28}\*|[（(](?:叹气|笑|微笑|苦笑|歪头|叉腰|双手叉腰|气鼓鼓|摸头|摸摸头|捂脸|扶额|耸肩|小声|轻声|皱眉|眨眼|挑眉|擦汗|深呼吸|sighs?|smiles?|laughs?|giggles?|tilts\s+head|shrugs?|whispers?|grins?|rolls\s+eyes)[）)])\s*/gi;

const CONCIERGE_TAIL_SENTENCE_RE =
  /(?:^|[\s~～]+|(?<=[。！？!?；;]))(?:Let me know if you need anything(?:\s+else)?[!.]?|Hope this helps[!.]?|Feel free to ask if you have(?:\s+any)?\s+questions[!.]?|Please review at your convenience[!.]?|希望(?:这)?(?:对您|对你)?有帮助[！!。.~～]?|如有(?:任何)?(?:需要|问题)(?:请)?随时告诉我[！!。.~～]?|请(?:随时)?检阅[！!。.~～]?)\s*$/i;

const BUBBLE_LABEL_PREFIX_RE = /^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*/i;
const TABLE_SEP_CELL_RE = /^:?-{2,}:?$/;
const WIDE_CHAR_RE = /[\u1100-\u115f\u2e80-\u303e\u3040-\u33bf\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/g;

export function estimateDisplayWidth(text        )         {
  const clean = String(text ?? '');
  const wideCount = (clean.match(WIDE_CHAR_RE) ?? []).length;
  return clean.length + wideCount;
}

function splitPipeRow(line        )           {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells           = [];
  let buf = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] ;
    if (ch === '\\' && trimmed[i + 1] === '|') {
      buf += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(buf.trim().replace(/\*\*([^*]+)\*\*/g, '$1'));
      buf = '';
    } else {
      buf += ch;
    }
  }
  cells.push(buf.trim().replace(/\*\*([^*]+)\*\*/g, '$1'));
  return cells;
}

export function parseMarkdownPipeTable(tableBlock        )                              {
  const lines = tableBlock
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return undefined;
  if (!lines[0] .includes('|') || !lines[1] .includes('|')) return undefined;

  const headers = splitPipeRow(lines[0] );
  const sepCells = splitPipeRow(lines[1] );
  if (headers.length === 0 || sepCells.length === 0) return undefined;
  if (!sepCells.every((c) => TABLE_SEP_CELL_RE.test(c))) return undefined;

  const rows = lines
    .slice(2)
    .filter((l) => l.includes('|'))
    .map((l) => {
      const parsed = splitPipeRow(l);
      while (parsed.length < headers.length) parsed.push('');
      return parsed.slice(0, headers.length);
    })
    .filter((r) => r.some((c) => c.length > 0));

  if (rows.length === 0) return undefined;
  return { headers, rows };
}

function buildAlignedAsciiTable(parsed                 )                                                           {
  const colWidths = parsed.headers.map((h, colIdx) => {
    let maxW = Math.max(1, estimateDisplayWidth(h));
    for (const row of parsed.rows) {
      maxW = Math.max(maxW, estimateDisplayWidth(row[colIdx] ?? ''));
    }
    return maxW;
  });

  const padCell = (val        , targetWidth        )         => {
    const padLen = Math.max(0, targetWidth - estimateDisplayWidth(val));
    return val + ' '.repeat(padLen);
  };

  const headerLine = parsed.headers.map((h, i) => padCell(h, colWidths[i] )).join('  ');
  const sepLine = colWidths.map((w) => '-'.repeat(w)).join('  ');
  const bodyLines = parsed.rows.map((row) =>
    row.map((cell, i) => padCell(cell, colWidths[i] )).join('  ').trimEnd(),
  );
  const allLines = [headerLine.trimEnd(), sepLine, ...bodyLines];
  const maxLineWidth = allLines.reduce((acc, ln) => Math.max(acc, estimateDisplayWidth(ln)), 0);
  return { text: allLines.join('\n'), maxLineWidth };
}

function buildCompactKvList(parsed                 , title         )         {
  const lines           = [];
  if (title && !/^comparison-table-\d+\.md$/i.test(title)) {
    lines.push(`[${title}]`);
  }
  for (const row of parsed.rows) {
    const lead = row[0] || '-';
    if (parsed.headers.length === 1) {
      lines.push(`- ${lead}`);
      continue;
    }
    if (parsed.headers.length === 2) {
      lines.push(`- ${lead}: ${row[1] ?? ''}`.trimEnd());
      continue;
    }
    const pairs           = [];
    for (let i = 1; i < parsed.headers.length; i += 1) {
      const val = row[i] ?? '';
      if (!val) continue;
      const hdr = parsed.headers[i] ?? `Col ${i + 1}`;
      pairs.push(`${hdr}: ${val}`);
    }
    lines.push(pairs.length > 0 ? `- ${lead} — ${pairs.join(' · ')}` : `- ${lead}`);
  }
  return lines.join('\n');
}

export function formatTableForChannel(
  tableMarkdown        ,
  options   
                              
                                          
                                        
                            
    = {},
)         {
  const parsed = parseMarkdownPipeTable(tableMarkdown);
  if (!parsed) {
    return `\`\`\`text\n${tableMarkdown.trim()}\n\`\`\``;
  }

  const mode = options.tableMode ?? 'auto';
  const maxWidth = options.maxMonospaceWidth ?? 40;
  const normalizedChannel = (options.channel ?? '').trim().toLowerCase();

  if (mode === 'kv') {
    return buildCompactKvList(parsed, options.title);
  }

  const ascii = buildAlignedAsciiTable(parsed);
  if (mode === 'code') {
    if (ascii.maxLineWidth <= maxWidth) {
      return `\`\`\`text\n${ascii.text}\n\`\`\``;
    }
    return buildCompactKvList(parsed, options.title);
  }

  // Auto mode: narrow IM surfaces or wide (>40 char) tables become thumb-readable KV cards;
  // compact tables on Telegram / Discord / Slack render as clean aligned monospace blocks.
  if (NARROW_KV_CHANNELS.has(normalizedChannel) || ascii.maxLineWidth > maxWidth) {
    return buildCompactKvList(parsed, options.title);
  }
  return `\`\`\`text\n${ascii.text}\n\`\`\``;
}

export function formatArtifactForChannel(
  artifact                  ,
  options   
                              
                                          
                                        
    = {},
)         {
  if (artifact.kind === 'table') {
    return formatTableForChannel(artifact.content, {
      channel: options.channel,
      tableMode: options.tableMode,
      maxMonospaceWidth: options.maxMonospaceWidth,
      title: artifact.title,
    });
  }

  if (artifact.kind === 'code' || artifact.kind === 'diff') {
    const lang = artifact.language || (artifact.kind === 'diff' ? 'diff' : '');
    const body = artifact.content.replace(/\r\n/g, '\n').trimEnd();
    const firstLine = body.split('\n', 1)[0]?.trim() ?? '';
    const hasTitleComment =
      !artifact.title ||
      /^(?:snippet|patch|notes)-\d+\./i.test(artifact.title) ||
      firstLine.includes(artifact.title);
    const headerPrefix =
      hasTitleComment || artifact.kind === 'diff'
        ? ''
        : lang === 'python' || lang === 'sh' || lang === 'bash' || lang === 'yaml' || lang === 'yml'
          ? `# ${artifact.title}\n`
          : lang === 'sql'
            ? `-- ${artifact.title}\n`
            : `// ${artifact.title}\n`;
    return `\`\`\`${lang}\n${headerPrefix}${body}\n\`\`\``;
  }

  // Markdown note artifact: flatten headings and bold bullet cages for clean mobile reading
  const flattened = artifact.content
    .replace(/\r\n/g, '\n')
    .replace(/^\s*#{1,6}\s+(.+)$/gm, '[$1]')
    .replace(/^\s*[-*]\s+\*\*([^*]+)\*\*\s*[:：]\s*/gm, '- $1: ')
    .trim();
  return flattened;
}

function cleanSingleBeat(
  raw        ,
  options                                                                                ,
)         {
  let s = raw.replace(/\r\n/g, '\n').trim();
  if (!s) return '';

  if (options.stripStageBrackets) {
    s = s.replace(STAGE_BRACKET_STRIP_RE, '').trim();
  }
  s = s.replace(BUBBLE_LABEL_PREFIX_RE, '').trim();
  if (options.stripConciergeTail) {
    const withoutTail = s.replace(CONCIERGE_TAIL_SENTENCE_RE, '').trim();
    s = withoutTail;
  }
  if (!s) return '';

  // Flatten Markdown headings and bold bullet walls inside conversational beats
  s = s
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+\*\*([^*:\n]+)\*\*\s*[:：]\s*/gm, '$1: ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .trim();

  // Strip formal trailing period on short single-clause mobile beats & copyable codes
  if (/[A-Za-z0-9]{4,}[。.]$/.test(s)) {
    s = s.slice(0, -1).trim();
    return s;
  }
  const { cjkChars, enWords } = countTextUnits(s);
  const hasInternalStops = /[。！？!?；;\n]/.test(s.slice(0, -1));
  if (!hasInternalStops) {
    if (s.endsWith('。') && cjkChars > 0 && cjkChars <= 22 && enWords <= 6) {
      s = s.slice(0, -1).trim();
    } else if (
      s.endsWith('.') &&
      !s.endsWith('..') &&
      !/\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$/i.test(s) &&
      cjkChars === 0 &&
      enWords > 0 &&
      enWords <= 12
    ) {
      s = s.slice(0, -1).trim();
    }
  }
  return s;
}

function splitLongParagraphIntoBeats(paragraph        )           {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];

  // Preserve tightly coupled 2-line copyable blocks (e.g. locker + pickup code)
  const rawLines = trimmed
    .split('\n')
    .map((ln) => ln.trim())
    .filter(Boolean);
  if (rawLines.length === 2) {
    const u = countTextUnits(trimmed);
    if (u.cjkChars <= 34 && u.enWords <= 24 && !/^\s*(?:[-*]|\d+[.)])\s+/.test(rawLines[0] )) {
      return [rawLines.join('\n')];
    }
  }

  // Convert numbered / bulleted lists into clean lines first
  if (rawLines.length > 1 && rawLines.every((ln) => /^(?:[-*•]|\d+[.)])\s+/.test(ln))) {
    return rawLines.map((ln) => ln.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  }

  const units = countTextUnits(trimmed);
  if (units.cjkChars <= 36 && units.enWords <= 28) {
    return [trimmed];
  }

  // Sentence-aware split that protects decimals (0.02), versions (v4.29.1), and URLs with query strings
  const sentences           = [];
  const sentenceRe =
    /(?:https?:\/\/\S+|[^。！？；;\n!?.]|\.(?!\s+[A-Z0-9"'])|!(?=\S)|\?(?=[A-Za-z0-9_=&/%#]))+(?:[。！？；;…~～]+|[.!?]+(?=\s+|$)|$)/g;
  const matches = trimmed.match(sentenceRe) ?? [trimmed];
  let current = '';
  for (const part of matches) {
    const piece = part.trim();
    if (!piece) continue;
    if (!current) {
      current = piece;
      continue;
    }
    const merged = `${current}${/[\u4e00-\u9fff]$/.test(current) ? '' : ' '}${piece}`;
    const mUnits = countTextUnits(merged);
    if (mUnits.cjkChars <= 34 && mUnits.enWords <= 24) {
      current = merged;
    } else {
      sentences.push(current);
      current = piece;
    }
  }
  if (current) sentences.push(current);
  return sentences;
}

function inferTitle(kind                                        , lang                    , content        , index        )         {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const commentMatch = firstLine.match(/^(?:\/\/|#|--|\/\*+)\s*([A-Za-z0-9_.\-/]+\.[A-Za-z0-9]+)\b/);
  if (commentMatch?.[1]) return commentMatch[1];
  if (kind === 'diff') return `patch-${index + 1}.diff`;
  if (kind === 'table') return `comparison-table-${index + 1}.md`;
  if (kind === 'code') {
    const ext = lang ? lang.toLowerCase().replace(/[^a-z0-9]+/g, '') : 'txt';
    return `snippet-${index + 1}.${ext || 'txt'}`;
  }
  return `details-${index + 1}.md`;
}

export function transformOutboundText(rawText        , options                       = {})                          {
  const original = String(rawText ?? '');
  const trimmedOriginal = original.trim();
  if (!trimmedOriginal) {
    const emptyLint = lintTurn({ bubbles: [] });
    return {
      changed: false,
      primaryText: original,
      bubbles: [],
      artifactCards: [],
      artifacts: [],
      schedule: [],
      lint: emptyLint,
    };
  }

  const maxBubbles = Math.max(1, options.maxBubbles ?? 4);
  const stripStageBrackets = options.stripStageBrackets ?? true;
  const stripConciergeTail = options.stripConciergeTail ?? true;

  const rawPool                     = [];
  let working = trimmedOriginal.replace(/\r\n/g, '\n');

  // 1. Extract fenced code blocks first so pipe characters inside code fences are never misparsed as tables
  working = working.replace(
    /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g,
    (_m, langRaw        , bodyRaw        ) => {
      const lang = String(langRaw ?? '').trim() || undefined;
      const content = String(bodyRaw ?? '').replace(/\n+$/, '');
      if (!content.trim()) return '';
      const slot = rawPool.length;
      if ((!lang || lang === 'markdown' || lang === 'md') && parseMarkdownPipeTable(content)) {
        rawPool.push({
          title: inferTitle('table', 'markdown', content, slot),
          kind: 'table',
          language: 'markdown',
          content: content.trim(),
        });
        return `\n\n@@NB_SPEAK_ART_${slot}@@\n\n`;
      }
      const kind = lang === 'diff' || lang === 'patch' ? 'diff' : 'code';
      rawPool.push({
        title: inferTitle(kind, lang, content, slot),
        kind,
        ...(lang ? { language: lang } : {}),
        content,
      });
      return `\n\n@@NB_SPEAK_ART_${slot}@@\n\n`;
    },
  );

  // 2. Extract raw Markdown pipe tables (`openclaw#36323`)
  working = working.replace(
    /(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:\-|]+\|\s*\n(?:\|[^\n]+\|\s*(?:\n|$))+)/g,
    (_m, tableBlock        ) => {
      const content = tableBlock.trim();
      if (!content) return '\n\n';
      const slot = rawPool.length;
      rawPool.push({
        title: inferTitle('table', 'markdown', content, slot),
        kind: 'table',
        language: 'markdown',
        content,
      });
      return `\n\n@@NB_SPEAK_ART_${slot}@@\n\n`;
    },
  );

  // 3. Collect extracted artifacts in exact document appearance order and remove placeholders
  const artifacts                     = [];
  working = working.replace(/@@NB_SPEAK_ART_(\d+)@@/g, (_m, idxStr        ) => {
    const item = rawPool[Number(idxStr)];
    if (item) artifacts.push(item);
    return '';
  });

  // 4. Split remaining prose into paragraphs -> human thumb-typed beats
  const paragraphs = working
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawBeats           = [];
  for (const para of paragraphs) {
    const subBeats = splitLongParagraphIntoBeats(para);
    for (const beat of subBeats) {
      const cleaned = cleanSingleBeat(beat, { stripStageBrackets, stripConciergeTail });
      if (cleaned) rawBeats.push(cleaned);
    }
  }

  let bubbles          ;
  if (rawBeats.length === 0 && artifacts.length > 0) {
    bubbles = [];
  } else if (rawBeats.length > maxBubbles) {
    // Keep the crisp opening verdict beats and move the overflow detail into a structured note card
    const headCount = Math.max(1, Math.min(2, maxBubbles - 1));
    const leadBeats = rawBeats.slice(0, headCount);
    const tailDetail = rawBeats.slice(headCount).map((b) => `- ${b}`).join('\n');
    artifacts.push({
      title: 'Details',
      kind: 'markdown',
      language: 'markdown',
      content: tailDetail,
    });
    bubbles = leadBeats;
  } else {
    bubbles = rawBeats;
  }

  const artifactCards = artifacts.map((art) =>
    formatArtifactForChannel(art, {
      channel: options.channel,
      tableMode: options.tableMode,
      maxMonospaceWidth: options.maxMonospaceWidth,
    }),
  );

  const sections = [...bubbles, ...artifactCards].filter(Boolean);
  const primaryText = sections.join('\n\n') || trimmedOriginal;
  const schedule = computeBubbleSchedule(bubbles, options.cadence);
  const lintTarget = bubbles.length > 0 ? { bubbles, end_turn: true } : { bubbles: [primaryText], end_turn: true };
  const lint = lintTurn(lintTarget, { maxBubbles });

  return {
    changed: primaryText !== trimmedOriginal,
    primaryText,
    bubbles,
    artifactCards,
    artifacts,
    schedule,
    lint,
  };
}
