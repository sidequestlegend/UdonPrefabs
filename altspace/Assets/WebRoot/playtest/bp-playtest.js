// Rungs 3 and 4: the beer pong table in editor Play mode, driven through the SDK's desktop player with the port kit's
// InputSim (a mouse and keyboard of the test's own: the SDK casts its own rays and raises grab, drop and uGUI clicks)
// and checked in Unity with the kit's probe command and beer pong's own (Assets/Kit/Editor/BeerPongProbe.cs).
// Not part of the snippet: the test page loads it before the snippet.
//
// window.__bpPlan: "single" (one page: key throw, a cup hit, re-rack, settings), "multi" (two Local Multiplayer
// players: one throws, the other watches; the watcher reloads its page and must see the same table) or "start3" (a
// fresh 3-side table: the player who starts it is not moved).
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

  /** Every graph-to-page event this page gets, by name (the ball graph's reports among them). */
  const graphSeen = [];
  function watchGraph() {
    const registry = window.__pk1;
    if (!registry || registry.__bpWatched) return;
    registry.__bpWatched = true;
    const original = registry.event;
    registry.event = function (key, name, args) {
      graphSeen.push({ t: Date.now(), name: name, args: String(args) });
      if (graphSeen.length > 400) graphSeen.splice(0, 200);
      return original.apply(this, arguments);
    };
  }
  const graphSince = (t, names) => graphSeen.filter((e) => e.t >= t && (!names || names.indexOf(e.name) >= 0));

  async function waitStarted(reload) {
    const ok = await until(() => debug() && debug().table, 120000, 250);
    watchGraph();
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
    // a hit's cup goes when the referee's removal arrives (a request to the referee: a round trip when the thrower is
    // not the referee), which can be just after the ball is back
    if (states.has("InCup") || states.has("Rimming")) {
      await until(() => table().cups[0] + table().cups[1] < beforeCups[0] + beforeCups[1], 4000, 100);
    }
    const t = table();
    const hit = t.cups[0] + t.cups[1] < beforeCups[0] + beforeCups[1];
    say("INFO", what + " ended", `states ${[...states].join(">")}, flying ${!!flying}, now ${ballState()} for side ${t.balls[0].side}, cups ${t.cups.join(",")}, scores ${t.scores.join(",")}`);
    return { ended: !!ended, hit, states };
  }

  /**
   * The ball held above a cup of the other side, checked in Unity before it is let go (a page that has just taken
   * the ball over may still see it where the last owner's sync put it for a moment).
   */
  async function placeAboveAndWait() {
    let name = "";
    for (let i = 0; i < 4; i++) {
      name = debug().placeAbove(0);
      const want = debug().ballPosition(0);
      let near = false;
      for (let k = 0; k < 20 && !near; k++) {
        const b = await ballInUnity(0);
        near = b.kinematic && Math.hypot(b.p[0] - want[0], b.p[1] - want[1], b.p[2] - want[2]) < 0.02;
        if (!near) await sleep(150);
      }
      if (near) break;
    }
    await sleep(300);
    return name;
  }

  /** A throw with no velocity from the AI spawn point misses (still for 1 s) and passes the turn, until `side` has it. */
  async function passTo(side) {
    for (let i = 0; i < 3 && table().balls[0].side !== side; i++) {
      const b = table().cups.slice();
      debug().aimPlace(0);
      await sleep(800);
      debug().dropThrow(0);
      await settleThrow("a dropped ball (passes the turn)", b, 10000);
    }
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
    // the table, its fittings and the cups are the port's own models (tools/make_models.py), none of upstream's
    const tableMeshes = await cmd("bpmesh " + HOLDER + " " + enc("BeerPong/table"));
    const fixtureMeshes = await cmd("bpmesh " + HOLDER + " " + enc(debug().pathOf("p0uiAnim")));
    const cupMeshes = await cmd("bpmesh " + HOLDER + " " + enc(first.path));
    const names = (tableMeshes + "," + fixtureMeshes + "," + cupMeshes).split(/[,|]/).map((n) => n.trim()).filter(Boolean);
    check(names.length >= 10 && names.every((n) => n.startsWith("bp_")) && cupMeshes.indexOf("| bp_cup_collider") > 0,
      "the table, the panel fittings and the cups draw and collide with the generated models",
      `table ${tableMeshes}; fittings ${fixtureMeshes}; cup ${cupMeshes}`);

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

    // ---- the desktop key throw (hold F), from side 0 (aim assist 1 steers it, as upstream's assist does) ----
    await passTo(0);
    const spawn0 = await probe("pos", debug().pathOf("ball0"));
    await cmd("look " + spawn0);
    const keyBefore = table().cups.slice();
    const keyNames = [(await cupNames(0)).split(","), (await cupNames(1)).split(",")];
    const keySince = debug().now();
    const keySinceWall = Date.now();
    say("INFO", "ray to the ball before the key throw's grab", await cmd("bpray " + spawn0));
    let grabbed = await cmd("press " + spawn0);
    let held = await until(() => ballState() === "InHand", 3000, 50);
    if (!held) {
      // the first grab of a Play session can let go at once (spikes/RESULTS.md S6): once more
      await cmd("release");
      await sleep(500);
      const again = await probe("pos", debug().pathOf("ball0"));
      await cmd("look " + again);
      say("INFO", "the grab did not hold; ray now", await cmd("bpray " + again) + "; state " + ballState());
      grabbed = await cmd("press " + again);
      held = await until(() => ballState() === "InHand", 3000, 50);
    }
    say("INFO", "grab for the key throw", grabbed + "; held " + !!held);
    await cmd("key F down");
    await cmd("wait 40");
    await sleep(500);
    const bar = await probe("matfloat", debug().pathOf("ball0Bar"), "_Cutoff");
    await cmd("key F up");
    const launched = await until(() => ballState() === "Flying" || ballState() === "Rimming" || ballState() === "InCup", 3000, 20);
    await sleep(100);
    ball = await ballInUnity(0);
    check(!!held && !!launched && !ball.kinematic && Number(bar) < 1, "the desktop key throw: grab the ball, hold F to charge (the bar fills), let go of F: the ball is thrown by its owner's physics",
      `held ${!!held}, state ${ballState()}, charge bar cutoff while charging ${bar}, body ${ball.text}`);
    await cmd("release");
    const keyThrow = await settleThrow("the key throw", keyBefore, 20000);
    const keyReports = graphSince(keySinceWall, ["collisionEnter", "bpStill", "bpLow", "bpRelease"]);
    say("INFO", "the ball graph's reports during the key throw", keyReports.length + ": " + keyReports.slice(0, 10).map((e) => e.name + " " + e.args.split("|").slice(0, 2).join("|")).join(" ; "));
    const keyRate = debug().reports(0, keySince);
    say("INFO", "transform reports during the key throw", `${keyRate.count} in ${keyRate.last - keyRate.first} ms, longest gap ${keyRate.longestGapMs} ms`);
    check(keyThrow.ended, "the key throw ends (a hit, or a miss that passes the turn)", keyThrow.hit ? "it hit" : "a miss");

    // ---- a hit: the key throw's, else the AI's aimed throw (skill 1, Player.AI_Aim / AI_Shoot) until one lands ----
    let hitSide = -1;
    let hitHow = "";
    let hitDetail = "";
    let launchChecked = false;
    if (keyThrow.hit) {
      t = table();
      hitSide = t.cups[0] < keyBefore[0] ? 0 : 1;
      const now = (await cupNames(hitSide)).split(",");
      hitHow = "the desktop key throw";
      hitDetail = `side ${hitSide}: ${keyBefore[hitSide]} -> ${t.cups[hitSide]} cups; Unity lost ${keyNames[hitSide].filter((n) => now.indexOf(n) < 0).join(",")}; scores ${t.scores.join(",")}`;
    }
    for (let attempt = 0; attempt < 3 && hitSide < 0; attempt++) {
      t = table();
      const thrower = t.balls[0].side;
      const target = 1 - thrower;
      const beforeNames = (await cupNames(target)).split(",").filter(Boolean);
      const beforeCups = t.cups.slice();
      // attempts 0 and 1: the AI's own aimed throw; then the ball let fall onto a cup from above (no aim involved: the
      // contact, the hit rule and the removal are what is tested)
      const how = attempt < 2 ? "aimed" : "fall";
      if (how === "aimed") say("INFO", "the AI's aim: the ball to side " + thrower + "'s AI spawn point", debug().aimPlace(0));
      else say("INFO", "the ball held above a cup of side " + target, await placeAboveAndWait());
      await sleep(1000);
      const since = debug().now();
      const aimedAt = Date.now();
      const v = how === "aimed" ? debug().aimShoot(0) : (debug().dropThrow(0), "0,0,0");
      say("INFO", (how === "aimed" ? "aimed throw from side " : "let fall, side ") + thrower, "velocity " + v);
      await sleep(150);
      ball = await ballInUnity(0);
      say("INFO", "the thrower's ball 150 ms later", ball.text);
      if (how === "aimed" && !launchChecked) {
        // the kit's standard rbLaunch (game op bpLaunch before): the body is dynamic and flies with the throw's
        // horizontal velocity (gravity changes only the vertical part; 150 ms is before any contact)
        launchChecked = true;
        const want = (v.match(/-?[\d.]+(e-?\d+)?/g) || []).map(Number);
        const flat = Math.hypot(want[0], want[2]);
        const off = Math.hypot(ball.v[0] - want[0], ball.v[2] - want[2]);
        check(!ball.kinematic && flat > 0.5 && off < 0.15 * flat, "a throw is the kit's rbLaunch: 150 ms later the body is dynamic with the throw's horizontal velocity",
          `thrown ${want.map((n) => n.toFixed(3)).join(",")}, body ${ball.text}, off by ${off.toFixed(3)} m/s`);
      }
      const aimed = await settleThrow("an aimed throw", beforeCups, 20000);
      const reports = graphSince(aimedAt - 200, ["collisionEnter", "bpStill", "bpLow"]);
      say("INFO", "the ball graph's reports", reports.length + ": " + reports.slice(0, 6).map((e) => e.name + " " + e.args.split("|").slice(0, 2).join("|")).join(" ; "));
      say("INFO", "cup contacts as the thrower judged them", debug().contactTrace(0).slice(-4).join(" ; "));
      const rate = debug().reports(0, since);
      say("INFO", "transform reports of the ball while it flew", `${rate.count} in ${rate.last - rate.first} ms, longest gap ${rate.longestGapMs} ms`);
      if (aimed.hit) {
        t = table();
        // probes run ahead of the relay: ask Unity again until its copies match the page's count (up to 3 s)
        let afterNames = [];
        for (let k = 0; k < 15; k++) {
          afterNames = (await cupNames(target)).split(",").filter(Boolean);
          if (afterNames.length === t.cups[target]) break;
          await sleep(200);
        }
        hitSide = target;
        hitHow = how === "aimed" ? "the AI's aimed throw" : "the ball let fall onto a cup";
        hitDetail = `side ${target}: ${beforeCups[target]} -> ${t.cups[target]} cups; Unity lost ${beforeNames.filter((n) => afterNames.indexOf(n) < 0).join(",")}; scores ${t.scores.join(",")}`;
      }
    }
    t = table();
    const agreeHit = await cupsAgree("after the hit");
    check(hitSide >= 0 && agreeHit.ok, "a hit in a cup (the thrower's physics; the contact reported by the ball graph) removes that cup, in the page and in Unity", `${hitHow}: ${hitDetail}`);
    const scorer = 1 - Math.max(hitSide, 0);
    const plate = await probe("text", debug().pathOf("p" + scorer + "score"));
    check(t.scores[scorer] >= 1 && plate === ("000" + t.scores[scorer]).slice(-4), "the thrower's side scores, and its score plate shows it in Unity", `scores ${t.scores.join(",")}, plate ${plate}`);

    // ---- the panel of the side that lost a cup: open it (table-edge button), Player tab, Rerack, Rows, Barrier ----
    const removedSide = Math.max(hitSide, 0);
    const scene = window.BS.Scene.GetInstance();
    // stand at that side's end (the table's centre is 1.65 m ahead of the start; side 1's end mirrors side 0's)
    if (removedSide === 1) {
      scene.TeleportTo(new window.BS.Vector3(0, 0, 3.3), 180, true);
      await sleep(1500);
    }
    await clickAt("p" + removedSide + "uiButton", "Open Settings of side " + removedSide);
    const open = await until(() => table().settingsOpen[removedSide], 3000, 100);
    check(!!open, "the table-edge button opens the side's settings panel (click on the UI layer)", JSON.stringify(table().settingsOpen));
    await sleep(1500); // the panel slides out and tilts up (1 s)
    // the open panel reaches back past the table's end, where this test's player stands: step back 0.7 m to use it
    scene.TeleportTo(new window.BS.Vector3(0, 0, removedSide === 1 ? 4.0 : -0.7), removedSide === 1 ? 180 : 0, true);
    await sleep(1500);
    await clickAt("p" + removedSide + "tabPlayer", "the Player tab");
    const tab = await until(() => table().tab[removedSide] === 2, 3000, 100);
    await sleep(700);
    const content = await probe("active", debug().pathOf("p" + removedSide + "contentPlayer"));
    check(!!tab && content === "True", "the Player tab opens (uGUI toggle through the relay graph; the page switches the content)", `tab ${table().tab[removedSide]}, content ${content}`);
    // a back-row cup goes too (as a second hit would take it), so that the re-rack has something to move: the hit above
    // took the rack's front cup, the highest grid index, which a re-rack leaves empty anyway
    const backCup = Number(debug().cups(removedSide)[0].name.split(" ").pop());
    say("INFO", "a second cup removed (grid index " + backCup + ")", String(debug().removeCup(removedSide, backCup)));
    await sleep(1500);
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
    await cmd("shot table " + (removedSide === 1 ? "0 1.7 4.4 0 0.8 1.6" : "0 1.7 -1.1 0 0.8 1.6") + " 60");
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
    const ref = debug().referee();
    // a hit's cup removal is a request to the referee: when the thrower is not the referee, it crosses pages
    say("INFO", "the referee is " + (ref && ref.sid === me.sid ? "this page (" + me.name + ")" : "the other page"));

    if (back) {
      // late join by reload: the cups and scores as the thrower left them
      const word = await until(() => heard.find((m) => m.kind === "final"), 30000, 250);
      await sleep(1500);
      if (word) await until(() => debug().stamp().version === word.stamp.version, 10000, 200);
      const t = table();
      const agree = await cupsAgree("after the reload");
      check(!!word && t.cups.join(",") === word.cups && t.scores.join(",") === word.scores && agree.ok,
        "after reloading its page the watcher sees the remaining cups and the scores (late join), in the page and in Unity",
        `${agree.detail}; scores ${t.scores.join(",")}; thrower said cups ${word && word.cups}, scores ${word && word.scores}`);
      const mine = debug().stamp();
      check(!!word && word.stamp.version === mine.version && word.stamp.digest === mine.digest, "the reloaded page holds the same state as the thrower's (digest at the same version)",
        word ? `${word.stamp.version} ${word.stamp.digest} / ${mine.version} ${mine.digest}` : "no word");
      send({ kind: "backDone", stamp: mine });
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
        debug().aimPlace(0);
        await sleep(1000);
        const v = debug().aimShoot(0);
        say("INFO", "round " + round + ": the AI's aimed throw from side " + side, v);
        let r = await settleThrow("round " + round, t.cups.slice(), 20000);
        for (let fall = 0; fall < 3 && !r.hit; fall++) {
          // the aimed throw met a rim (physics): the ball let fall onto a cup instead, so the round has its hit
          await passTo(side);
          say("INFO", "round " + round + ": the ball held above a cup and let fall", await placeAboveAndWait());
          debug().dropThrow(0);
          r = await settleThrow("round " + round + " (fall " + (fall + 1) + ")", t.cups.slice(), 20000);
          if (!r.hit) say("INFO", "round " + round + ": the fall did not count; cup contacts", debug().contactTrace(0).slice(-3).join(" ; ") + "; body " + (await ballInUnity(0)).text);
        }
        // probes run ahead of the relay: ask Unity again until its copies match the page's count (up to 3 s)
        let afterNames = [];
        for (let k = 0; k < 15; k++) {
          afterNames = (await cupNames(target)).split(",").filter(Boolean);
          if (afterNames.length === table().cups[target]) break;
          await sleep(200);
        }
        const gone = beforeNames.filter((n) => afterNames.indexOf(n) < 0);
        check(r.hit && gone.length === 1, `round ${round}: the thrower's throw removes one cup of side ${target}`, gone.join(","));
        send({ kind: "result", round, target, gone: gone.join(","), cups: table().cups.join(","), stamp: debug().stamp() });
        await until(() => heard.some((m) => m.kind === "seen" && m.round === round), 30000, 200);
      }
      const seen = heard.filter((m) => m.kind === "seen");
      check(seen.length === 2 && seen.every((m) => m.stamp && m.result && m.stamp.version === m.result.version && m.stamp.digest === m.result.digest),
        "the watcher reached the same state after each throw (digest at the same version)", JSON.stringify(seen.map((m) => [m.stamp, m.result])));
      // the watcher reloads; the table as it stands goes to it, and it must find the same
      await until(() => heard.some((m) => m.kind === "reloading"), 30000, 200);
      await until(() => heard.some((m) => m.kind === "hello"), 120000, 250);
      const t = table();
      send({ kind: "final", cups: t.cups.join(","), scores: t.scores.join(","), stamp: debug().stamp() });
      const done = await until(() => heard.find((m) => m.kind === "backDone"), 60000, 250);
      const mine = debug().stamp();
      check(!!done && done.stamp.version === mine.version && done.stamp.digest === mine.digest, "after the reload both pages hold the same state (digest at the same version)",
        done ? `${done.stamp.version} ${done.stamp.digest} / ${mine.version} ${mine.digest}` : "no word");
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
      check(!!result && gone.length === 1 && gone.join(",") === result.gone && table().cups.join(",") === result.cups,
        `round ${round}: the same cup is removed on the watcher's page and in its Unity`, `here ${gone.join(",")} / thrower ${result && result.gone}; cups ${table().cups.join(",")}`);
      if (result) await until(() => debug().stamp().version === result.stamp.version, 10000, 200);
      send({ kind: "seen", round, stamp: debug().stamp(), result: result && result.stamp });
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

  // ---- diagnostics ----------------------------------------------------------------------------------------------
  async function poke() {
    if (!(await waitStarted())) return;
    await sleep(3000);
    const c = debug().cups(0)[0];
    say("INFO", "cup 0 of side 0 (page)", JSON.stringify(c));
    say("INFO", "cup in Unity", await probe("pos", c.path));
    say("INFO", "cup active", await probe("active", c.path));
    say("INFO", "cup LOD0 pos", await probe("pos", c.path + "/Glass_LOD0"));
    say("INFO", "anchor pos", await probe("pos", "BeerPong/Players/Player/[GamemodeNormal]Cups Anchor"));
    say("INFO", "player pos", await probe("pos", "BeerPong/Players/Player"));
    say("INFO", "template pos", await probe("pos", "BeerPong/Players/Player/[GamemodeNormal]Cups Anchor/CupTemplate"));
    say("INFO", "ball", (await ballInUnity(0)).text);
    say("INFO", "ball layer", await probe("layer", debug().pathOf("ball0")));
    const raw = [];
    const scene = window.BS.Scene.GetInstance();
    const go = Object.values(scene.objects).find((o) => o.name === "Ball" && !o.destroyed);
    say("INFO", "page knows the ball", go ? "yes, layer " + go.layer : "no");
    if (go) for (const kind of ["grab", "drop", "click"]) go.On(kind, () => raw.push(kind));
    const pos = await probe("pos", debug().pathOf("ball0"));
    say("INFO", "look", await cmd("look " + pos));
    say("INFO", "ray to the ball", await cmd("bpray " + pos));
    // the relay alone: kinematic off, then a velocity, then read the body
    debug().aimPlace(0);
    await sleep(1000);
    debug().rawRelay("rbKinematic|" + debug().refOf("ball0") + "|0^rbVelocity|" + debug().refOf("ball0") + "|0|3|1");
    await sleep(100);
    say("INFO", "body 100 ms after rbKinematic 0 + rbVelocity 0,3,1", (await ballInUnity(0)).text);
    await sleep(1500);
    debug().aimPlace(0);
    await sleep(1000);
    debug().rawRelay("rbKinematic|" + debug().refOf("ball0") + "|0");
    await sleep(300);
    debug().rawRelay("rbVelocity|" + debug().refOf("ball0") + "|0|3|1");
    await sleep(60);
    say("INFO", "body 60 ms after rbVelocity 0,3,1 sent 300 ms after rbKinematic 0", (await ballInUnity(0)).text);
    await sleep(1500);
    for (let i = 0; i < 3; i++) {
      say("INFO", "press " + i, await cmd("press " + pos));
      await cmd("wait 40");
      say("INFO", "state while pressed", ballState() + " raw " + raw.join(","));
      await cmd("release");
      await sleep(1500);
      say("INFO", "after release", ballState() + " raw " + raw.join(","));
    }
    await cmd("shot poke 0.6 1.3 0 0.3 0.8 1.2 60");
  }

  // ---- a fresh 3-side table: the player who starts it stays where they are (review finding 3) ----------------
  async function start3() {
    const before = await cmd("probe - head");
    if (!(await waitStarted())) return;
    await sleep(4000); // the fresh table's start-up writes, and a teleport if one came
    const after = await cmd("probe - head");
    const a = before.split(" ").map(Number);
    const b = after.split(" ").map(Number);
    const moved = Math.hypot(a[0] - b[0], a[2] - b[2]);
    const t = table();
    const shown = await probe("active", debug().pathOf("table3"));
    check(t.players === 3 && shown === "True", "a fresh table takes players=\"3\": three sides, the 3-side table shown", `players ${t.players}, table3 active ${shown}`);
    check(a.length >= 3 && b.length >= 3 && moved < 0.05, "the player who starts a 3-side table is not teleported (the first side count is not a change)",
      `head before ${before}, after ${after}, moved ${moved.toFixed(3)} m`);
    const agree = await cupsAgree("3 sides");
    check(agree.ok && t.cups[2] === 15, "the third side's rack is made in Unity too", agree.detail);
  }

  window.__bpRun = async function (plan) {
    try {
      if (plan === "single") await single();
      else if (plan === "start3") await start3();
      else if (plan === "poke") await poke();
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
