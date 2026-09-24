/**
 * The client-side script that ships INSIDE the generated HTML file.
 * Exported as a plain string (not compiled/bundled) because the viewer
 * itself must stay a single, dependency-free, vanilla-JS HTML file that
 * works when opened directly from disk - no build step, no server.
 */
export const CLIENT_SCRIPT = `
(function () {
  "use strict";

  var dataEl = document.getElementById("trace-data");
  var TRACE = JSON.parse(dataEl.textContent);
  var byId = {};
  var childrenOf = {};
  TRACE.spans.forEach(function (s) {
    byId[s.id] = s;
    var key = s.parentId === null ? "__root__" : s.parentId;
    if (!childrenOf[key]) childrenOf[key] = [];
    childrenOf[key].push(s.id);
  });

  function descendantIds(id) {
    var out = [];
    var queue = (childrenOf[id] || []).slice();
    while (queue.length) {
      var next = queue.shift();
      out.push(next);
      var kids = childrenOf[next];
      if (kids) queue = queue.concat(kids);
    }
    return out;
  }

  var rows = document.querySelectorAll(".row");
  var rowById = {};
  rows.forEach(function (row) {
    rowById[row.getAttribute("data-id")] = row;
  });

  function setCollapsed(id, collapsed) {
    var row = rowById[id];
    if (!row) return;
    var toggle = row.querySelector(".toggle");
    if (toggle) toggle.textContent = collapsed ? "\\u25B8" : "\\u25BE";
    row.classList.toggle("collapsed", collapsed);
    descendantIds(id).forEach(function (childId) {
      var childRow = rowById[childId];
      if (childRow) childRow.classList.toggle("hidden", collapsed);
    });
  }

  document.addEventListener("click", function (evt) {
    var toggle = evt.target.closest(".toggle");
    if (toggle) {
      evt.stopPropagation();
      var row = toggle.closest(".row");
      var id = row.getAttribute("data-id");
      var willCollapse = !row.classList.contains("collapsed");
      setCollapsed(id, willCollapse);
      return;
    }

    var row = evt.target.closest(".row");
    if (row) {
      selectRow(row.getAttribute("data-id"));
    }
  });

  var detailEl = document.getElementById("detail-panel");

  function selectRow(id) {
    rows.forEach(function (r) {
      r.classList.toggle("selected", r.getAttribute("data-id") === id);
    });
    var span = byId[id];
    if (!span || !detailEl) return;
    var durationMs = Math.max(0, span.endTime - span.startTime);
    var lines = [];
    lines.push("<h2>" + escapeHtml(span.name) + "</h2>");
    lines.push('<dl class="detail-fields">');
    lines.push("<dt>id</dt><dd>" + escapeHtml(String(span.id)) + "</dd>");
    lines.push("<dt>status</dt><dd class=\\"status-" + escapeHtml(span.status) + "\\">" + escapeHtml(span.status) + "</dd>");
    lines.push("<dt>start</dt><dd>" + escapeHtml(new Date(span.startTime).toISOString()) + "</dd>");
    lines.push("<dt>end</dt><dd>" + escapeHtml(new Date(span.endTime).toISOString()) + "</dd>");
    lines.push("<dt>duration</dt><dd>" + durationMs + "ms</dd>");
    lines.push("<dt>parent</dt><dd>" + (span.parentId ? escapeHtml(String(span.parentId)) : "(root)") + "</dd>");
    lines.push("</dl>");
    lines.push("<h3>Payload</h3>");
    lines.push("<pre>" + escapeHtml(JSON.stringify(span.metadata || {}, null, 2)) + "</pre>");
    detailEl.innerHTML = lines.join("\\n");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var expandAllBtn = document.getElementById("expand-all");
  var collapseAllBtn = document.getElementById("collapse-all");
  if (expandAllBtn) {
    expandAllBtn.addEventListener("click", function () {
      TRACE.spans.forEach(function (s) {
        if (childrenOf[s.id]) setCollapsed(s.id, false);
      });
    });
  }
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener("click", function () {
      TRACE.spans.forEach(function (s) {
        if (childrenOf[s.id]) setCollapsed(s.id, true);
      });
    });
  }

  if (TRACE.spans.length > 0) {
    selectRow(TRACE.spans[0].id);
  }
})();
`;
