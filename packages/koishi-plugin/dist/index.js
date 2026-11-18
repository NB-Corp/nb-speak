import { createRequire } from 'node:module';
import path from 'node:path';
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

                                    
                             
                                     
                               
                                        
                                      
                               
                                   
                                 
                                         
                                      
 

                                            
                            
                                    
                              
                                       
                                     
                              
                                  
                                
                                        
                                     
 

                                    
               
                                 
                                 
                          
 

                                
               
                      
                                           
                      
                                      
                       
 

                                    
                    
                     
                   
                  
                                                                      
           
                       
               
                                                                          
                                     
                             
      
                           
    
                      
                                 
                   
                                                                                                      
 

                                    
                                                                          
                                    
                                                                
          
                                                                
    
             
                                                                                                  
                                  
    
 

export function resolveKoishiSpeakConfig(raw                    = {})                            {
  const p = String(raw?.persona ?? 'neutral_peer');
  const persona                  =
    p === 'sharp_lead' || p === 'warm_companion' || p === 'calm_sre' || p === 'custom' ? p : 'neutral_peer';
  const tm = String(raw?.tableMode ?? 'auto');
  const tableMode                   = tm === 'kv' || tm === 'code' ? tm : 'auto';
  const width = Number(raw?.maxMonospaceWidth ?? 40);
  const maxBubbles = Number(raw?.maxBubbles ?? 4);
  const speed = Number(raw?.cadenceSpeed ?? 1);

  return {
    enabled: raw?.enabled !== false,
    persona,
    customSoul: typeof raw?.customSoul === 'string' ? raw.customSoul.trim() : '',
    tableMode,
    maxMonospaceWidth: Number.isFinite(width) ? Math.max(24, Math.min(120, Math.round(width))) : 40,
    maxBubbles: Number.isFinite(maxBubbles) ? Math.max(1, Math.min(6, Math.round(maxBubbles))) : 4,
    pacedDelivery: raw?.pacedDelivery !== false,
    cadenceSpeed: Number.isFinite(speed) && speed > 0 ? Math.min(50, speed) : 1,
    platforms: Array.isArray(raw?.platforms)
      ? raw.platforms.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
      : [],
    enableVoiceNotes: raw?.enableVoiceNotes === true,
  };
}

function resolveHostKoishiBindings()                            {
  const resolvers                   = [];
  try {
    resolvers.push(createRequire(import.meta.url));
  } catch {
    // ignore in restricted runtimes
  }
  try {
    resolvers.push(createRequire(path.join(process.cwd(), 'package.json')));
  } catch {
    // ignore when cwd has no resolvable root
  }

  let foundSchema     ;
  let foundH     ;

  for (const req of resolvers) {
    if (!foundSchema) {
      for (const id of ['schemastery', 'koishi']) {
        try {
          const mod = req(id);
          const candidate = id === 'schemastery' ? mod?.default ?? mod : mod?.Schema;
          if (typeof candidate === 'function' && typeof candidate.object === 'function') {
            foundSchema = candidate;
            break;
          }
        } catch {
          // continue searching
        }
      }
    }
    if (!foundH) {
      for (const id of ['@satorijs/element', 'koishi']) {
        try {
          const mod = req(id);
          const candidate = id === '@satorijs/element' ? mod?.default ?? mod : mod?.h;
          if (typeof candidate === 'function' && typeof candidate.text === 'function') {
            foundH = candidate;
            break;
          }
        } catch {
          // continue searching
        }
      }
    }
    if (foundSchema && foundH) break;
  }

  return { Schema: foundSchema, h: foundH };
}

function buildCallableFallbackSchema() {
  const wrapField = (meta                         ) => {
    const fn = (val         ) => (val === undefined ? meta.defaultValue : val);
    return Object.assign(fn, meta, {
      default: (val         ) => wrapField({ ...meta, defaultValue: val }),
      description: (desc        ) => wrapField({ ...meta, desc }),
      role: (roleName        ) => wrapField({ ...meta, role: roleName }),
      min: (minVal        ) => wrapField({ ...meta, minValue: minVal }),
      max: (maxVal        ) => wrapField({ ...meta, maxValue: maxVal }),
      step: (stepVal        ) => wrapField({ ...meta, stepValue: stepVal }),
    });
  };
  return {
    object: (dict                         ) => {
      const schemaCallable = (raw                    ) => resolveKoishiSpeakConfig(raw);
      return Object.assign(schemaCallable, {
        type: 'object',
        dict,
        description: (desc        ) => Object.assign(schemaCallable, { type: 'object', dict, desc }),
        toJSON: () => ({ type: 'object', dict }),
      });
    },
    boolean: () => wrapField({ type: 'boolean' }),
    number: () => wrapField({ type: 'number' }),
    string: () => wrapField({ type: 'string' }),
    union: (list                    ) => wrapField({ type: 'union', list }),
    array: (inner         ) => wrapField({ type: 'array', inner }),
  };
}

const hostBindings = resolveHostKoishiBindings();
const S = hostBindings.Schema ?? buildCallableFallbackSchema();

export const Config = S.object({
  enabled: S.boolean()
    .default(true)
    .description('启用外发消息短气泡分段与裸 Markdown 管道表格转换（Enable outbound IM bubble & pipe-table gate）。'),
  persona: S.union(['neutral_peer', 'sharp_lead', 'warm_companion', 'calm_sre', 'custom'])
    .default('neutral_peer')
    .description('语气基线预设（通过 ctx.nbSpeak.getSystemPrompt() 提供给上游对话插件）。'),
  customSoul: S.string()
    .default('')
    .description('当 persona 设为 custom 时的自定义语气补充说明。'),
  tableMode: S.union(['auto', 'kv', 'code'])
    .default('auto')
    .description('管道表格转换策略：auto（OneBot/QQ/微信自动转手机键值卡，TG/Discord 短表转等宽代码块）、kv（全部转键值卡）、code（<=40列等宽块）。'),
  maxMonospaceWidth: S.number()
    .min(24)
    .max(120)
    .default(40)
    .description('等宽代码表格最大显示列宽（超出自动降级为手机易读键值卡）。'),
  maxBubbles: S.number()
    .min(1)
    .max(6)
    .default(4)
    .description('单轮对话短气泡数量上限（超出部分自动归并收束，绝不丢字）。'),
  pacedDelivery: S.boolean()
    .default(true)
    .description('按真人拇指打字节奏逐条投递多气泡与代码/表格卡片。'),
  cadenceSpeed: S.number()
    .min(0.25)
    .max(50)
    .default(1)
    .description('打字间隔倍率（数值越大发送越快，1 为拟真默认节奏）。'),
  platforms: S.array(S.string())
    .default([])
    .description('指定生效的平台标识白名单（如 onebot, qq, telegram, discord；留空表示全部适配器生效）。'),
  enableVoiceNotes: S.boolean()
    .default(false)
    .description('启用可选语音条提示词规则（默认严格关闭，仅发送纯文本短气泡与卡片）。'),
});

const STRUCTURAL_CONTAINER_TYPES = new Set([
  'message',
  'figure',
  'forward',
  'card',
  'button',
]);

function escapeSatoriText(raw        )         {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function makeSatoriElement(type        , attrs                         , children                      = [])                    {
  if (hostBindings.h) {
    if (type === 'text') {
      return hostBindings.h.text(String(attrs.content ?? ''));
    }
    return hostBindings.h(type, attrs, children);
  }
  if (type === 'text') {
    const content = String(attrs.content ?? '');
    return {
      type: 'text',
      attrs: { content },
      children: [],
      toString() {
        return escapeSatoriText(content);
      },
    };
  }
  return {
    type,
    attrs: { ...attrs },
    children: [...children],
  };
}

function makeTextElement(text        )                    {
  return makeSatoriElement('text', { content: text });
}

                             
                            
                                                 
                                            
                                                          
 

function planSatoriSessionTurn(
  session                   ,
  cfg                           ,
  platform        ,
)                                {
  const channelHint = platform || 'onebot';

  // Fallback for minimal string-only sessions without `elements` array
  if (!Array.isArray(session.elements) || session.elements.length === 0) {
    if (typeof session.content !== 'string' || !session.content.trim()) {
      return undefined;
    }
    const transformed = transformOutboundText(session.content, {
      channel: channelHint,
      tableMode: cfg.tableMode,
      maxMonospaceWidth: cfg.maxMonospaceWidth,
      maxBubbles: cfg.maxBubbles,
      cadence: { speedMultiplier: cfg.cadenceSpeed },
    });
    if (!transformed.changed) return undefined;
    const segs = [...transformed.bubbles, ...transformed.artifactCards].filter(Boolean);
    if (segs.length === 0) return undefined;
    return {
      changed: true,
      units: segs.map((t) => [makeTextElement(t)]),
      scheduleTexts: segs,
    };
  }

  // Never touch composite forward/card/button trees
  for (const el of session.elements) {
    if (!el || STRUCTURAL_CONTAINER_TYPES.has(el.type)) {
      return undefined;
    }
  }

  const leadingHeaders                      = [];
  let detachedSessionQuote                                     ;
  const sessionQuoteObj = session.event?.message?.quote ?? session.quote;
  const firstIsQuote = session.elements[0]?.type === 'quote';
  if (!firstIsQuote && sessionQuoteObj && (sessionQuoteObj.id || sessionQuoteObj.messageId)) {
    const qId = String(sessionQuoteObj.id ?? sessionQuoteObj.messageId);
    leadingHeaders.push(makeSatoriElement('quote', { id: qId }));
    detachedSessionQuote = sessionQuoteObj;
  }

  let cursor = 0;
  let trailingSpaceAfterAt = false;
  while (cursor < session.elements.length) {
    const el = session.elements[cursor] ;
    if (el.type === 'quote' || el.type === 'at') {
      leadingHeaders.push(el);
      cursor += 1;
      trailingSpaceAfterAt = el.type === 'at';
      continue;
    }
    if (
      trailingSpaceAfterAt &&
      el.type === 'text' &&
      typeof el.attrs?.content === 'string' &&
      /^[ \t]+$/.test(el.attrs.content)
    ) {
      cursor += 1;
      trailingSpaceAfterAt = false;
      continue;
    }
    break;
  }

                  
                                                      
                                                                      

  const bodyTokens              = [];
  let textBuf = '';
  for (let i = cursor; i < session.elements.length; i += 1) {
    const el = session.elements[i] ;
    if (el.type === 'text') {
      textBuf += String(el.attrs?.content ?? '');
    } else if (el.type === 'br') {
      textBuf += '\n';
    } else {
      if (textBuf) {
        bodyTokens.push({ kind: 'text', text: textBuf });
        textBuf = '';
      }
      bodyTokens.push({ kind: 'media', element: el });
    }
  }
  if (textBuf) {
    bodyTokens.push({ kind: 'text', text: textBuf });
  }

  const hasTextToken = bodyTokens.some((t) => t.kind === 'text' && t.text.trim().length > 0);
  if (!hasTextToken) {
    return undefined;
  }

  let anyTextChanged = false;
  const expandedTokens                                                                                                                                           = [];
  let totalTextSegments = 0;
  let mediaCount = 0;

  for (const tok of bodyTokens) {
    if (tok.kind === 'media') {
      mediaCount += 1;
      expandedTokens.push(tok);
      continue;
    }
    if (!tok.text.trim()) {
      continue;
    }
    const tr = transformOutboundText(tok.text, {
      channel: channelHint,
      tableMode: cfg.tableMode,
      maxMonospaceWidth: cfg.maxMonospaceWidth,
      maxBubbles: cfg.maxBubbles,
      cadence: { speedMultiplier: cfg.cadenceSpeed },
    });
    if (tr.changed) anyTextChanged = true;
    const segs = tr.changed
      ? [...tr.bubbles, ...tr.artifactCards].filter(Boolean)
      : [tok.text.trim()];
    totalTextSegments += segs.length;
    expandedTokens.push({ kind: 'text', segments: segs });
  }

  if (!anyTextChanged) {
    return undefined;
  }

  // Preserve native single-image + single-caption pairing (e.g. `[<img/>, <text "Caption">]`) in one message
  if (totalTextSegments === 1 && mediaCount > 0) {
    const combinedUnit                      = [...leadingHeaders];
    let textLabel = '';
    for (const item of expandedTokens) {
      if (item.kind === 'media') {
        combinedUnit.push(item.element);
      } else if (item.segments[0]) {
        const prefixSpace =
          combinedUnit.length > 0 && combinedUnit[combinedUnit.length - 1]?.type === 'at' ? ' ' : '';
        combinedUnit.push(makeTextElement(`${prefixSpace}${item.segments[0]}`));
        textLabel = item.segments[0];
      }
    }
    return {
      changed: true,
      units: [combinedUnit],
      scheduleTexts: [textLabel],
    };
  }

  const rawUnits                        = [];
  const scheduleTexts           = [];

  for (const item of expandedTokens) {
    if (item.kind === 'media') {
      rawUnits.push([item.element]);
      scheduleTexts.push('');
    } else {
      for (const seg of item.segments) {
        rawUnits.push([makeTextElement(seg)]);
        scheduleTexts.push(seg);
      }
    }
  }

  if (rawUnits.length === 0) return undefined;

  if (leadingHeaders.length > 0) {
    const firstUnit = rawUnits[0] ;
    const lastHeader = leadingHeaders[leadingHeaders.length - 1];
    if (lastHeader?.type === 'at' && firstUnit[0]?.type === 'text') {
      const firstText = String(firstUnit[0].attrs?.content ?? '');
      rawUnits[0] = [
        ...leadingHeaders,
        makeTextElement(firstText.startsWith(' ') || firstText.startsWith('\n') ? firstText : ` ${firstText}`),
        ...firstUnit.slice(1),
      ];
    } else {
      rawUnits[0] = [...leadingHeaders, ...firstUnit];
    }
  }

  return {
    changed: true,
    units: rawUnits,
    scheduleTexts,
    detachedSessionQuote,
  };
}

function flattenUnitsToElements(units                                           )                      {
  const merged                      = [];
  for (const unit of units) {
    for (const el of unit) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === 'text' && el.type === 'text') {
        const combined = `${String(prev.attrs?.content ?? '')}\n\n${String(el.attrs?.content ?? '')}`;
        merged[merged.length - 1] = makeTextElement(combined);
      } else {
        merged.push(el);
      }
    }
  }
  return merged;
}

function writeSessionElements(session                   , elements                              )       {
  if (Array.isArray(session.elements)) {
    session.elements.splice(0, session.elements.length, ...elements);
    return;
  }
  session.content = elements
    .map((el) => (el.type === 'text' ? String(el.attrs?.content ?? '') : el.toString?.() ?? ''))
    .join('');
}

function canDispatchFollowUp(session                   , options                          )          {
  if (session.bot && typeof session.bot.sendMessage === 'function' && session.channelId) {
    return true;
  }
  const originSession = options?.session                                 ;
  if (originSession && typeof originSession.send === 'function') {
    return true;
  }
  return typeof session.send === 'function';
}

async function dispatchSingleUnit(
  session                   ,
  options                                     ,
  unit                              ,
)                {
  const bypassOptions                          = {
    ...(options ?? {}),
    session: (options?.session                      ) ?? session,
    nbSpeakBypass: true,
  };

  if (session.bot && typeof session.bot.sendMessage === 'function' && session.channelId) {
    await session.bot.sendMessage(
      session.channelId,
      [...unit],
      session.event?.referrer ?? session.guildId,
      bypassOptions,
    );
    return;
  }

  const originSession = options?.session                                 ;
  const sender = originSession && typeof originSession.send === 'function' ? originSession : session;
  const onlySingleText = unit.length === 1 && unit[0]?.type === 'text';
  const payload                               = onlySingleText
    ? String(unit[0] .attrs?.content ?? '')
    : [...unit];
  await sender.send (payload, bypassOptions);
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

  ctx.i18n?.define('zh-CN', {
    _config: {
      enabled: '启用短气泡分段与管道表格门禁',
      persona: '语气基线预设',
      customSoul: '自定义语气说明',
      tableMode: 'Markdown 管道表格转换模式',
      maxMonospaceWidth: '等宽代码表格最大列宽',
      maxBubbles: '单轮最多短气泡数',
      pacedDelivery: '拟真打字间隔逐条发送',
      cadenceSpeed: '打字速度倍率',
      platforms: '生效平台白名单',
      enableVoiceNotes: '启用可选语音条规则（默认关闭）',
    },
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

  const bypassSessions = new WeakSet        ();

  ctx.on('before-send', async (session                   , options                          ) => {
    if (!session || typeof session !== 'object') return;
    if (options?.nbSpeakBypass === true || bypassSessions.has(session)) return;

    const platform = String(session.platform ?? '').trim().toLowerCase();
    if (cfg.platforms.length > 0 && platform && !cfg.platforms.includes(platform)) {
      return;
    }

    const plan = planSatoriSessionTurn(session, cfg, platform);
    if (!plan || !plan.changed || plan.units.length === 0) return;

    if (!cfg.pacedDelivery || plan.units.length === 1 || !canDispatchFollowUp(session, options)) {
      writeSessionElements(session, flattenUnitsToElements(plan.units));
      return;
    }

    // Dispatch units[0 .. N-2] sequentially with natural typing cadence and leave unit[N-1]
    // in `session.elements` so Satori's MessageEncoder flushes the final bubble in exact order
    // and recovers unsent tail segments automatically if any mid-turn network send throws.
    const fullSchedule = computeBubbleSchedule(plan.scheduleTexts, { speedMultiplier: cfg.cadenceSpeed });
    let sentCount = 0;

    bypassSessions.add(session);
    try {
      for (let i = 0; i < plan.units.length - 1; i += 1) {
        const delayMs = fullSchedule[i]?.delayMs ?? 360;
        await sleepFn(delayMs);
        await dispatchSingleUnit(session, options, plan.units[i] );
        sentCount += 1;
      }
    } catch (err) {
      ctx.logger?.('nb-speak')?.warn(err);
      const remainingUnits = plan.units.slice(sentCount);
      writeSessionElements(session, flattenUnitsToElements(remainingUnits));
      return;
    } finally {
      bypassSessions.delete(session);
    }

    if (plan.detachedSessionQuote && session.event?.message) {
      session.event.message.quote = undefined;
    }

    const finalDelayMs = fullSchedule[plan.units.length - 1]?.delayMs ?? 360;
    await sleepFn(finalDelayMs);
    writeSessionElements(session, plan.units[plan.units.length - 1] );
  });
}

export default {
  name,
  inject,
  Config,
  apply,
};
