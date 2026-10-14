(() => {
  const MODES = {
    time: [15, 30, 60, 120],
    words: [10, 25, 50, 100],
  };
  const API = "https://fish-text.ru/get";

  const state = {
    screen: "menu",
    mode: "time",
    value: 60,
    words: [],
    wordIndex: 0,
    input: "",
    typedWords: [],
    started: false,
    finished: false,
    startTime: 0,
    elapsedMs: 0,
    secondsLeft: 60,
    correct: 0,
    wrong: 0,
    extra: 0,
  };

  let timerId = null;
  let caret = null;
  let caretMark = null;

  const ui = {
    menu: document.getElementById("screen-menu"),
    test: document.getElementById("screen-test"),
    results: document.getElementById("screen-results"),
    config: document.getElementById("config-bar"),
    values: document.getElementById("value-options"),
    modeTime: document.getElementById("mode-time"),
    modeWords: document.getElementById("mode-words"),
    start: document.getElementById("btn-start"),
    restartTest: document.getElementById("btn-restart-test"),
    restartResults: document.getElementById("btn-restart-results"),
    next: document.getElementById("btn-next"),
    progress: document.getElementById("progress"),
    words: document.getElementById("words"),
    wrap: document.getElementById("words-wrap"),
    input: document.getElementById("typing-input"),
    statType: document.getElementById("stat-type"),
    statCpm: document.getElementById("stat-cpm"),
    statAccuracy: document.getElementById("stat-accuracy"),
    statChars: document.getElementById("stat-chars"),
    statErrors: document.getElementById("stat-errors"),
  };

  function splitText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[«»„“”]/g, '"')
      .replace(/[–—]/g, "-")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function needWords() {
    return state.mode === "words" ? state.value : state.value * 3;
  }

  async function loadWords(reuse) {
    const need = needWords();
    if (reuse && state.words.length >= need) return state.words.slice(0, need);

    let words = [];
    try {
      const n = Math.min(50, Math.max(10, Math.ceil(need / 5)));
      const res = await fetch(`${API}?type=sentence&number=${n}&format=json`);
      const data = await res.json();
      if (data.status === "success") words = splitText(data.text);
    } catch (_) {}

    let i = 0;
    while (words.length < need) {
      words.push(...splitText(FALLBACK_TEXTS[i % FALLBACK_TEXTS.length]));
      i += 1;
    }
    return words.slice(0, need);
  }

  function resetRun() {
    state.wordIndex = 0;
    state.input = "";
    state.typedWords = [];
    state.started = false;
    state.finished = false;
    state.startTime = 0;
    state.elapsedMs = 0;
    state.secondsLeft = state.mode === "time" ? state.value : 0;
    state.correct = 0;
    state.wrong = 0;
    state.extra = 0;
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.secondsLeft = state.value;
    updateProgress();
    timerId = setInterval(() => {
      if (!state.started || state.finished) return;
      state.secondsLeft -= 1;
      updateProgress();
      if (state.secondsLeft <= 0) finishTest();
    }, 1000);
  }

  function beginTyping() {
    if (state.started || state.finished) return;
    state.started = true;
    state.startTime = performance.now();
    if (state.mode === "time") startTimer();
  }

  function addScore(typed, expected) {
    const n = Math.min(typed.length, expected.length);
    for (let i = 0; i < n; i += 1) {
      if (typed[i] === expected[i]) state.correct += 1;
      else state.wrong += 1;
    }
    if (typed.length < expected.length) state.wrong += expected.length - typed.length;
    if (typed.length > expected.length) state.extra += typed.length - expected.length;
  }

  function lastWord() {
    return state.mode === "words"
      ? state.wordIndex >= state.value - 1
      : state.wordIndex >= state.words.length - 1;
  }

  function commitWord(typed) {
    if (state.finished) return;
    beginTyping();
    const expected = state.words[state.wordIndex] || "";
    addScore(typed, expected);
    state.typedWords[state.wordIndex] = typed;
    state.wordIndex += 1;
    state.input = "";

    if (state.mode === "words") {
      updateProgress();
      if (state.wordIndex >= state.value) {
        finishTest();
        return;
      }
    }
    if (state.wordIndex >= state.words.length) finishTest();
  }

  function onInput(value) {
    if (state.finished) return;

    if (value.endsWith(" ") || value.endsWith("\n")) {
      commitWord(value.slice(0, -1));
      ui.input.value = "";
      state.input = "";
      if (!state.finished) drawWords();
      return;
    }

    beginTyping();
    state.input = value;

    const expected = state.words[state.wordIndex] || "";
    if (lastWord() && state.input === expected) {
      commitWord(state.input);
      ui.input.value = "";
      state.input = "";
      return;
    }

    drawWords();
  }

  function finishTest() {
    if (state.finished) return;
    state.finished = true;
    stopTimer();
    if (state.startTime) state.elapsedMs = performance.now() - state.startTime;

    if (state.input && state.wordIndex < state.words.length) {
      addScore(state.input, state.words[state.wordIndex]);
      state.typedWords[state.wordIndex] = state.input;
    }

    const minutes = Math.max(state.elapsedMs / 60000, 1 / 60);
    const total = state.correct + state.wrong + state.extra;
    const accuracy = total ? Math.max(0, Math.round((state.correct / total) * 100)) : 100;

    ui.statType.textContent =
      state.mode === "time" ? `время ${state.value}` : `слова ${state.value}`;
    ui.statCpm.textContent = String(Math.round(state.correct / minutes));
    ui.statAccuracy.textContent = `${accuracy}%`;
    ui.statChars.textContent = String(state.correct);
    ui.statErrors.textContent = String(state.wrong + state.extra);
    showScreen("results");
  }

  function showScreen(name) {
    state.screen = name;
    ui.menu.classList.toggle("is-hidden", name !== "menu");
    ui.test.classList.toggle("is-hidden", name !== "test");
    ui.results.classList.toggle("is-hidden", name !== "results");
    ui.config.classList.toggle("is-hidden", name === "results");
  }

  function updateProgress() {
    ui.progress.textContent =
      state.mode === "time"
        ? String(Math.max(0, state.secondsLeft))
        : `${Math.min(state.wordIndex, state.value)}/${state.value}`;
  }

  function makeChar(text, cls) {
    const span = document.createElement("span");
    span.className = "char" + (cls ? " " + cls : "");
    span.textContent = text;
    return span;
  }

  function makeMark() {
    const mark = document.createElement("span");
    mark.className = "caret-mark";
    caretMark = mark;
    return mark;
  }

  function placeCaret() {
    if (!caret) {
      caret = document.createElement("div");
      caret.className = "caret";
      ui.wrap.appendChild(caret);
    }
    const mark = caretMark || ui.words.querySelector(".caret-mark");
    if (!mark) {
      caret.style.opacity = "0";
      return;
    }
    const a = ui.wrap.getBoundingClientRect();
    const b = mark.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(ui.words).fontSize) || 23;
    caret.style.opacity = "1";
    caret.style.height = `${Math.round(b.height || size)}px`;
    caret.style.left = `${Math.round(b.left - a.left)}px`;
    caret.style.top = `${Math.round(b.top - a.top)}px`;
  }

  function fillWord(wordEl, expected, typed, current) {
    let error = false;

    for (let i = 0; i < expected.length; i += 1) {
      const charEl = document.createElement("span");
      charEl.className = "char";

      if (i < typed.length) {
        if (typed[i] === expected[i]) {
          charEl.classList.add("char--correct");
          charEl.textContent = expected[i];
        } else {
          charEl.classList.add("char--incorrect");
          charEl.textContent = typed[i];
          error = true;
        }
      } else if (current) {
        if (i === typed.length) charEl.appendChild(makeMark());
        charEl.appendChild(document.createTextNode(expected[i]));
      } else {
        charEl.classList.add("char--incorrect");
        charEl.textContent = expected[i];
        error = true;
      }
      wordEl.appendChild(charEl);
    }

    for (let i = expected.length; i < typed.length; i += 1) {
      wordEl.appendChild(makeChar(typed[i] === " " ? "·" : typed[i], "char--extra"));
      error = true;
    }

    if (current && typed.length >= expected.length) wordEl.appendChild(makeMark());
    if (error) wordEl.classList.add("word--error");
  }

  function drawWords() {
    const frag = document.createDocumentFragment();
    caretMark = null;

    state.words.forEach((word, i) => {
      const el = document.createElement("span");
      el.className = "word";
      el.dataset.index = String(i);

      if (i < state.wordIndex) {
        fillWord(el, word, state.typedWords[i] || "", false);
      } else if (i === state.wordIndex) {
        fillWord(el, word, state.input, true);
      } else {
        el.textContent = word;
      }
      frag.appendChild(el);
    });

    ui.words.innerHTML = "";
    ui.words.appendChild(frag);
    placeCaret();
  }

  function renderValues() {
    ui.values.innerHTML = "";
    MODES[state.mode].forEach((value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "value-btn" + (value === state.value ? " is-active" : "");
      btn.textContent = String(value);
      btn.onclick = () => {
        if (value === state.value) {
          if (state.screen === "test") ui.input.focus();
          return;
        }
        state.value = value;
        renderValues();
        if (state.screen === "test" || state.screen === "results") startTest(false);
      };
      ui.values.appendChild(btn);
    });
  }

  function setMode(mode) {
    const changed = state.mode !== mode;
    state.mode = mode;
    if (!MODES[mode].includes(state.value)) {
      state.value = mode === "time" ? 60 : 50;
    }
    ui.modeTime.classList.toggle("is-active", mode === "time");
    ui.modeWords.classList.toggle("is-active", mode === "words");
    renderValues();
    if (changed && (state.screen === "test" || state.screen === "results")) {
      startTest(false);
    }
  }

  async function startTest(reuse) {
    stopTimer();
    ui.start.disabled = true;
    ui.start.textContent = "Загрузка...";

    try {
      state.words = await loadWords(reuse);
      resetRun();
      updateProgress();
      drawWords();
      showScreen("test");
      ui.input.value = "";
      ui.input.focus();
    } catch (_) {
      alert("Не удалось подготовить текст для теста.");
      showScreen("menu");
    } finally {
      ui.start.disabled = false;
      ui.start.innerHTML =
        'Начать тест <span class="btn__chevron" aria-hidden="true">›</span>';
    }
  }

  ui.modeTime.onclick = () => setMode("time");
  ui.modeWords.onclick = () => setMode("words");
  ui.start.onclick = () => startTest(false);
  ui.restartTest.onclick = () => startTest(true);
  ui.restartResults.onclick = () => startTest(true);
  ui.next.onclick = () => startTest(false);
  ui.input.oninput = (e) => onInput(e.target.value);
  ui.wrap.onclick = () => ui.input.focus();

  document.onkeydown = (e) => {
    if (state.screen !== "test" || state.finished) return;
    if (e.key === "Tab" || e.key === "Escape") return;
    const tag = e.target && e.target.tagName;
    if (tag === "BUTTON" || tag === "A") return;
    if (document.activeElement !== ui.input) ui.input.focus();
  };

  setMode("time");
  showScreen("menu");
})();
