import {
  buildSpeakSystemPrompt,
  computeBubbleSchedule,
  getOpenAISpeakTools,
  lintTurn,
  normalizeTurnOutput,
} from './nb-speak-browser.js';
import { SCENARIOS } from './scenarios.js';

const LANG = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';

const ZH_EMOTION_MAP = {
  calm: '沉稳补充',
  warm: '温和叮嘱',
  dry: '克制调侃',
  relieved: '松一口气',
  playful: '轻快随口',
  serious: '严肃提醒',
  neutral: '口语补充',
};

const ZH_KIND_MAP = {
  code: '代码卡',
  table: '表格卡',
  diff: '变更卡',
  markdown: '文档卡',
};

const UI_STRINGS = {
  en: {
    issuesSuffix: (n) => (n === 0 ? 'bubble_lint: 0 warnings' : `bubble_lint: ${n} issues`),
    voiceLabel: (sec, emotion) => `${sec}s · ${emotion || 'voice'}`,
    artifactBadge: (kind, language) => (language ? `${kind} · ${language}` : kind),
    footStat: (bubbles, arts, sec) => `${bubbles} bubbles · ${arts} artifact · ${sec}s cadence`,
    rawFallbackStat: 'Single assistant.content blob',
    copied: 'Copied',
    copy: 'Copy',
    bridgeOnline: 'Bridge connected',
    bridgeOffline: 'Bridge offline (using local normalizer)',
    lintZero: '0 issues — clean thumb-typed IM payload.',
  },
  zh: {
    issuesSuffix: (n) => (n === 0 ? 'bubble_lint: 0 告警' : `bubble_lint: ${n} 项问题`),
    voiceLabel: (sec, emotion) => `${sec}秒 · ${ZH_EMOTION_MAP[emotion] || emotion || '语音补充'}`,
    artifactBadge: (kind, language) => {
      const k = ZH_KIND_MAP[kind] || kind;
      return language ? `${k} · ${language.toUpperCase()}` : k;
    },
    footStat: (bubbles, arts, sec) => `${bubbles} 条短气泡 · ${arts} 张独立卡片 · ${sec}秒节拍`,
    rawFallbackStat: '单块长文倾倒',
    copied: '已复制',
    copy: '复制',
    bridgeOnline: '本地桥接已连接',
    bridgeOffline: '本地桥接未启动（当前为离线协议解析模式）',
    lintZero: '0 告警 —— 符合真人拇指打字与语音互补规范。',
  },
}[LANG];

function svgPlay() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>';
}

function svgCode() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderVoicePill(voiceNote) {
  const wrap = createEl('div', 'voice-pill-wrap');
  const pill = createEl('button', 'voice-pill');
  pill.type = 'button';
  const playOrb = createEl('span', 'voice-play-btn');
  playOrb.innerHTML = svgPlay();
  pill.appendChild(playOrb);

  const bars = createEl('span', 'voice-bars');
  const heights = [7, 13, 18, 10, 16, 19, 11, 15, 9, 17, 12, 8, 14, 10];
  heights.forEach((h, idx) => {
    const bar = createEl('span', 'voice-bar');
    bar.style.height = `${h}px`;
    bar.style.animationDelay = `${idx * 45}ms`;
    bars.appendChild(bar);
  });
  pill.appendChild(bars);

  const estSec = Math.max(4, Math.min(11, Math.round(voiceNote.text.length / 7)));
  const meta = createEl('span', 'tabular', UI_STRINGS.voiceLabel(estSec, voiceNote.emotion));
  pill.appendChild(meta);

  const transcript = createEl('div', 'voice-transcript', `“${voiceNote.text}”`);

  let timer = null;
  pill.addEventListener('click', () => {
    const active = pill.getAttribute('data-playing') === 'true';
    if (active) {
      pill.setAttribute('data-playing', 'false');
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (timer) clearTimeout(timer);
      return;
    }
    pill.setAttribute('data-playing', 'true');
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(voiceNote.text);
        utter.lang = /[\u4e00-\u9fff]/.test(voiceNote.text) ? 'zh-CN' : 'en-US';
        utter.rate = 1.03;
        utter.onend = () => pill.setAttribute('data-playing', 'false');
        utter.onerror = () => pill.setAttribute('data-playing', 'false');
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback timer below handles UI reset
      }
    }
    timer = setTimeout(() => pill.setAttribute('data-playing', 'false'), estSec * 1000);
  });

  wrap.appendChild(pill);
  wrap.appendChild(transcript);
  return wrap;
}

function renderArtifactCard(art) {
  const card = createEl('div', 'artifact-card');
  const head = createEl('div', 'artifact-head');
  const titleWrap = createEl('span', 'artifact-title');
  titleWrap.innerHTML = svgCode();
  titleWrap.appendChild(createEl('span', '', art.title));
  const kindBadge = createEl('span', 'artifact-kind', UI_STRINGS.artifactBadge(art.kind, art.language));
  head.appendChild(titleWrap);
  head.appendChild(kindBadge);

  const pre = createEl('pre', 'artifact-body', art.content);
  card.appendChild(head);
  card.appendChild(pre);
  return card;
}

// --- Section 1: Interactive Split Stage ---
const scenarioList = SCENARIOS[LANG] || SCENARIOS.en;
let activeScenarioIdx = 0;
let playGeneration = 0;

function renderSplitStage(scenario, animate = true) {
  playGeneration += 1;
  const gen = playGeneration;

  const rawStream = document.getElementById('raw-stream');
  const speakStream = document.getElementById('speak-stream');
  const rawLintBadge = document.getElementById('raw-lint-badge');
  const speakLintBadge = document.getElementById('speak-lint-badge');
  const rawFootStat = document.getElementById('raw-foot-stat');
  const speakFootStat = document.getElementById('speak-foot-stat');
  const stageJsonModal = document.getElementById('stage-json-preview');

  if (!rawStream || !speakStream) return;

  rawStream.innerHTML = '';
  speakStream.innerHTML = '';

  // User prompt on both sides
  for (const container of [rawStream, speakStream]) {
    const uRow = createEl('div', 'msg-row msg-row--user');
    uRow.appendChild(createEl('div', 'bubble bubble--user', scenario.userPrompt));
    container.appendChild(uRow);
  }

  // Lint raw wall deterministically via real @nb-corp/nb-speak engine
  const rawReport = lintTurn({ messages: [{ text: scenario.rawWall }] });
  rawLintBadge.className = `lint-badge ${rawReport.ok ? 'lint-badge--pass' : 'lint-badge--fail'}`;
  rawLintBadge.textContent = UI_STRINGS.issuesSuffix(rawReport.issueCount);

  const wallRow = createEl('div', 'msg-row msg-row--agent');
  wallRow.style.maxWidth = '96%';
  wallRow.appendChild(createEl('div', 'bubble bubble--wall', scenario.rawWall));
  rawStream.appendChild(wallRow);

  const rawIssueCodes = rawReport.issues.slice(0, 3).map((i) => i.code).join(' · ');
  rawFootStat.textContent = rawIssueCodes || UI_STRINGS.rawFallbackStat;

  // Lint nb-speak payload via real @nb-corp/nb-speak engine
  const speakReport = lintTurn(scenario.speakToolCall);
  speakLintBadge.className = `lint-badge ${speakReport.ok ? 'lint-badge--pass' : 'lint-badge--warn'}`;
  speakLintBadge.textContent = UI_STRINGS.issuesSuffix(speakReport.issueCount);

  const naturalSchedule = computeBubbleSchedule(scenario.speakToolCall.bubbles);
  const schedule = computeBubbleSchedule(scenario.speakToolCall.bubbles, {
    speedMultiplier: animate ? 1.55 : 999,
  });

  if (stageJsonModal) {
    stageJsonModal.textContent = JSON.stringify(
      {
        send_message: scenario.speakToolCall,
        ...(scenario.artifacts.length > 0 ? { send_artifact: scenario.artifacts } : {}),
      },
      null,
      2,
    );
  }

  const totalCadence = naturalSchedule.reduce((acc, s) => acc + s.delayMs, 0);
  speakFootStat.textContent = UI_STRINGS.footStat(
    naturalSchedule.length,
    scenario.artifacts.length,
    (totalCadence / 1000).toFixed(1),
  );

  if (!animate) {
    for (const item of schedule) {
      const row = createEl('div', 'msg-row msg-row--agent');
      row.appendChild(createEl('div', 'bubble bubble--agent', item.text));
      speakStream.appendChild(row);
    }
    for (const art of scenario.artifacts) {
      speakStream.appendChild(renderArtifactCard(art));
    }
    if (scenario.speakToolCall.voice_note) {
      speakStream.appendChild(renderVoicePill(scenario.speakToolCall.voice_note));
    }
    return;
  }

  // Animated paced playback with typing indicator
  const typingRow = createEl('div', 'typing-pill');
  typingRow.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  speakStream.appendChild(typingRow);

  let elapsed = 0;
  schedule.forEach((item, idx) => {
    elapsed += item.delayMs;
    setTimeout(() => {
      if (gen !== playGeneration) return;
      const row = createEl('div', 'msg-row msg-row--agent');
      row.appendChild(createEl('div', 'bubble bubble--agent', item.text));
      speakStream.insertBefore(row, typingRow);

      if (idx === schedule.length - 1) {
        typingRow.remove();
        scenario.artifacts.forEach((art, aIdx) => {
          setTimeout(() => {
            if (gen !== playGeneration) return;
            speakStream.appendChild(renderArtifactCard(art));
          }, 160 * (aIdx + 1));
        });
        if (scenario.speakToolCall.voice_note) {
          setTimeout(() => {
            if (gen !== playGeneration) return;
            speakStream.appendChild(renderVoicePill(scenario.speakToolCall.voice_note));
          }, 220 + scenario.artifacts.length * 160);
        }
      }
    }, elapsed);
  });
}

function initSplitStage() {
  const tabsWrap = document.getElementById('scenario-tabs');
  const replayBtn = document.getElementById('replay-stage-btn');
  const toggleJsonBtn = document.getElementById('toggle-stage-json');
  const jsonDrawer = document.getElementById('stage-json-drawer');

  if (!tabsWrap) return;
  tabsWrap.innerHTML = '';

  scenarioList.forEach((sc, idx) => {
    const btn = createEl('button', 'scenario-tab', sc.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeScenarioIdx = idx;
      [...tabsWrap.querySelectorAll('.scenario-tab')].forEach((b, bIdx) => {
        b.setAttribute('aria-selected', bIdx === idx ? 'true' : 'false');
      });
      renderSplitStage(scenarioList[idx], true);
    });
    tabsWrap.appendChild(btn);
  });

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      renderSplitStage(scenarioList[activeScenarioIdx], true);
    });
  }

  if (toggleJsonBtn && jsonDrawer) {
    toggleJsonBtn.addEventListener('click', () => {
      const hidden = jsonDrawer.hasAttribute('hidden');
      if (hidden) jsonDrawer.removeAttribute('hidden');
      else jsonDrawer.setAttribute('hidden', '');
    });
  }

  // Render initial state cleanly right away (so crawlers & instant first paint see full bubbles + artifacts!)
  renderSplitStage(scenarioList[0], false);
}

// --- Section 2: Live BYOK / Local Bridge IM Workspace + Live Linter ---
function initWorkspace() {
  const modeSelect = document.getElementById('ws-mode');
  const personaSelect = document.getElementById('ws-persona');
  const endpointInput = document.getElementById('ws-endpoint');
  const apiKeyField = document.getElementById('ws-apikey-wrap');
  const apiKeyInput = document.getElementById('ws-apikey');
  const modelInput = document.getElementById('ws-model');
  const soulInput = document.getElementById('ws-soul');
  const chatThread = document.getElementById('ws-thread');
  const chatInput = document.getElementById('ws-composer-input');
  const sendBtn = document.getElementById('ws-send-btn');
  const bridgeStatus = document.getElementById('ws-bridge-status');

  const inspectorTabs = document.querySelectorAll('[data-inspector-tab]');
  const paneToolJson = document.getElementById('insp-pane-json');
  const paneLintLive = document.getElementById('insp-pane-lint');
  const paneSystem = document.getElementById('insp-pane-system');

  const toolJsonCode = document.getElementById('insp-tool-json');
  const systemCode = document.getElementById('insp-system-prompt');
  const lintEditor = document.getElementById('lint-live-editor');
  const lintLiveBadge = document.getElementById('lint-live-badge');
  const lintIssuesList = document.getElementById('lint-live-issues');

  if (!modeSelect || !chatThread) return;

  const history = [];

  function syncSystemPreview() {
    const persona = personaSelect ? personaSelect.value : 'neutral_peer';
    const customSoul = soulInput ? soulInput.value : '';
    if (systemCode) {
      systemCode.textContent = buildSpeakSystemPrompt({ persona, customSoul });
    }
  }

  function runLiveLintEditor() {
    if (!lintEditor || !lintLiveBadge || !lintIssuesList) return;
    const report = lintTurn(lintEditor.value, { surface: 'auto' });
    lintLiveBadge.className = `lint-badge ${report.ok ? 'lint-badge--pass' : 'lint-badge--fail'}`;
    lintLiveBadge.textContent = UI_STRINGS.issuesSuffix(report.issueCount);
    lintIssuesList.innerHTML = '';
    if (report.ok) {
      lintIssuesList.appendChild(createEl('li', 'issue-item', UI_STRINGS.lintZero));
    } else {
      for (const issue of report.issues) {
        lintIssuesList.appendChild(
          createEl('li', 'issue-item', `[${issue.level}] ${issue.code} — ${issue.message}`),
        );
      }
    }
  }

  async function probeLocalBridge() {
    if (!bridgeStatus || modeSelect.value !== 'bridge') return;
    const base = (endpointInput?.value || 'http://127.0.0.1:18090').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        bridgeStatus.className = 'lint-badge lint-badge--pass';
        bridgeStatus.textContent = UI_STRINGS.bridgeOnline;
        return;
      }
    } catch {
      // Offline is expected when user opens GitHub Pages before starting local CLI
    }
    bridgeStatus.className = 'lint-badge lint-badge--warn';
    bridgeStatus.textContent = UI_STRINGS.bridgeOffline;
  }

  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value;
    if (mode === 'bridge') {
      if (endpointInput) endpointInput.value = 'http://127.0.0.1:18090/v1';
      if (apiKeyField) apiKeyField.setAttribute('hidden', '');
      void probeLocalBridge();
    } else if (mode === 'byok') {
      if (endpointInput) endpointInput.value = 'https://api.deepseek.com/v1';
      if (apiKeyField) apiKeyField.removeAttribute('hidden');
    } else {
      if (apiKeyField) apiKeyField.setAttribute('hidden', '');
    }
  });

  personaSelect?.addEventListener('change', syncSystemPreview);
  soulInput?.addEventListener('input', syncSystemPreview);
  lintEditor?.addEventListener('input', runLiveLintEditor);

  inspectorTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-inspector-tab');
      inspectorTabs.forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      if (paneToolJson) paneToolJson.hidden = target !== 'json';
      if (paneLintLive) paneLintLive.hidden = target !== 'lint';
      if (paneSystem) paneSystem.hidden = target !== 'system';
    });
  });

  function appendTurnToWorkspace(userText, parsedTurn) {
    const uRow = createEl('div', 'msg-row msg-row--user');
    uRow.appendChild(createEl('div', 'bubble bubble--user', userText));
    chatThread.appendChild(uRow);

    for (const b of parsedTurn.bubbles) {
      const aRow = createEl('div', 'msg-row msg-row--agent');
      aRow.appendChild(createEl('div', 'bubble bubble--agent', b));
      chatThread.appendChild(aRow);
    }
    for (const art of parsedTurn.artifacts) {
      chatThread.appendChild(renderArtifactCard(art));
    }
    if (parsedTurn.voice_note) {
      chatThread.appendChild(renderVoicePill(parsedTurn.voice_note));
    }
    chatThread.scrollTop = chatThread.scrollHeight;

    const inspectPayload = {
      source: parsedTurn.source,
      bubbles: parsedTurn.bubbles,
      ...(parsedTurn.voice_note ? { voice_note: parsedTurn.voice_note } : {}),
      ...(parsedTurn.artifacts.length > 0 ? { artifacts: parsedTurn.artifacts } : {}),
      schedule: parsedTurn.schedule.map((s) => ({ index: s.index, delayMs: s.delayMs })),
      lint: { ok: parsedTurn.lint.ok, issueCount: parsedTurn.lint.issueCount },
    };
    if (toolJsonCode) toolJsonCode.textContent = JSON.stringify(inspectPayload, null, 2);
    if (lintEditor) {
      lintEditor.value = JSON.stringify(
        {
          bubbles: parsedTurn.bubbles,
          ...(parsedTurn.voice_note ? { voice_note: parsedTurn.voice_note } : {}),
          end_turn: true,
        },
        null,
        2,
      );
      runLiveLintEditor();
    }
  }

  async function handleSend() {
    const text = (chatInput?.value || '').trim();
    if (!text) return;
    chatInput.value = '';

    const mode = modeSelect.value;
    const persona = personaSelect?.value || 'neutral_peer';
    const customSoul = soulInput?.value || '';

    if (mode === 'normalize') {
      const turn = normalizeTurnOutput(text, { cleanHygiene: true });
      appendTurnToWorkspace(
        LANG === 'zh' ? '将以下原始大模型长文归一化为 IM 气泡与制品：' : 'Normalize raw LLM draft into IM beats & artifacts:',
        turn,
      );
      return;
    }

    const base = (endpointInput?.value || 'http://127.0.0.1:18090/v1').replace(/\/+$/, '');
    const url = base.endsWith('/chat/completions')
      ? base
      : base.endsWith('/v1')
        ? `${base}/chat/completions`
        : `${base}/v1/chat/completions`;

    history.push({ role: 'user', content: text });

    try {
      const headers = { 'content-type': 'application/json' };
      let payload;

      if (mode === 'bridge') {
        headers['x-nb-speak-persona'] = persona;
        if (customSoul.trim()) headers['x-nb-speak-soul'] = encodeURIComponent(customSoul.trim());
        payload = {
          model: modelInput?.value || 'deepseek-chat',
          stream: false,
          messages: history,
        };
      } else {
        const key = (apiKeyInput?.value || '').trim();
        if (key) headers.authorization = `Bearer ${key}`;
        payload = {
          model: modelInput?.value || 'deepseek-chat',
          stream: false,
          messages: [{ role: 'system', content: buildSpeakSystemPrompt({ persona, customSoul }) }, ...history],
          tools: getOpenAISpeakTools(),
        };
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const turn = json.nb_speak ? json.nb_speak : normalizeTurnOutput(json, { cleanHygiene: true });
      history.push({ role: 'assistant', content: turn.bubbles.join('\n\n') });
      appendTurnToWorkspace(text, turn);
    } catch {
      // If bridge isn't running locally, normalize text directly via real @nb-corp/nb-speak parser so user still gets a working parse
      const fallbackTurn = normalizeTurnOutput(text, { cleanHygiene: true });
      appendTurnToWorkspace(text, fallbackTurn);
    }
  }

  sendBtn?.addEventListener('click', () => void handleSend());
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  });

  // Seed workspace with 1 clean real normalized turn so it looks alive on arrival
  const seedRaw =
    LANG === 'zh'
      ? 'Bubble 1: 灰度日志刚核对完。\n\n```sql\n-- check_pool.sql\nSELECT state, count(*) FROM pg_stat_activity GROUP BY 1;\n```\n\n连接池空闲充裕，今晚放心推全量。'
      : 'Bubble 1: Checked the canary pool stats.\n\n```sql\n-- check_pool.sql\nSELECT state, count(*) FROM pg_stat_activity GROUP BY 1;\n```\n\nIdle connections have plenty of headroom, safe to flip 100%.';
  const seedTurn = normalizeTurnOutput(seedRaw, { cleanHygiene: true });
  appendTurnToWorkspace(
    LANG === 'zh' ? '帮我看眼数据库连接池水位，能发版吗？' : 'Check pg_stat_activity pool headroom before we flip prod?',
    seedTurn,
  );
  syncSystemPreview();
  void probeLocalBridge();
}

function initCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy-target');
      const targetEl = targetId ? document.getElementById(targetId) : null;
      if (!targetEl) return;
      try {
        await navigator.clipboard.writeText(targetEl.textContent || '');
        const orig = btn.textContent;
        btn.textContent = UI_STRINGS.copied;
        setTimeout(() => {
          btn.textContent = orig;
        }, 1300);
      } catch {
        // Ignore clipboard permission errors in headless environments
      }
    });
  });
}

initSplitStage();
initWorkspace();
initCopyButtons();
