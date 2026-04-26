(function () {
  var cfg = window.THOMAS_BUILDS_CONFIG || {};
  var client = null;
  var threadId = null;
  var realtimeChan = null;

  function el(id) {
    return document.getElementById(id);
  }

  function ready() {
    return !!(
      cfg.supabaseUrl &&
      cfg.supabaseAnonKey &&
      window.supabase &&
      typeof window.supabase.createClient === "function"
    );
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  async function ensureThread(uid) {
    var q = await client.from("threads").select("id").eq("visitor_id", uid).maybeSingle();
    if (q.error) return null;
    if (q.data && q.data.id) return q.data.id;
    var ins = await client.from("threads").insert({ visitor_id: uid }).select("id").single();
    if (!ins.error && ins.data && ins.data.id) return ins.data.id;
    var again = await client.from("threads").select("id").eq("visitor_id", uid).maybeSingle();
    if (again.data && again.data.id) return again.data.id;
    return null;
  }

  function clearPreviews() {
    var pv = el("chat-file-preview");
    if (!pv) return;
    pv.innerHTML = "";
    pv.hidden = true;
  }

  function wireFilePreview() {
    var fi = el("chat-files");
    var pv = el("chat-file-preview");
    if (!fi || !pv) return;
    fi.addEventListener("change", function () {
      pv.innerHTML = "";
      var files = fi.files;
      if (!files || !files.length) {
        pv.hidden = true;
        return;
      }
      pv.hidden = false;
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
            vid.playsInline = true;
            vid.src = URL.createObjectURL(file);
            li.appendChild(vid);
          } else {
            li.textContent = file.name;
          }
          pv.appendChild(li);
        })(files[i]);
      }
    });
  }

  async function signedUrlFor(path) {
    var r = await client.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 6);
    if (r.error || !r.data || !r.data.signedUrl) return null;
    return r.data.signedUrl;
  }

  async function bubbleNode(m, meId) {
    var wrap = document.createElement("div");
    wrap.className = "chat-bubble-wrap " + (m.author_id === meId ? "is-me" : "is-them");

    var lab = document.createElement("div");
    lab.className = "chat-bubble-label";
    lab.textContent = m.author_id === meId ? "You" : "Thomas";

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    var text = document.createElement("div");
    text.className = "chat-bubble__text";
    text.style.whiteSpace = "pre-wrap";
    text.textContent = m.body || "";
    bubble.appendChild(text);

    var att = m.attachments;
    if (typeof att === "string") {
      try {
        att = JSON.parse(att);
      } catch (e) {
        att = [];
      }
    }
    if (!att || !att.length) att = [];

    for (var j = 0; j < att.length; j++) {
      var a = att[j];
      if (!a || !a.path) continue;
      var url = await signedUrlFor(a.path);
      if (!url) continue;
      var mime = a.mime || "";
      if (mime.indexOf("image/") === 0) {
        var img = document.createElement("img");
        img.className = "chat-bubble__media";
        img.src = url;
        img.alt = a.name || "";
        bubble.appendChild(img);
      } else if (mime.indexOf("video/") === 0) {
        var v = document.createElement("video");
        v.className = "chat-bubble__media";
        v.controls = true;
        v.src = url;
        bubble.appendChild(v);
      } else {
        var link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = a.name || "Download";
        bubble.appendChild(link);
      }
    }

    var time = document.createElement("time");
    time.className = "chat-bubble__time";
    time.setAttribute("datetime", m.created_at || "");
    time.textContent = formatTime(m.created_at);
    bubble.appendChild(time);

    wrap.appendChild(lab);
    wrap.appendChild(bubble);
    return wrap;
  }

  async function renderMessages(rows, meId) {
    var stream = el("chat-stream");
    if (!stream) return;
    stream.innerHTML = "";
    if (!rows || !rows.length) {
      var hint = document.createElement("p");
      hint.className = "chat-empty-hint";
      hint.textContent =
        "No messages on this device yet — type below and tap Send. Each browser/device has its own thread.";
      stream.appendChild(hint);
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      stream.appendChild(await bubbleNode(rows[i], meId));
    }
    stream.scrollTop = stream.scrollHeight;
  }

  async function loadMessages() {
    if (!client || !threadId) return;
    var me = (await client.auth.getUser()).data.user;
    if (!me) return;
    var res = await client
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (res.error) return;
    await renderMessages(res.data || [], me.id);
    await refreshClosureHint();
  }

  function subscribeRealtime() {
    if (!client || !threadId) return;
    if (realtimeChan) {
      client.removeChannel(realtimeChan);
      realtimeChan = null;
    }
    var filt = "thread_id=eq." + threadId;
    realtimeChan = client
      .channel("thread:" + threadId + ":v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: filt },
        function () {
          loadMessages();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_closure_requests", filter: filt },
        function () {
          refreshClosureHint();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "thread_closure_requests", filter: filt },
        function () {
          refreshClosureHint();
        }
      )
      .subscribe();
  }

  async function refreshClosureHint() {
    var hint = el("chat-closure-hint");
    if (!hint || !threadId || !client) return;
    var r = await client
      .from("thread_closure_requests")
      .select("id,status,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false });
    if (r.error) {
      hint.hidden = true;
      return;
    }
    var rows = r.data || [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].status === "pending") {
        hint.hidden = false;
        hint.textContent =
          "Thomas was asked to close this chat. They can approve or decline when they see it.";
        hint.className = "chat-status chat-status--closure chat-status--warn";
        return;
      }
    }
    for (i = 0; i < rows.length; i++) {
      if (rows[i].status === "declined") {
        hint.hidden = false;
        hint.textContent = "Thomas declined the close request. You can keep messaging.";
        hint.className = "chat-status chat-status--closure";
        return;
      }
    }
    hint.hidden = true;
  }

  async function onSend(e) {
    e.preventDefault();
    var status = el("chat-status");
    var bodyEl = el("chat-body");
    var filesEl = el("chat-files");
    if (!client || !threadId || !bodyEl || !filesEl) return;

    var nickEl = el("chat-nick");
    var nick = nickEl ? nickEl.value.trim() : "";
    var body = bodyEl.value.trim();
    var files = filesEl.files;

    if (!body && (!files || !files.length)) return;

    if (nick) {
      try {
        localStorage.setItem("thomas_chat_nick", nick);
      } catch (x) {}
      body = "[" + nick + "]\n\n" + body;
    } else {
      var saved = "";
      try {
        saved = localStorage.getItem("thomas_chat_nick") || "";
      } catch (x) {}
      if (saved) body = "[" + saved + "]\n\n" + body;
    }

    var uid = (await client.auth.getUser()).data.user.id;
    var attachments = [];

    if (files && files.length) {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 100);
        var path = uid + "/" + threadId + "/" + Date.now() + "_" + i + "_" + safe;
        var up = await client.storage.from("chat-media").upload(path, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false
        });
        if (!up.error) {
          attachments.push({
            path: path,
            mime: f.type || "application/octet-stream",
            name: f.name
          });
        }
      }
    }

    var ins = await client.from("messages").insert({
      thread_id: threadId,
      author_id: uid,
      body: body,
      attachments: attachments
    });

    if (ins.error) {
      if (status) {
        status.textContent = "Could not send: " + ins.error.message;
        status.className = "chat-status chat-status--error";
      }
      return;
    }

    bodyEl.value = "";
    filesEl.value = "";
    clearPreviews();
    if (status) {
      status.className = "chat-status chat-status--ok";
    }
    await loadMessages();
    await refreshClosureHint();
  }

  async function boot() {
    var stream = el("chat-stream");
    var status = el("chat-status");
    if (!stream || !status) return;

    if (!ready()) {
      status.textContent =
        "Private chat will appear here after you paste supabaseUrl + supabaseAnonKey from Supabase into site-config.js (see SETUP-SUPABASE.txt). Social buttons above still work.";
      status.className = "chat-status chat-status--warn";
      return;
    }

    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "thomas_builds_visitor_auth"
      }
    });

    status.textContent = "Starting a private thread…";
    status.className = "chat-status";

    var anon = await client.auth.signInAnonymously();
    if (anon.error) {
      status.textContent =
        "Could not start chat: " + anon.error.message + " — In Supabase: Authentication → Providers → turn on Anonymous sign-ins.";
      status.className = "chat-status chat-status--error";
      return;
    }

    var uid = anon.data.user.id;
    var tid = await ensureThread(uid);
    if (!tid) {
      status.textContent = "Could not create a conversation. Check database policies in SETUP-SUPABASE.txt.";
      status.className = "chat-status chat-status--error";
      return;
    }

    threadId = tid;
    status.textContent =
      "You are messaging Thomas inside this site. Use your normal emoji keyboard, and attach photos or short videos.";
    status.className = "chat-status chat-status--ok";

    try {
      var nk = localStorage.getItem("thomas_chat_nick");
      var nickInput = el("chat-nick");
      if (nickInput && nk) nickInput.value = nk;
    } catch (x) {}

    wireFilePreview();
    var form = el("chat-composer");
    if (form) form.addEventListener("submit", onSend);

    var reqBtn = el("chat-request-close");
    if (reqBtn) {
      reqBtn.addEventListener("click", async function () {
        if (!threadId || !client) return;
        var status = el("chat-status");
        var ins = await client.from("thread_closure_requests").insert({
          thread_id: threadId,
          status: "pending"
        });
        if (ins.error) {
          var msg = ins.error.message || "";
          if (status) {
            if (msg.indexOf("duplicate") >= 0 || ins.error.code === "23505") {
              status.textContent = "You already have a pending close request for this chat.";
            } else {
              status.textContent =
                msg + " — Thomas must run ADD-CLOSURE-REQUESTS-SQL.txt in Supabase.";
            }
            status.className = "chat-status chat-status--error";
          }
          return;
        }
        if (status) {
          status.textContent = "Request sent — Thomas can approve or decline when they see it.";
          status.className = "chat-status chat-status--ok";
        }
        await refreshClosureHint();
      });
    }

    await loadMessages();
    await refreshClosureHint();
    subscribeRealtime();

    client.auth.onAuthStateChange(function () {
      loadMessages();
      refreshClosureHint();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
