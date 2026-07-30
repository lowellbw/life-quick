// Review-only version switcher.
//
// Injected into the preview copies of the three design versions by build.sh —
// it is NOT part of any of the deliverable sites in site/, site-quiet/ or
// site-briefing/.
//
// Figures out which version and which page it is showing from the URL, then
// renders a fixed bar linking to the same page in the other two versions. No
// per-page configuration, so adding a version means adding it to VERSIONS and
// to build.sh.

(function () {
  "use strict";

  var VERSIONS = [
    { slug: "compact",  label: "Compact" },
    { slug: "briefing", label: "Briefing" },
    { slug: "quiet",    label: "Quiet" },
    { slug: "bold",     label: "Bold" }
  ];

  var slugs = VERSIONS.map(function (v) { return v.slug; });

  // /briefing/people.html -> ["briefing", "people.html"]
  var parts = window.location.pathname.split("/").filter(Boolean);
  var file = "index.html";
  var current = null;

  for (var i = parts.length - 1; i >= 0; i--) {
    if (slugs.indexOf(parts[i]) !== -1) {
      current = parts[i];
      if (i + 1 < parts.length && /\.html?$/.test(parts[i + 1])) file = parts[i + 1];
      break;
    }
  }

  if (!current) return; // not inside a version folder — nothing to switch

  var css = [
    ".vsw{position:fixed;z-index:9999;left:50%;bottom:1rem;transform:translateX(-50%);",
    "display:flex;align-items:center;gap:.5rem;max-width:calc(100vw - 1.5rem);",
    "padding:.4rem .5rem .4rem .75rem;border-radius:2px;",
    "background:#0b2136;color:rgba(255,255,255,.72);",
    "box-shadow:0 6px 24px rgba(8,31,53,.28);",
    "font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}",
    ".vsw-l{white-space:nowrap;padding-right:.25rem}",
    ".vsw-o{display:flex;gap:2px;flex-wrap:wrap}",
    ".vsw a{display:block;padding:.45rem .7rem;border-radius:2px;color:rgba(255,255,255,.72);",
    "text-decoration:none;white-space:nowrap;transition:background .12s ease,color .12s ease}",
    ".vsw a:hover{background:rgba(255,255,255,.1);color:#fff}",
    ".vsw a[aria-current]{background:#ceff80;color:#0b2136}",
    ".vsw-x{border:0;background:none;color:rgba(255,255,255,.5);cursor:pointer;",
    "padding:.4rem .45rem;font:inherit;line-height:1}",
    ".vsw-x:hover{color:#fff}",
    "@media print{.vsw{display:none}}",
    "@media (max-width:520px){.vsw{left:.75rem;right:.75rem;transform:none;justify-content:center}",
    ".vsw-l{display:none}}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement("div");
  bar.className = "vsw";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Design version");

  var label = document.createElement("span");
  label.className = "vsw-l";
  label.textContent = "Version";
  bar.appendChild(label);

  var opts = document.createElement("div");
  opts.className = "vsw-o";

  VERSIONS.forEach(function (v) {
    var a = document.createElement("a");
    a.href = "../" + v.slug + "/" + file;
    a.textContent = v.label;
    if (v.slug === current) {
      a.setAttribute("aria-current", "true");
      a.setAttribute("aria-label", v.label + " (current version)");
    }
    opts.appendChild(a);
  });

  bar.appendChild(opts);

  var close = document.createElement("button");
  close.className = "vsw-x";
  close.type = "button";
  close.setAttribute("aria-label", "Hide version switcher");
  close.textContent = "×";
  close.addEventListener("click", function () { bar.remove(); });
  bar.appendChild(close);

  document.body.appendChild(bar);
})();
