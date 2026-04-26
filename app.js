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

  function initHeader() {
    var logo = $("#logo-home");
    if (logo) {
      logo.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    var open = $("#open-chat");
    var close = $("#close-chat");
    var drawer = $("#chat-drawer");
    var scrim = $("#drawer-scrim");
    var dd = $("#drawer-discord");
    if (dd && cfg.discordInvite) dd.href = cfg.discordInvite;
    function setOpen(on) {
      if (!drawer || !scrim) return;
      drawer.hidden = !on;
      scrim.hidden = !on;
      drawer.setAttribute("aria-hidden", on ? "false" : "true");
      if (open) open.setAttribute("aria-expanded", on ? "true" : "false");
    }
    if (open) open.addEventListener("click", function () { setOpen(true); });
    if (close) close.addEventListener("click", function () { setOpen(false); });
    if (scrim) scrim.addEventListener("click", function () { setOpen(false); });
  }

  function renderSocial() {
    var ul = $("#social-list");
    if (!ul) return;
    var items = [
      { key: "discord", label: "Discord", url: cfg.discordInvite },
      { key: "tiktok", label: "TikTok", url: cfg.tiktokUrl },
      { key: "youtube", label: "YouTube", url: cfg.youtubeUrl },
      { key: "roblox", label: "Roblox", url: cfg.robloxUrl },
      { key: "instagram", label: "Instagram", url: cfg.instagramUrl }
    ];
    ul.innerHTML = "";
    items.forEach(function (item) {
      var li = document.createElement("li");
      if (!item.url) li.className = "muted";
      var a = document.createElement("a");
      a.href = item.url || "#social";
      a.textContent = item.label;
      if (item.url) a.target = "_blank";
      a.rel = "noopener noreferrer";
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

  function initMessageForm() {
    var form = $("#message-form");
    var filesInput = $("#message-files");
    var preview = $("#file-preview");
    if (!form) return;

    function clearPreview() {
      if (!preview) return;
      preview.innerHTML = "";
      preview.hidden = true;
    }

    if (filesInput && preview) {
      filesInput.addEventListener("change", function () {
        clearPreview();
        var files = filesInput.files;
        if (!files || !files.length) return;
        preview.hidden = false;
        for (var i = 0; i < files.length; i++) {
          (function (file) {
            var li = document.createElement("li");
            if (file.type.indexOf("image/") === 0) {
              var img = document.createElement("img");
              img.alt = "";
              img.src = URL.createObjectURL(file);
              li.appendChild(img);
            } else if (file.type.indexOf("video/") === 0) {
              var vid = document.createElement("video");
              vid.muted = true;
              vid.src = URL.createObjectURL(file);
              vid.playsInline = true;
              li.appendChild(vid);
            } else {
              li.textContent = file.name;
            }
            preview.appendChild(li);
          })(files[i]);
        }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var name = (fd.get("name") || "").toString().trim();
      var body = (fd.get("body") || "").toString().trim();
      var draft =
        (name ? "From: " + name + "\n\n" : "") +
        body +
        "\n\n— Sent from Thomas Builds site";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(draft).catch(function () {});
      }
      var note = $("#form-note");
      if (note) {
        note.textContent =
          "Draft copied to clipboard. Discord opens next — paste there. For images/videos, attach them in Discord after you paste the text (browser security blocks auto-upload).";
      }
      if (cfg.discordInvite) {
        window.open(cfg.discordInvite, "_blank", "noopener,noreferrer");
      } else {
        alert("Set discordInvite in site-config.js to your server or user link.");
      }
    });
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
  initMessageForm();
  applyBranding();
  loadBuilds();
})();
