import {
  computeBubbleSchedule,
  countTextUnits,
                          
                      
                        
} from './protocol.js';
import { lintTurn,                 } from './lint.js';

                                                      

                                  
                                      
                                                
 

                                       
                            
                                        
                                      
                               
                                        
                                        
                                    
 

                                          
                            
                               
                                      
                                            
                                                  
                                                   
                            
 

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
