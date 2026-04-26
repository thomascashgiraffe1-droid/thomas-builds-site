(function () {
  var cfg = window.THOMAS_BUILDS_CONFIG || {};
  var client = null;
  var activeThread = null;
  var globalChan = null;
  var ownerUserId = null;
  var pendingClosureRequestId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function log(msg) {
    var n = $("own-log");
    if (n) n.textContent = msg || "";
  }

  function ready() {
    return !!(
      cfg.supabaseUrl &&
      cfg.supabaseAnonKey &&
      window.supabase &&
      typeof window.supabase.createClient === "function"
    );
  }

  async function isOwner() {
    var u = await client.auth.getUser();
    if (!u.data.user) return false;
    ownerUserId = u.data.user.id;
    var r = await client.from("profiles").select("is_owner").eq("id", ownerUserId).maybeSingle();
    if (r.error || !r.data) return false;
    return !!r.data.is_owner;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  async function signedUrl(path) {
    var r = await client.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 6);
    if (r.error || !r.data || !r.data.signedUrl) return null;
    return r.data.signedUrl;
  }

  async function lineBubble(m, meId) {
    var wrap = document.createElement("div");
    wrap.className = "chat-bubble-wrap " + (m.author_id === meId ? "is-me" : "is-them");
    var lab = document.createElement("div");
    lab.className = "chat-bubble-label";
    lab.textContent = m.author_id === meId ? "You" : "Visitor";
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
    if (!att) att = [];
    for (var j = 0; j < att.length; j++) {
      var a = att[j];
      if (!a || !a.path) continue;
      var url = await signedUrl(a.path);
      if (!url) continue;
      if ((a.mime || "").indexOf("image/") === 0) {
        var img = document.createElement("img");
        img.className = "chat-bubble__media";
        img.src = url;
        img.alt = "";
        bubble.appendChild(img);
      } else if ((a.mime || "").indexOf("video/") === 0) {
        var v = document.createElement("video");
        v.className = "chat-bubble__media";
        v.controls = true;
        v.src = url;
        bubble.appendChild(v);
      }
    }
    var time = document.createElement("time");
    time.className = "chat-bubble__time";
    time.textContent = formatTime(m.created_at);
    bubble.appendChild(time);
    wrap.appendChild(lab);
    wrap.appendChild(bubble);
    return wrap;
  }

  async function loadThreadMessages(tid) {
    var stream = $("own-stream");
    if (!stream) return;
    stream.innerHTML = "Loading…";
    var me = (await client.auth.getUser()).data.user.id;
    var res = await client
      .from("messages")
      .select("*")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    if (res.error) {
      stream.textContent = res.error.message;
      await refreshClosureBar(tid);
      return;
    }
    stream.innerHTML = "";
    for (var i = 0; i < (res.data || []).length; i++) {
      stream.appendChild(await lineBubble(res.data[i], me));
    }
    stream.scrollTop = stream.scrollHeight;
    await refreshClosureBar(tid);
  }

  async function refreshClosureBar(tid) {
    var bar = $("own-closure-bar");
    pendingClosureRequestId = null;
    if (!bar || !client || !tid) {
      if (bar) bar.hidden = true;
      return;
    }
    var r = await client
      .from("thread_closure_requests")
      .select("id")
      .eq("thread_id", tid)
      .eq("status", "pending")
      .maybeSingle();
    if (r.error || !r.data || !r.data.id) {
      bar.hidden = true;
      return;
    }
    pendingClosureRequestId = r.data.id;
    bar.hidden = false;
  }

  async function purgeThreadStorage(tid) {
    var res = await client.from("messages").select("attachments").eq("thread_id", tid);
    if (res.error) return;
    var paths = [];
    (res.data || []).forEach(function (row) {
      var att = row.attachments;
      if (typeof att === "string") {
        try {
          att = JSON.parse(att);
        } catch (e) {
          att = [];
        }
      }
      if (!att || !att.length) return;
      for (var i = 0; i < att.length; i++) {
        if (att[i] && att[i].path) paths.push(att[i].path);
      }
    });
    if (paths.length) {
      await client.storage.from("chat-media").remove(paths);
    }
  }

  async function performDeleteThread(tid) {
    if (!tid || !client) return false;
    log("Deleting…");
    await purgeThreadStorage(tid);
    var del = await client.from("threads").delete().eq("id", tid);
    if (del.error) {
      log(del.error.message + " — Run ADD-DELETE-CHAT-SQL.txt in Supabase if you have not yet.");
      return false;
    }
    activeThread = null;
    pendingClosureRequestId = null;
    var bar = $("own-closure-bar");
    if (bar) bar.hidden = true;
    var stream = $("own-stream");
    if (stream) {
      stream.innerHTML = "";
      var p = document.createElement("p");
      p.className = "chat-empty-hint";
      p.textContent = "Thread deleted. Pick another thread or refresh.";
      stream.appendChild(p);
    }
    log("Thread deleted.");
    await loadThreads();
    return true;
  }

  async function deleteActiveThread() {
    if (!activeThread || !client) return;
    if (!confirm("Delete this whole conversation for you and the visitor? This cannot be undone.")) return;
    await performDeleteThread(activeThread);
  }

  async function loadThreads() {
    var host = $("own-thread-list");
    if (!host) return;
    host.innerHTML = "Loading…";
    var res = await client.from("threads").select("id, visitor_id, created_at").order("created_at", { ascending: false });
    if (res.error) {
      host.textContent = res.error.message;
      return;
    }
    var pendRes = await client.from("thread_closure_requests").select("thread_id").eq("status", "pending");
    var pendSet = {};
    if (!pendRes.error && pendRes.data) {
      pendRes.data.forEach(function (row) {
        if (row.thread_id) pendSet[row.thread_id] = true;
      });
    }
    host.innerHTML = "";
    (res.data || []).forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "thread-row" + (activeThread === t.id ? " is-active" : "");
      var label = "Thread " + String(t.id).slice(0, 8) + "… · " + new Date(t.created_at).toLocaleString();
      if (pendSet[t.id]) label += " · close requested";
      b.textContent = label;
      b.addEventListener("click", async function () {
        activeThread = t.id;
        Array.prototype.forEach.call(host.querySelectorAll(".thread-row"), function (x) {
          x.classList.remove("is-active");
        });
        b.classList.add("is-active");
        await loadThreadMessages(t.id);
      });
      host.appendChild(b);
    });
    if (!(res.data || []).length) host.textContent = "No threads yet.";
  }

  function maybeNotifyClosure(row) {
    if (!row || row.status !== "pending") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      new Notification("Close chat requested", {
        body: "A visitor asked to close a thread.",
        tag: "closure-" + String(row.thread_id || row.id)
      });
    } catch (e) {}
  }

  function maybeNotify(row) {
    if (!row || row.author_id === ownerUserId) return;
    var body = (row.body || "").toString().replace(/\s+/g, " ").trim();
    var preview = body.length > 120 ? body.slice(0, 117) + "…" : body || "New attachment";
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      new Notification("New site message", { body: preview, tag: String(row.thread_id || row.id) });
    } catch (e) {}
  }

  function subscribeGlobal() {
    if (globalChan) {
      client.removeChannel(globalChan);
      globalChan = null;
    }
    globalChan = client
      .channel("owner-global-msgs-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async function (payload) {
          var row = payload.new;
          if (!row) return;
          maybeNotify(row);
          await loadThreads();
          if (activeThread && row.thread_id === activeThread) {
            await loadThreadMessages(activeThread);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_closure_requests" },
        async function (payload) {
          var row = payload.new;
          if (!row) return;
          maybeNotifyClosure(row);
          await loadThreads();
          if (activeThread && row.thread_id === activeThread) {
            await loadThreadMessages(activeThread);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "thread_closure_requests" },
        async function (payload) {
          var row = payload.new;
          if (!row) return;
          await loadThreads();
          if (activeThread && row.thread_id === activeThread) {
            await loadThreadMessages(activeThread);
          }
        }
      )
      .subscribe();
  }

  async function afterAuth() {
    var ok = await isOwner();
    if (!ok) {
      log("This account is not owner (profiles.is_owner = true). Run the SQL in SETUP-SUPABASE.txt part C.");
      $("own-app").hidden = true;
      $("own-login").hidden = false;
      return;
    }
    $("own-login").hidden = true;
    $("own-app").hidden = false;
    log("");
    await loadThreads();
    subscribeGlobal();
  }

  async function boot() {
    if (!ready()) return;

    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "thomas_builds_owner_auth"
      }
    });

    var sess = await client.auth.getSession();
    if (sess.data.session) {
      await afterAuth();
    }

    var sp = $("own-signin-pass");
    if (sp) {
      sp.addEventListener("click", async function () {
        var email = $("own-email").value.trim();
        var password = $("own-pass").value;
        if (!email || !password) {
          log("Enter email and password.");
          return;
        }
        var res = await client.auth.signInWithPassword({ email: email, password: password });
        if (res.error) {
          log(res.error.message);
          return;
        }
        await afterAuth();
      });
    }

    var so = $("own-signin-otp");
    if (so) {
      so.addEventListener("click", async function () {
        var email = $("own-email").value.trim();
        if (!email) {
          log("Enter your email.");
          return;
        }
        var redir = window.location.origin + "/owner.html";
        var res = await client.auth.signInWithOtp({
          email: email,
          options: { emailRedirectTo: redir }
        });
        if (res.error) {
          log(res.error.message);
          return;
        }
        log("Check your email — the link opens your private owner.html page.");
      });
    }

    var out = $("own-signout");
    if (out) {
      out.addEventListener("click", async function () {
        if (globalChan) {
          client.removeChannel(globalChan);
          globalChan = null;
        }
        await client.auth.signOut();
        activeThread = null;
        ownerUserId = null;
        $("own-app").hidden = true;
        $("own-login").hidden = false;
        log("Signed out.");
      });
    }

    var rep = $("own-reply");
    if (rep) {
      rep.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!activeThread) {
          log("Pick a thread first.");
          return;
        }
        var body = $("own-body").value.trim();
        if (!body) return;
        var uid = (await client.auth.getUser()).data.user.id;
        var ins = await client.from("messages").insert({
          thread_id: activeThread,
          author_id: uid,
          body: body,
          attachments: []
        });
        if (ins.error) {
          log(ins.error.message);
          return;
        }
        $("own-body").value = "";
        await loadThreadMessages(activeThread);
      });
    }

    var delBtn = $("own-delete-thread");
    if (delBtn) {
      delBtn.addEventListener("click", function () {
        deleteActiveThread();
      });
    }

    var appr = $("own-approve-close");
    if (appr) {
      appr.addEventListener("click", async function () {
        if (!activeThread || !pendingClosureRequestId) return;
        if (!confirm("Approve the visitor's request and delete this chat permanently?")) return;
        await performDeleteThread(activeThread);
      });
    }

    var dec = $("own-decline-close");
    if (dec) {
      dec.addEventListener("click", async function () {
        if (!pendingClosureRequestId) return;
        var upd = await client
          .from("thread_closure_requests")
          .update({ status: "declined" })
          .eq("id", pendingClosureRequestId);
        if (upd.error) {
          log(upd.error.message);
          return;
        }
        pendingClosureRequestId = null;
        var bar = $("own-closure-bar");
        if (bar) bar.hidden = true;
        log("Close request declined.");
        await loadThreads();
        if (activeThread) await refreshClosureBar(activeThread);
      });
    }

    var nb = $("own-notify-btn");
    if (nb) {
      nb.addEventListener("click", async function () {
        if (typeof Notification === "undefined") {
          log("This browser does not support notifications.");
          return;
        }
        var p = await Notification.requestPermission();
        log(p === "granted" ? "Alerts on — you’ll get a desktop ping for new visitor messages when this tab is in the background." : "Notifications not granted.");
      });
    }

    client.auth.onAuthStateChange(function (_ev, session) {
      if (session) afterAuth();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
