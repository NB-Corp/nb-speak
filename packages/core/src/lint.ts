import { countTextUnits, type VoiceNotePayload } from './protocol.ts';

export type LintSeverity = 'error' | 'warning';
export type LintSurface = 'auto' | 'json' | 'plain';

export interface LintIssue {
  readonly code: string;
  readonly level: LintSeverity;
  readonly message: string;
}

export interface LintOptions {
  readonly surface?: LintSurface;
  readonly maxBubbles?: number;
  readonly maxCjkChars?: number;
  readonly maxEnWords?: number;
  readonly personaEmoji?: 'deny' | 'allow';
  readonly maxTtsOverlap?: number;
  readonly explicitTtsText?: string;
}

export interface LintReport {
  readonly ok: boolean;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly stats: {
    readonly bubbleCount: number;
    readonly totalCjkChars: number;
    readonly totalEnWords: number;
    readonly hasVoiceNote: boolean;
    readonly ttsOverlap: number;
  };
  readonly issues: readonly LintIssue[];
}

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

interface NormalizedBubbleEntry {
  readonly text: string;
  readonly voiceMode?: string;
  readonly tts?: VoiceNotePayload;
}

interface NormalizedLintPayload {
  readonly entries: readonly NormalizedBubbleEntry[];
  readonly usedBubblesProtocol: boolean;
  readonly usedMessagesArray: boolean;
  readonly batchRootTts: boolean;
  readonly plainMetaLeak: boolean;
  readonly schemaError?: LintIssue;
}

function endsWithFormalPeriod(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (s.endsWith('。')) return true;
  if (s.endsWith('.') && !s.endsWith('..') && !ABBREV_END_RE.test(s)) return true;
  return false;
}

function isShortSingleClauseWithPeriod(text: string): boolean {
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

export function charBigrams(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
  if (cleaned.length < 2) {
    return cleaned ? new Set([cleaned]) : new Set();
  }
  const grams = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    grams.add(cleaned.slice(i, i + 2));
  }
  return grams;
}

export function computeVoiceOverlap(bubbleTexts: readonly string[], ttsText: string): number {
  const bGrams = charBigrams(bubbleTexts.join(' '));
  const tGrams = charBigrams(ttsText);
  if (bGrams.size === 0 || tGrams.size === 0) return 0;
  let shared = 0;
  for (const g of tGrams) {
    if (bGrams.has(g)) shared += 1;
  }
  return shared / tGrams.size;
}

export function splitPlainBeats(raw: string, explicitPlainSurface: boolean): string[] {
  const stripped = raw.trim();
  if (!stripped) return [];
  if (/\n\s*\n/.test(stripped)) {
    return stripped
      .split(/\n\s*\n+/)
      .map((blk) => blk.trim())
      .filter(Boolean);
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
  input: unknown,
  surface: LintSurface,
  explicitTtsText?: string,
): NormalizedLintPayload {
  let obj: Record<string, unknown>;
  let plainMetaLeak = false;

  if (typeof input === 'string') {
    const stripped = input.trim();
    if (surface === 'plain') {
      plainMetaLeak = PLAIN_META_LEAK_RE.test(stripped);
      const beats = splitPlainBeats(stripped, true);
      obj = { messages: beats.map((b) => ({ text: b })) };
    } else if (surface === 'json' || (surface === 'auto' && (stripped.startsWith('{') || stripped.startsWith('[')))) {
      const parsed: unknown = JSON.parse(stripped);
      if (Array.isArray(parsed)) {
        obj = { messages: parsed };
      } else if (typeof parsed === 'object' && parsed !== null) {
        obj = { ...(parsed as Record<string, unknown>) };
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
    obj = { ...(input as Record<string, unknown>) };
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

  let entries: NormalizedBubbleEntry[] = [];
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
        ? { text: String((item as Record<string, unknown>).text ?? '') }
        : { text: String(item ?? '') },
    );
    const vn = obj.voice_note ?? obj.voiceNote;
    if (typeof vn === 'object' && vn !== null) {
      const vnText = String((vn as Record<string, unknown>).text ?? '').trim();
      const emotion = typeof (vn as Record<string, unknown>).emotion === 'string'
        ? String((vn as Record<string, unknown>).emotion)
        : undefined;
      if (vnText) {
        if (entries.length > 0) {
          const last = entries[entries.length - 1]!;
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
        const rec = item as Record<string, unknown>;
        const ttsObj = typeof rec.tts === 'object' && rec.tts !== null ? (rec.tts as Record<string, unknown>) : undefined;
        return {
          text: String(rec.text ?? ''),
          voiceMode: typeof rec.voice_mode === 'string' ? rec.voice_mode : undefined,
          tts: ttsObj ? { text: String(ttsObj.text ?? '') } : undefined,
        };
      }
      return { text: String(item ?? '') };
    });
  } else {
    const ttsObj = typeof obj.tts === 'object' && obj.tts !== null ? (obj.tts as Record<string, unknown>) : undefined;
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
      const last = entries[entries.length - 1]!;
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

export function lintTurn(input: unknown, options: LintOptions = {}): LintReport {
  const surface = options.surface ?? 'auto';
  const maxCjkChars = options.maxCjkChars ?? 55;
  const maxEnWords = options.maxEnWords ?? 45;
  const personaEmoji = options.personaEmoji ?? 'deny';
  const maxTtsOverlap = options.maxTtsOverlap ?? 0.5;

  let normalized: NormalizedLintPayload;
  try {
    normalized = normalizeInputToPayload(input, surface, options.explicitTtsText);
  } catch (err) {
    const issue: LintIssue = {
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

  const issues: LintIssue[] = [];
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

  const bubbleTexts: string[] = [];
  const ttsEntries: Array<{ readonly index: number; readonly text: string }> = [];
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
    const clip = ttsEntries[0]!;
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
