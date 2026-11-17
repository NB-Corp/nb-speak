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
