const DATA_URLS = ["./data/study-data.json", "/Sources/InsuranceStudyApp/Resources/study-data.json"];
const STORAGE_KEY = "insurance-study-web-progress-v1";

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
  flatSections: [],
  allQuestions: [],
};

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  storageStatus: document.querySelector("#storageStatus"),
  globalSearch: document.querySelector("#globalSearch"),
  statsGrid: document.querySelector("#statsGrid"),
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
      setView(button.dataset.view);
    });
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
}

function prepareData() {
  state.flatSections = state.data.materials.flatMap((material) =>
    flattenSections(material.sections || [], material, 0),
  );
  state.allQuestions = state.data.questionSets.flatMap((set) =>
    set.questions.map((question) => ({
      ...question,
      setTitle: set.title,
      setSubtitle: set.subtitle,
    })),
  );
}

function hydrateDefaults() {
  state.activeSetId = state.data.questionSets[0]?.id ?? null;
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

function setView(view) {
  state.activeView = view;
  const [title, subtitle] = viewCopy[view] ?? viewCopy.dashboard;
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = subtitle;
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.id === `${view}View`);
  });
  renderNav();
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
  const exams = state.data.questionSets.length;
  const answered = Object.keys(state.progress.answers).length;
  const wrong = getWrongAnswers().length;
  const stats = [
    ["教材", textbooks, "Paper 1 与 Paper 3"],
    ["套题", exams, "含精选题与模拟题"],
    ["题目", state.allQuestions.length, "可按套题完整练习"],
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

  els.deckList.innerHTML = "";
  state.data.questionSets.forEach((set) => {
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
      state.activeSetId = set.id;
      state.activeQuestionIndex = findFirstUnansweredIndex(set);
      setView("practice");
      renderPractice();
    });
    els.deckList.append(row);
  });

  renderRecommendations();
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
      <button class="primary-button" type="button" data-action="next">下一题</button>
    </div>
  `;

  els.questionCard.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(question, button.dataset.option));
  });
  els.questionCard.querySelector('[data-action="prev"]').addEventListener("click", () => moveQuestion(-1));
  els.questionCard.querySelector('[data-action="next"]').addEventListener("click", () => moveQuestion(1));
  els.questionCard.querySelector('[data-action="reference"]').addEventListener("click", () => openReference(question));

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

function renderLoadError(error) {
  els.viewTitle.textContent = "无法读取数据";
  els.viewSubtitle.textContent = "请从项目根目录启动本地服务器后再打开网页。";
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("is-active"));
  document.querySelector("#dashboardView").classList.add("is-active");
  els.statsGrid.innerHTML = "";
  els.deckList.innerHTML = `<div class="empty-state">读取题库失败：${escapeHtml(error.message)}</div>`;
  els.recommendationList.innerHTML = "";
}
