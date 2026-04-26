(function () {
  var CATEGORIES = [
    { slug: "cutecore", label: "Cutecore" },
    { slug: "dark", label: "Dark" },
    { slug: "nature-and-cozy", label: "Nature & Cozy" },
    { slug: "modern-and-luxury", label: "Modern & Luxury" },
    { slug: "magical-and-fantasy", label: "Magical & Fantasy" },
    { slug: "seasonal", label: "Seasonal" },
    { slug: "detailed", label: "Detailed" },
    { slug: "fandom", label: "Fandom" },
    { slug: "other", label: "Other" }
  ];

  var cfg = window.THOMAS_BUILDS_CONFIG || {};
  var STORAGE_DEVICE = "thomas_builds_device_v1";
  var STORAGE_MODAL = "thomas_builds_device_modal_v1";

  function $(sel) {
    return document.querySelector(sel);
  }

  function setDeviceClass(device) {
    document.body.classList.remove("device-mobile", "device-tablet", "device-desktop");
    if (device === "mobile" || device === "tablet" || device === "desktop") {
      document.body.classList.add("device-" + device);
    }
    var label = $("#device-label");
    if (label) {
      label.textContent =
        device === "mobile" ? "Mobile" : device === "tablet" ? "Tablet" : device === "desktop" ? "Desktop" : "Auto";
    }
  }

  function closeDeviceModal() {
    var m = $("#device-modal");
    if (m) {
      m.hidden = true;
    }
  }

  function openDeviceModal() {
    var m = $("#device-modal");
    if (m) {
      m.hidden = false;
    }
  }

  function initDevicePrompt() {
    var seen = localStorage.getItem(STORAGE_MODAL);
    if (!seen) {
      openDeviceModal();
    }
    var saved = localStorage.getItem(STORAGE_DEVICE);
    if (saved === "mobile" || saved === "tablet" || saved === "desktop") {
      setDeviceClass(saved);
    }
    function pick(device) {
      if (device === "skip") {
        localStorage.setItem(STORAGE_MODAL, "1");
        closeDeviceModal();
        return;
      }
      localStorage.setItem(STORAGE_DEVICE, device);
      localStorage.setItem(STORAGE_MODAL, "1");
      setDeviceClass(device);
      closeDeviceModal();
    }
    document.querySelectorAll("[data-device]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pick(btn.getAttribute("data-device"));
      });
    });
    var skip = $("#device-skip");
    if (skip) skip.addEventListener("click", function () { pick("skip"); });
    var fd = $("#footer-device");
    if (fd) {
      fd.addEventListener("click", function () {
        openDeviceModal();
      });
    }
  }

  function goMessages() {
    var msg = document.getElementById("message");
    if (msg) msg.scrollIntoView({ behavior: "smooth" });
    setTimeout(function () {
      var ta = document.getElementById("chat-body");
      if (ta) ta.focus();
    }, 450);
  }

  function initHeader() {
    var logo = $("#logo-home");
    if (logo) {
      logo.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    var open = $("#open-chat");
    if (open) {
      open.addEventListener("click", function () {
        goMessages();
      });
    }
  }

  function renderSocial() {
    var ul = $("#social-list");
    if (!ul) return;
    var items = [
      { label: "Discord", url: cfg.discordUrl, icon: "✦" },
      { label: "TikTok", url: cfg.tiktokUrl, icon: "♪" },
      { label: "YouTube", url: cfg.youtubeUrl, icon: "▶" },
      { label: "Roblox", url: cfg.robloxUrl, icon: "◇" },
      { label: "Instagram", url: cfg.instagramUrl, icon: "◎" },
      { label: "X", url: cfg.twitterUrl, icon: "𝕏" }
    ];
    if (cfg.contactEmail) {
      items.push({
        label: "Email",
        url: "mailto:" + String(cfg.contactEmail).replace(/^mailto:/i, ""),
        icon: "✉"
      });
    }
    ul.innerHTML = "";
    items.forEach(function (item) {
      var li = document.createElement("li");
      if (!item.url) li.className = "muted";
      var a = document.createElement("a");
      a.href = item.url || "#social";
      a.className = "social-btn";
      if (item.url) a.target = "_blank";
      a.rel = "noopener noreferrer";
      var ic = document.createElement("span");
      ic.className = "social-btn__ic";
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = item.icon;
      var tx = document.createElement("span");
      tx.className = "social-btn__tx";
      tx.textContent = item.label;
      a.appendChild(ic);
      a.appendChild(tx);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function cardHtml(b) {
    var badges = "";
    if (b.featured) badges += '<span class="badge badge--featured">Featured</span>';
    if (b.isNew) badges += '<span class="badge badge--new">New</span>';
    var mediaInner = "";
    if (b.videoUrl) {
      mediaInner =
        '<video src="' +
        escapeAttr(b.videoUrl) +
        '" muted loop playsinline controls preload="metadata"></video>';
    } else if (b.thumbnailUrl) {
      mediaInner = '<img src="' + escapeAttr(b.thumbnailUrl) + '" alt="" loading="lazy" />';
    } else {
      mediaInner = "<span>Add videoUrl or thumbnailUrl in builds.json</span>";
    }
    var tags = "";
    if (b.tags && b.tags.length) {
      tags =
        '<ul class="build-card__tags">' +
        b.tags.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") +
        "</ul>";
    }
    return (
      '<article class="build-card">' +
      (badges ? '<div class="build-card__badges">' + badges + "</div>" : "") +
      '<div class="build-card__media">' +
      mediaInner +
      "</div>" +
      '<div class="build-card__body">' +
      '<h3 class="build-card__title">' +
      escapeHtml(b.title) +
      "</h3>" +
      '<p class="build-card__meta"><strong>House type:</strong> ' +
      escapeHtml(b.houseType) +
      "</p>" +
      tags +
      '<div class="build-card__foot">' +
      '<span class="cost-pill">' +
      escapeHtml(b.cost) +
      "</span>" +
      (b.videoUrl
        ? '<a class="btn btn--small btn--primary" href="' +
          escapeAttr(b.videoUrl) +
          '" target="_blank" rel="noopener">Open video</a>'
        : "") +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  var state = { builds: [], active: "cutecore" };

  function renderTabs() {
    var host = document.querySelector(".tabs");
    if (!host) return;
    host.innerHTML = "";
    CATEGORIES.forEach(function (cat, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", cat.slug === state.active ? "true" : "false");
      btn.id = "tab-" + cat.slug;
      btn.textContent = cat.label;
      btn.addEventListener("click", function () {
        state.active = cat.slug;
        renderTabs();
        renderGrid();
      });
      host.appendChild(btn);
    });
  }

  function renderGrid() {
    var grid = $("#build-grid");
    var empty = $("#empty-hint");
    if (!grid) return;
    var list = state.builds.filter(function (b) { return b.category === state.active; });
    if (!list.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = list.map(cardHtml).join("");
    grid.querySelectorAll("video").forEach(function (v) {
      v.addEventListener("mouseenter", function () {
        v.play().catch(function () {});
      });
      v.addEventListener("mouseleave", function () {
        v.pause();
        try {
          v.currentTime = 0;
        } catch (e) {}
      });
    });
  }

  function loadBuilds() {
    return fetch("builds.json", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        state.builds = Array.isArray(data) ? data : [];
        renderTabs();
        renderGrid();
      })
      .catch(function () {
        state.builds = [];
        renderTabs();
        renderGrid();
      });
  }

  function applyHeroVideo() {
    var host = document.getElementById("hero-video-host");
    if (!host) return;
    host.innerHTML = "";
    if (!cfg.heroVideoUrl) return;
    var v = document.createElement("video");
    v.className = "hero__bg-video";
    v.setAttribute("autoplay", "");
    v.setAttribute("muted", "");
    v.setAttribute("loop", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("preload", "metadata");
    v.setAttribute("aria-hidden", "true");
    var s = document.createElement("source");
    s.src = cfg.heroVideoUrl;
    s.type = "video/mp4";
    v.appendChild(s);
    host.appendChild(v);
    v.play().catch(function () {});
  }

  function applyBranding() {
    if (cfg.siteName) {
      var logo = $("#logo-home");
      if (logo) logo.textContent = cfg.siteName;
      document.title = cfg.siteName;
      var fb = document.querySelector(".footer-brand");
      if (fb) fb.textContent = cfg.siteName;
    }
  }

  initDevicePrompt();
  initHeader();
  renderSocial();
  applyBranding();
  applyHeroVideo();
  loadBuilds();
})();
