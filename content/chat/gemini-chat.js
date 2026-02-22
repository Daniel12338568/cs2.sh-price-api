/**
 * cs2.sh Docs Chat Widget — Mintlify-style right sidebar.
 * Navbar integration, code block context, expand mode, resize handle.
 */
(function () {
  "use strict";

  if (window.__GC_CHAT_WIDGET_INIT__) return;
  window.__GC_CHAT_WIDGET_INIT__ = true;

  var WORKER_URL =
    "https://cs2sh-chat.cloudflare-browsing402.workers.dev/v1/chat/completions";
  var MAX_PAIRS = 10;
  var messages = [];
  var isStreaming = false;
  var abortCtrl = null;
  var codeContexts = [];
  var lastPath = window.location.pathname;

  // ── SVG Icons ───────────────────────────────────────────────────────
  var ICON_SPARKLE_SM =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><g fill="currentColor"><path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259-.342-.474s-.138-.406-.342-.474Z" fill="currentColor" stroke="none"/><polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';
  var ICON_SPARKLE_14 =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18"><g fill="currentColor"><path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259-.342-.474s-.138-.406-.342-.474Z" fill="currentColor" stroke="none"/><polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';
  var ICON_CLOSE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICON_TRASH =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var ICON_SEND =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
  var ICON_PAGE =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICON_CODE =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  var ICON_X_SM =
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICON_COPY_SM =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_CHECK_SM =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // ── Markdown ────────────────────────────────────────────────────────
  var MARKDOWN_CACHE_LIMIT = 40;
  var markdownCache = new Map();
  var SAFE_LINK_PROTOCOLS = {
    "http:": true,
    "https:": true,
    "mailto:": true,
  };
  var SANITIZE_ALLOWED_TAGS = {
    A: true,
    BR: true,
    CODE: true,
    EM: true,
    H1: true,
    H2: true,
    H3: true,
    H4: true,
    H5: true,
    H6: true,
    LI: true,
    OL: true,
    P: true,
    PRE: true,
    STRONG: true,
    UL: true,
  };
  var SANITIZE_ALLOWED_ATTRS = {
    A: { href: true, target: true, rel: true },
    CODE: { class: true },
  };

  function md(text) {
    var source = String(text == null ? "" : text);
    if (!source) return "";
    if (markdownCache.has(source)) return markdownCache.get(source);

    var rendered = "";
    try {
      rendered = renderMarkdownToHtml(source);
      rendered = sanitizeRenderedHtml(rendered);
      if (!rendered) rendered = renderPlainTextFallback(source);
    } catch (_) {
      rendered = renderPlainTextFallback(source);
    }

    markdownCache.set(source, rendered);
    if (markdownCache.size > MARKDOWN_CACHE_LIMIT) {
      var firstKey = markdownCache.keys().next().value;
      markdownCache.delete(firstKey);
    }
    return rendered;
  }

  function renderPlainTextFallback(text) {
    return "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>";
  }

  function renderMarkdownToHtml(text) {
    var blocks = parseMarkdownBlocks(text);
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      out.push(renderBlock(blocks[i]));
    }
    return out.join("");
  }

  function parseMarkdownBlocks(text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    var blocks = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }

      var fenceInfo = parseFenceStart(line);
      if (fenceInfo) {
        var codeLines = [];
        i++;
        while (i < lines.length && !isFenceEnd(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && isFenceEnd(lines[i])) i++;
        blocks.push({
          type: "code",
          lang: fenceInfo.lang,
          code: codeLines.join("\n"),
        });
        continue;
      }

      var headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch) {
        blocks.push({
          type: "heading",
          level: headingMatch[1].length,
          text: headingMatch[2],
        });
        i++;
        continue;
      }

      var listMeta = getListMeta(line);
      if (listMeta) {
        var parsedList = parseList(lines, i, listMeta.indent, listMeta.ordered);
        blocks.push({
          type: "list",
          ordered: parsedList.ordered,
          items: parsedList.items,
        });
        i = parsedList.nextIndex;
        continue;
      }

      var paragraphLines = [line];
      i++;
      while (i < lines.length && !isBlockBoundary(lines[i])) {
        paragraphLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join("\n").replace(/\s+$/g, ""),
      });
    }

    return blocks;
  }

  function isBlockBoundary(line) {
    if (!line.trim()) return true;
    if (parseFenceStart(line)) return true;
    if (/^\s{0,3}(#{1,6})\s+/.test(line)) return true;
    return !!getListMeta(line);
  }

  function parseFenceStart(line) {
    var m = line.match(/^\s*```([^\s`]*)\s*$/);
    if (!m) return null;
    var lang = (m[1] || "text").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return { lang: lang || "text" };
  }

  function isFenceEnd(line) {
    return /^\s*```/.test(line);
  }

  function getListMeta(line) {
    var m = line.match(/^(\s*)([-*]|\d+\.)\s+([\s\S]*)$/);
    if (!m) return null;
    return {
      indent: countIndent(m[1]),
      ordered: /\d+\./.test(m[2]),
      text: m[3],
    };
  }

  function countIndent(prefix) {
    var count = 0;
    for (var i = 0; i < prefix.length; i++) {
      if (prefix[i] === " ") count += 1;
      else if (prefix[i] === "\t") count += 2;
    }
    return count;
  }

  function parseList(lines, startIndex, baseIndent, ordered) {
    var items = [];
    var i = startIndex;

    while (i < lines.length) {
      var meta = getListMeta(lines[i]);
      if (!meta || meta.indent !== baseIndent || meta.ordered !== ordered)
        break;

      var item = { textLines: [meta.text], children: [] };
      i++;

      while (i < lines.length) {
        var line = lines[i];
        if (!line.trim()) {
          var maybeNext = lines[i + 1];
          if (!maybeNext) {
            i++;
            break;
          }

          var nextIndent = countIndent(
            (maybeNext.match(/^(\s*)/) || ["", ""])[1],
          );
          var nextMeta = getListMeta(maybeNext);
          if (nextMeta && nextMeta.indent <= baseIndent) {
            i++;
            break;
          }
          if (!nextMeta && nextIndent <= baseIndent) {
            i++;
            break;
          }
          item.textLines.push("");
          i++;
          continue;
        }

        var childMeta = getListMeta(line);
        if (childMeta) {
          if (childMeta.indent === baseIndent) break;
          if (childMeta.indent > baseIndent) {
            var childList = parseList(
              lines,
              i,
              childMeta.indent,
              childMeta.ordered,
            );
            if (childList.items.length) {
              item.children.push({
                type: "list",
                ordered: childList.ordered,
                items: childList.items,
              });
              i = childList.nextIndex;
              continue;
            }
          }
        }

        var lineIndent = countIndent((line.match(/^(\s*)/) || ["", ""])[1]);
        if (lineIndent > baseIndent) {
          item.textLines.push(line.trim());
          i++;
          continue;
        }
        break;
      }

      items.push(item);
    }

    return {
      ordered: ordered,
      items: items,
      nextIndex: i,
    };
  }

  function renderBlock(block) {
    if (block.type === "heading") {
      var level = Math.min(6, Math.max(1, block.level || 1));
      return (
        "<h" +
        level +
        ">" +
        renderInline(block.text || "") +
        "</h" +
        level +
        ">"
      );
    }
    if (block.type === "code") {
      var lang = (block.lang || "text").replace(/[^a-z0-9_-]/gi, "");
      return (
        '<pre><code class="language-' +
        (lang || "text") +
        '">' +
        escapeHtml(block.code || "") +
        "</code></pre>"
      );
    }
    if (block.type === "list") {
      return renderList(block);
    }
    return "<p>" + renderInline(block.text || "") + "</p>";
  }

  function renderList(block) {
    var tag = block.ordered ? "ol" : "ul";
    var out = ["<" + tag + ">"];
    for (var i = 0; i < block.items.length; i++) {
      var item = block.items[i];
      var text = item.textLines.join("\n").replace(/^\n+|\n+$/g, "");
      out.push("<li>");
      if (text) out.push(renderInline(text));
      for (var j = 0; j < item.children.length; j++) {
        out.push(renderList(item.children[j]));
      }
      out.push("</li>");
    }
    out.push("</" + tag + ">");
    return out.join("");
  }

  function renderInline(text) {
    var source = String(text == null ? "" : text);
    var out = [];
    var plain = "";
    var i = 0;

    function flushPlain() {
      if (!plain) return;
      out.push(escapeHtml(plain));
      plain = "";
    }

    while (i < source.length) {
      var ch = source.charAt(i);

      if (ch === "\n") {
        flushPlain();
        out.push("<br>");
        i++;
        continue;
      }

      if (ch === "`") {
        var codeEnd = source.indexOf("`", i + 1);
        if (codeEnd !== -1) {
          flushPlain();
          out.push(
            "<code>" + escapeHtml(source.slice(i + 1, codeEnd)) + "</code>",
          );
          i = codeEnd + 1;
          continue;
        }
      }

      if (source.slice(i, i + 2) === "**") {
        var strongEnd = source.indexOf("**", i + 2);
        if (strongEnd !== -1 && strongEnd > i + 2) {
          flushPlain();
          out.push(
            "<strong>" +
              renderInline(source.slice(i + 2, strongEnd)) +
              "</strong>",
          );
          i = strongEnd + 2;
          continue;
        }
      }

      if (ch === "*") {
        var emEnd = source.indexOf("*", i + 1);
        if (emEnd !== -1 && emEnd > i + 1) {
          flushPlain();
          out.push("<em>" + renderInline(source.slice(i + 1, emEnd)) + "</em>");
          i = emEnd + 1;
          continue;
        }
      }

      if (ch === "[") {
        var closeBracket = source.indexOf("]", i + 1);
        if (closeBracket !== -1 && source.charAt(closeBracket + 1) === "(") {
          var closeParen = findClosingParen(source, closeBracket + 1);
          if (closeParen !== -1) {
            var label = source.slice(i + 1, closeBracket);
            var url = source.slice(closeBracket + 2, closeParen);
            var safeUrl = normalizeSafeUrl(url);
            if (safeUrl) {
              flushPlain();
              out.push(
                '<a href="' +
                  escapeAttr(safeUrl) +
                  '" target="_blank" rel="noopener noreferrer">' +
                  renderInline(label) +
                  "</a>",
              );
            } else {
              plain += source.slice(i, closeParen + 1);
            }
            i = closeParen + 1;
            continue;
          }
        }
      }

      var urlToken = readBareUrlToken(source, i);
      if (urlToken) {
        flushPlain();
        var safeBareUrl = normalizeSafeUrl(urlToken.url);
        if (safeBareUrl) {
          out.push(
            '<a href="' +
              escapeAttr(safeBareUrl) +
              '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(urlToken.url) +
              "</a>",
          );
        } else {
          out.push(escapeHtml(urlToken.url));
        }
        if (urlToken.suffix) out.push(escapeHtml(urlToken.suffix));
        i += urlToken.length;
        continue;
      }

      plain += ch;
      i++;
    }

    flushPlain();
    return out.join("");
  }

  function findClosingParen(text, openParenIndex) {
    var depth = 0;
    for (var i = openParenIndex; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth === 0) return i;
    }
    return -1;
  }

  function readBareUrlToken(text, index) {
    if (index > 0 && /[A-Za-z0-9_]/.test(text.charAt(index - 1))) return null;

    var rest = text.slice(index);
    var match = rest.match(/^(https?:\/\/[^\s<]+)/);
    if (!match) return null;

    var candidate = match[1];
    var trimmed = candidate;
    while (/[.,!?;:]$/.test(trimmed)) {
      trimmed = trimmed.slice(0, -1);
    }
    while (
      trimmed.charAt(trimmed.length - 1) === ")" &&
      hasMoreClosingParens(trimmed)
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    if (!trimmed) return null;

    return {
      url: trimmed,
      suffix: candidate.slice(trimmed.length),
      length: candidate.length,
    };
  }

  function hasMoreClosingParens(text) {
    var open = 0;
    var close = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) === "(") open++;
      if (text.charAt(i) === ")") close++;
    }
    return close > open;
  }

  function normalizeSafeUrl(rawUrl) {
    var value = String(rawUrl == null ? "" : rawUrl).trim();
    if (!value) return null;

    try {
      var parsed = new URL(value, window.location.origin);
      if (!SAFE_LINK_PROTOCOLS[parsed.protocol]) return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  function sanitizeRenderedHtml(html) {
    if (!html || typeof document === "undefined" || !document.implementation)
      return "";

    try {
      var doc = document.implementation.createHTMLDocument("");
      doc.body.innerHTML = html;

      var walker = doc.createTreeWalker(doc.body, 1, null);
      var elements = [];
      var node = walker.nextNode();
      while (node) {
        elements.push(node);
        node = walker.nextNode();
      }

      for (var i = 0; i < elements.length; i++) {
        sanitizeElement(elements[i], doc);
      }

      return doc.body.innerHTML;
    } catch (_) {
      return "";
    }
  }

  function sanitizeElement(el, doc) {
    var tag = el.tagName;
    if (!SANITIZE_ALLOWED_TAGS[tag]) {
      replaceWithTextNode(el, doc);
      return;
    }

    var allowedAttrs = SANITIZE_ALLOWED_ATTRS[tag] || {};
    var attrs = Array.prototype.slice.call(el.attributes || []);
    for (var i = 0; i < attrs.length; i++) {
      var attrName = attrs[i].name.toLowerCase();
      if (!allowedAttrs[attrName]) el.removeAttribute(attrName);
    }

    if (tag === "A") {
      var href = normalizeSafeUrl(el.getAttribute("href"));
      if (!href) {
        replaceWithTextNode(el, doc);
        return;
      }
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }

    if (tag === "CODE") {
      var className = el.getAttribute("class");
      if (className && !/^language-[a-z0-9_-]+$/i.test(className)) {
        el.removeAttribute("class");
      }
    }
  }

  function replaceWithTextNode(el, doc) {
    if (!el.parentNode) return;
    var text = doc.createTextNode(el.textContent || "");
    el.parentNode.replaceChild(text, el);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function addResponseCopyBtn(el, rawText) {
    var btn = document.createElement("button");
    btn.className = "gc-response-copy";
    btn.innerHTML = ICON_COPY_SM;
    btn.onclick = function () {
      navigator.clipboard
        .writeText(rawText)
        .then(function () {
          btn.innerHTML = ICON_CHECK_SM;
          setTimeout(function () {
            btn.innerHTML = ICON_COPY_SM;
          }, 1500);
        })
        .catch(function () {});
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
        navigator.clipboard
          .writeText(pre.textContent)
          .then(function () {
            btn.textContent = "Copied!";
            setTimeout(function () {
              btn.textContent = "Copy";
            }, 1500);
          })
          .catch(function () {});
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

    var resetBtn = document.createElement("button");
    resetBtn.id = "gc-reset";
    resetBtn.innerHTML = ICON_TRASH;
    resetBtn.onclick = resetChat;

    var closeBtn = document.createElement("button");
    closeBtn.id = "gc-close";
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.onclick = close;

    headerRight.appendChild(resetBtn);
    headerRight.appendChild(closeBtn);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    panel.appendChild(header);

    // Messages
    messagesEl = document.createElement("div");
    messagesEl.id = "gc-messages";
    var disc = document.createElement("div");
    disc.className = "gc-disclaimer";
    disc.textContent =
      "Responses are generated using AI and may contain mistakes. Model: Gemini Flash.";
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
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
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
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });

    // Recalculate panel width on resize
    window.addEventListener("resize", function () {
      if (panel.classList.contains("open")) updatePanelWidth();
    });
  }

  // ── Panel width — align with content right edge ────────────────────
  function updatePanelWidth() {
    var content =
      document.querySelector("#content-area") ||
      document.querySelector("#content") ||
      document.querySelector("article");
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
    try {
      localStorage.setItem("gc-closed", "1");
    } catch (_) {}
  }

  function resetChat() {
    if (isStreaming && abortCtrl) abortCtrl.abort();
    isStreaming = false;
    abortCtrl = null;
    messages = [];
    codeContexts = [];
    messagesEl.innerHTML = "";
    var disc = document.createElement("div");
    disc.className = "gc-disclaimer";
    disc.textContent =
      "Responses are generated using AI and may contain mistakes. Model: Gemini Flash.";
    messagesEl.appendChild(disc);
    renderChips();
    textarea.value = "";
    textarea.style.height = "auto";
    sendBtn.disabled = true;
    textarea.focus();
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
    btn.className =
      "flex items-center gap-1.5 whitespace-nowrap font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 border border-current rounded-lg py-1.5 px-3 text-sm";
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

  // ── Intercept native nav sparkle button ─────────────────────────────
  function interceptNavButtons() {
    document
      .querySelectorAll("#assistant-entry-mobile")
      .forEach(function (btn) {
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
    var copyBtns = document.querySelectorAll(
      '[data-testid="copy-code-button"]',
    );
    copyBtns.forEach(function (copyBtn) {
      // Find the actions container (copy button's parent's parent — the flex row)
      var actionsContainer =
        copyBtn.parentElement && copyBtn.parentElement.parentElement;
      if (!actionsContainer) return;
      // Skip if already injected in this container
      if (actionsContainer.querySelector("[data-gc-ask-ai]")) return;

      // Deep-clone the copy button's entire wrapper (includes tooltip)
      var copyWrapper = copyBtn.parentElement;
      var wrapper = copyWrapper.cloneNode(true);
      wrapper.setAttribute("data-gc-ask-ai", "true");

      // Clear cloned button content, reserve space, fade in icon
      var askBtn =
        wrapper.querySelector('[data-testid="copy-code-button"]') ||
        wrapper.querySelector("button");
      if (!askBtn) return;
      askBtn.removeAttribute("data-testid");
      askBtn.innerHTML = "";

      // Update tooltip text if present
      var tooltip = wrapper.querySelector(
        "[class*='tooltip'], [role='tooltip'], span:not(:empty)",
      );
      if (tooltip && tooltip !== askBtn) tooltip.textContent = "Ask AI";

      askBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Find nearest <pre> to extract code
        var pre =
          actionsContainer.closest("pre") ||
          (actionsContainer.parentElement &&
            actionsContainer.parentElement.querySelector("pre"));
        if (!pre) {
          // Walk up to find code block container, then find pre within
          var codeBlock =
            actionsContainer.closest("[class*='code']") ||
            actionsContainer.closest("div");
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
    pageChip.innerHTML =
      '<span class="gc-chip-icon">' +
      ICON_PAGE +
      '</span><span class="gc-chip-text">' +
      escapeHtml(truncPath) +
      "</span>";
    chipContainer.appendChild(pageChip);

    // Code chips
    for (var i = 0; i < codeContexts.length; i++) {
      (function (idx) {
        var ctx = codeContexts[idx];
        var truncText = ctx.text.replace(/\s+/g, " ").trim();
        truncText =
          truncText.length > 40 ? truncText.slice(0, 40) + "\u2026" : truncText;

        var chip = document.createElement("div");
        chip.className = "gc-chip gc-chip-code";
        chip.innerHTML =
          '<span class="gc-chip-icon">' +
          ICON_CODE +
          '</span><span class="gc-chip-text">' +
          escapeHtml(truncText) +
          "</span>";

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
    var value = String(str == null ? "" : str);
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildContextPrefix(contexts) {
    var prefix = "";
    var path = window.location.pathname;
    if (path && path !== "/") {
      prefix += "Current page: " + path + "\n";
    }
    for (var i = 0; i < contexts.length; i++) {
      prefix += "Additional context:\n```\n" + contexts[i].text + "\n```\n";
    }
    return prefix;
  }

  function clearSentCodeContexts(sentContexts) {
    if (!sentContexts || sentContexts.length === 0) return;
    codeContexts = codeContexts.filter(function (ctx) {
      return sentContexts.indexOf(ctx) === -1;
    });
    renderChips();
  }

  function parseSSEDelta(line) {
    if (!line.startsWith("data: ")) return "";
    var data = line.slice(6);
    if (data === "[DONE]") return "";
    try {
      var parsed = JSON.parse(data);
      var delta =
        parsed.choices &&
        parsed.choices[0] &&
        parsed.choices[0].delta &&
        parsed.choices[0].delta.content;
      return typeof delta === "string" ? delta : "";
    } catch (_) {
      return "";
    }
  }

  function consumeSSEBuffer(buffer, isFinal, onDelta) {
    var lines = buffer.split("\n");
    var remainder = "";
    if (!isFinal) {
      remainder = lines.pop() || "";
    }
    for (var i = 0; i < lines.length; i++) {
      var delta = parseSSEDelta(lines[i].trim());
      if (delta) onDelta(delta);
    }
    return remainder;
  }

  // ── Send message ────────────────────────────────────────────────────
  function send() {
    if (isStreaming) return;
    var text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";
    textarea.style.height = "auto";
    sendBtn.disabled = true;

    var contextsSnapshot = codeContexts.slice();
    var contextPrefix = buildContextPrefix(contextsSnapshot);
    streamResponse(text, contextPrefix, contextsSnapshot);
  }

  // ── Stream ──────────────────────────────────────────────────────────
  async function streamResponse(userText, contextPrefix, contextsSnapshot) {
    isStreaming = true;
    var STREAM_RENDER_INTERVAL_MS = 33;
    var lastRenderAt = 0;
    var renderTimer = null;
    var pendingRender = false;

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
    var apiMessages = messages.map(function (m) {
      return { role: m.role, content: m.content };
    });
    if (contextPrefix) {
      var last = apiMessages.length - 1;
      apiMessages[last] = {
        role: "user",
        content: contextPrefix + "\n" + userText,
      };
    }

    var content = "";
    abortCtrl = new AbortController();

    try {
      var resp = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, stream: true }),
        signal: abortCtrl.signal,
      });
      if (!resp.ok) {
        var e;
        try {
          e = await resp.json();
        } catch (_) {
          e = {};
        }
        throw new Error(e.message || "Request failed (" + resp.status + ")");
      }
      if (!resp.body) {
        throw new Error("AI service returned an empty response.");
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      function renderAssistantNow() {
        pendingRender = false;
        renderTimer = null;
        assistDiv.innerHTML = md(content);
        assistDiv.classList.add("gc-cursor");
        addCopyBtns(assistDiv);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        lastRenderAt = Date.now();
      }

      function scheduleAssistantRender() {
        pendingRender = true;
        var now = Date.now();
        var elapsed = now - lastRenderAt;
        if (elapsed >= STREAM_RENDER_INTERVAL_MS) {
          if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = null;
          }
          renderAssistantNow();
          return;
        }
        if (renderTimer) return;
        renderTimer = setTimeout(function () {
          if (!pendingRender) {
            renderTimer = null;
            return;
          }
          renderAssistantNow();
        }, STREAM_RENDER_INTERVAL_MS - elapsed);
      }

      function onDelta(delta) {
        content += delta;
        scheduleAssistantRender();
      }

      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        buffer = consumeSSEBuffer(buffer, false, onDelta);
      }
      buffer += decoder.decode();
      consumeSSEBuffer(buffer, true, onDelta);
      if (pendingRender) {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        renderAssistantNow();
      }

      assistDiv.classList.remove("gc-cursor");
      assistDiv.innerHTML = md(content);
      addCopyBtns(assistDiv);
      addResponseCopyBtn(assistDiv, content);
      messages.push({ role: "assistant", content: content });
      clearSentCodeContexts(contextsSnapshot);
    } catch (err) {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      assistDiv.remove();
      if (err.name !== "AbortError") {
        var errDiv = document.createElement("div");
        errDiv.className = "gc-msg-error";
        errDiv.textContent = err.message || "Something went wrong.";
        messagesEl.appendChild(errDiv);
      }
      messages.pop();
    } finally {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
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
      if (!localStorage.getItem("gc-closed") && window.innerWidth > 1024)
        open();
    } catch (_) {}

    // MutationObserver for SPA nav (code blocks, intercepts, path changes)
    var obsTimer = null;
    new MutationObserver(function (muts) {
      if (
        !muts.some(function (m) {
          return m.addedNodes.length > 0;
        })
      )
        return;
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
