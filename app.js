const DATA_URLS = ["./data/study-data.json", "/Sources/InsuranceStudyApp/Resources/study-data.json"];
const STORAGE_KEY = "insurance-study-web-progress-v1";
const AI_STORAGE_KEY = "insurance-study-web-ai-settings-v1";
const MOCK_EXAM_STORAGE_KEY = "insurance-study-web-mock-exams-v1";
const MOCK_EXAM_CONFIGS = [
  {
    id: "mock-exam-paper1",
    title: "试卷一：模拟考试",
    subtitle: "75 题 · 保險原理及實務",
    sourceSetId: "set-paper1-mock-2026-02",
    count: 75,
  },
  {
    id: "mock-exam-paper3",
    title: "试卷三：模拟考试",
    subtitle: "50 题 · 長期保險",
    sourceSetId: "set-paper3-mock-2026-02",
    count: 50,
  },
];
const DEFAULT_AI_SETTINGS = {
  provider: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
  temperature: 0.2,
  maxTokens: 900,
};
const AI_MODEL_OPTIONS = ["deepseek-v4-flash", "deepseek-v4-pro"];

const state = {
  data: null,
  activeView: "dashboard",
  previousView: "dashboard",
  activeSetId: null,
  activeQuestionIndex: 0,
  activeMaterialId: null,
  activeSectionId: null,
  searchTerm: "",
  progress: loadProgress(),
  aiSettings: loadAISettings(),
  mockExamSelections: loadMockExamSelections(),
  flatSections: [],
  allQuestions: [],
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  aiSettingsForm: document.querySelector("#aiSettingsForm"),
  aiSettingsClear: document.querySelector("#aiSettingsClear"),
  aiProviderInput: document.querySelector("#aiProviderInput"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  aiModelSelect: document.querySelector("#aiModelSelect"),
  aiCustomModelInput: document.querySelector("#aiCustomModelInput"),
  aiApiKeyInput: document.querySelector("#aiApiKeyInput"),
  aiKeyStatus: document.querySelector("#aiKeyStatus"),
  aiSettingsStatus: document.querySelector("#aiSettingsStatus"),
  storageStatus: document.querySelector("#storageStatus"),
  globalSearch: document.querySelector("#globalSearch"),
  statsGrid: document.querySelector("#statsGrid"),
  mockExamList: document.querySelector("#mockExamList"),
  deckList: document.querySelector("#deckList"),
  recommendationList: document.querySelector("#recommendationList"),
  questionSetSelect: document.querySelector("#questionSetSelect"),
  questionSelect: document.querySelector("#questionSelect"),
  resetSetButton: document.querySelector("#resetSetButton"),
  questionCard: document.querySelector("#questionCard"),
  setProgressText: document.querySelector("#setProgressText"),
  questionMapToggle: document.querySelector("#questionMapToggle"),
  questionMap: document.querySelector("#questionMap"),
  materialSelect: document.querySelector("#materialSelect"),
  sectionTreeToggle: document.querySelector("#sectionTreeToggle"),
  activeSectionLabel: document.querySelector("#activeSectionLabel"),
  sectionTree: document.querySelector("#sectionTree"),
  sectionContent: document.querySelector("#sectionContent"),
  wrongList: document.querySelector("#wrongList"),
  searchSummary: document.querySelector("#searchSummary"),
  searchResults: document.querySelector("#searchResults"),
};

const viewCopy = {
  dashboard: ["总览", "读取现有题库和教材，直接在浏览器学习。"],
  practice: ["刷题", "按套题练习，答完立即显示答案与解析。"],
  reader: ["教材", "按章节阅读 Paper 1 与 Paper 3 教材。"],
  review: ["错题", "集中处理本机答错过的题目。"],
  aiSettings: ["AI设置", "配置 DeepSeek 或兼容模型，设置只保存在当前浏览器。"],
  search: ["搜索", "在题库和教材章节里快速定位。"],
};

const mobileQuery = window.matchMedia("(max-width: 640px)");

init();

async function init() {
  bindEvents();
  try {
    state.data = await fetchStudyData();
    prepareData();
    hydrateDefaults();
    state.activeView = getViewFromHash() || state.activeView;
    renderAll();
  } catch (error) {
    renderLoadError(error);
  }
}

async function fetchStudyData() {
  const errors = [];
  for (const url of DATA_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(errors.join("；"));
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      els.globalSearch.value = "";
      state.searchTerm = "";
      setView(button.dataset.view, { updateHash: true });
    });
  });

  els.aiSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAISettingsFromForm();
  });
  els.aiModelSelect.addEventListener("change", syncCustomModelInput);
  els.aiSettingsClear.addEventListener("click", () => {
    localStorage.removeItem(AI_STORAGE_KEY);
    state.aiSettings = { ...DEFAULT_AI_SETTINGS };
    populateAISettingsForm();
    els.aiSettingsStatus.classList.remove("is-success");
    els.aiSettingsStatus.textContent = "已清除本地 AI 设置。";
  });

  els.globalSearch.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    if (state.searchTerm) {
      state.previousView = state.activeView === "search" ? state.previousView : state.activeView;
      setView("search");
      renderSearch();
      return;
    }
    setView(state.previousView || "dashboard");
  });

  els.questionSetSelect.addEventListener("change", (event) => {
    state.activeSetId = event.target.value;
    state.activeQuestionIndex = 0;
    renderPractice();
  });

  els.questionSelect.addEventListener("change", (event) => {
    state.activeQuestionIndex = Number(event.target.value);
    renderPracticeQuestion();
    renderQuestionMap();
  });

  els.resetSetButton.addEventListener("click", () => {
    const set = getActiveSet();
    if (!set) return;
    set.questions.forEach((question) => {
      delete state.progress.answers[question.id];
    });
    saveProgress();
    renderAll();
  });

  els.questionMapToggle.addEventListener("click", () => {
    setCollapsed(els.questionMap, els.questionMapToggle, !els.questionMap.classList.contains("is-collapsed"));
  });

  els.materialSelect.addEventListener("change", (event) => {
    state.activeMaterialId = event.target.value;
    const firstSection = getSectionsForMaterial(state.activeMaterialId)[0];
    state.activeSectionId = firstSection?.id ?? null;
    renderReader();
  });

  els.sectionTreeToggle.addEventListener("click", () => {
    setCollapsed(els.sectionTree, els.sectionTreeToggle, !els.sectionTree.classList.contains("is-collapsed"));
  });

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener("change", () => applyResponsiveDefaults());
  } else {
    mobileQuery.addListener(() => applyResponsiveDefaults());
  }
  window.addEventListener("hashchange", () => {
    const view = getViewFromHash();
    if (view) {
      setView(view);
    }
  });
}

function prepareData() {
  state.flatSections = state.data.materials.flatMap((material) =>
    flattenSections(material.sections || [], material, 0),
  );
  hydrateStoredMockExams();
  refreshQuestionIndex();
}

function refreshQuestionIndex() {
  state.allQuestions = state.data.questionSets.flatMap((set) =>
    set.questions.map((question) => ({
      ...question,
      setTitle: set.title,
      setSubtitle: set.subtitle,
    })),
  );
}

function hydrateDefaults() {
  state.activeSetId = getSourceQuestionSets()[0]?.id ?? state.data.questionSets[0]?.id ?? null;
  state.activeMaterialId = state.data.materials.find((material) => material.type === "textbook")?.id ?? null;
  state.activeSectionId = getSectionsForMaterial(state.activeMaterialId)[0]?.id ?? null;
}

function renderAll() {
  renderStorageStatus();
  renderNav();
  renderDashboard();
  renderPractice();
  renderReader();
  renderReview();
  renderSearch();
  applyResponsiveDefaults();
  setView(state.activeView);
}

function setView(view, options = {}) {
  state.activeView = view;
  const [title, subtitle] = viewCopy[view] ?? viewCopy.dashboard;
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = subtitle;
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.id === `${view}View`);
  });
  if (view === "aiSettings") {
    populateAISettingsForm();
  }
  if (options.updateHash && view !== "search") {
    history.replaceState(null, "", `#${view}`);
  }
  renderNav();
}

function getViewFromHash() {
  const view = window.location.hash.replace(/^#/, "");
  return viewCopy[view] ? view : null;
}

function renderNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.activeView);
  });
}

function renderStorageStatus() {
  const answered = Object.keys(state.progress.answers).length;
  const wrong = getWrongAnswers().length;
  els.storageStatus.textContent = `${answered} 题已作答，${wrong} 题待复盘`;
}

function renderDashboard() {
  const textbooks = state.data.materials.filter((material) => material.type === "textbook").length;
  const sourceSets = getSourceQuestionSets();
  const exams = sourceSets.length + MOCK_EXAM_CONFIGS.length;
  const answered = Object.keys(state.progress.answers).length;
  const wrong = getWrongAnswers().length;
  const questionTotal = sourceSets.reduce((total, set) => total + set.questions.length, 0);
  const stats = [
    ["教材", textbooks, "Paper 1 与 Paper 3"],
    ["套题", exams, "含精选题与模拟题"],
    ["题目", questionTotal, "可按套题完整练习"],
    ["错题", wrong, answered ? `已作答 ${answered} 题` : "开始刷题后自动记录"],
  ];
  els.statsGrid.innerHTML = "";
  stats.forEach(([label, value, note]) => {
    const node = document.querySelector("#statTemplate").content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = label;
    node.querySelector(".stat-value").textContent = value;
    node.querySelector(".stat-note").textContent = note;
    els.statsGrid.append(node);
  });

  renderMockExamList();
  els.deckList.innerHTML = "";
  sourceSets.forEach((set) => {
    const summary = getSetSummary(set);
    const row = document.createElement("article");
    row.className = "deck-row";
    row.innerHTML = `
      <div>
        <h3>${escapeHtml(set.title)}</h3>
        <p>${escapeHtml(set.subtitle)} · ${set.questions.length} 题 · ${summary}</p>
      </div>
      <button class="primary-button" type="button">开始</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      openQuestionSet(set.id);
    });
    els.deckList.append(row);
  });

  renderRecommendations();
}

function openQuestionSet(setId) {
  const set = state.data.questionSets.find((item) => item.id === setId);
  if (!set) return;
  state.activeSetId = set.id;
  state.activeQuestionIndex = findFirstUnansweredIndex(set);
  setView("practice");
  renderPractice();
}

function renderMockExamList() {
  els.mockExamList.innerHTML = "";
  MOCK_EXAM_CONFIGS.forEach((config) => {
    const set = getMockExamSet(config.id);
    const summary = set ? getSetSummary(set) : `点击生成 ${config.count} 道考试规格模拟题`;
    const card = document.createElement("article");
    card.className = "mock-exam-card";
    card.innerHTML = `
      <div>
        <span class="mock-exam-label">模拟试题</span>
        <h3>${escapeHtml(config.title)}</h3>
        <p>${escapeHtml(config.subtitle)} · ${escapeHtml(summary)}</p>
      </div>
      <div class="mock-exam-actions">
        ${
          set
            ? '<button class="secondary-button" type="button" data-action="continue">继续</button>'
            : ""
        }
        <button class="primary-button" type="button" data-action="generate">${set ? "重新生成" : "生成试卷"}</button>
      </div>
    `;
    card.querySelector('[data-action="generate"]').addEventListener("click", () => generateMockExam(config.id));
    card.querySelector('[data-action="continue"]')?.addEventListener("click", () => openQuestionSet(config.id));
    els.mockExamList.append(card);
  });
}

function generateMockExam(configId) {
  const config = MOCK_EXAM_CONFIGS.find((item) => item.id === configId);
  if (!config) return;
  const sourceSet = state.data.questionSets.find((set) => set.id === config.sourceSetId);
  if (!sourceSet) return;

  const previousSet = getMockExamSet(config.id);
  if (previousSet) {
    previousSet.questions.forEach((question) => {
      delete state.progress.answers[question.id];
    });
  }

  const selectedQuestions = shuffleItems(sourceSet.questions).slice(0, config.count);
  state.mockExamSelections[config.id] = {
    sourceSetId: sourceSet.id,
    questionIds: selectedQuestions.map((question) => question.id),
    createdAt: new Date().toISOString(),
  };
  saveMockExamSelections();
  saveProgress();
  upsertMockExamSet(buildMockExamSet(config, selectedQuestions));
  refreshQuestionIndex();
  renderStorageStatus();
  renderDashboard();
  renderReview();
  openQuestionSet(config.id);
}

function renderRecommendations() {
  const wrong = getWrongAnswers();
  const weakReferences = countBy(wrong.map((item) => item.question.reference).filter(Boolean));
  const topWeak = Object.entries(weakReferences).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const rows = [];
  if (!Object.keys(state.progress.answers).length) {
    rows.push(["先完成一套题", "建议从 2026 年 3 月精选题开始，做完后再集中看错题。"]);
  } else if (topWeak.length) {
    topWeak.forEach(([reference, count]) => {
      rows.push([`复盘 ${reference}`, `这个参考章节已出现 ${count} 道错题，建议回到教材原文再做一遍。`]);
    });
  } else {
    rows.push(["保持节奏", "目前没有错题记录，可以切换另一套题巩固。"]);
  }

  els.recommendationList.innerHTML = rows
    .map(
      ([title, body]) => `
        <article class="recommendation-row">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(body)}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPractice() {
  els.questionSetSelect.innerHTML = state.data.questionSets
    .map((set) => `<option value="${escapeHtml(set.id)}">${escapeHtml(set.title)} · ${escapeHtml(set.subtitle)}</option>`)
    .join("");
  els.questionSetSelect.value = state.activeSetId;

  const set = getActiveSet();
  if (!set) return;
  els.questionSelect.innerHTML = set.questions
    .map((question, index) => `<option value="${index}">第 ${question.number} 题</option>`)
    .join("");
  els.questionSelect.value = String(state.activeQuestionIndex);

  renderPracticeQuestion();
  renderQuestionMap();
}

function renderPracticeQuestion() {
  const set = getActiveSet();
  const question = set?.questions[state.activeQuestionIndex];
  if (!question) {
    els.questionCard.innerHTML = '<div class="empty-state">没有找到题目。</div>';
    return;
  }

  const answer = state.progress.answers[question.id];
  els.questionCard.innerHTML = `
    <div class="question-kicker">
      <span>第 ${question.number} 题</span>
      <span>${escapeHtml(set.title)}</span>
      ${question.reference ? `<span>参考章节：${escapeHtml(question.reference)}</span>` : ""}
      ${question.tag ? `<span class="tag">${escapeHtml(question.tag)}</span>` : ""}
    </div>
    <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
    <div class="options-list">
      ${question.options
        .map((option) => {
          const classes = ["option-button"];
          if (answer?.selected === option.id) classes.push("is-selected");
          if (answer && option.id === question.answer) classes.push("is-correct");
          if (answer?.selected === option.id && option.id !== question.answer) classes.push("is-wrong");
          return `
            <button class="${classes.join(" ")}" type="button" data-option="${escapeHtml(option.id)}">
              <span class="option-key">${escapeHtml(option.id)}</span>
              <span>${escapeHtml(option.text)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
    ${
      answer
        ? `<div class="answer-panel">
            <h3>${answer.correct ? "答对了" : `答错了，正确答案是 ${escapeHtml(question.answer)}`}</h3>
            <p>${escapeHtml(question.explanation || "暂无解析。")}</p>
          </div>`
        : ""
    }
    <div class="question-actions">
      <button class="secondary-button" type="button" data-action="prev">上一题</button>
      <button class="secondary-button" type="button" data-action="reference">看参考章节</button>
      <button class="secondary-button" type="button" data-action="ai">AI 讲解</button>
      <button class="primary-button" type="button" data-action="next">下一题</button>
    </div>
    <div class="ai-result-panel" data-ai-result hidden></div>
  `;

  els.questionCard.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(question, button.dataset.option));
  });
  els.questionCard.querySelector('[data-action="prev"]').addEventListener("click", () => moveQuestion(-1));
  els.questionCard.querySelector('[data-action="next"]').addEventListener("click", () => moveQuestion(1));
  els.questionCard.querySelector('[data-action="reference"]').addEventListener("click", () => openReference(question));
  els.questionCard.querySelector('[data-action="ai"]').addEventListener("click", () => explainQuestionWithAI(set, question));

  const summary = getSetSummary(set);
  els.setProgressText.textContent = summary;
}

function renderQuestionMap() {
  const set = getActiveSet();
  if (!set) return;
  els.questionMap.innerHTML = "";
  set.questions.forEach((question, index) => {
    const answer = state.progress.answers[question.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-button";
    button.textContent = question.number;
    button.classList.toggle("is-current", index === state.activeQuestionIndex);
    button.classList.toggle("is-correct", answer?.correct === true);
    button.classList.toggle("is-wrong", answer?.correct === false);
    button.addEventListener("click", () => {
      state.activeQuestionIndex = index;
      renderPractice();
    });
    els.questionMap.append(button);
  });
  updateQuestionMapToggle();
}

function answerQuestion(question, optionId) {
  state.progress.answers[question.id] = {
    selected: optionId,
    correct: optionId === question.answer,
    answeredAt: new Date().toISOString(),
  };
  saveProgress();
  renderStorageStatus();
  renderPracticeQuestion();
  renderQuestionMap();
  renderDashboard();
  renderReview();
}

function moveQuestion(delta) {
  const set = getActiveSet();
  const next = Math.min(Math.max(state.activeQuestionIndex + delta, 0), set.questions.length - 1);
  state.activeQuestionIndex = next;
  renderPractice();
}

async function explainQuestionWithAI(set, question) {
  const panel = els.questionCard.querySelector("[data-ai-result]");
  const settings = state.aiSettings;
  panel.hidden = false;
  if (!settings.apiKey) {
    panel.innerHTML = `
      <h3>需要先设置 API Key</h3>
      <p>进入大目录里的“AI设置”页面，填写 DeepSeek 或兼容服务商的 API Key。密钥只保存在当前浏览器。</p>
    `;
    setView("aiSettings");
    return;
  }

  panel.innerHTML = `<h3>AI 正在生成讲解</h3><p>正在请求 ${escapeHtml(settings.provider || "AI")}，请稍等。</p>`;
  try {
    const content = await requestAIExplanation(set, question, settings);
    panel.innerHTML = `<h3>AI 讲解</h3>${markdownToHtml(content)}`;
  } catch (error) {
    panel.innerHTML = `
      <h3>AI 请求失败</h3>
      <p>${escapeHtml(error.message)}</p>
      <p>如果浏览器提示 CORS，可在 AI 设置里换成支持浏览器调用的兼容端点。</p>
    `;
  }
}

async function requestAIExplanation(set, question, settings) {
  const requestBody = {
    model: settings.model,
    temperature: DEFAULT_AI_SETTINGS.temperature,
    max_tokens: DEFAULT_AI_SETTINGS.maxTokens,
    messages: [
      {
        role: "system",
        content:
          "你是香港保险中介人考试备考教练。请用简体中文解释题目，先指出考点，再解释为什么正确选项正确、为什么干扰项容易错，最后给一个记忆点。不要编造题目之外的法规细节。",
      },
      {
        role: "user",
        content: buildQuestionPrompt(set, question),
      },
    ],
  };
  if (settings.model === "deepseek-v4-pro") {
    requestBody.thinking = { type: "enabled" };
    requestBody.reasoning_effort = "high";
  }

  const response = await fetch(resolveChatCompletionsUrl(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 返回结果里没有可显示的讲解内容。");
  }
  return content;
}

function buildQuestionPrompt(set, question) {
  const options = question.options.map((option) => `${option.id}. ${option.text}`).join("\n");
  return [
    `题组：${set.title} ${set.subtitle}`,
    `题号：${question.number}`,
    question.reference ? `参考章节：${question.reference}` : "",
    `题目：${question.prompt}`,
    `选项：\n${options}`,
    `正确答案：${question.answer}`,
    question.explanation ? `原解析：${question.explanation}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/chat/completions`;
}

function renderReader() {
  const textbooks = state.data.materials.filter((material) => material.type === "textbook");
  els.materialSelect.innerHTML = textbooks
    .map((material) => `<option value="${escapeHtml(material.id)}">${escapeHtml(material.title)}</option>`)
    .join("");
  els.materialSelect.value = state.activeMaterialId;
  renderSectionTree();
  renderSectionContent();
}

function renderSectionTree() {
  const sections = getSectionsForMaterial(state.activeMaterialId);
  els.sectionTree.innerHTML = "";
  sections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-button";
    button.classList.toggle("is-active", section.id === state.activeSectionId);
    button.style.paddingLeft = `${10 + section.depth * 14}px`;
    button.textContent = `${section.reference} ${section.title}`;
    button.addEventListener("click", () => {
      state.activeSectionId = section.id;
      renderSectionTree();
      renderSectionContent();
    });
    els.sectionTree.append(button);
  });
  updateSectionTreeToggle();
}

function renderSectionContent() {
  const section = state.flatSections.find(
    (item) => item.material.id === state.activeMaterialId && item.id === state.activeSectionId,
  );
  if (!section) {
    els.activeSectionLabel.textContent = "请选择章节";
    els.sectionContent.innerHTML = '<div class="empty-state">请选择左侧章节。</div>';
    return;
  }
  els.activeSectionLabel.textContent = `${section.material.title} · ${section.reference} ${section.title}`;
  const body = section.markdownBody || "本级目录没有正文，请选择下级章节。";
  els.sectionContent.innerHTML = `
    <h2>${escapeHtml(section.reference)} ${escapeHtml(section.title)}</h2>
    ${markdownToHtml(body)}
  `;
}

function renderReview() {
  const wrong = getWrongAnswers();
  if (!wrong.length) {
    els.wrongList.innerHTML = '<div class="empty-state">还没有错题。刷完一套题后，这里会自动沉淀复盘清单。</div>';
    return;
  }
  els.wrongList.innerHTML = "";
  wrong.forEach(({ question, answer }) => {
    const row = document.createElement("article");
    row.className = "wrong-row";
    row.innerHTML = `
      <div>
        <h3>${escapeHtml(question.setTitle)} · 第 ${question.number} 题</h3>
        <p>${escapeHtml(question.prompt)}</p>
        <p>你选 ${escapeHtml(answer.selected)}，正确答案 ${escapeHtml(question.answer)}${question.reference ? ` · 参考章节 ${escapeHtml(question.reference)}` : ""}</p>
      </div>
      <button class="primary-button" type="button">重做</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      const set = state.data.questionSets.find((item) => item.id === question.questionSetID);
      state.activeSetId = set.id;
      state.activeQuestionIndex = set.questions.findIndex((item) => item.id === question.id);
      setView("practice");
      renderPractice();
    });
    els.wrongList.append(row);
  });
}

function renderSearch() {
  if (!state.data) return;
  const term = state.searchTerm;
  if (!term) {
    els.searchSummary.textContent = "输入关键词后显示相关题目和教材章节。";
    els.searchResults.innerHTML = '<div class="empty-state">可以搜索“可保權益”“最高誠信”“洗錢”等关键词。</div>';
    return;
  }

  const lower = term.toLocaleLowerCase();
  const questionHits = state.allQuestions
    .filter((question) =>
      [question.prompt, question.explanation, question.reference, question.setTitle]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(lower)),
    )
    .slice(0, 12);
  const sectionHits = state.flatSections
    .filter((section) =>
      [section.title, section.reference, section.markdownBody]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(lower)),
    )
    .slice(0, 12);

  els.searchSummary.textContent = `找到 ${questionHits.length} 道题、${sectionHits.length} 个章节。`;
  els.searchResults.innerHTML = "";
  if (!questionHits.length && !sectionHits.length) {
    els.searchResults.innerHTML = '<div class="empty-state">没有匹配结果，换一个关键词试试。</div>';
    return;
  }

  questionHits.forEach((question) => {
    const row = document.createElement("article");
    row.className = "search-row";
    row.innerHTML = `
      <div>
        <h3>题目 · ${escapeHtml(question.setTitle)} 第 ${question.number} 题</h3>
        <p>${highlight(question.prompt, term)}</p>
      </div>
      <button class="primary-button" type="button">打开</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      const set = state.data.questionSets.find((item) => item.id === question.questionSetID);
      state.activeSetId = set.id;
      state.activeQuestionIndex = set.questions.findIndex((item) => item.id === question.id);
      els.globalSearch.value = "";
      state.searchTerm = "";
      setView("practice");
      renderPractice();
    });
    els.searchResults.append(row);
  });

  sectionHits.forEach((section) => {
    const row = document.createElement("article");
    row.className = "search-row";
    row.innerHTML = `
      <div>
        <h3>章节 · ${escapeHtml(section.material.title)} ${escapeHtml(section.reference)}</h3>
        <p>${highlight(section.title, term)}</p>
      </div>
      <button class="secondary-button" type="button">阅读</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      state.activeMaterialId = section.material.id;
      state.activeSectionId = section.id;
      els.globalSearch.value = "";
      state.searchTerm = "";
      setView("reader");
      renderReader();
    });
    els.searchResults.append(row);
  });
}

function openReference(question) {
  const section = findReferenceSection(question);
  if (!section) {
    state.searchTerm = question.reference || question.prompt;
    els.globalSearch.value = state.searchTerm;
    setView("search");
    renderSearch();
    return;
  }
  state.activeMaterialId = section.material.id;
  state.activeSectionId = section.id;
  setView("reader");
  renderReader();
  if (mobileQuery.matches) {
    setCollapsed(els.sectionTree, els.sectionTreeToggle, true);
  }
}

function applyResponsiveDefaults() {
  if (mobileQuery.matches) {
    setCollapsed(els.questionMap, els.questionMapToggle, true);
    setCollapsed(els.sectionTree, els.sectionTreeToggle, true);
    return;
  }
  setCollapsed(els.questionMap, els.questionMapToggle, false);
  setCollapsed(els.sectionTree, els.sectionTreeToggle, false);
}

function setCollapsed(panel, toggle, collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  updateQuestionMapToggle();
  updateSectionTreeToggle();
}

function updateQuestionMapToggle() {
  const collapsed = els.questionMap.classList.contains("is-collapsed");
  const set = getActiveSet();
  const current = set?.questions[state.activeQuestionIndex]?.number ?? "";
  els.questionMapToggle.textContent = collapsed ? `展开题号 · 当前 ${current}` : "收起题号";
}

function updateSectionTreeToggle() {
  const collapsed = els.sectionTree.classList.contains("is-collapsed");
  els.sectionTreeToggle.textContent = collapsed ? "展开目录" : "收起目录";
}

function populateAISettingsForm() {
  const settings = state.aiSettings;
  els.aiSettingsStatus.classList.remove("is-success");
  els.aiSettingsStatus.textContent = "";
  els.aiProviderInput.value = settings.provider || DEFAULT_AI_SETTINGS.provider;
  els.aiBaseUrlInput.value = settings.baseUrl || DEFAULT_AI_SETTINGS.baseUrl;
  setModelControls(settings.model || DEFAULT_AI_SETTINGS.model);
  els.aiApiKeyInput.value = "";
  els.aiKeyStatus.textContent = settings.apiKey ? "已在本浏览器保存密钥" : "未保存密钥";
}

function saveAISettingsFromForm() {
  const existingKey = state.aiSettings.apiKey || "";
  const enteredKey = els.aiApiKeyInput.value.trim();
  const selectedModel = getSelectedAIModel();
  state.aiSettings = {
    provider: els.aiProviderInput.value.trim() || DEFAULT_AI_SETTINGS.provider,
    baseUrl: els.aiBaseUrlInput.value.trim() || DEFAULT_AI_SETTINGS.baseUrl,
    model: selectedModel || DEFAULT_AI_SETTINGS.model,
    apiKey: enteredKey || existingKey,
    temperature: DEFAULT_AI_SETTINGS.temperature,
    maxTokens: DEFAULT_AI_SETTINGS.maxTokens,
  };
  saveAISettings();
  els.aiApiKeyInput.value = "";
  setModelControls(state.aiSettings.model);
  els.aiKeyStatus.textContent = state.aiSettings.apiKey ? "已在本浏览器保存密钥" : "未保存密钥";
  els.aiSettingsStatus.classList.add("is-success");
  els.aiSettingsStatus.textContent = "AI 设置已保存到本地浏览器。";
}

function setModelControls(model) {
  const normalizedModel = model || DEFAULT_AI_SETTINGS.model;
  const isKnownModel = AI_MODEL_OPTIONS.includes(normalizedModel);
  els.aiModelSelect.value = isKnownModel ? normalizedModel : "custom";
  els.aiCustomModelInput.value = isKnownModel ? "" : normalizedModel;
  syncCustomModelInput();
}

function syncCustomModelInput() {
  const isCustom = els.aiModelSelect.value === "custom";
  els.aiCustomModelInput.classList.toggle("is-hidden", !isCustom);
  els.aiCustomModelInput.disabled = !isCustom;
}

function getSelectedAIModel() {
  if (els.aiModelSelect.value !== "custom") return els.aiModelSelect.value;
  return els.aiCustomModelInput.value.trim();
}

function findReferenceSection(question) {
  const candidates = state.flatSections.filter((item) => item.material.id === question.materialID);
  const reference = normalizeReference(question.reference);
  if (!reference) return null;
  return (
    candidates.find((section) => normalizeReference(section.reference) === reference) ||
    candidates.find((section) => reference.startsWith(`${normalizeReference(section.reference)}.`)) ||
    candidates.find((section) => reference.startsWith(normalizeReference(section.reference))) ||
    null
  );
}

function normalizeReference(reference) {
  return String(reference || "")
    .toLocaleLowerCase()
    .replace(/註/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[a-z]+$/g, "")
    .replace(/[^\d.]/g, "")
    .replace(/\.+$/g, "");
}

function getActiveSet() {
  return state.data?.questionSets.find((set) => set.id === state.activeSetId);
}

function getSourceQuestionSets() {
  return state.data.questionSets.filter((set) => !isMockExamSet(set));
}

function getMockExamSet(configId) {
  return state.data.questionSets.find((set) => set.id === configId && isMockExamSet(set));
}

function isMockExamSet(set) {
  return set?.type === "mockExam";
}

function hydrateStoredMockExams() {
  MOCK_EXAM_CONFIGS.forEach((config) => {
    const selection = state.mockExamSelections[config.id];
    if (!selection?.questionIds?.length) return;
    const sourceSet = state.data.questionSets.find((set) => set.id === config.sourceSetId);
    if (!sourceSet) return;
    const byId = new Map(sourceSet.questions.map((question) => [question.id, question]));
    const questions = selection.questionIds.map((id) => byId.get(id)).filter(Boolean).slice(0, config.count);
    if (questions.length) {
      upsertMockExamSet(buildMockExamSet(config, questions, selection.createdAt));
    }
  });
}

function upsertMockExamSet(set) {
  const index = state.data.questionSets.findIndex((item) => item.id === set.id);
  if (index === -1) {
    state.data.questionSets.unshift(set);
    return;
  }
  state.data.questionSets[index] = set;
}

function buildMockExamSet(config, sourceQuestions, createdAt = new Date().toISOString()) {
  const sourceSet = state.data.questionSets.find((set) => set.id === config.sourceSetId);
  return {
    id: config.id,
    title: config.title,
    subtitle: `${config.subtitle} · ${formatDateTime(createdAt)}`,
    materialID: sourceSet?.materialID,
    type: "mockExam",
    sourceSetId: config.sourceSetId,
    questions: sourceQuestions.map((question, index) => ({
      ...question,
      id: `${config.id}-q${String(index + 1).padStart(3, "0")}-${question.id}`,
      number: index + 1,
      questionSetID: config.id,
      sourceQuestionID: question.id,
    })),
  };
}

function getSectionsForMaterial(materialId) {
  return state.flatSections.filter((section) => section.material.id === materialId);
}

function getSetSummary(set) {
  const answers = set.questions.map((question) => state.progress.answers[question.id]).filter(Boolean);
  const correct = answers.filter((answer) => answer.correct).length;
  if (!answers.length) return "尚未开始";
  return `已答 ${answers.length}/${set.questions.length}，正确 ${correct}，错题 ${answers.length - correct}`;
}

function getWrongAnswers() {
  return state.allQuestions
    .map((question) => ({ question, answer: state.progress.answers[question.id] }))
    .filter((item) => item.answer && !item.answer.correct);
}

function findFirstUnansweredIndex(set) {
  const index = set.questions.findIndex((question) => !state.progress.answers[question.id]);
  return index === -1 ? 0 : index;
}

function flattenSections(sections, material, depth) {
  return sections.flatMap((section) => [
    {
      ...section,
      material,
      depth,
    },
    ...flattenSections(section.children || [], material, depth + 1),
  ]);
}

function countBy(values) {
  return values.reduce((result, value) => {
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近生成";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }
    if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h3>${inlineMarkdown(trimmed.slice(3))}</h3>`);
      return;
    }
    if (trimmed.startsWith("# ")) {
      closeList();
      html.push(`<h3>${inlineMarkdown(trimmed.slice(2))}</h3>`);
      return;
    }
    if (trimmed.startsWith(">")) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  });
  closeList();
  return html.join("");
}

function inlineMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function highlight(text, term) {
  const safeText = escapeHtml(text || "");
  const safeTerm = escapeRegExp(escapeHtml(term));
  return safeText.replace(new RegExp(safeTerm, "gi"), (match) => `<mark>${match}</mark>`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { answers: {} };
    const parsed = JSON.parse(raw);
    return { answers: parsed.answers || {} };
  } catch {
    return { answers: {} };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function loadMockExamSelections() {
  try {
    const raw = localStorage.getItem(MOCK_EXAM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMockExamSelections() {
  localStorage.setItem(MOCK_EXAM_STORAGE_KEY, JSON.stringify(state.mockExamSelections));
}

function loadAISettings() {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw);
    const model = parsed.model === "deepseek-pro" ? "deepseek-v4-pro" : parsed.model;
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      model,
      temperature: DEFAULT_AI_SETTINGS.temperature,
      maxTokens: DEFAULT_AI_SETTINGS.maxTokens,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function saveAISettings() {
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(state.aiSettings));
}

function renderLoadError(error) {
  els.viewTitle.textContent = "无法读取数据";
  els.viewSubtitle.textContent = "请从项目根目录启动本地服务器后再打开网页。";
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("is-active"));
  document.querySelector("#dashboardView").classList.add("is-active");
  els.statsGrid.innerHTML = "";
  els.deckList.innerHTML = `<div class="empty-state">读取题库失败：${escapeHtml(error.message)}</div>`;
  els.recommendationList.innerHTML = "";
}
