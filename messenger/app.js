"use strict";

(() => {
  const GRAPHQL_URL = "https://api.github.com/graphql";
  const DEVICE_CODE_URL = "https://github.com/login/device/code";
  const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
  const CHAT_TITLE = "Круг · общая комната";
  const STICKER_PREFIX = "[[circle-sticker:v1]]";
  const EMOJIS = ["👋", "✨", "💜", "🌿", "🎉", "☕", "🔥", "🫶", "💡", "🚀", "🌸", "👏", "😊", "🤔", "🥳", "⭐", "🧡", "🌈"];
  const CONFIG_KEY = "circle.github.config.v1";
  const state = { config: readConfig(), token: null, user: null, repoId: null, discussion: null, pollTimeout: null, device: null, pollCommentsTimer: null };
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    setupPanel: $("#setupPanel"), setupForm: $("#setupForm"), category: $("#categorySelect"), authCard: $("#authCard"), chatArea: $("#chatArea"),
    emptyChat: $("#emptyChat"), messageList: $("#messageList"), statusBanner: $("#statusBanner"), statusText: $("#statusText"),
    flash: $("#flashMessage"), deviceDialog: $("#deviceDialog"), deviceCode: $("#deviceUserCode"), deviceStatus: $("#deviceStatus"),
    messageInput: $("#messageInput"), charCount: $("#charCount"), participantCount: $("#participantCount")
  };

  function readConfig() {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      return {
        owner: validOwner(value.owner) ? value.owner : "tipinopgopinok-ctrl",
        repo: validRepo(value.repo) ? value.repo : "tipinopgopinok-ctrl.github.io",
        clientId: typeof value.clientId === "string" ? value.clientId.trim() : "",
        categoryId: typeof value.categoryId === "string" ? value.categoryId : ""
      };
    } catch (parseError) {
      return { owner: "tipinopgopinok-ctrl", repo: "tipinopgopinok-ctrl.github.io", clientId: "", categoryId: "" };
    }
  }

  function validOwner(value) { return typeof value === "string" && /^[A-Za-z0-9-]{1,39}$/.test(value); }
  function validRepo(value) { return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value); }

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
    $("#sidebarRepo").textContent = `${state.config.owner}/${state.config.repo}`;
    $("#mobileRepo").textContent = `${state.config.owner}/${state.config.repo}`;
  }

  function setStatus(message, type = "") {
    ui.statusText.textContent = message;
    ui.statusBanner.classList.remove("connected", "error");
    if (type) ui.statusBanner.classList.add(type);
  }

  function showError(message) {
    ui.flash.textContent = message;
    ui.flash.hidden = false;
  }

  function clearError() {
    ui.flash.textContent = "";
    ui.flash.hidden = true;
  }

  function showSetup(show = true) {
    ui.setupPanel.hidden = !show;
    if (show) ui.setupPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function createIcon(name, extraClass = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `icon${extraClass ? ` ${extraClass}` : ""}`);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }

  async function githubGraphql(query, variables = {}) {
    if (!state.token) throw new Error("Сначала войдите через GitHub.");
    let response;
    try {
      response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json", Accept: "application/vnd.github+json" },
        body: JSON.stringify({ query, variables })
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Браузер заблокировал запрос к GitHub API. Проверьте CORS и доступ к сети; без сервера обойти браузерную политику нельзя.");
      }
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `GitHub API вернул ошибку ${response.status}.`);
    if (result.errors && result.errors.length) throw new Error(result.errors.map((error) => error.message).join(" "));
    return result.data;
  }

  async function postOAuth(url, fields) {
    const body = new URLSearchParams(fields);
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error((result && (result.error_description || result.error)) || `GitHub OAuth вернул ошибку ${response.status}.`);
    if (!result) throw new Error("GitHub OAuth вернул ответ, который не удалось прочитать.");
    return result;
  }

  function openDeviceDialog() {
    ui.deviceDialog.hidden = false;
    $("#deviceVerificationLink").focus();
  }

  function closeDeviceDialog() {
    ui.deviceDialog.hidden = true;
    if (state.device) state.device.cancelled = true;
    state.device = null;
    if (state.pollTimeout) window.clearTimeout(state.pollTimeout);
    state.pollTimeout = null;
  }

  async function beginSignIn() {
    clearError();
    if (!state.config.clientId) {
      showSetup(true);
      showError("Сначала укажите OAuth Client ID в настройках подключения.");
      return;
    }
    $("#signInButton").disabled = true;
    setStatus("Запрашиваем одноразовый код у GitHub…");
    try {
      const result = await postOAuth(DEVICE_CODE_URL, { client_id: state.config.clientId, scope: "read:user read:discussion write:discussion" });
      if (!result.device_code || !result.user_code || !result.verification_uri) {
        throw new Error(result.error_description || "GitHub не выдал код устройства. Проверьте Client ID и настройку Device Flow.");
      }
      state.device = { deviceCode: result.device_code, interval: Math.max(Number(result.interval) || 5, 2), expiresAt: Date.now() + (Number(result.expires_in) || 900) * 1000, cancelled: false };
      ui.deviceCode.textContent = result.user_code;
      $("#deviceVerificationLink").href = result.verification_uri;
      ui.deviceStatus.textContent = "Ожидаем подтверждения в GitHub…";
      openDeviceDialog();
      pollDeviceToken();
    } catch (error) {
      setStatus("Не удалось начать вход через GitHub.", "error");
      showError(`${error.message} Если браузер сообщает о CORS, GitHub не разрешает OAuth-запрос с этого сайта — в рамках статического сайта обхода без сервера нет.`);
    } finally {
      $("#signInButton").disabled = false;
    }
  }

  async function pollDeviceToken() {
    const device = state.device;
    if (!device || device.cancelled) return;
    if (Date.now() >= device.expiresAt) {
      ui.deviceStatus.textContent = "Срок действия кода истёк. Начните вход заново.";
      return;
    }
    try {
      const result = await postOAuth(ACCESS_TOKEN_URL, {
        client_id: state.config.clientId,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      });
      if (!state.device || device.cancelled) return;
      if (result.access_token) {
        state.token = result.access_token;
        closeDeviceDialog();
        await loadUserAndCommunity();
        return;
      }
      if (result.error === "authorization_pending") {
        ui.deviceStatus.textContent = "Код подтверждён не был — завершите вход на GitHub.";
      } else if (result.error === "slow_down") {
        device.interval += 5;
        ui.deviceStatus.textContent = "GitHub попросил немного подождать…";
      } else if (result.error === "expired_token" || result.error === "access_denied") {
        ui.deviceStatus.textContent = result.error === "access_denied" ? "Вход отменён в GitHub." : "Срок действия кода истёк. Начните вход заново.";
        return;
      } else if (result.error) {
        throw new Error(result.error_description || result.error);
      }
    } catch (error) {
      ui.deviceStatus.textContent = `Не удалось проверить вход: ${error.message}`;
      setStatus("Ошибка при входе через GitHub.", "error");
      return;
    }
    if (state.device && !state.device.cancelled) {
      state.pollTimeout = window.setTimeout(pollDeviceToken, device.interval * 1000);
    }
  }

  async function loadUserAndCommunity() {
    clearError();
    setStatus("Проверяем профиль GitHub и Discussions…");
    try {
      const data = await githubGraphql(`query CircleBootstrap($owner: String!, $name: String!) {
        viewer { login name avatarUrl }
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 50) { nodes { id name emoji } }
        }
      }`, { owner: state.config.owner, name: state.config.repo });
      if (!data.repository) throw new Error("Репозиторий не найден или недоступен для этого аккаунта.");
      state.user = data.viewer;
      state.repoId = data.repository.id;
      const categories = data.repository.discussionCategories.nodes;
      renderCategories(categories);
      if (!categories.length) throw new Error("В репозитории нет категорий Discussions. Включите Discussions и создайте категорию.");
      if (!categories.some((category) => category.id === state.config.categoryId)) {
        state.config.categoryId = "";
        showSetup(true);
        setStatus("Выберите категорию для общего чата.");
        $("#authCard").hidden = true;
        ui.chatArea.hidden = true;
        updateProfile();
        return;
      }
      saveConfig();
      updateProfile();
      $("#authCard").hidden = true;
      ui.chatArea.hidden = false;
      await loadDiscussion();
      setStatus(`Вы вошли как @${state.user.login}. Сообщения хранятся в публичном GitHub Discussion.`, "connected");
      if (state.pollCommentsTimer) window.clearInterval(state.pollCommentsTimer);
      state.pollCommentsTimer = window.setInterval(() => loadDiscussion().catch((error) => showError(error.message)), 30000);
    } catch (error) {
      state.token = null;
      state.user = null;
      state.repoId = null;
      $("#authCard").hidden = false;
      ui.chatArea.hidden = true;
      setStatus("Не удалось подключиться к GitHub Discussions.", "error");
      showError(error.message);
    }
  }

  function renderCategories(categories) {
    const select = ui.category;
    while (select.firstChild) select.removeChild(select.firstChild);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = categories.length ? "Выберите категорию" : "Нет категорий";
    select.append(placeholder);
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      select.append(option);
    }
    select.value = state.config.categoryId;
  }

  function updateProfile() {
    const user = state.user;
    const setAvatar = (element, className = "") => {
      while (element.firstChild) element.removeChild(element.firstChild);
      if (user && user.avatarUrl) {
        const image = document.createElement("img");
        image.src = user.avatarUrl;
        image.alt = `${user.login} аватар`;
        image.referrerPolicy = "no-referrer";
        element.append(image);
      } else {
        element.append(createIcon("user"));
      }
      if (className) element.className = className;
    };
    setAvatar($("#sidebarAvatar"), "avatar avatar-small");
    setAvatar($("#profileAvatar"), "profile-avatar avatar");
    $("#sidebarName").textContent = user ? user.name || user.login : "Гость";
    $("#sidebarStatus").textContent = user ? `@${user.login}` : "Вход не выполнен";
    $("#profileName").textContent = user ? user.name || user.login : "Вы не вошли";
    $("#profileLogin").textContent = user ? `@${user.login} · GitHub` : "Подключите GitHub, чтобы открыть профиль.";
  }

  async function loadDiscussion() {
    if (!state.token || !state.config.categoryId) return;
    const data = await githubGraphql(`query CircleChat($owner: String!, $name: String!, $categoryId: ID!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 100, categoryId: $categoryId, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes { id title body createdAt comments(first: 100) {
            nodes { id body createdAt author { login avatarUrl url } }
            pageInfo { hasNextPage }
          } }
        }
      }
    }`, { owner: state.config.owner, name: state.config.repo, categoryId: state.config.categoryId });
    if (!data.repository) throw new Error("Репозиторий не найден.");
    const discussion = data.repository.discussions.nodes.find((item) => item.title === CHAT_TITLE) || null;
    state.discussion = discussion;
    ui.emptyChat.hidden = Boolean(discussion);
    $("#composerWrap").hidden = !discussion;
    ui.messageList.replaceChildren();
    renderStickerChips();
    if (!discussion) {
      ui.participantCount.textContent = "0";
      return;
    }
    const comments = discussion.comments.nodes.slice().reverse();
    const participants = new Set();
    for (const comment of comments) {
      if (comment.author && comment.author.login) participants.add(comment.author.login);
      renderComment(comment);
    }
    ui.participantCount.textContent = String(participants.size);
    $("#chatPagination").hidden = !discussion.comments.pageInfo.hasNextPage;
    ui.messageList.scrollTop = ui.messageList.scrollHeight;
    renderStickerChips();
  }

  function parseSticker(body) {
    if (!body.startsWith(STICKER_PREFIX)) return null;
    try {
      const sticker = JSON.parse(body.slice(STICKER_PREFIX.length));
      if (typeof sticker.emoji !== "string" || typeof sticker.label !== "string") return null;
      return { emoji: Array.from(sticker.emoji).slice(0, 4).join(""), label: sticker.label.slice(0, 32) };
    } catch (parseError) {
      return null;
    }
  }

  function renderComment(comment) {
    const article = document.createElement("article");
    article.className = "message";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    const author = comment.author;
    if (author && author.avatarUrl) {
      const image = document.createElement("img");
      image.src = author.avatarUrl;
      image.alt = `${author.login} аватар`;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      avatar.append(image);
    } else {
      avatar.append(createIcon("user"));
    }
    const body = document.createElement("div");
    body.className = "message-body";
    const meta = document.createElement("p");
    meta.className = "message-meta";
    if (author && author.login) {
      const link = document.createElement("a");
      link.href = `https://github.com/${encodeURIComponent(author.login)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = author.login;
      meta.append(link);
    } else {
      const name = document.createElement("span");
      name.textContent = "Удалённый пользователь";
      meta.append(name);
    }
    const time = document.createElement("time");
    const created = new Date(comment.createdAt);
    time.dateTime = Number.isNaN(created.getTime()) ? "" : created.toISOString();
    time.textContent = Number.isNaN(created.getTime()) ? "" : new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }).format(created);
    meta.append(time);
    body.append(meta);
    const sticker = parseSticker(comment.body || "");
    if (sticker) {
      const content = document.createElement("div");
      content.className = "message-sticker";
      const emoji = document.createElement("span");
      emoji.className = "sticker-emoji";
      emoji.textContent = sticker.emoji;
      const label = document.createElement("span");
      label.textContent = sticker.label;
      content.append(emoji, label);
      body.append(content);
    } else {
      const content = document.createElement("p");
      content.className = "message-content";
      content.textContent = comment.body || "";
      body.append(content);
    }
    article.append(avatar, body);
    ui.messageList.append(article);
  }

  async function createChat() {
    if (!state.repoId || !state.config.categoryId) {
      showSetup(true);
      return;
    }
    const button = $("#createChatButton");
    button.disabled = true;
    clearError();
    try {
      const result = await githubGraphql(`mutation CircleCreateChat($input: CreateDiscussionInput!) {
        createDiscussion(input: $input) { discussion { id title } }
      }`, { input: {
        repositoryId: state.repoId,
        categoryId: state.config.categoryId,
        title: CHAT_TITLE,
        body: "Общий чат сообщества «Круг». Все комментарии здесь публичны. Не публикуйте личные данные."
      } });
      if (!result.createDiscussion || !result.createDiscussion.discussion) throw new Error("GitHub не создал обсуждение.");
      await loadDiscussion();
      setStatus("Общий чат создан в GitHub Discussions.", "connected");
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function sendMessage(text) {
    if (!state.discussion) throw new Error("Сначала создайте общий чат.");
    const result = await githubGraphql(`mutation CircleComment($input: AddDiscussionCommentInput!) {
      addDiscussionComment(input: $input) { comment { id body createdAt } }
    }`, { input: { discussionId: state.discussion.id, body: text } });
    if (!result.addDiscussionComment || !result.addDiscussionComment.comment) throw new Error("GitHub не сохранил комментарий.");
    await loadDiscussion();
  }

  function openStickerDialog() {
    if (!state.user) {
      setView("chat");
      showError("Войдите через GitHub, чтобы создать стикер.");
      return;
    }
    if (!state.discussion) {
      setView("chat");
      showError("Сначала создайте общий чат.");
      return;
    }
    const select = $("#stickerEmoji");
    if (!select.options.length) {
      for (const emoji of EMOJIS) {
        const option = document.createElement("option");
        option.value = emoji;
        option.textContent = emoji;
        select.append(option);
      }
    }
    $("#stickerDialog").showModal();
  }

  function renderStickerChips() {
    const container = $("#stickerList");
    container.replaceChildren();
    const stickers = [];
    if (state.discussion) {
      for (const comment of [...state.discussion.comments.nodes].reverse()) {
        const sticker = parseSticker(comment.body || "");
        if (sticker) stickers.push(sticker);
      }
    }
    for (const sticker of stickers.slice(0, 6)) {
      const chip = document.createElement("span");
      chip.className = "sticker-chip";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${sticker.emoji} ${sticker.label}`;
      button.setAttribute("aria-label", `Использовать стикер ${sticker.label}`);
      button.addEventListener("click", () => {
        ui.messageInput.value = `${sticker.emoji} ${sticker.label}`;
        ui.messageInput.focus();
        ui.charCount.textContent = `${ui.messageInput.value.length} / 2000`;
      });
      chip.append(button);
      container.append(chip);
    }
    if (!stickers.length) {
      const empty = document.createElement("p");
      empty.className = "sticker-empty";
      empty.textContent = state.user ? "Стикеров пока нет." : "Войдите и создайте первый.";
      container.append(empty);
    }
  }

  function setView(view) {
    for (const panel of document.querySelectorAll(".view-panel")) panel.hidden = panel.id !== `${view}View`;
    for (const button of document.querySelectorAll(".nav-item")) {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }

  function insertEmoji(emoji) {
    const input = ui.messageInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(emoji, start, end, "end");
    input.focus();
    ui.charCount.textContent = `${input.value.length} / 2000`;
  }

  function init() {
    $("#sidebarRepo").textContent = `${state.config.owner}/${state.config.repo}`;
    $("#mobileRepo").textContent = `${state.config.owner}/${state.config.repo}`;
    ui.setupForm.elements.owner.value = state.config.owner;
    ui.setupForm.elements.repo.value = state.config.repo;
    ui.setupForm.elements.clientId.value = state.config.clientId;

    $("#settingsButton").addEventListener("click", () => showSetup(!ui.setupPanel.hidden));
    $("#statusAction").addEventListener("click", () => showSetup(true));
    $("#closeSetupButton").addEventListener("click", () => showSetup(false));
    $("#signInButton").addEventListener("click", beginSignIn);
    $("#refreshButton").addEventListener("click", () => loadDiscussion().catch((error) => showError(error.message)));
    $("#createChatButton").addEventListener("click", createChat);
    $("#stickerButton").addEventListener("click", openStickerDialog);
    $("#createStickerLink").addEventListener("click", openStickerDialog);
    $("#accountButton").addEventListener("click", () => {
      if (state.user && window.confirm("Выйти из GitHub? Токен будет удалён из памяти этой вкладки.")) {
        state.token = null;
        state.user = null;
        state.repoId = null;
        state.discussion = null;
        if (state.pollCommentsTimer) window.clearInterval(state.pollCommentsTimer);
        $("#authCard").hidden = false;
        ui.chatArea.hidden = true;
        updateProfile();
        renderStickerChips();
        setStatus("Вы вышли из аккаунта.");
      } else if (!state.user) {
        showSetup(true);
      }
    });
    $("#cancelDeviceButton").addEventListener("click", closeDeviceDialog);
    $("#copyCodeButton").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ui.deviceCode.textContent);
        $("#copyCodeButton").textContent = "Код скопирован";
      } catch (clipboardError) {
        ui.deviceStatus.textContent = "Не удалось скопировать. Выделите код и скопируйте вручную.";
      }
    });
    $("#emojiToggle").addEventListener("click", () => {
      const popover = $("#emojiPopover");
      if (!popover.childElementCount) {
        for (const emoji of EMOJIS) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "emoji-choice";
          button.textContent = emoji;
          button.setAttribute("aria-label", `Вставить ${emoji}`);
          button.addEventListener("click", () => {
            insertEmoji(emoji);
            popover.hidden = true;
          });
          popover.append(button);
        }
      }
      popover.hidden = !popover.hidden;
    });
    ui.messageInput.addEventListener("input", () => {
      ui.charCount.textContent = `${ui.messageInput.value.length} / 2000`;
    });
    ui.messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("#messageForm").requestSubmit();
      }
    });
    $("#messageForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = ui.messageInput.value.trim();
      if (!text || text.length > 2000) return;
      const button = event.currentTarget.querySelector(".send-button");
      button.disabled = true;
      clearError();
      try {
        await sendMessage(text);
        ui.messageInput.value = "";
        ui.charCount.textContent = "0 / 2000";
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    $("#stickerForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const emoji = $("#stickerEmoji").value;
      const label = $("#stickerLabel").value.trim();
      if (!emoji || !label || label.length > 32) return;
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      clearError();
      try {
        if (!state.discussion) throw new Error("Создайте общий чат перед отправкой стикера.");
        await sendMessage(`${STICKER_PREFIX}${JSON.stringify({ emoji, label })}`);
        $("#stickerDialog").close();
        $("#stickerLabel").value = "";
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    ui.setupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const owner = form.elements.owner.value.trim();
      const repo = form.elements.repo.value.trim();
      const clientId = form.elements.clientId.value.trim();
      if (!validOwner(owner) || !validRepo(repo) || !clientId) {
        showError("Укажите допустимое имя владельца, репозитория и OAuth Client ID.");
        return;
      }
      const repoChanged = owner !== state.config.owner || repo !== state.config.repo;
      state.config = Object.assign({}, state.config, {
        owner,
        repo,
        clientId,
        categoryId: repoChanged ? "" : ui.category.value || state.config.categoryId
      });
      if (repoChanged) {
        state.repoId = null;
        state.discussion = null;
      }
      saveConfig();
      showSetup(false);
      clearError();
      if (repoChanged && state.token) {
        await loadUserAndCommunity();
        return;
      }
      if (state.token && state.repoId && state.config.categoryId) {
        $("#authCard").hidden = true;
        ui.chatArea.hidden = false;
        try {
          await loadDiscussion();
          setStatus(`Вы вошли как @${state.user.login}. Сообщения хранятся в публичном GitHub Discussion.`, "connected");
          if (state.pollCommentsTimer) window.clearInterval(state.pollCommentsTimer);
          state.pollCommentsTimer = window.setInterval(() => loadDiscussion().catch((error) => showError(error.message)), 30000);
        } catch (error) {
          showError(error.message);
          setStatus("Не удалось открыть выбранную категорию.", "error");
        }
      } else {
        setStatus("Настройки сохранены. Выполните вход через GitHub.");
      }
    });
    for (const button of document.querySelectorAll(".nav-item")) button.addEventListener("click", () => setView(button.dataset.view));
    renderStickerChips();
    updateProfile();
    if (!state.config.clientId) showSetup(true);
    setStatus(state.config.clientId ? "Войдите через GitHub, чтобы подключить общий чат." : "Настройте OAuth App, чтобы подключить настоящий общий чат.");
  }

  init();
})();
