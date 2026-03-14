/* ═══════════════════════════════════════════════════
 *  Game Hub — Trivia Module  (v6.2.0)
 *  Solo mode, Duel mode, timer, results
 *  ─ Forfeit, cancel, lobby ready-up, voice invite
 *  ─ GameStore integration (trivia slice)
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { HUB, api, showToast, sleep } from "./shared.js";
import { HUD } from "./hud.js";

const TriviaGame = (() => {
  let session = null; // { question, startTime, timerId }
  let duel = null; // { roomId, inviteCode, pollId, countdownId, lobbyTimeoutId }
  let view = "menu"; // menu | solo | duel-create | duel-join | duel-wait | duel-lobby | duel-play | results
  let duelHistoryPage = 1;

  const $ = (id) => document.getElementById(id);
  const DUEL_TIMEOUT_SEC = 60; // auto-cancel after 60s

  /** Sync trivia state to GameStore */
  function syncToStore() {
    GameStore.setState("trivia", { session, duel, view, duelHistoryPage });
  }

  function init() {
    // Register trivia slice
    GameStore.registerSlice("trivia", {
      session,
      duel,
      view,
      duelHistoryPage,
    });
    showMenu();
    // Collapsed bar click -> return to menu
    const bar = $("trivia-duel-history-bar");
    if (bar) bar.addEventListener("click", () => showMenu());

    // Trivia button bindings (moved from shared.js for SRP)
    $("btn-trivia-solo")?.addEventListener("click", () => startSolo());
    $("btn-trivia-create-duel")?.addEventListener("click", () => createDuel());
    $("btn-trivia-join-duel")?.addEventListener("click", () => showJoinDuel());
    $("btn-duel-copy-code")?.addEventListener("click", () => copyInviteCode());
    $("btn-duel-create-cancel")?.addEventListener("click", () => cancelDuel());
    $("btn-duel-join-submit")?.addEventListener("click", () => joinDuel());
    $("btn-duel-join-back")?.addEventListener("click", () => showMenu());
    $("btn-duel-wait-cancel")?.addEventListener("click", () => cancelDuel());
    $("btn-trivia-forfeit")?.addEventListener("click", () => forfeitSolo());
    $("btn-trivia-play-again")?.addEventListener("click", () => showMenu());
    $("btn-duel-voice-invite")?.addEventListener("click", () =>
      inviteFromVoice(),
    );
    $("btn-duel-ready")?.addEventListener("click", () => duelReady());
    $("btn-duel-lobby-cancel")?.addEventListener("click", () => cancelDuel());
  }
  function onEnter() {
    fetchDuelHistory();
  }

  /** Called when leaving the trivia screen — hide floating panels */
  function onLeave() {
    const histPanel = document.getElementById("trivia-duel-history");
    const histBar = document.getElementById("trivia-duel-history-bar");
    if (histPanel) histPanel.style.display = "none";
    if (histBar) histBar.style.display = "none";
  }

  /* ─── View Management ─── */
  function showView(name) {
    view = name;
    [
      "trivia-menu",
      "trivia-play",
      "trivia-duel-create",
      "trivia-duel-join",
      "trivia-duel-wait",
      "trivia-duel-lobby",
      "trivia-results",
    ].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = "none";
    });
    const el = $(
      name === "solo" || name === "duel-play"
        ? "trivia-play"
        : name === "duel-lobby"
          ? "trivia-duel-lobby"
          : `trivia-${name}`,
    );
    if (el) el.style.display = "";

    // Show/hide forfeit button
    const forfeitBtn = $("btn-trivia-forfeit");
    if (forfeitBtn)
      forfeitBtn.style.display =
        name === "solo" || name === "duel-play" ? "" : "none";

    // Duel history: show panel on menu, collapse to bar on other views
    const histPanel = $("trivia-duel-history");
    const histBar = $("trivia-duel-history-bar");
    if (histPanel && histBar) {
      if (name === "menu") {
        histPanel.style.display = "";
        histBar.style.display = "none";
      } else {
        histPanel.style.display = "none";
        histBar.style.display = "";
      }
    }
  }

  function showMenu() {
    showView("menu");
    stopTimer();
    clearDuelPolling();
    if (duel?.lobbyTimeoutId) clearInterval(duel.lobbyTimeoutId);
    duel = null;
    session = null;
    syncToStore();
    fetchDuelHistory();
  }

  /* ─── Duel History ─── */
  async function fetchDuelHistory(page) {
    if (page !== undefined) duelHistoryPage = page;
    try {
      const url = `/api/trivia/duel/history?userId=${encodeURIComponent(HUB.userId || "")}&page=${duelHistoryPage}&limit=5`;
      const data = await fetch(url).then((r) => r.json());
      renderDuelHistory(data);
    } catch (e) {
      console.warn("Failed to fetch duel history", e);
    }
  }

  // v4.15.3: Cache for duel history — skip DOM rebuild on unchanged data
  let _lastHistoryJSON = "";

  function renderDuelHistory(data) {
    const json = JSON.stringify(data);
    if (json === _lastHistoryJSON) return; // No change — skip
    _lastHistoryJSON = json;
    const list = $("duel-history-list");
    const pager = $("duel-history-pager");
    const panel = $("trivia-duel-history");
    if (!list || !panel) return;

    if (!data.entries || (data.entries.length === 0 && data.page === 1)) {
      list.innerHTML =
        '<div class="duel-history-empty">No duels yet — create or join one!</div>';
      if (pager) pager.innerHTML = "";
      panel.style.display = view === "menu" ? "" : "none";
      return;
    }

    panel.style.display = view === "menu" ? "" : "none";
    const myId = HUB.userId || "";

    list.innerHTML = data.entries
      .map((d) => {
        const me = d.players.find((p) => p.userId === myId);
        const opp =
          d.players.find((p) => p.userId !== myId) ||
          d.players[1] ||
          d.players[0];
        const isWin = d.winner === (me?.username || "");
        const isTie = d.winner === "Tie";
        const cls = isWin ? "win" : isTie ? "tie" : "loss";
        const resultText = isTie ? "Tie" : isWin ? "Win" : "Loss";
        const ago = timeAgo(d.finishedAt);
        return `<div class="duel-history-item ${cls}">
        <div class="dh-players">
          <span>${me?.username || "You"} vs ${opp?.username || "?"}</span>
          <span style="font-size:0.7rem;color:var(--text-dim)">${me?.score ?? 0} – ${opp?.score ?? 0} · ${ago}</span>
        </div>
        <div class="dh-result">${resultText}</div>
      </div>`;
      })
      .join("");

    if (pager) {
      if (data.totalPages <= 1) {
        pager.innerHTML = "";
      } else {
        pager.innerHTML = `
          <button ${data.page <= 1 ? "disabled" : ""} id="dh-prev">← Prev</button>
          <span style="font-size:0.72rem;color:var(--text-dim)">${data.page}/${data.totalPages}</span>
          <button ${data.page >= data.totalPages ? "disabled" : ""} id="dh-next">Next →</button>
        `;
        const prev = $("dh-prev");
        const next = $("dh-next");
        if (prev) prev.onclick = () => fetchDuelHistory(data.page - 1);
        if (next) next.onclick = () => fetchDuelHistory(data.page + 1);
      }
    }
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }

  /* ═══ SOLO MODE ═══ */
  async function startSolo() {
    // Energy gatekeep — show quick-feed modal instead of toast
    if (!HUD.hasEnergy(3)) {
      HUD.showEnergyModal(3, () => startSolo());
      return;
    }

    const data = await api("/api/trivia/start", {
      userId: HUB.userId,
      username: HUB.username,
      count: 5,
      // 7.3: Read user-selected category & difficulty from settings panel
      category: document.getElementById("trivia-category-select")?.value || "",
      difficulty:
        document.getElementById("trivia-difficulty-select")?.value || "medium",
    });
    if (data && data.error === "NOT_ENOUGH_ENERGY") {
      showToast("⚡ Not enough energy!");
      return;
    }
    if (!data.success) return;

    // Sync resources (energy deducted)
    if (data.resources) {
      HUD.syncFromServer(data.resources);
    }

    session = { mode: "solo", score: 0, streak: 0 };
    syncToStore();
    showView("solo");
    renderQuestion(data.question);
  }

  /* ═══ FORFEIT (Solo) ═══ */
  async function forfeitSolo() {
    if (!session) return;
    stopTimer();
    const data = await api("/api/trivia/forfeit", {
      userId: HUB.userId,
    });
    if (data?.success) {
      session.score = data.score;
      showResults({
        isComplete: true,
        stats: data.stats,
        forfeited: true,
      });
    } else {
      showMenu();
    }
  }

  /* ═══ DUEL MODE ═══ */
  function clearDuelPolling() {
    if (duel?.pollId) clearInterval(duel.pollId);
    if (duel?.countdownId) clearInterval(duel.countdownId);
  }

  async function createDuel() {
    // Energy gatekeep
    if (!HUD.hasEnergy(3)) {
      showToast("⚡ Need 3 energy to create a duel!");
      return;
    }

    const data = await api("/api/trivia/duel/create", {
      userId: HUB.userId,
      username: HUB.username,
      count: 5,
    });
    if (data && data.error === "NOT_ENOUGH_ENERGY") {
      showToast("⚡ Not enough energy!");
      return;
    }
    if (!data.success) return;

    // Sync resources (energy deducted)
    if (data.resources) {
      HUD.syncFromServer(data.resources);
    }

    duel = { roomId: data.roomId, inviteCode: data.inviteCode };
    showView("duel-create");
    $("duel-invite-code").textContent = data.inviteCode;

    // Start countdown
    startWaitCountdown("duel-create-countdown");

    // Poll for opponent
    duel.pollId = setInterval(async () => {
      const s = await api(`/api/trivia/duel/status/${duel.roomId}`);
      if (s.error) {
        // Room expired/deleted
        clearDuelPolling();
        showToast("⏰ Room expired");
        showMenu();
        return;
      }
      if (
        s.status === "lobby" ||
        s.status === "active" ||
        s.players?.length >= 2
      ) {
        clearDuelPolling();
        if (s.status === "active") {
          startDuelPlay();
        } else {
          showDuelLobby();
        }
      }
    }, 2000);
  }

  function showJoinDuel() {
    showView("duel-join");
    $("duel-join-input").value = "";
    $("duel-join-input").focus();
  }

  async function joinDuel() {
    const code = $("duel-join-input").value.trim().toUpperCase();
    if (!code) return;
    const data = await api("/api/trivia/duel/join", {
      userId: HUB.userId,
      username: HUB.username,
      inviteCode: code,
    });
    if (data.error) {
      showToast(`❌ ${data.error}`);
      return;
    }
    duel = { roomId: data.roomId };
    if (data.status === "active") {
      startDuelPlay();
    } else if (data.status === "lobby") {
      showDuelLobby();
    } else {
      showView("duel-wait");
      // Start countdown for joiner too
      startWaitCountdown("duel-wait-countdown");
      // Poll for start
      duel.pollId = setInterval(async () => {
        const s = await api(`/api/trivia/duel/status/${duel.roomId}`);
        if (s.error) {
          clearDuelPolling();
          showToast("⏰ Room expired");
          showMenu();
          return;
        }
        if (s.status === "active") {
          clearDuelPolling();
          startDuelPlay();
        } else if (s.status === "lobby") {
          clearDuelPolling();
          showDuelLobby();
        }
      }, 2000);
    }
  }

  /* ─── Wait Countdown ─── */
  function startWaitCountdown(elId) {
    let remaining = DUEL_TIMEOUT_SEC;
    const el = $(elId);
    if (el) el.textContent = `Auto-cancel in ${remaining}s`;

    duel.countdownId = setInterval(() => {
      remaining--;
      if (el) el.textContent = `Auto-cancel in ${remaining}s`;
      if (remaining <= 0) {
        cancelDuel();
        showToast("⏰ Timed out waiting for opponent");
      }
    }, 1000);
  }

  /* ─── Cancel Duel ─── */
  async function cancelDuel() {
    clearDuelPolling();
    if (duel?.lobbyTimeoutId) clearInterval(duel.lobbyTimeoutId);
    duel = null;
    syncToStore();
    showMenu();
  }

  /* ─── Duel Lobby (Issue 8: Ready-up) ─── */
  function showDuelLobby() {
    showView("duel-lobby");
    const lobbyDiv = $("duel-lobby-players");
    if (lobbyDiv)
      lobbyDiv.innerHTML = "<p class='text-dim'>Loading lobby...</p>";

    // Poll lobby state
    let lobbyTimeout = 60;
    const timeoutEl = $("duel-lobby-timeout");
    if (timeoutEl) timeoutEl.textContent = `Auto-start in ${lobbyTimeout}s`;

    duel.lobbyTimeoutId = setInterval(() => {
      lobbyTimeout--;
      if (timeoutEl) timeoutEl.textContent = `Auto-start in ${lobbyTimeout}s`;
      if (lobbyTimeout <= 0) {
        clearInterval(duel.lobbyTimeoutId);
        // Force ready
        duelReady();
      }
    }, 1000);

    // Poll for ready state
    duel.pollId = setInterval(async () => {
      const s = await api(`/api/trivia/duel/status/${duel.roomId}`);
      if (s.error) {
        clearDuelPolling();
        if (duel?.lobbyTimeoutId) clearInterval(duel.lobbyTimeoutId);
        showToast("⏰ Room expired");
        showMenu();
        return;
      }
      if (s.status === "active") {
        clearDuelPolling();
        if (duel?.lobbyTimeoutId) clearInterval(duel.lobbyTimeoutId);
        startDuelPlay();
        return;
      }
      // Update lobby UI
      renderLobbyPlayers(s.players || []);
    }, 1500);

    // Initial fetch
    api(`/api/trivia/duel/status/${duel.roomId}`).then((s) => {
      if (s.players) renderLobbyPlayers(s.players);
    });
  }

  function renderLobbyPlayers(players) {
    const lobbyDiv = $("duel-lobby-players");
    if (!lobbyDiv) return;
    lobbyDiv.innerHTML = players
      .map(
        (p) => `
      <div class="duel-lobby-player ${p.ready ? "is-ready" : "is-waiting"}">
        <div class="lp-name">${p.username}</div>
        <div class="lp-status">${p.ready ? "✅ Ready" : "⏳ Waiting..."}</div>
      </div>
    `,
      )
      .join("");
  }

  async function duelReady() {
    if (!duel?.roomId) return;
    const data = await api("/api/trivia/duel/ready", {
      userId: HUB.userId,
      roomId: duel.roomId,
    });
    if (data?.status === "active") {
      clearDuelPolling();
      if (duel?.lobbyTimeoutId) clearInterval(duel.lobbyTimeoutId);
      startDuelPlay();
    }
  }

  /* ─── Voice Chat Invite (Issue 6) ─── */
  async function inviteFromVoice() {
    if (HUB.sdk) {
      try {
        // Pre-check: verify we're in a guild channel (not a DM)
        const channel = await HUB.sdk.commands.getChannel({
          channel_id: HUB.sdk.channelId,
        });
        if (!channel?.guild_id) {
          showToast(
            "📋 Invite dialog requires a server voice channel — code copied instead",
          );
        } else {
          await HUB.sdk.commands.openInviteDialog();
          return;
        }
      } catch (e) {
        console.warn("SDK invite unavailable:", e?.message || e);
        showToast("📋 Invite dialog unavailable — code copied instead");
      }
    }
    // Fallback: copy invite code to clipboard
    const code = duel?.inviteCode;
    if (code) {
      try {
        await navigator.clipboard.writeText(code);
        showToast("🎮 Code copied! Share it in voice chat");
      } catch {
        showToast(`🎮 Share this code: ${code}`);
      }
    }
  }

  async function startDuelPlay() {
    clearDuelPolling();
    const data = await api("/api/trivia/duel/start", {
      userId: HUB.userId,
      roomId: duel.roomId,
    });
    if (!data.success) return;
    session = {
      mode: "duel",
      score: 0,
      streak: 0,
      roomId: duel.roomId,
      opponent: data.opponent,
    };
    showView("duel-play");
    renderQuestion(data.question);
  }

  let currentImageBufferId = "trivia-img-a"; // "trivia-img-a" or "trivia-img-b"

  /* ═══ QUESTION RENDERING ═══ */
  function renderQuestion(q) {
    if (!q) return;
    session.question = q;
    session.answered = false;
    $("trivia-progress").textContent = `Question ${q.index + 1} / ${q.total}`;
    $("trivia-score-display").textContent = session.score;
    $("trivia-streak-display").textContent =
      session.streak > 0 ? `🔥 ${session.streak}` : "";
    $("trivia-category").textContent = `${q.category} • ${q.difficulty}`;
    $("trivia-q-text").textContent = q.question;

    // v5.0: Double Buffering Image Load (Opt 6)
    const imgContainer = $("trivia-image-container");
    const imgA = $("trivia-img-a");
    const imgB = $("trivia-img-b");
    if (imgContainer && imgA && imgB) {
      if (q.imageUrl) {
        imgContainer.style.display = "";
        const nextBufferId = currentImageBufferId === "trivia-img-a" ? "trivia-img-b" : "trivia-img-a";
        const nextBuffer = nextBufferId === "trivia-img-a" ? imgA : imgB;
        const currentBuffer = currentImageBufferId === "trivia-img-a" ? imgA : imgB;
        
        nextBuffer.src = q.imageUrl;
        // Wait for image to load before fading (avoids jitter)
        nextBuffer.onload = () => {
          nextBuffer.classList.add("active");
          currentBuffer.classList.remove("active");
          currentImageBufferId = nextBufferId;
        };
        // Fallback if cached or fails
        if (nextBuffer.complete) {
          nextBuffer.classList.add("active");
          currentBuffer.classList.remove("active");
          currentImageBufferId = nextBufferId;
        }
      } else {
        imgContainer.style.display = "none";
        imgA.classList.remove("active");
        imgB.classList.remove("active");
      }
    }

    // v7.2: Card flip entrance
    const card = document.querySelector(".trivia-question-card");
    if (card) {
      card.classList.remove("flipping");
      void card.offsetWidth; // force reflow
      card.classList.add("flipping");
      card.addEventListener(
        "animationend",
        () => card.classList.remove("flipping"),
        { once: true },
      );
    }

    const ansDiv = $("trivia-answers");
    ansDiv.innerHTML = "";
    q.answers.forEach((ans, i) => {
      const btn = document.createElement("button");
      btn.className = "trivia-answer-btn";
      btn.style.setProperty("--i", i); // v7.2: stagger-fade entrance
      btn.textContent = ans;
      btn.onclick = () => submitAnswer(ans);
      ansDiv.appendChild(btn);
    });

    // Start timer
    startTimer(q.timeLimit);
  }

  /* ═══ TIMER ═══ */
  let timerStart, timerDuration, timerRaf;
  // v4.15.3: Cached DOM refs for timer (eliminates getElementById × 2 per rAF frame)
  let _timerFillEl = null;
  let _timerTextEl = null;
  let _timerWrapperEl = null;
  let _lastDanger = false;

  // [Phase 2] Global Event-Driven Garbage Collector
  document.addEventListener("hub:route-leave", () => {
    _timerFillEl = null;
    _timerTextEl = null;
    _timerWrapperEl = null;
  });

  function startTimer(seconds) {
    _timerFillEl = $("trivia-timer-fill");
    _timerTextEl = $("trivia-timer-text");
    _timerWrapperEl = document.querySelector(".trivia-timer");
    _lastDanger = false;
    if (_timerWrapperEl) _timerWrapperEl.classList.remove("danger");
    if (_timerTextEl) _timerTextEl.classList.remove("danger");
    
    timerStart = Date.now();
    timerDuration = seconds * 1000;
    
    // Phase 17: GPU-Accelerated CSS Timer instead of 16ms JS loop
    if (_timerFillEl) {
      _timerFillEl.style.transition = "none";
      _timerFillEl.style.width = "100%";
      void _timerFillEl.offsetWidth; // flush layout
      
      _timerFillEl.style.transition = `width ${seconds}s linear`;
      _timerFillEl.style.width = "0%";
    }
    
    stopTimer();
    // Coarse 1-second interval for text and end condition
    timerRaf = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      const remaining = Math.max(0, timerDuration - elapsed);
      const sec = Math.ceil(remaining / 1000);
      
      if (_timerTextEl) {
        _timerTextEl.textContent = sec + "s";
        const isDanger = sec <= 3 && remaining > 0;
        if (isDanger !== _lastDanger) {
          _timerTextEl.classList.toggle("danger", isDanger);
          if (_timerWrapperEl) _timerWrapperEl.classList.toggle("danger", isDanger);
          _lastDanger = isDanger;
        }
      }
      
      if (remaining <= 0) {
        stopTimer();
        if (!session.answered) submitAnswer(null); // Time's up
      }
    }, 1000);
    
    // Initial text update
    if (_timerTextEl) _timerTextEl.textContent = seconds + "s";
  }

  function stopTimer() {
    if (timerRaf) {
      clearInterval(timerRaf);
      timerRaf = null;
    }
    if (_timerFillEl) {
      // Freeze the bar to its computed visual width upon stopping
      const currentWidth = getComputedStyle(_timerFillEl).width;
      _timerFillEl.style.transition = "none";
      _timerFillEl.style.width = currentWidth;
    }
  }

  /* ═══ SUBMIT ANSWER ═══ */
  async function submitAnswer(answer) {
    if (session.answered) return;
    session.answered = true;
    stopTimer();

    const timeMs = Date.now() - timerStart;
    const btns = $("trivia-answers").querySelectorAll(".trivia-answer-btn");
    btns.forEach((b) => {
      b.disabled = true;
    });

    let data;
    if (session.mode === "solo") {
      data = await api("/api/trivia/answer", {
        userId: HUB.userId,
        answer,
        timeMs,
      });
    } else {
      data = await api("/api/trivia/duel/answer", {
        userId: HUB.userId,
        roomId: session.roomId,
        answer,
        timeMs,
      });
    }

    // Highlight correct/wrong + v7.2 juice
    btns.forEach((b) => {
      if (b.textContent === data.correctAnswer) {
        b.classList.add("correct");
        b.classList.add("correct-pop"); // v7.2: pop animation
      } else if (b.textContent === answer && !data.correct)
        b.classList.add("wrong");
    });

    session.score = data.sessionScore;
    session.streak = data.streak;
    syncToStore();

    // v7.2: Streak glow
    const streakEl = $("trivia-streak-display");
    if (streakEl && session.streak > 1) {
      streakEl.classList.remove("trivia-streak-active");
      void streakEl.offsetWidth;
      streakEl.classList.add("trivia-streak-active");
    }

    await sleep(1200);

    if (data.isComplete) {
      // Sync gold reward from server
      if (data.resources) {
        HUD.syncFromServer(data.resources);
        if (data.goldReward) HUD.animateGoldChange(data.goldReward);
      }
      showResults(data);
    } else if (data.nextQuestion) {
      renderQuestion(data.nextQuestion);
    }
  }

  /* ═══ RESULTS ═══ */
  async function showResults(data) {
    showView("results");
    $("trivia-final-score").textContent = session.score;

    if (data.forfeited) {
      $("trivia-results-extra").innerHTML = `
        <div class="trivia-results-breakdown">
          <span>🏳️ Forfeited</span>
          <span>🏆 Total: ${data.stats.totalScore}</span>
          <span>📊 Games: ${data.stats.totalPlayed}</span>
        </div>`;
    } else if (session.mode === "solo" && data.stats) {
      $("trivia-results-extra").innerHTML = `
        <div class="trivia-results-breakdown">
          <span>🏆 Total: ${data.stats.totalScore}</span>
          <span>🔥 Best Streak: ${data.stats.bestStreak}</span>
          <span>📊 Games: ${data.stats.totalPlayed}</span>
        </div>`;
    } else if (session.mode === "duel") {
      $("trivia-results-extra").innerHTML =
        '<div class="trivia-duel-status"><span class="spinner">⏳</span> Waiting for opponent...</div>';
      // Poll for duel results
      const pollId = setInterval(async () => {
        const s = await api(`/api/trivia/duel/status/${session.roomId}`);
        if (s.status === "finished") {
          clearInterval(pollId);
          renderDuelResults(s);
        }
      }, 2000);
    }
  }

  function renderDuelResults(s) {
    let html = '<div class="trivia-duel-results">';
    s.players.forEach((p) => {
      const isWinner = s.winner === p.username;
      html += `<div class="trivia-duel-player${isWinner ? " winner" : ""}">
        <div class="dp-name">${isWinner ? "👑 " : ""}${p.username}</div>
        <div class="dp-score">${p.score}</div>
        <div style="font-size:0.7rem;color:var(--text-dim)">${p.correctCount}/${p.totalQuestions} correct</div>
      </div>`;
    });
    html += "</div>";
    if (s.winner === "Tie")
      html +=
        '<div style="text-align:center;font-size:1.1rem;font-weight:700;color:var(--gold)">🤝 It\'s a Tie!</div>';
    $("trivia-results-extra").innerHTML = html;
  }

  /* ═══ CLIPBOARD COPY (3-tier fallback) ═══ */
  async function copyInviteCode() {
    const code = $("duel-invite-code").textContent;
    if (await copyToClipboard(code)) {
      showToast("📋 Code copied!");
    } else {
      showToast("📋 Long-press the code to copy");
    }
  }

  function isClipboardAllowed() {
    // Check via Feature Policy API (Chrome)
    try {
      if (document.featurePolicy?.allowsFeature?.("clipboard-write"))
        return true;
    } catch (_) {}
    // If we're in an iframe, Clipboard API is almost certainly blocked
    if (window.self !== window.top) return false;
    return true; // top-level window, probably fine
  }

  async function copyToClipboard(text) {
    // Tier 1: Clipboard API (only if allowed — avoids console violations)
    if (isClipboardAllowed()) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) {}
    }

    // Tier 2: execCommand fallback (works in most iframes)
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (_) {}

    // Tier 3: Select the code element for manual copy
    try {
      const codeEl = $("duel-invite-code");
      if (codeEl) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) {}

    return false;
  }

  return {
    init,
    onEnter,
    onLeave,
    startSolo,
    forfeitSolo,
    createDuel,
    showJoinDuel,
    joinDuel,
    cancelDuel,
    showMenu,
    copyInviteCode,
    duelReady,
    inviteFromVoice,
    fetchDuelHistory,
  };
})();

export const TriviaModule = TriviaGame;
