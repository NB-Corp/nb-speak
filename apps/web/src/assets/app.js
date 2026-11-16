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
    artifactExpand: (lines) => `Expand (${lines} lines)`,
    artifactCollapse: 'Collapse',
    footStat: (bubbles, arts, sec) =>
      arts > 0
        ? `${bubbles} bubbles · ${arts} artifact · ${sec}s cadence`
        : `${bubbles} bubbles · ${sec}s cadence`,
    rawFallbackStat: 'Single assistant.content blob',
    copied: 'Copied',
    copy: 'Copy',
    bridgeOnline: 'Bridge connected',
    bridgeOffline: 'Bridge offline (using local normalizer)',
    lintZero: '0 issues — clean thumb-typed IM payload.',
    voiceAiTag: (voice) =>
      voice ? `ElevenLabs ${voice} · AI-synthesized` : 'ElevenLabs eleven_v4 · AI-synthesized',
    voicePlayAria: 'Play ElevenLabs voice note',
    voicePauseAria: 'Pause voice note',
    viewDshShot: 'Live DSH Capture',
  },
  zh: {
    issuesSuffix: (n) => (n === 0 ? 'bubble_lint: 0 告警' : `bubble_lint: ${n} 项问题`),
    voiceLabel: (sec, emotion) => `${sec}秒 · ${ZH_EMOTION_MAP[emotion] || emotion || '语音补充'}`,
    artifactBadge: (kind, language) => {
      const k = ZH_KIND_MAP[kind] || kind;
      return language ? `${k} · ${language.toUpperCase()}` : k;
    },
    artifactExpand: (lines) => `展开全部 (${lines} 行)`,
    artifactCollapse: '收起',
    footStat: (bubbles, arts, sec) =>
      arts > 0
        ? `${bubbles} 条短气泡 · ${arts} 张独立卡片 · ${sec}秒节拍`
        : `${bubbles} 条短气泡 · 零代码卡 · ${sec}秒节拍`,
    rawFallbackStat: '单块长文倾倒',
    copied: '已复制',
    copy: '复制',
    bridgeOnline: '本地桥接已连接',
    bridgeOffline: '本地桥接未启动（当前为离线协议解析模式）',
    lintZero: '0 告警 —— 符合真人拇指打字与语音互补规范。',
    voiceAiTag: (voice) =>
      voice ? `ElevenLabs ${voice} · AI 合成真声` : 'ElevenLabs eleven_v4 · AI 合成真声',
    voicePlayAria: '播放 ElevenLabs 语音条',
    voicePauseAria: '暂停语音条',
    viewDshShot: 'DSH 同屏实拍',
  },
}[LANG];

const ASSET_BASE = LANG === 'zh' ? '../assets/' : './assets/';
const AUDIO_BASE = `${ASSET_BASE}audio/`;
let activeVoiceStop = null;

function stopActiveVoice() {
  if (typeof activeVoiceStop === 'function') {
    const fn = activeVoiceStop;
    activeVoiceStop = null;
    fn();
  }
}

function svgPlay() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>';
}

function svgPause() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
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

async function writeClipboardSafe(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to textarea copy
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

function computeBarHeights(seedText, count = 22) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const out = [];
  for (let i = 0; i < count; i += 1) {
    hash ^= (i + 1) * 2654435761;
    hash = Math.imul(hash, 1597334677);
    const unit = ((hash >>> 0) % 1000) / 1000;
    const env = Math.sin(((i + 0.5) / count) * Math.PI);
    out.push(Math.max(5, Math.min(19, Math.round(5 + (0.35 + 0.65 * env) * unit * 14))));
  }
  return out;
}

function parsePipeTable(content) {
  const lines = String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes('|')) return null;
  const splitRow = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const headers = splitRow(lines[0]);
  const startRow = /^[\s|:-]+$/.test(lines[1]) ? 2 : 1;
  const rows = lines.slice(startRow).map(splitRow);
  return headers.length > 0 && rows.length > 0 ? { headers, rows } : null;
}

function renderVoicePill(voiceNote, audioMeta = null) {
  const wrap = createEl('div', 'voice-pill-wrap');
  const pill = createEl('button', 'voice-pill');
  pill.type = 'button';
  pill.setAttribute('data-playing', 'false');
  pill.setAttribute('aria-pressed', 'false');
  pill.setAttribute('aria-label', UI_STRINGS.voicePlayAria);

  const playOrb = createEl('span', 'voice-play-btn');
  playOrb.innerHTML = svgPlay();
  pill.appendChild(playOrb);

  const bars = createEl('span', 'voice-bars');
  const heights = computeBarHeights(voiceNote.text || 'nb-speak', 22);
  const barEls = heights.map((h, idx) => {
    const bar = createEl('span', 'voice-bar');
    bar.style.height = `${h}px`;
    bar.style.animationDelay = `${idx * 38}ms`;
    bars.appendChild(bar);
    return bar;
  });
  pill.appendChild(bars);

  let durationSec =
    audioMeta?.durationSec && Number.isFinite(audioMeta.durationSec)
      ? Math.max(1, Math.round(audioMeta.durationSec))
      : Math.max(4, Math.min(11, Math.round(voiceNote.text.length / 7)));
  const meta = createEl('span', 'tabular', UI_STRINGS.voiceLabel(durationSec, voiceNote.emotion));
  pill.appendChild(meta);

  const transcript = createEl('div', 'voice-transcript');
  transcript.appendChild(createEl('span', '', `“${voiceNote.text}”`));
  if (audioMeta?.file) {
    transcript.appendChild(createEl('span', 'voice-ai-tag', UI_STRINGS.voiceAiTag(audioMeta.voice)));
  }

  const updateBarProgress = (ratio) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const activeCount = Math.round(clamped * barEls.length);
    barEls.forEach((bar, idx) => {
      bar.classList.toggle('is-passed', clamped > 0 && idx < activeCount);
    });
  };

  if (audioMeta?.file) {
    const audioEl = document.createElement('audio');
    audioEl.preload = 'metadata';
    audioEl.src = `${AUDIO_BASE}${audioMeta.file}`;
    audioEl.setAttribute('aria-hidden', 'true');
    audioEl.setAttribute('data-voice-audio', audioMeta.file);
    audioEl.hidden = true;

    let rafId = null;
    const tick = () => {
      if (audioEl.paused || audioEl.ended) {
        rafId = null;
        return;
      }
      const dur = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : durationSec;
      updateBarProgress(audioEl.currentTime / dur);
      rafId = requestAnimationFrame(tick);
    };

    const setPlayingState = (playing) => {
      pill.setAttribute('data-playing', playing ? 'true' : 'false');
      pill.setAttribute('aria-pressed', playing ? 'true' : 'false');
      pill.setAttribute('aria-label', playing ? UI_STRINGS.voicePauseAria : UI_STRINGS.voicePlayAria);
      playOrb.innerHTML = playing ? svgPause() : svgPlay();
      if (!playing && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const stopThis = () => {
      if (!audioEl.paused) audioEl.pause();
      audioEl.currentTime = 0;
      setPlayingState(false);
      updateBarProgress(0);
    };

    audioEl.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        durationSec = Math.max(1, Math.round(audioEl.duration));
        meta.textContent = UI_STRINGS.voiceLabel(durationSec, voiceNote.emotion);
      }
    });

    audioEl.addEventListener('ended', () => {
      audioEl.currentTime = 0;
      setPlayingState(false);
      updateBarProgress(0);
      if (activeVoiceStop === stopThis) activeVoiceStop = null;
    });

    audioEl.addEventListener('pause', () => {
      if (!audioEl.ended) setPlayingState(false);
    });

    audioEl.addEventListener('play', () => {
      setPlayingState(true);
      if (rafId === null) rafId = requestAnimationFrame(tick);
    });

    pill.addEventListener('click', () => {
      const active = pill.getAttribute('data-playing') === 'true';
      if (active) {
        audioEl.pause();
        setPlayingState(false);
        return;
      }
      stopActiveVoice();
      activeVoiceStop = stopThis;
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setPlayingState(false);
        });
      }
    });

    wrap.appendChild(pill);
    wrap.appendChild(audioEl);
    wrap.appendChild(transcript);
    return wrap;
  }

  // Fallback to Web Speech API ONLY for custom dynamic text typed in Live Workspace
  let timer = null;
  const stopSynth = () => {
    pill.setAttribute('data-playing', 'false');
    pill.setAttribute('aria-pressed', 'false');
    pill.setAttribute('aria-label', UI_STRINGS.voicePlayAria);
    playOrb.innerHTML = svgPlay();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  pill.addEventListener('click', () => {
    const active = pill.getAttribute('data-playing') === 'true';
    if (active) {
      stopSynth();
      if (activeVoiceStop === stopSynth) activeVoiceStop = null;
      return;
    }
    stopActiveVoice();
    activeVoiceStop = stopSynth;
    pill.setAttribute('data-playing', 'true');
    pill.setAttribute('aria-pressed', 'true');
    pill.setAttribute('aria-label', UI_STRINGS.voicePauseAria);
    playOrb.innerHTML = svgPause();
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(voiceNote.text);
        utter.lang = /[\u4e00-\u9fff]/.test(voiceNote.text) ? 'zh-CN' : 'en-US';
        utter.rate = 1.03;
        utter.onend = () => stopSynth();
        utter.onerror = () => stopSynth();
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback timer below handles UI reset
      }
    }
    timer = setTimeout(() => stopSynth(), durationSec * 1000);
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
  titleWrap.appendChild(createEl('span', 'artifact-kind', UI_STRINGS.artifactBadge(art.kind, art.language)));

  const actions = createEl('div', 'artifact-actions');
  const lineCount = String(art.content || '').split('\n').length;
  const parsedTable = art.kind === 'table' ? parsePipeTable(art.content) : null;
  const collapsible = !parsedTable && lineCount > 11;
  let expanded = false;

  let bodyEl;
  if (parsedTable) {
    bodyEl = createEl('div', 'artifact-table-wrap');
    const table = createEl('table', 'artifact-table');
    const thead = createEl('thead');
    const headRow = createEl('tr');
    parsedTable.headers.forEach((hd) => headRow.appendChild(createEl('th', '', hd)));
    thead.appendChild(headRow);
    const tbody = createEl('tbody');
    parsedTable.rows.forEach((row) => {
      const tr = createEl('tr');
      row.forEach((cell) => tr.appendChild(createEl('td', '', cell)));
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    bodyEl.appendChild(table);
  } else {
    bodyEl = createEl('pre', 'artifact-body', art.content);
    bodyEl.setAttribute('data-collapsible', collapsible ? 'true' : 'false');
    bodyEl.setAttribute('data-expanded', 'false');
  }

  if (collapsible) {
    const expandBtn = createEl('button', 'artifact-chip-btn', UI_STRINGS.artifactExpand(lineCount));
    expandBtn.type = 'button';
    expandBtn.setAttribute('data-action', 'expand-artifact');
    expandBtn.addEventListener('click', () => {
      expanded = !expanded;
      bodyEl.setAttribute('data-expanded', expanded ? 'true' : 'false');
      expandBtn.textContent = expanded ? UI_STRINGS.artifactCollapse : UI_STRINGS.artifactExpand(lineCount);
    });
    actions.appendChild(expandBtn);
  }

  const copyBtn = createEl('button', 'artifact-chip-btn', UI_STRINGS.copy);
  copyBtn.type = 'button';
  copyBtn.setAttribute('data-action', 'copy-artifact');
  copyBtn.setAttribute('data-copied', 'false');
  copyBtn.addEventListener('click', async () => {
    const ok = await writeClipboardSafe(art.content || '');
    if (ok) {
      copyBtn.setAttribute('data-copied', 'true');
      copyBtn.textContent = UI_STRINGS.copied;
      setTimeout(() => {
        copyBtn.setAttribute('data-copied', 'false');
        copyBtn.textContent = UI_STRINGS.copy;
      }, 1400);
    }
  });
  actions.appendChild(copyBtn);

  head.appendChild(titleWrap);
  head.appendChild(actions);
  card.appendChild(head);
  card.appendChild(bodyEl);
  return card;
}

// --- Section 1: Interactive Split Stage + DSH Live Capture Lightbox ---
const scenarioList = SCENARIOS[LANG] || SCENARIOS.en;
const dshScenarioList = scenarioList.filter((sc) => Boolean(sc.dshCapture));
let activeScenarioIdx = 0;
let playGeneration = 0;

function openDshLightbox(targetScenarioId) {
  const dialog = document.getElementById('dsh-lightbox');
  const imgEl = document.getElementById('dsh-lightbox-img');
  const titleEl = document.getElementById('dsh-lightbox-title');
  const capEl = document.getElementById('dsh-lightbox-caption');
  const tabsWrap = document.getElementById('dsh-lightbox-tabs');
  if (!dialog || !imgEl || dshScenarioList.length === 0) return;

  const chosen =
    dshScenarioList.find((sc) => sc.id === targetScenarioId) || dshScenarioList[0];

  imgEl.src = `${ASSET_BASE}${chosen.dshCapture.file}`;
  imgEl.alt = chosen.dshCapture.title;
  if (titleEl) titleEl.textContent = chosen.dshCapture.title;
  if (capEl) capEl.textContent = chosen.dshCapture.caption;

  if (tabsWrap) {
    [...tabsWrap.querySelectorAll('[data-lightbox-id]')].forEach((btn) => {
      const match = btn.getAttribute('data-lightbox-id') === chosen.id;
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
      btn.classList.toggle('mini-btn--accent', match);
    });
  }

  if (!dialog.open && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (!dialog.open) {
    dialog.setAttribute('open', '');
  }
}

function syncDshProofBar(scenario) {
  const proofBar = document.getElementById('dsh-proof-bar');
  const proofBadge = document.getElementById('dsh-proof-badge');
  const proofTitle = document.getElementById('dsh-proof-title');
  const stageDshBtn = document.getElementById('open-stage-dsh-btn');

  if (stageDshBtn) {
    if (scenario.dshCapture) {
      stageDshBtn.hidden = false;
      stageDshBtn.onclick = () => openDshLightbox(scenario.id);
    } else {
      stageDshBtn.hidden = true;
    }
  }

  if (!proofBar) return;
  const fallbackDsh = scenario.dshCapture ? scenario : dshScenarioList[0];
  if (!fallbackDsh?.dshCapture) {
    proofBar.hidden = true;
    return;
  }
  proofBar.hidden = false;
  if (proofBadge) proofBadge.textContent = fallbackDsh.dshBadge || 'DSH Live';
  if (proofTitle) proofTitle.textContent = fallbackDsh.dshCapture.title;
  const barBtn = document.getElementById('dsh-proof-open-btn');
  if (barBtn) {
    barBtn.onclick = () => openDshLightbox(fallbackDsh.id);
  }
}

function initDshLightbox() {
  const dialog = document.getElementById('dsh-lightbox');
  const closeBtn = document.getElementById('dsh-lightbox-close');
  const tabsWrap = document.getElementById('dsh-lightbox-tabs');
  if (!dialog) return;

  if (tabsWrap) {
    tabsWrap.innerHTML = '';
    dshScenarioList.forEach((sc) => {
      const btn = createEl('button', 'mini-btn', sc.label);
      btn.type = 'button';
      btn.setAttribute('data-lightbox-id', sc.id);
      btn.addEventListener('click', () => openDshLightbox(sc.id));
      tabsWrap.appendChild(btn);
    });
  }

  closeBtn?.addEventListener('click', () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });

  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  });
}

function renderSplitStage(scenario, animate = true) {
  stopActiveVoice();
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
  syncDshProofBar(scenario);

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
      speakStream.appendChild(renderVoicePill(scenario.speakToolCall.voice_note, scenario.voiceAudio || null));
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
            speakStream.appendChild(renderVoicePill(scenario.speakToolCall.voice_note, scenario.voiceAudio || null));
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

  initDshLightbox();
  if (!tabsWrap) return;
  tabsWrap.innerHTML = '';

  scenarioList.forEach((sc, idx) => {
    const btn = createEl('button', 'scenario-tab', sc.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-scenario-id', sc.id);
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
      const ok = await writeClipboardSafe(targetEl.textContent || '');
      if (ok) {
        const orig = btn.textContent;
        btn.textContent = UI_STRINGS.copied;
        setTimeout(() => {
          btn.textContent = orig;
        }, 1300);
      }
    });
  });
}

initSplitStage();
initWorkspace();
initCopyButtons();
