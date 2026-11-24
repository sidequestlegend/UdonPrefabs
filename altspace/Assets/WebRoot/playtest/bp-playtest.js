// Rungs 3 and 4: the beer pong table in editor Play mode, driven through the SDK's desktop player with the port kit's
// InputSim (a mouse and keyboard of the test's own: the SDK casts its own rays and raises grab, drop and uGUI clicks)
// and checked in Unity with the kit's probe command and beer pong's own (Assets/Kit/Editor/BeerPongProbe.cs).
// Not part of the snippet: the test page loads it before the snippet.
//
// window.__bpPlan: "single" (one page: key throw, a cup hit, re-rack, settings) or "multi" (two Local Multiplayer
// players: one throws, the other watches; the watcher reloads its page and must see the same table).
(function () {
  "use strict";
  const KEY = "beer-pong:0";
  const HOLDER = "pk1:beer-pong:0";
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  let passed = 0;
  let failed = 0;
  const check = (ok, what, detail) => {
    if (ok) passed++;
    else failed++;
    say(ok ? "PASS" : "FAIL", what, detail);
    return ok;
  };
  const replies = new Map();
  let count = 0;
  window.__pktest = Object.assign(window.__pktest || {}, {
    reply(id, text) {
      const resolve = replies.get(id);
      if (resolve) {
        replies.delete(id);
        resolve(text);
      }
    },
  });
  const cmd = (line, ms) =>
    new Promise((resolve) => {
      const id = "b" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms, step) {
    const end = Date.now() + ms;
    for (;;) {
      let value = false;
      try {
        value = test();
      } catch (e) {
        value = false;
      }
      if (value) return value;
      if (Date.now() > end) return false;
      await sleep(step || 100);
    }
  }
  const debug = () => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY];
  const table = () => debug().table();
  const enc = (path) => path.replace(/ /g, "%20");
  const probe = (what, path, extra) => cmd("probe " + HOLDER + " " + what + " " + enc(path) + (extra ? " " + extra : ""));
  const cupsInUnity = () => cmd("bpcups " + HOLDER);
  const cupNames = (side) => cmd("bpcupnames " + HOLDER + " " + side);
  const ballInUnity = async (i) => {
    const r = (await cmd("bpball " + HOLDER + " " + (i || 0))).split(" ");
    return { kinematic: r[0] === "True", v: r.slice(1, 4).map(Number), p: r.slice(4, 7).map(Number), text: r.join(" ") };
  };
  const STATE = ["Idle", "InHand", "Locked", "Flying", "Rimming", "InCup"];
  const ballState = () => STATE[table().balls[0].state];

  async function clickAt(key, what) {
    const pos = await probe("pos", debug().pathOf(key));
    await cmd("look " + pos);
    const r = await cmd("click " + pos);
    say("INFO", "click " + what, pos + " " + r);
    return r.startsWith("ok");
  }

  async function waitStarted(reload) {
    const ok = await until(() => debug() && debug().table, 120000, 250);
    check(!!ok, "the kit loads from a hand-written bs-snippet and the instance starts", ok ? "" : "no debug hooks after 120 s");
    if (!ok) return false;
    const exists = await probe("exists", ".");
    check(exists === "True", "the kit is in the scene" + (reload ? " again" : ""), "holder " + exists);
    return true;
  }

  /** The cups as the page holds them and as Unity has them (side 0, side 1). */
  async function cupsAgree(label) {
    const t = table();
    const unity = (await cupsInUnity()).split(" ").map(Number);
    const ok = unity[0] === t.cups[0] && unity[1] === t.cups[1] && unity[2] === t.cups[2] && unity[3] === t.cups[3];
    return { ok, detail: `${label}: page ${t.cups.join(",")}, Unity ${unity.join(",")}` };
  }

  /** Waits for the ball to come to a turn again (Idle) after a throw, and says how it ended. */
  async function settleThrow(what, beforeCups, ms) {
    const flying = await until(() => ballState() !== "Idle" && ballState() !== "InHand", 3000, 20);
    const states = new Set();
    const ended = await until(() => {
      states.add(ballState());
      return ballState() === "Idle";
    }, ms || 20000, 50);
    const t = table();
    const hit = t.cups[0] + t.cups[1] < beforeCups[0] + beforeCups[1];
    say("INFO", what + " ended", `states ${[...states].join(">")}, flying ${!!flying}, now ${ballState()} for side ${t.balls[0].side}, cups ${t.cups.join(",")}, scores ${t.scores.join(",")}`);
    return { ended: !!ended, hit, states };
  }

  // ---- one page ------------------------------------------------------------------------------------------------
  async function single() {
    if (!(await waitStarted())) return;
    await sleep(3000); // the referee's first writes (a fresh table)
    let t = table();
    check(t.players === 2 && t.mode === 0 && t.cups[0] === 15 && t.cups[1] === 15 && t.aimAssist === 1,
      "a fresh table takes the element's settings: 2 sides, Normal, 5-row triangles (15 cups each), aim assist 1", JSON.stringify(t));
    const agree0 = await cupsAgree("at start");
    check(agree0.ok, "every cup the page made exists in Unity (spawned from the anchor's template)", agree0.detail);
    const first = debug().cups(1)[0];
    const colour = await cmd("bpcupcolor " + HOLDER + " 1 " + first.name.replace(/ /g, "%20"));
    check(colour === "0.745 0.000 0.218", "a cup of side 1 has side 1's colour on its LOD renderers (cupPlace)", first.name + " " + colour);
    let ball = await ballInUnity(0);
    check(ball.kinematic, "the ball rests kinematic at side 0's spawn", ball.text);

    // ---- the first grab of a Play session lets go by itself (spikes/RESULTS.md S6): a desktop drop with no charge is a
    //      throw of strength 0, which misses and passes the turn. Done first so the key throw below is a real hold.
    const spawn = await probe("pos", debug().pathOf("ball0"));
    await cmd("look " + spawn);
    const before0 = table().cups.slice();
    await cmd("press " + spawn);
    await cmd("wait 30");
    const heldAfterWarmup = ballState() === "InHand";
    await cmd("release");
    say("INFO", "warm-up grab", heldAfterWarmup ? "held (no first-grab let-go this run)" : "let go at once, as the first grab of a session does");
    await settleThrow("the warm-up drop", before0, 20000);

    // ---- a cup hit by the owner's physics: the AI's aimed throw (skill 1) from whichever side has the ball ----
    t = table();
    const thrower = t.balls[0].side;
    const target = 1 - thrower;
    const beforeNames = (await cupNames(target)).split(",").filter(Boolean);
    const beforeCups = t.cups.slice();
    const since = debug().now();
    const v = debug().aimedThrow(0);
    say("INFO", "aimed throw from side " + thrower, "velocity " + v);
    await sleep(150);
    ball = await ballInUnity(0);
    check(!ball.kinematic && Math.hypot(...ball.v) > 0.5, "the throw makes the thrower's ball a dynamic body with the throw's velocity (rbKinematic, rbVelocity)", ball.text);
    const aimed = await settleThrow("the aimed throw", beforeCups, 20000);
    const rate = debug().reports(0, since);
    say("INFO", "transform reports of the ball while it flew", `${rate.count} in ${rate.last - rate.first} ms, longest gap ${rate.longestGapMs} ms`);
    t = table();
    const afterNames = (await cupNames(target)).split(",").filter(Boolean);
    const gone = beforeNames.filter((n) => afterNames.indexOf(n) < 0);
    check(aimed.hit && t.cups[target] === beforeCups[target] - 1 && gone.length === 1 && afterNames.length === t.cups[target],
      "a hit in a cup (the physics ball's contact, reported by the ball graph) removes that cup, in the page and in Unity",
      `side ${target}: ${beforeCups[target]} -> ${t.cups[target]} cups; Unity lost ${gone.join(",")}; states ${[...aimed.states].join(">")}`);
    check(t.scores[thrower] >= 1, "the thrower's side scores", t.scores.join(","));

    // ---- the desktop key throw (hold F), from side 0 ----
    // the ball must be at side 0: a throw with no velocity from wherever it is misses (still for 1 s) and passes the turn
    for (let i = 0; i < 3 && table().balls[0].side !== 0; i++) {
      const b = table().cups.slice();
      debug().dropThrow(0);
      await settleThrow("a dropped ball (passes the turn)", b, 10000);
    }
    const spawn0 = await probe("pos", debug().pathOf("ball0"));
    await cmd("look " + spawn0);
    const keyBefore = table().cups.slice();
    const keySince = debug().now();
    const grabbed = await cmd("press " + spawn0);
    const held = await until(() => ballState() === "InHand", 3000, 50);
    say("INFO", "grab for the key throw", grabbed + "; held " + !!held);
    await cmd("key F down");
    await cmd("wait 40");
    await sleep(500);
    const bar = await probe("matfloat", debug().pathOf("ball0Bar"), "_Cutoff");
    await cmd("key F up");
    const launched = await until(() => ballState() === "Flying" || ballState() === "Rimming" || ballState() === "InCup", 3000, 20);
    await sleep(100);
    ball = await ballInUnity(0);
    check(!!held && !!launched && !ball.kinematic, "the desktop key throw: grab the ball, hold F to charge, let go of F: the ball is thrown by its owner's physics",
      `held ${!!held}, state ${ballState()}, charge bar cutoff while charging ${bar}, body ${ball.text}`);
    await cmd("release");
    const keyThrow = await settleThrow("the key throw", keyBefore, 20000);
    const keyRate = debug().reports(0, keySince);
    say("INFO", "transform reports during the key throw", `${keyRate.count} in ${keyRate.last - keyRate.first} ms, longest gap ${keyRate.longestGapMs} ms`);
    check(keyThrow.ended, "the key throw ends (a hit, or a miss that passes the turn)", keyThrow.hit ? "it hit" : "a miss");

    // ---- the panel of side 0: open it (table-edge button), Player tab, Rerack, Rows ----
    const side0before = table().cups[0] + table().cups[1];
    const removedSide = table().cups[0] < 15 ? 0 : 1;
    await clickAt("p" + removedSide + "uiButton", "Open Settings of side " + removedSide);
    const open = await until(() => table().settingsOpen[removedSide], 3000, 100);
    check(!!open, "the table-edge button opens the side's settings panel (click on the UI layer)", JSON.stringify(table().settingsOpen));
    await sleep(1500); // the panel slides out and tilts up (1 s)
    await clickAt("p" + removedSide + "tabPlayer", "the Player tab");
    const tab = await until(() => table().tab[removedSide] === 2, 3000, 100);
    const content = await probe("active", debug().pathOf("p" + removedSide + "contentPlayer"));
    check(!!tab && content === "True", "the Player tab opens (uGUI toggle through the relay graph; the page switches the content)", `tab ${table().tab[removedSide]}, content ${content}`);
    const rackBefore = (await cupNames(removedSide)).split(",").sort().join(",");
    await clickAt("p" + removedSide + "_rerack", "Rerack");
    await sleep(1500);
    const rackAfter = (await cupNames(removedSide)).split(",").sort().join(",");
    const agree1 = await cupsAgree("after the re-rack");
    check(rackAfter !== rackBefore && agree1.ok, "Rerack from the panel re-lays the side's remaining cups (Unity's copies follow)", agree1.detail + `; ${rackBefore.split(",").length} cups, layout changed`);

    // a setting: the Rows slider of this side, clicked near its right end
    const rowsBefore = table().rows[removedSide];
    const slider = (await probe("pos", debug().pathOf("p" + removedSide + "_rows"))).split(" ").map(Number);
    say("INFO", "rows slider at", slider.join(" "));
    await cmd("look " + slider.join(" "));
    // aim 40 % of the track to the right: the slider's own transform is the track's centre
    const right = (await cmd("bpright " + HOLDER + " " + enc(debug().pathOf("p" + removedSide + "_rows")) + " 0.35")).trim();
    const clicked = await cmd("click " + (right.startsWith("error") ? slider.join(" ") : right));
    const rowsChanged = await until(() => table().rows[removedSide] !== rowsBefore, 4000, 100);
    await sleep(1000);
    const agree2 = await cupsAgree("after the rows change");
    check(!!rowsChanged && agree2.ok, "a setting changed on the panel (Rows slider) reaches the rules and the kit", `rows ${rowsBefore} -> ${table().rows[removedSide]} (${clicked}); ${agree2.detail}`);

    // a game-wide setting: Barrier on the Game tab raises the dividers (Animator bool, 1 s)
    await clickAt("p" + removedSide + "tabGame", "the Game tab");
    await sleep(500);
    await clickAt("p" + removedSide + "_barrier", "Barrier");
    const barrier = await until(() => table().barrier === true, 3000, 100);
    await sleep(1500);
    const divider = await probe("active", "BeerPong/table/[ThryBP]2Players/2Divider/Collider");
    check(!!barrier && divider === "True", "Barrier on the panel raises the divider (synced setting, animator in Unity)", `barrier ${table().barrier}, divider collider active ${divider}`);
    await cmd("shot table 0 1.6 -0.4 0 0.8 1.6 60");
  }

  // ---- two players -------------------------------------------------------------------------------------------
  const heard = [];
  function channel() {
    const scene = window.BS.Scene.GetInstance();
    scene.On("one-shot", (e) => {
      const data = e && e.detail && e.detail.data;
      if (typeof data !== "string" || data.indexOf("bpTest") < 0) return;
      try {
        heard.push(JSON.parse(data));
      } catch (x) {
        /* not ours */
      }
    });
    return (message) => scene.OneShot(JSON.stringify(Object.assign({ bpTest: 1 }, message)));
  }
  const reloaded = () => {
    try {
      return sessionStorage.getItem("bpTestReloaded") === "1";
    } catch (e) {
      return false;
    }
  };

  async function multi() {
    const back = reloaded();
    if (!(await waitStarted(back))) return;
    const send = channel();
    const two = await until(() => debug().players().length >= 2, 90000, 500);
    check(!!two, "two players in the room", JSON.stringify(debug().players()));
    if (!two) return;
    await sleep(3000);
    const me = debug().me();
    const others = debug().players().filter((p) => p.sid !== me.sid);
    // the thrower: the player who is not coming back from a reload, and whose session sorts first otherwise
    const thrower = back ? false : me.sid < others[0].sid;
    say("INFO", (thrower ? "thrower" : "watcher") + " is " + me.name + (back ? " (back after a reload)" : ""));

    if (back) {
      // late join by reload: the cups and scores as the thrower left them
      const word = await until(() => heard.find((m) => m.kind === "final"), 30000, 250);
      await sleep(1500);
      const t = table();
      const agree = await cupsAgree("after the reload");
      check(!!word && t.cups.join(",") === word.cups && t.scores.join(",") === word.scores && agree.ok,
        "after reloading its page the watcher sees the remaining cups and the scores (late join), in the page and in Unity",
        `${agree.detail}; scores ${t.scores.join(",")}; thrower said cups ${word && word.cups}, scores ${word && word.scores}`);
      check(!!word && word.digest === debug().digest(), "the reloaded page holds the same state as the thrower's (digest)", word ? `${word.digest} / ${debug().digest()}` : "no word");
      send({ kind: "backDone", digest: debug().digest() });
      try {
        sessionStorage.removeItem("bpTestReloaded");
      } catch (e) {
        /* nothing */
      }
      return;
    }

    if (thrower) {
      for (let round = 0; round < 2; round++) {
        await until(() => heard.some((m) => m.kind === "ready" && m.round === round), 30000, 200);
        const t = table();
        const side = t.balls[0].side;
        const target = 1 - side;
        const beforeNames = (await cupNames(target)).split(",").filter(Boolean);
        send({ kind: "throw", round, target, at: Date.now() });
        const v = debug().aimedThrow(0);
        say("INFO", "round " + round + ": aimed throw from side " + side, v);
        const r = await settleThrow("round " + round, t.cups.slice(), 20000);
        const afterNames = (await cupNames(target)).split(",").filter(Boolean);
        const gone = beforeNames.filter((n) => afterNames.indexOf(n) < 0);
        check(r.hit && gone.length === 1, `round ${round}: the thrower's throw removes one cup of side ${target}`, gone.join(","));
        send({ kind: "result", round, target, gone: gone.join(","), cups: table().cups.join(","), digest: debug().digest() });
        await until(() => heard.some((m) => m.kind === "seen" && m.round === round), 30000, 200);
      }
      const seen = heard.filter((m) => m.kind === "seen");
      check(seen.length === 2 && seen.every((m) => m.digest === m.myDigestAtResult), "the watcher reached the same state digest after each throw", JSON.stringify(seen.map((m) => m.digest)));
      // the watcher reloads; the table as it stands goes to it, and it must find the same
      await until(() => heard.some((m) => m.kind === "reloading"), 30000, 200);
      await until(() => heard.some((m) => m.kind === "hello"), 120000, 250);
      const t = table();
      send({ kind: "final", cups: t.cups.join(","), scores: t.scores.join(","), digest: debug().digest() });
      const done = await until(() => heard.find((m) => m.kind === "backDone"), 60000, 250);
      check(!!done && done.digest === debug().digest(), "after the reload both pages hold the same state (digest)", done ? `${done.digest} / ${debug().digest()}` : "no word");
      return;
    }

    // the watcher: sees the ball fly and the same cup go
    for (let round = 0; round < 2; round++) {
      send({ kind: "ready", round });
      const go = await until(() => heard.find((m) => m.kind === "throw" && m.round === round), 30000, 50);
      if (!go) {
        check(false, `round ${round}: the throw was announced`, "");
        return;
      }
      const target = go.target;
      const beforeNames = (await cupNames(target)).split(",").filter(Boolean);
      // the ball in Unity on this page: synced from the thrower's physics
      const samples = [];
      const end = Date.now() + 2500;
      while (Date.now() < end) {
        const b = await ballInUnity(0);
        samples.push(b.p);
        await sleep(60);
      }
      const ys = samples.map((p) => p[1]);
      const travelled = Math.hypot(samples[samples.length - 1][0] - samples[0][0], samples[samples.length - 1][2] - samples[0][2]);
      const distinct = new Set(samples.map((p) => p.map((x) => x.toFixed(2)).join(","))).size;
      const result = await until(() => heard.find((m) => m.kind === "result" && m.round === round), 30000, 100);
      await sleep(2500);
      const afterNames = (await cupNames(target)).split(",").filter(Boolean);
      const gone = beforeNames.filter((n) => afterNames.indexOf(n) < 0);
      check(distinct >= 5 && Math.max(...ys) - Math.min(...ys) > 0.05,
        `round ${round}: the watcher sees the ball fly (its synced transform in this page's Unity)`, `${samples.length} samples, ${distinct} distinct positions, height ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)}, ${travelled.toFixed(2)} m across`);
      check(!!result && gone.join(",") === result.gone && table().cups.join(",") === result.cups,
        `round ${round}: the same cup is removed on the watcher's page and in its Unity`, `here ${gone.join(",")} / thrower ${result && result.gone}; cups ${table().cups.join(",")}`);
      send({ kind: "seen", round, digest: debug().digest(), myDigestAtResult: result && result.digest });
    }
    // late join by reload
    send({ kind: "reloading" });
    try {
      sessionStorage.setItem("bpTestReloaded", "1");
    } catch (e) {
      /* no storage: the reload test cannot run */
    }
    say("INFO", "the watcher reloads its page");
    await sleep(500);
    location.reload();
    await sleep(60000);
  }

  // after a reload the watcher says hello, so the thrower sends the table as it stands
  async function hello() {
    if (!reloaded()) return;
    await until(() => debug() && debug().table && window.BS, 120000, 250);
    await sleep(2000);
    const scene = window.BS.Scene.GetInstance();
    scene.OneShot(JSON.stringify({ bpTest: 1, kind: "hello" }));
  }

  window.__bpRun = async function (plan) {
    try {
      if (plan === "single") await single();
      else if (plan === "multi") {
        hello();
        await multi();
      }
    } catch (e) {
      check(false, "the test ran to its end", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
    }
    say("INFO", "page result " + passed + " passed, " + failed + " failed");
    console.log("PKTEST DONE");
  };
  if (window.__bpPlan) window.__bpRun(window.__bpPlan);
})();
