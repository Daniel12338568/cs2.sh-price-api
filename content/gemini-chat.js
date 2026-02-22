/**
 * cs2.sh Docs Chat Widget — Mintlify-style right sidebar.
 * Navbar integration, code block context, expand mode, resize handle.
 */
(function () {
  "use strict";

  var WORKER_URL = "https://cs2sh-chat.cloudflare-browsing402.workers.dev/v1/chat/completions";
  var MAX_PAIRS = 10;
  var messages = [];
  var isStreaming = false;
  var abortCtrl = null;
  var codeContexts = [];
  var lastPath = window.location.pathname;

  // ── SVG Icons ───────────────────────────────────────────────────────
  var ICON_SPARKLE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><g fill="currentColor"><path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259-.342-.474s-.138-.406-.342-.474Z" fill="currentColor" stroke="none"/><polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';
  var ICON_SPARKLE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><g fill="currentColor"><path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259-.342-.474s-.138-.406-.342-.474Z" fill="currentColor" stroke="none"/><polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';
  var ICON_SPARKLE_14 = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18"><g fill="currentColor"><path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259-.342-.474s-.138-.406-.342-.474Z" fill="currentColor" stroke="none"/><polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';
  var ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICON_SEND = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
  var ICON_PAGE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICON_CODE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  var ICON_X_SM = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICON_COPY_SM = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_CHECK_SM = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // ── Markdown ────────────────────────────────────────────────────────
  function md(text) {
    var h = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code class="language-' + (lang || "text") + '">' + code.trim() + "</code></pre>";
    });
    h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Auto-link bare URLs not already inside an anchor tag
    h = h.replace(/(?<!href="|">)(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    h = h.replace(/^(?:- |\* )(.+)$/gm, "<li>$1</li>");
    h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
    h = h.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    h = h.split(/\n{2,}/).map(function (b) {
      b = b.trim();
      if (!b) return "";
      if (/^<(?:h[1-4]|ul|ol|pre|li)/.test(b)) return b;
      return "<p>" + b + "</p>";
    }).join("\n");
    h = h.replace(/(<p>[\s\S]*?<\/p>)/g, function (p) {
      return p.replace(/(?<!\n)\n(?!\n)/g, "<br>");
    });
    return h;
  }

  function addResponseCopyBtn(el, rawText) {
    var btn = document.createElement("button");
    btn.className = "gc-response-copy";
    btn.innerHTML = ICON_COPY_SM;
    btn.onclick = function () {
      navigator.clipboard.writeText(rawText);
      btn.innerHTML = ICON_CHECK_SM;
      setTimeout(function () { btn.innerHTML = ICON_COPY_SM; }, 1500);
    };
    el.appendChild(btn);
  }

  function addCopyBtns(el) {
    el.querySelectorAll("pre").forEach(function (pre) {
      if (pre.querySelector(".gc-copy-btn")) return;
      var btn = document.createElement("button");
      btn.className = "gc-copy-btn";
      btn.textContent = "Copy";
      btn.onclick = function () {
        navigator.clipboard.writeText(pre.textContent);
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = "Copy"; }, 1500);
      };
      pre.appendChild(btn);
    });
  }

  // ── DOM refs ────────────────────────────────────────────────────────
  var panel, messagesEl, textarea, sendBtn, chipContainer;

  // ── Build UI ────────────────────────────────────────────────────────
  function buildUI() {
    // Panel
    panel = document.createElement("div");
    panel.id = "gc-panel";

    // Header
    var header = document.createElement("div");
    header.id = "gc-header";

    var headerLeft = document.createElement("div");
    headerLeft.className = "gc-header-left";
    var headerIcon = document.createElement("span");
    headerIcon.className = "gc-header-icon";
    headerIcon.innerHTML = ICON_SPARKLE_SM;
    var titleGroup = document.createElement("div");
    titleGroup.className = "gc-header-title-group";
    var title = document.createElement("span");
    title.id = "gc-header-title";
    title.textContent = "Assistant";
    var escHint = document.createElement("button");
    escHint.className = "gc-esc-hint";
    escHint.textContent = "Esc to close";
    escHint.onclick = close;
    titleGroup.appendChild(title);
    titleGroup.appendChild(escHint);
    headerLeft.appendChild(headerIcon);
    headerLeft.appendChild(titleGroup);

    var headerRight = document.createElement("div");
    headerRight.className = "gc-header-right";

    var closeBtn = document.createElement("button");
    closeBtn.id = "gc-close";
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.onclick = close;

    headerRight.appendChild(closeBtn);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    panel.appendChild(header);

    // Messages
    messagesEl = document.createElement("div");
    messagesEl.id = "gc-messages";
    var disc = document.createElement("div");
    disc.className = "gc-disclaimer";
    disc.textContent = "Responses are generated using AI and may contain mistakes. Model: Gemini 3 Flash.";
    messagesEl.appendChild(disc);
    panel.appendChild(messagesEl);

    // Input area
    var inputArea = document.createElement("div");
    inputArea.id = "gc-input-area";

    // Chip container
    chipContainer = document.createElement("div");
    chipContainer.id = "gc-chips";
    inputArea.appendChild(chipContainer);

    // Input box (relative container for absolute send button)
    var inputBox = document.createElement("div");
    inputBox.id = "gc-input-box";

    textarea = document.createElement("textarea");
    textarea.id = "gc-textarea";
    textarea.placeholder = "Ask a question...";
    textarea.rows = 1;
    textarea.addEventListener("input", function () {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
      sendBtn.disabled = isStreaming || !textarea.value.trim();
    });
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    sendBtn = document.createElement("button");
    sendBtn.id = "gc-send";
    sendBtn.disabled = true;
    sendBtn.innerHTML = ICON_SEND;
    sendBtn.onclick = send;

    inputBox.appendChild(textarea);
    inputBox.appendChild(sendBtn);
    inputArea.appendChild(inputBox);
    panel.appendChild(inputArea);

    document.body.appendChild(panel);

    // Inject nav button into header (re-injected by observer on SPA nav)
    injectNavButton();

    // Inject code block buttons (observer catches late hydration)
    interceptNavButtons();
    injectCodeBlockButtons();

    // Render initial chips (page chip)
    renderChips();

    // Keyboard: Cmd+I toggle, Escape close
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); toggle(); }
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });

    // Recalculate panel width on resize
    window.addEventListener("resize", function () {
      if (panel.classList.contains("open")) updatePanelWidth();
    });
  }

  // ── Panel width — align with content right edge ────────────────────
  function updatePanelWidth() {
    var content = document.querySelector("#content-area") || document.querySelector("#content") || document.querySelector("article");
    if (!content || window.innerWidth <= 1024) return;
    var rect = content.getBoundingClientRect();
    // Panel left edge sits just past content right edge with a gap
    var width = window.innerWidth - rect.right - 16;
    width = Math.max(380, Math.min(width, window.innerWidth * 0.6));
    panel.style.width = width + "px";
  }

  // ── Open / Close ────────────────────────────────────────────────────
  function updateNavButtonState() {
    var btn = document.getElementById("gc-nav-toggle");
    if (!btn) return;
    btn.style.display = panel.classList.contains("open") ? "none" : "";
  }

  function open() {
    updatePanelWidth();
    panel.classList.add("open");
    updateNavButtonState();
    textarea.focus();
  }

  function close() {
    panel.classList.remove("open");
    updateNavButtonState();
    if (isStreaming && abortCtrl) abortCtrl.abort();
    try { localStorage.setItem("gc-closed", "1"); } catch (_) {}
  }

  function toggle() {
    panel.classList.contains("open") ? close() : open();
  }

  // ── "Ask AI" nav button (injected into header nav, polled to survive React) ──
  function injectNavButton() {
    // Find Dashboard link anywhere in the page
    var dashLink = null;
    var allLinks = document.querySelectorAll("nav ul li a");
    for (var i = 0; i < allLinks.length; i++) {
      if (allLinks[i].textContent.trim() === "Dashboard") {
        dashLink = allLinks[i];
        break;
      }
    }
    if (!dashLink) return;
    var dashLi = dashLink.closest("li");
    var navUl = dashLink.closest("ul");
    if (!dashLi || !navUl) return;
    // Already there? Done.
    if (navUl.querySelector("#gc-nav-toggle")) return;
    // Build <li> matching Dashboard's structure
    var li = document.createElement("li");
    li.className = "navbar-link";
    var btn = document.createElement("button");
    btn.id = "gc-nav-toggle";
    btn.className = "flex items-center gap-1.5 whitespace-nowrap font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 border border-current rounded-lg py-1.5 px-3 text-sm";
    btn.textContent = "Ask AI";
    if (panel && panel.classList.contains("open")) btn.style.display = "none";
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    li.appendChild(btn);
    navUl.insertBefore(li, dashLi);
  }

  // Poll to keep the button alive — React reconciliation removes foreign nodes,
  // this re-injects faster than the user can notice.
  setInterval(injectNavButton, 200);

  // ── Intercept native nav sparkle button ─────────────────────────────
  function interceptNavButtons() {
    document.querySelectorAll("#assistant-entry-mobile").forEach(function (btn) {
      if (btn.dataset.gcOwned) return;
      var clone = btn.cloneNode(true);
      clone.dataset.gcOwned = "true";
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });
    });
  }

  // ── Code block "Ask AI" buttons ────────────────────────────────────
  function injectCodeBlockButtons() {
    var copyBtns = document.querySelectorAll('[data-testid="copy-code-button"]');
    copyBtns.forEach(function (copyBtn) {
      // Find the actions container (copy button's parent's parent — the flex row)
      var actionsContainer = copyBtn.parentElement && copyBtn.parentElement.parentElement;
      if (!actionsContainer) return;
      // Skip if already injected in this container
      if (actionsContainer.querySelector("[data-gc-ask-ai]")) return;

      // Deep-clone the copy button's entire wrapper (includes tooltip)
      var copyWrapper = copyBtn.parentElement;
      var wrapper = copyWrapper.cloneNode(true);
      wrapper.setAttribute("data-gc-ask-ai", "true");

      // Clear cloned button content, reserve space, fade in icon
      var askBtn = wrapper.querySelector('[data-testid="copy-code-button"]') || wrapper.querySelector("button");
      if (!askBtn) return;
      askBtn.removeAttribute("data-testid");
      askBtn.innerHTML = "";

      // Update tooltip text if present
      var tooltip = wrapper.querySelector("[class*='tooltip'], [role='tooltip'], span:not(:empty)");
      if (tooltip && tooltip !== askBtn) tooltip.textContent = "Ask AI";

      askBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Find nearest <pre> to extract code
        var pre = actionsContainer.closest("pre") || actionsContainer.parentElement && actionsContainer.parentElement.querySelector("pre");
        if (!pre) {
          // Walk up to find code block container, then find pre within
          var codeBlock = actionsContainer.closest("[class*='code']") || actionsContainer.closest("div");
          if (codeBlock) pre = codeBlock.querySelector("pre");
        }
        if (pre) {
          addCodeContext(pre.textContent);
        }
        open();
        textarea.focus();
      };

      askBtn.innerHTML = ICON_SPARKLE_14;
      actionsContainer.appendChild(wrapper);
    });
  }

  // ── Context chip system ────────────────────────────────────────────
  function addCodeContext(text) {
    codeContexts.push({ type: "code", text: text.slice(0, 2000) });
    renderChips();
    open();
  }

  function removeCodeContext(index) {
    codeContexts.splice(index, 1);
    renderChips();
  }

  function renderChips() {
    if (!chipContainer) return;
    chipContainer.innerHTML = "";

    // Page chip (always present)
    var path = window.location.pathname;
    var truncPath = path.length > 30 ? path.slice(0, 30) + "\u2026" : path;
    var pageChip = document.createElement("div");
    pageChip.className = "gc-chip gc-chip-page";
    pageChip.innerHTML = '<span class="gc-chip-icon">' + ICON_PAGE + '</span><span class="gc-chip-text">' + escapeHtml(truncPath) + '</span>';
    chipContainer.appendChild(pageChip);

    // Code chips
    for (var i = 0; i < codeContexts.length; i++) {
      (function (idx) {
        var ctx = codeContexts[idx];
        var truncText = ctx.text.replace(/\s+/g, " ").trim();
        truncText = truncText.length > 40 ? truncText.slice(0, 40) + "\u2026" : truncText;

        var chip = document.createElement("div");
        chip.className = "gc-chip gc-chip-code";
        chip.innerHTML = '<span class="gc-chip-icon">' + ICON_CODE + '</span><span class="gc-chip-text">' + escapeHtml(truncText) + '</span>';

        var removeBtn = document.createElement("button");
        removeBtn.className = "gc-chip-remove";
        removeBtn.innerHTML = ICON_X_SM;
        removeBtn.onclick = function (e) {
          e.preventDefault();
          removeCodeContext(idx);
        };
        chip.appendChild(removeBtn);
        chipContainer.appendChild(chip);
      })(i);
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Send message ────────────────────────────────────────────────────
  function send() {
    if (isStreaming) return;
    var text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";
    textarea.style.height = "auto";
    sendBtn.disabled = true;

    // Build context prefix from chips
    var contextPrefix = "";
    var path = window.location.pathname;
    if (path && path !== "/") {
      contextPrefix += "Current page: " + path + "\n";
    }
    for (var i = 0; i < codeContexts.length; i++) {
      contextPrefix += "Additional context:\n```\n" + codeContexts[i].text + "\n```\n";
    }

    // Clear code contexts after building prefix (page chip persists)
    codeContexts = [];
    renderChips();

    streamResponse(text, contextPrefix);
  }

  // ── Stream ──────────────────────────────────────────────────────────
  async function streamResponse(userText, contextPrefix) {
    isStreaming = true;

    // Remove disclaimer
    var disc = messagesEl.querySelector(".gc-disclaimer");
    if (disc) disc.remove();

    // Store clean text in message history, but send context to API
    messages.push({ role: "user", content: userText });
    while (messages.length > MAX_PAIRS * 2) messages.shift();

    var userDiv = document.createElement("div");
    userDiv.className = "gc-msg gc-msg-user";
    userDiv.textContent = userText;
    messagesEl.appendChild(userDiv);

    // Add assistant placeholder
    var assistDiv = document.createElement("div");
    assistDiv.className = "gc-msg gc-msg-assistant gc-cursor";
    messagesEl.appendChild(assistDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Build API messages — inject context prefix into the last user message
    var apiMessages = messages.map(function (m) { return { role: m.role, content: m.content }; });
    if (contextPrefix) {
      var last = apiMessages.length - 1;
      apiMessages[last] = {
        role: "user",
        content: contextPrefix + "\n" + userText
      };
    }

    var content = "";
    abortCtrl = new AbortController();

    try {
      var resp = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: "gemini-3-flash-preview", stream: true }),
        signal: abortCtrl.signal,
      });
      if (!resp.ok) {
        var e; try { e = await resp.json(); } catch (_) { e = {}; }
        throw new Error(e.message || "Request failed (" + resp.status + ")");
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split("\n");
        buffer = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith("data: ")) continue;
          var data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            var parsed = JSON.parse(data);
            var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
            if (delta) {
              content += delta;
              assistDiv.innerHTML = md(content);
              assistDiv.classList.add("gc-cursor");
              addCopyBtns(assistDiv);
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          } catch (_) {}
        }
      }

      assistDiv.classList.remove("gc-cursor");
      assistDiv.innerHTML = md(content);
      addCopyBtns(assistDiv);
      addResponseCopyBtn(assistDiv, content);
      messages.push({ role: "assistant", content: content });
    } catch (err) {
      assistDiv.remove();
      if (err.name !== "AbortError") {
        var errDiv = document.createElement("div");
        errDiv.className = "gc-msg-error";
        errDiv.textContent = err.message || "Something went wrong.";
        messagesEl.appendChild(errDiv);
      }
      messages.pop();
    } finally {
      isStreaming = false;
      abortCtrl = null;
      sendBtn.disabled = !textarea.value.trim();
      textarea.focus();
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────
  function init() {
    buildUI();

    // Auto-open for new users on desktop only
    try {
      if (!localStorage.getItem("gc-closed") && window.innerWidth > 1024) open();
    } catch (_) {}

    // MutationObserver for SPA nav (code blocks, intercepts, path changes)
    var obsTimer = null;
    new MutationObserver(function (muts) {
      if (!muts.some(function (m) { return m.addedNodes.length > 0; })) return;
      clearTimeout(obsTimer);
      obsTimer = setTimeout(function () {
        interceptNavButtons();
        injectNavButton();
        injectCodeBlockButtons();
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          renderChips();
          if (panel.classList.contains("open")) updatePanelWidth();
        }
      }, 16);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
