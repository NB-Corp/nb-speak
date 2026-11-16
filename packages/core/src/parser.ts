import {
  computeBubbleSchedule,
  countTextUnits,
  type ArtifactKind,
  type BubbleScheduleItem,
  type CadenceOptions,
  type SendArtifactArgs,
  type VoiceNotePayload,
} from './protocol.ts';
import { lintTurn, splitPlainBeats, type LintOptions, type LintReport } from './lint.ts';

export interface ParsedSpeakTurn {
  readonly source: 'tool_calls' | 'plain_fallback';
  readonly bubbles: readonly string[];
  readonly artifacts: readonly SendArtifactArgs[];
  readonly voice_note?: VoiceNotePayload;
  readonly reply_to?: string;
  readonly end_turn: boolean;
  readonly schedule: readonly BubbleScheduleItem[];
  readonly lint: LintReport;
}

export type SpeakStreamEvent =
  | {
      readonly type: 'nb.bubble';
      readonly index: number;
      readonly text: string;
      readonly delayMs: number;
      readonly typingDurationMs: number;
      readonly cumulativeMs: number;
    }
  | {
      readonly type: 'nb.artifact';
      readonly index: number;
      readonly artifact: SendArtifactArgs;
    }
  | {
      readonly type: 'nb.voice_note';
      readonly voice_note: VoiceNotePayload;
    }
  | {
      readonly type: 'nb.lint';
      readonly lint: LintReport;
    }
  | {
      readonly type: 'nb.done';
      readonly turn: ParsedSpeakTurn;
    };

export interface NormalizeTurnOptions {
  readonly cleanHygiene?: boolean;
  readonly maxBubbles?: number;
  readonly cadence?: CadenceOptions;
  readonly lint?: LintOptions;
  readonly sendMessageNames?: readonly string[];
  readonly sendArtifactNames?: readonly string[];
}

const DEFAULT_MSG_NAMES = new Set(['send_message', 'nb_send_message', 'SendMessage']);
const DEFAULT_ART_NAMES = new Set(['send_artifact', 'nb_send_artifact', 'send_code_or_doc']);

function cleanBubbleText(raw: string, cleanHygiene: boolean): string {
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

function inferArtifactTitle(kind: ArtifactKind, language: string | undefined, content: string, index: number): string {
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
  rawText: string,
  options: { readonly cleanHygiene?: boolean; readonly maxBubbles?: number } = {},
): { readonly bubbles: string[]; readonly artifacts: SendArtifactArgs[] } {
  const cleanHygiene = options.cleanHygiene ?? true;
  const maxBubbles = options.maxBubbles ?? 4;
  const artifacts: SendArtifactArgs[] = [];

  // 1. Extract fenced code blocks out of narrow chat bubbles
  let working = rawText.replace(/\r\n/g, '\n');
  working = working.replace(/```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g, (_match, langRaw: string, bodyRaw: string) => {
    const lang = String(langRaw ?? '').trim() || undefined;
    const content = String(bodyRaw ?? '').replace(/\n+$/, '');
    if (!content.trim()) return '';
    const kind: ArtifactKind = lang === 'diff' || lang === 'patch' ? 'diff' : 'code';
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
    (_match, tableBlock: string) => {
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
      bubbles: [`Put the ${artifacts[0]!.kind} details in ${artifacts[0]!.title}`],
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
    const lead = rawBeats[0]!
      .replace(/^\s*#{1,6}\s+/, '')
      .split(/\n/)[0]!
      .slice(0, 72)
      .trim();
    const leadClean = cleanBubbleText(lead, cleanHygiene) || 'Details are in the attached note';
    return {
      bubbles: [leadClean, `Full breakdown moved to ${artifacts[artifacts.length - 1]!.title}`].slice(0, maxBubbles),
      artifacts,
    };
  }

  return { bubbles: rawBeats.slice(0, maxBubbles), artifacts };
}

interface RawToolCallCandidate {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function safeParseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractToolCallsFromCompletion(input: unknown): {
  readonly calls: RawToolCallCandidate[];
  readonly contentText: string;
} {
  if (typeof input === 'string') {
    const asObj = safeParseJsonObject(input);
    if (!asObj) return { calls: [], contentText: input };
    return extractToolCallsFromCompletion(asObj);
  }
  if (typeof input !== 'object' || input === null) {
    return { calls: [], contentText: '' };
  }

  const rec = input as Record<string, unknown>;

  // Direct `send_message` payload passed directly
  if (Array.isArray(rec.bubbles)) {
    return { calls: [{ name: 'send_message', args: rec }], contentText: '' };
  }

  const calls: RawToolCallCandidate[] = [];
  let contentText = '';

  // OpenAI Chat Completion envelope (`choices[0].message`) or Assistant message directly
  const msgObj =
    Array.isArray(rec.choices) &&
    rec.choices.length > 0 &&
    typeof rec.choices[0] === 'object' &&
    rec.choices[0] !== null &&
    typeof (rec.choices[0] as Record<string, unknown>).message === 'object'
      ? ((rec.choices[0] as Record<string, unknown>).message as Record<string, unknown>)
      : rec;

  if (typeof msgObj.content === 'string') {
    contentText = msgObj.content;
  } else if (Array.isArray(msgObj.content)) {
    // Anthropic `content` blocks (`text` + `tool_use`)
    for (const blk of msgObj.content) {
      if (typeof blk !== 'object' || blk === null) continue;
      const b = blk as Record<string, unknown>;
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
      const t = tc as Record<string, unknown>;
      const fn = typeof t.function === 'object' && t.function !== null ? (t.function as Record<string, unknown>) : t;
      if (typeof fn.name === 'string') {
        const parsed = safeParseJsonObject(fn.arguments ?? fn.input);
        if (parsed) calls.push({ name: fn.name, args: parsed });
      }
    }
  }

  // Gemini `candidates[0].content.parts`
  if (Array.isArray(rec.candidates) && rec.candidates.length > 0) {
    const cand = rec.candidates[0] as Record<string, unknown>;
    const content = typeof cand?.content === 'object' && cand.content !== null ? (cand.content as Record<string, unknown>) : undefined;
    if (content && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (typeof part !== 'object' || part === null) continue;
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string') {
          contentText += (contentText ? '\n\n' : '') + p.text;
        }
        if (typeof p.functionCall === 'object' && p.functionCall !== null) {
          const fc = p.functionCall as Record<string, unknown>;
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

export function normalizeTurnOutput(input: unknown, options: NormalizeTurnOptions = {}): ParsedSpeakTurn {
  const msgNames = options.sendMessageNames ? new Set(options.sendMessageNames) : DEFAULT_MSG_NAMES;
  const artNames = options.sendArtifactNames ? new Set(options.sendArtifactNames) : DEFAULT_ART_NAMES;
  const cleanHygiene = options.cleanHygiene ?? false;
  const maxBubbles = options.maxBubbles ?? 4;

  const { calls, contentText } = extractToolCallsFromCompletion(input);

  const bubbles: string[] = [];
  const artifacts: SendArtifactArgs[] = [];
  let voiceNote: VoiceNotePayload | undefined;
  let replyTo: string | undefined;
  let endTurn = true;
  let matchedSpeakTool = false;

  for (const call of calls) {
    if (artNames.has(call.name)) {
      matchedSpeakTool = true;
      const kindRaw = String(call.args.kind ?? 'code');
      const kind: ArtifactKind =
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
            const rec = item as Record<string, unknown>;
            const text = cleanBubbleText(String(rec.text ?? ''), cleanHygiene);
            if (text) bubbles.push(text);
            if (typeof rec.tts === 'object' && rec.tts !== null) {
              const ttsText = String((rec.tts as Record<string, unknown>).text ?? '').trim();
              if (ttsText) voiceNote = { text: ttsText };
            }
          } else {
            const text = cleanBubbleText(String(item ?? ''), cleanHygiene);
            if (text) bubbles.push(text);
          }
        }
      }
      if (typeof call.args.voice_note === 'object' && call.args.voice_note !== null) {
        const vn = call.args.voice_note as Record<string, unknown>;
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

  let source: 'tool_calls' | 'plain_fallback' = 'tool_calls';
  if (!matchedSpeakTool) {
    source = 'plain_fallback';
    const fallback = extractPlainReplyArtifactsAndBeats(contentText, {
      cleanHygiene: options.cleanHygiene ?? true,
      maxBubbles,
    });
    bubbles.push(...fallback.bubbles);
    artifacts.push(...fallback.artifacts);
  } else if (bubbles.length === 0 && artifacts.length > 0) {
    bubbles.push(`Attached ${artifacts[0]!.title}`);
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

export function turnToEvents(turn: ParsedSpeakTurn): SpeakStreamEvent[] {
  const events: SpeakStreamEvent[] = [];
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
  private content = '';
  private readonly toolCallSlots = new Map<number, { id: string; name: string; arguments: string }>();

  pushOpenAIChunk(chunk: Record<string, unknown>): void {
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      if (typeof choice !== 'object' || choice === null) continue;
      const delta = (choice as Record<string, unknown>).delta;
      if (typeof delta !== 'object' || delta === null) continue;
      const d = delta as Record<string, unknown>;
      if (typeof d.content === 'string') {
        this.content += d.content;
      }
      if (Array.isArray(d.tool_calls)) {
        d.tool_calls.forEach((rawTc, idx) => {
          if (typeof rawTc !== 'object' || rawTc === null) return;
          const tc = rawTc as Record<string, unknown>;
          const slotIndex = typeof tc.index === 'number' ? tc.index : idx;
          const existing = this.toolCallSlots.get(slotIndex) ?? { id: '', name: '', arguments: '' };
          if (typeof tc.id === 'string' && tc.id) existing.id = tc.id;
          if (typeof tc.function === 'object' && tc.function !== null) {
            const fn = tc.function as Record<string, unknown>;
            if (typeof fn.name === 'string' && fn.name) existing.name += fn.name;
            if (typeof fn.arguments === 'string') existing.arguments += fn.arguments;
          }
          this.toolCallSlots.set(slotIndex, existing);
        });
      }
    }
  }

  finalize(options: NormalizeTurnOptions = {}): ParsedSpeakTurn {
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

export interface VoiceSidecarOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly persona?: string;
  readonly fetchImpl?: typeof fetch;
}

export async function translateDraftViaSidecar(
  draftContent: string,
  sidecar: VoiceSidecarOptions,
): Promise<ParsedSpeakTurn> {
  const fetchFn = sidecar.fetchImpl ?? fetch;
  const cleanBase = sidecar.baseUrl.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : cleanBase.endsWith('/v1')
      ? `${cleanBase}/chat/completions`
      : `${cleanBase}/v1/chat/completions`;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
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
  const json: unknown = await res.json();
  return normalizeTurnOutput(json, { cleanHygiene: true });
}
