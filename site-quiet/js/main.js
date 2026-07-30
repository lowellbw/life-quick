// SRI-2030 — small progressive enhancements (no dependencies)

(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Three nav items are same-page anchors, so the menu must close on click
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") closeNav();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        closeNav();
        toggle.focus();
      }
    });
  }

  // Move the sidebar's current marker between sections as they scroll past.
  // Without JS the marker stays on the page-level link, which is still correct.
  //
  // The rule is "the last section whose top has crossed a line 30% down the
  // viewport". Because each section stays current until the next one crosses,
  // coverage is continuous — an observer band would leave the marker stranded
  // in the gaps between sections.
  var pageLink = nav && nav.querySelector("a[aria-current]");
  var targets = [];

  if (nav) {
    Array.prototype.forEach.call(nav.querySelectorAll('a[href*="#"]'), function (link) {
      var id = link.getAttribute("href").split("#")[1];
      var section = id && document.getElementById(id);
      if (section) targets.push({ link: link, section: section });
    });
  }

  if (pageLink && targets.length) {
    var queued = false;

    var sync = function () {
      queued = false;
      var line = window.innerHeight * 0.3;
      var active = pageLink;
      targets.forEach(function (t) {
        if (t.section.getBoundingClientRect().top <= line) active = t.link;
      });
      if (active.hasAttribute("aria-current")) return;
      Array.prototype.forEach.call(nav.querySelectorAll("a[aria-current]"), function (a) {
        a.removeAttribute("aria-current");
      });
      active.setAttribute("aria-current", active === pageLink ? "page" : "true");
    };

    var onScroll = function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(sync);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    sync();
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
