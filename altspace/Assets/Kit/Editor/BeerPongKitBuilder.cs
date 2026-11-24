// The beer-pong kit: BeerPong.prefab (Thryrallo/UdonPrefabs, MIT; table and cup art by TsunaMoo) made into a kit the
// snippet script loads. What changes against upstream, and why, is in altspace/PORT.md (sections 0 and 10).
//
// The object model is the one ts/tools/make-bindings.ts wrote provisionally from PORT.md section 5: the same object
// keys, behaviour ids (bindings.lock.json was seeded with them) and fields, now with the numbers measured here.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using PortKit;
using TMPro;
using Unity.VisualScripting;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace BeerPong
{
    public sealed class BeerPongKitBuilder : KitBuilder
    {
        public const string UpstreamPrefab = "Assets/Upstream/BeerPong.prefab";
        const string Csv = "Assets/Upstream/_Internal/BeerPong/beerpong_localization.csv";
        const string MaterialFolder = "Assets/Kit/Materials";
        const string FontFolder = "Assets/Kit/Fonts";
        const string SoundFolder = "Assets/Kit/Sounds";
        /// <summary>The upstream copy under the kit's root: the Game's object, which the page scales with the table's Size.</summary>
        public const string Top = "BeerPong";
        public const string CupTemplate = "CupTemplate";

        static readonly string[] PlayerNames = { "Player", "Player (1)", "Player (2)", "Player (3)" };
        static readonly string[] BallNames = { "Ball", "Ball (1)", "Ball (2)", "Ball (3)" };
        static readonly string[] Tabs = { "Game", "Rules", "Player", "AI", "Visual", "Credits" };

        public override string Slug => "beer-pong";
        public override string Title => "Beer Pong";
        public override string Summary => "Beer pong for 2 to 4 sides, with King of the Hill, Big Pong and Mayhem modes, AI players and aim assist. A port of Thryrallo's beer pong table.";
        public override string Description =>
            "Throw the ball into the other side's cups: grab it and let go in a headset, or hold F to charge a throw on a desktop. " +
            "2, 3 or 4 sides, teams, barriers, racks of 3 to 11 rows in four shapes, re-racks, rim shots, King of the Hill (176 cups), " +
            "Big Pong and Mayhem, AI opponents and adjustable aim assist, from a settings panel on each side. A port of the beer pong " +
            "table in Thryrallo's UdonPrefabs (https://github.com/Thryrallo/UdonPrefabs, MIT); table and cup models and textures by " +
            "TsunaMoo (https://tsunamoo.booth.pm/). Sounds CC0 (Kenney, ezwa); Dosis font SIL OFL 1.1.";
        public override string SnippetPosition => "0 0 0";
        /// <summary>PORT.md 8.2: what a fresh table starts with.</summary>
        public override IReadOnlyList<(string name, string value)> SnippetSettings => new[]
        {
            ("room", ""), ("players", "2"), ("mode", "normal"), ("rows", "5"), ("shape", "triangle"), ("size", "1"),
            ("teams", "false"), ("barrier", "false"), ("self-fire", "false"), ("friendly-fire", "true"), ("auto-respawn", "true"),
            ("points-popup", "true"), ("aim-assist", "0.3"), ("allow-aim-assist", "true"), ("allow-ai", "true"),
            ("throw-vr", "1.5"), ("throw-desktop", "1"), ("throw-key", "F"), ("volume", "0.5"),
        };

        GameObject bp;
        TMP_FontAsset dosis;
        KitStage stage;
        readonly Dictionary<string, object> tokens = new Dictionary<string, object>();
        readonly Dictionary<string, JObject> fields = new Dictionary<string, JObject>();

        Transform F(Transform from, string path)
        {
            var t = from.Find(path);
            if (t != null) return t;
            // say what is there, so a wrong name is quick to fix
            var parts = path.Split('/');
            var at = from;
            foreach (var part in parts)
            {
                var next = at.Find(part);
                if (next == null)
                    throw new Exception($"no '{part}' under '{KitStage.KitPath(at, stage.Root.transform)}' (looking for '{path}'); children: " +
                                        string.Join(", ", at.Cast<Transform>().Select(c => "'" + c.name + "'")));
                at = next;
            }
            return at;
        }

        /// <summary>A plain behaviour of the TypeScript (id fixed by bindings.lock.json), its fields filled in later.</summary>
        object Beh(string id, string type, GameObject on)
        {
            var f = new JObject();
            var token = stage.Behaviour(on, type, f);
            tokens[id] = token;
            fields[id] = f;
            return token;
        }

        JObject B(string id) => stage.BehaviourValue(tokens[id]);
        GameObject O(GameObject go, string key, bool refToo = true, string sync = null, bool? grab = null, bool? click = null)
        {
            stage.Object(go, key: key, sync: sync, grab: grab, click: click);
            if (refToo) stage.Ref(go);
            return go;
        }
        static JObject Comp(string key, string kind) => new JObject { ["$comp"] = key, ["kind"] = kind };
        static JObject Obj(string key) => new JObject { ["$obj"] = key };
        static JObject V3(Vector3 v) => new JObject { ["$v3"] = new JArray(Round(v.x), Round(v.y), Round(v.z)) };
        static double Round(float f) => Math.Round(f, 5);

        protected override void Compose(KitStage s)
        {
            stage = s;
            tokens.Clear();
            fields.Clear();
            var upstream = AssetDatabase.LoadAssetAtPath<GameObject>(UpstreamPrefab) ?? throw new Exception($"no upstream prefab at {UpstreamPrefab}: run the importer");
            bp = stage.Copy(upstream, null, Top);
            bp.transform.localPosition = Vector3.zero;
            bp.transform.localRotation = Quaternion.identity;
            bp.transform.localScale = Vector3.one;
            var root = bp.transform;

            // VRChat's layers mean nothing here: everything on Default; bound objects get UI or Grabbable from the kit builder.
            foreach (var t in bp.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 0;

            // ---- what is not ported (PORT.md 10.2, 8.1): the reflection probe (a snippet must not light the host world),
            //      the never-shown throw indicator, localisation, the screen-space strength bar (replaced below) ----
            foreach (var name in new[] { "Reflection Probe", "ThrowIndicator", "Localization", "CupsCollector" })
            {
                var t = root.Find(name);
                if (t != null) Object.DestroyImmediate(t.gameObject);
            }
            foreach (var t in bp.GetComponentsInChildren<Transform>(true).Where(t => t != null && t.name == "Strength Indicator" && t.parent == root).ToList())
                Object.DestroyImmediate(t.gameObject);
            foreach (var t in bp.GetComponentsInChildren<Transform>(true).Where(t => t != null && t.name.StartsWith("LocalizationMenu")).ToList())
                Object.DestroyImmediate(t.gameObject);
            foreach (var probe in bp.GetComponentsInChildren<ReflectionProbe>(true)) Object.DestroyImmediate(probe.gameObject);

            var players = F(root, "Players");
            players.localPosition = Vector3.zero;
            players.localRotation = Quaternion.identity;
            players.localScale = Vector3.one;

            foreach (var c in bp.GetComponentsInChildren<Collider>(true).Where(c => !c.enabled))
                stage.Report.AppendLine($"   collider off in the prefab: {KitStage.KitPath(c.transform, stage.Root.transform)} {c.GetType().Name}");
            Materials();
            Labels();
            TextureSizes();
            var dosisSource = AssetDatabase.LoadAssetAtPath<Font>("Assets/Upstream/_Internal/_Assets/Dosis-VariableFont_wght.ttf") ?? throw new Exception("Dosis is missing");
            Directory.CreateDirectory(FontFolder);
            string ascii = new string(Enumerable.Range(32, 95).Select(i => (char)i).ToArray()) + "äöüÄÖÜß°…";
            dosis = KitText.StaticFontAsset(dosisSource, ascii, $"{FontFolder}/Dosis SDF.asset", 90, 1024);

            // ---- the table, effects, balls ----
            O(bp, "beerPong", refToo: false);
            var table = F(root, "table").gameObject;
            O(table, "table");
            var tables = new JArray(JValue.CreateNull(), JValue.CreateNull());
            for (int n = 2; n <= 4; n++)
            {
                var model = F(table.transform, $"[ThryBP]{n}Players").gameObject;
                O(model, $"table{n}");
                tables.Add(Comp($"table{n}", "Renderer"));
            }
            var splash = F(root, "SplashParticles").gameObject;
            O(splash, "splash");
            SplashBurst(splash.GetComponent<ParticleSystem>());

            // ---- the Game (on the upstream copy's root, so the page can scale it) ----
            Beh("game", "Game", bp);
            var cupTemplateSource = F(root, "[ThryBP]glass").gameObject;
            var lod0 = F(cupTemplateSource.transform, "Glass_LOD0").GetComponent<Renderer>();
            var glass = new JObject { ["boundsExtents"] = V3(lod0.bounds.extents), ["lossyScale"] = V3(cupTemplateSource.transform.lossyScale) };
            stage.Report.AppendLine($"   cup template: Glass_LOD0 bounds extents {lod0.bounds.extents:F4}, lossy scale {cupTemplateSource.transform.lossyScale:F4}");

            // ---- the four sides (the ball's rest height needs the table's top and the ball's radius) ----
            var hull = F(table.transform, "[ThryBP]2Players").GetComponent<MeshCollider>();
            tableTop = hull != null ? hull.bounds.max.y - root.position.y : 0.82f;
            var firstBall = F(root, BallNames[0]).GetComponent<Renderer>();
            ballRadius = (firstBall.bounds.extents.x + firstBall.bounds.extents.y + firstBall.bounds.extents.z) / 3f;
            stage.Report.AppendLine($"   table top {tableTop:F3}, ball radius {ballRadius:F4}");
            for (int side = 0; side < 4; side++) Side(side, glass, cupTemplateSource);

            // the cup template at the table centre (King of the Hill, Big Pong); the original goes
            Template(cupTemplateSource, F(root, "KingOfTheHillPosition"));
            Object.DestroyImmediate(cupTemplateSource);

            // ---- balls ----
            for (int i = 0; i < 4; i++) Ball(i);

            // ---- the Game's fields (PORT.md 5.3) ----
            Color[] colours = { new Color(0.237f, 0.745f, 0f), new Color(0.745f, 0f, 0.218f), new Color(0f, 0.569f, 0.764f), new Color(0.84f, 0.698f, 0f) };
            JObject Pose(Transform team) => new JObject
            {
                ["position"] = V3(root.InverseTransformPoint(team.position)),
                ["yaw"] = Round((Quaternion.Inverse(root.rotation) * team.rotation).eulerAngles.y),
            };
            JArray Poses(int n) => new JArray(Enumerable.Range(1, n).Select(k => (JToken)Pose(F(table.transform, $"[ThryBP]{n}Players/Team{k}"))));
            var g = fields["game"];
            g["_initialPlayerColors"] = new JArray(colours.Select(c => (JToken)new JObject { ["$color"] = new JArray(Round(c.r), Round(c.g), Round(c.b), 1.0) }));
            g["_allowAvatarThemeColorUsage"] = true;
            g["_allowAimAssist"] = true;
            g["_allowAI"] = true;
            g["PlayersList"] = new JArray(Enumerable.Range(0, 4).Select(p => (JToken)B($"p{p}")));
            g["_tablesAnimator"] = Comp("table", "Animator");
            g["Balls"] = new JArray(Enumerable.Range(0, 4).Select(b => (JToken)B($"ball{b}")));
            g["_teamIndicatorMaterialIndex"] = 3;
            g["_tables"] = tables;
            g["_twoTeamPositions"] = Poses(2);
            g["_threeTeamPositions"] = Poses(3);
            g["_fourTeamPositions"] = Poses(4);
            g["_respawnHeightLocal"] = V3(root.InverseTransformPoint(F(root, "RespawnHeight").position));
            g["_kingOfTheHillLocal"] = V3(root.InverseTransformPoint(F(root, "KingOfTheHillPosition").position));
            g["KingOfTheHillPath"] = $"{Top}/KingOfTheHillPosition";
            g["ballRadiusLocal"] = Round(ballRadius);
            g["LogMinLevel"] = 1;
            stage.Report.AppendLine($"   ball radius {ballRadius:F4}; respawn height {g["_respawnHeightLocal"]}; table height {g["_kingOfTheHillLocal"]}");

            // ---- uGUI: the panels are clicked through uGUI (spike S6: a GraphicRaycaster, the UI layer); nothing calls
            //      UnityEvents any more (their targets were Udon), every value goes through the relay graph ----
            UiCleanup();
            Credits();
        }

        // ------------------------------------------------------------------ one side

        float tableTop, ballRadius;

        void Side(int s, JObject glass, GameObject cupTemplateSource)
        {
            var root = bp.transform;
            string K(string name) => $"p{s}{name}";
            var player = F(root, $"Players/{PlayerNames[s]}");
            var ui = F(player, "Fixture UI/Slider/Panel/UI");
            O(player.gameObject, K(""));
            O(F(player, "ScoreTable/Points").gameObject, K("score"));
            O(F(player, "Fixture UI/Button Open Settings").gameObject, K("uiButton"), click: true);
            O(F(player, "Fixture UI").gameObject, K("uiAnim"));
            var popup = F(player, "Temp Scoreboard");
            O(popup.gameObject, K("popup"));
            O(F(popup, "Canvas/Score").gameObject, K("popupScore"));
            O(F(popup, "Canvas/Player Aim Assist/Value").gameObject, K("popupAssist"));
            var bg0 = F(popup, "Canvas/BG_scoreboard");
            O(bg0.gameObject, K("popupBg0"));
            var bg1 = bg0.Cast<Transform>().FirstOrDefault(c => c.GetComponent<UnityEngine.UI.Image>() != null) ?? F(popup, "Canvas/BG_scoreboard_1");
            O(bg1.gameObject, K("popupBg1"));
            O(F(ui, "Last Aim Assist/Value").gameObject, K("lastAssist"));
            O(F(ui, "NavBar").gameObject, K("navbar"));
            foreach (var t in Tabs) O(F(ui, $"NavBar/{t}").gameObject, K("tab" + t));
            O(F(ui, "Main/AI/AI").gameObject, K("aiSettings"));
            O(F(ui, "Main/AI/AimAssist").gameObject, K("aimAssistSettings"));
            O(F(ui, "Main/Visual/UseAvatarThemeColor").gameObject, K("avatarColor"));
            O(F(ui, "Main/AI/AimAssist/AdaptiveAim").gameObject, K("adaptiveAim"));

            // the rack anchor holds the CupsManager (it has no object of its own upstream that stays on: CupsManager.cs:64-66)
            var anchor = F(player, "[GamemodeNormal]Cups Anchor");
            O(anchor.gameObject, K("cupsAnchor"), refToo: false);
            var cm = F(anchor, "CupsManager");
            Object.DestroyImmediate(cm.gameObject);
            Template(cupTemplateSource, anchor);

            Beh($"p{s}", "Player", player.gameObject);
            Beh($"cm{s}", "CupsManager", anchor.gameObject);
            Beh($"ann{s}", "PlayerScoreAnnouncement", popup.gameObject);

            float Alpha(Transform t) { var gr = t.GetComponent<UnityEngine.UI.Graphic>(); return gr != null ? gr.color.a : 1f; }
            var p = fields[$"p{s}"];
            p["CupsManager"] = B($"cm{s}");
            p["ScoreAnnouncement"] = B($"ann{s}");
            p["UIAnimator"] = Comp(K("uiAnim"), "Animator");
            p["UiButtonRenderer"] = Comp(K("uiButton"), "Renderer");
            p["LastAimAssitDisplay"] = Comp(K("lastAssist"), "Text");
            p["UI_score_boards"] = new JArray(Comp(K("score"), "Text"));
            p["UiImagesUsingPlayerColor"] = new JArray(Comp(K("popupBg0"), "Image"), Comp(K("popupBg1"), "Image"));
            p["UiImageAlphas"] = new JArray(Round(Alpha(bg0)), Round(Alpha(bg1)));
            p["_avatarThemeColorToggle"] = Obj(K("avatarColor"));
            p["_aiNavButton"] = Obj(K("tabAI"));
            p["_aiSettings"] = Obj(K("aiSettings"));
            p["_aimAssistSettings"] = Obj(K("aimAssistSettings"));
            p["_adaptiveAimToggle"] = Obj(K("adaptiveAim"));
            // the ball rests on the table: upstream's spawn point (0.01 above the table's base, kinematic) is inside the
            // table's convex collider, which a physics ball would fall through and a desktop pointer cannot reach
            var spawnPoint = player.InverseTransformPoint(F(player, "BallSpawnPoint").position);
            spawnPoint.y = Mathf.Max(spawnPoint.y, tableTop - player.localPosition.y + ballRadius + 0.003f);
            p["BallSpawnLocal"] = V3(spawnPoint);
            p["AiBallSpawnLocal"] = V3(player.InverseTransformPoint(F(player, "AI_SpawnPoint").position));
            p["CupsAnchorLocal"] = V3(player.InverseTransformPoint(anchor.position));
            p["CupsAnchorPath"] = KitStage.KitPath(anchor, stage.Root.transform);
            p["LogMinLevel"] = 1;
            var c = fields[$"cm{s}"];
            c["Glass"] = glass.DeepClone();
            c["SidePlayer"] = B($"p{s}");
            c["LogMinLevel"] = 1;
            var a = fields[$"ann{s}"];
            a["_animator"] = Comp(K("popup"), "Animator");
            a["_textScore"] = Comp(K("popupScore"), "TMP");
            a["_textSkill"] = Comp(K("popupAssist"), "TMP");
            a["_player"] = B($"p{s}");

            // ---- the panel's inputs (PORT.md 5.4) ----
            // the click (UI/ClickSound.cs): one source per panel, the CC0 click
            var clickHolder = ui.gameObject;
            var click = Clip(clickHolder, K("panel"), LoadClip("bp_click.ogg"), volume: 0.6f);
            JObject Input(string id, string type, GameObject on, JObject extra)
            {
                Beh($"p{s}_{id}", type, on);
                var f = fields[$"p{s}_{id}"];
                f["NetworkVariable"] = false;
                f["EventName"] = "";
                f["VariableName"] = "";
                f["clickSource"] = Comp(K("panel"), "AudioSource");
                f["clickClip"] = click.DeepClone();
                foreach (var pr in extra.Properties()) f[pr.Name] = pr.Value;
                return f;
            }
            void Toggle(string id, string path, string target, string variable)
            {
                var go = O(F(ui, path).gameObject, K("_" + id));
                Input(id, "SimpleUIToggle", go, new JObject { ["UdonBehaviours"] = new JArray(B(target)), ["VariableName"] = variable, ["NetworkVariable"] = true });
                stage.Event(go, "uiToggle", tokens[$"p{s}_{id}"], "OnValueChanged");
            }
            void Slider(string id, string path, string target, string variable, bool networked, JObject extra = null)
            {
                var go = O(F(ui, path).gameObject, K("_" + id));
                var slider = go.GetComponent<UnityEngine.UI.Slider>();
                if (slider == null) throw new Exception($"no Slider on {path}");
                var f = new JObject { ["UdonBehaviours"] = new JArray(B(target)), ["VariableName"] = variable, ["NetworkVariable"] = networked, ["wholeNumbers"] = slider.wholeNumbers };
                if (extra != null) foreach (var pr in extra.Properties()) f[pr.Name] = pr.Value;
                Input(id, "SimpleUISlider", go, f);
                stage.Event(go, "uiSlider", tokens[$"p{s}_{id}"], "OnValueChanged");
            }
            void Selector(string id, string path, string target, string variable, bool networked, string[] options, string eventName = "")
            {
                var go = O(F(ui, path).gameObject, K("_" + id));
                O(F(ui, path + "/Selection").gameObject, K("_" + id + "Label"));
                Input(id, "SimpleUIOptionSelector", go, new JObject
                {
                    ["UdonBehaviours"] = new JArray(B(target)), ["VariableName"] = variable, ["NetworkVariable"] = networked, ["EventName"] = eventName,
                    ["Options"] = new JArray(options), ["Label"] = Comp(K("_" + id + "Label"), "Text"),
                });
                var left = O(ButtonUnder(F(ui, path), "Left"), K("_" + id + "Left"));
                var right = O(ButtonUnder(F(ui, path), "Right"), K("_" + id + "Right"));
                stage.Event(left, "uiButton", tokens[$"p{s}_{id}"], "Prev");
                stage.Event(right, "uiButton", tokens[$"p{s}_{id}"], "Next");
            }
            void Button(string id, string path, string behaviour, string method)
            {
                var go = O(F(ui, path).gameObject, K("_" + id));
                stage.Event(go, "uiButton", tokens[behaviour], method);
            }

            // Game tab
            Selector("mode", "Main/Game/Gamemode", "game", "_gameMode", true, new[] { "Normal", "King of the Pong", "Big Pong", "Mayhem" });
            O(HandleText(F(ui, "Main/Game/PlayerCount")), K("_countHandle"));
            Slider("count", "Main/Game/PlayerCount", "game", "_playerCount", true, new JObject { ["Handle"] = Comp(K("_countHandle"), "Text") });
            Toggle("teams", "Main/Game/TeamsBarrier/Teams", "game", "_doTeams");
            Toggle("barrier", "Main/Game/TeamsBarrier/Barrier", "game", "_useBarrier");
            // Rules tab
            Toggle("selfFire", "Main/Rules/Self Fire", "game", "_allowSelfFire");
            Toggle("friendlyFire", "Main/Rules/Friendly Fire (Teams):", "game", "_allowFriendlyFire");
            Toggle("autoRespawn", "Main/Rules/Auto Respawn Balls", "game", "_doAutoRespawnBalls");
            // Player tab: rows and shape are this side's, not networked, then ResetGlasses
            // (upstream's Rows handle has no number on it, unlike the side count's)
            Slider("rows", "Main/Player/Options/Rows", $"cm{s}", "_rows", false, new JObject { ["EventName"] = "ResetGlasses" });
            Selector("shape", "Main/Player/Options/Shape", $"cm{s}", "_shape", false, new[] { "Triangle", "Square", "Circle", "HashTag" }, "ResetGlasses");
            Button("reset", "Main/Player/Options/Buttons/Reset", $"p{s}", "ResetPlayer");
            Button("rerack", "Main/Player/Options/Buttons/Rerack", $"cm{s}", "Rerack");
            Button("sync", "Main/Player/Global/Sync", $"p{s}", "SyncSettingsToAllPlayers");
            Button("resetAll", "Main/Player/Global/Reset", $"p{s}", "ResetAllPlayers");
            // AI tab
            Toggle("ai", "Main/AI/AI/AI", $"p{s}", "_isAI");
            Toggle("aiAdaptive", "Main/AI/AI/Adaptive", $"p{s}", "_useAdaptiveAISkill");
            Slider("aiSkill", "Main/AI/AI/AI Skill", $"p{s}", "_aiSkill", true);
            Slider("aimAssist", "Main/AI/AimAssist/AimAssist", "game", "_aimAssist", true);
            // Visual tab
            Toggle("pointsPopup", "Main/Visual/Points Popup", "game", "_showPointsPopup");
            Slider("size", "Main/Visual/Size/Slider", "game", "_size", true, new JObject { ["resetValue"] = 1 });
            Button("sizeReset", "Main/Visual/Size/Reset", $"p{s}_size", "ResetValue");
            // Volume (local)
            Slider("volume", "Volume/Container/Volume", "game", "_volume", false);
            var volumeToggle = O(F(ui, "Volume/Toggle").gameObject, K("_volumeToggle"));
            var volumeContainer = O(F(ui, "Volume/Container").gameObject, K("_volumeContainer"));
            Beh($"p{s}_volumeOpen", "ToggleActive", volumeToggle);
            fields[$"p{s}_volumeOpen"]["Target"] = Obj(K("_volumeContainer"));
            stage.Event(volumeToggle, "uiToggle", tokens[$"p{s}_volumeOpen"], "OnValueChanged");
            // Tabs (the contents are switched by the page: SimpleUIToggleGroup.Contents)
            var contents = new JArray();
            foreach (var t in Tabs) { O(F(ui, $"Main/{t}").gameObject, K("content" + t)); contents.Add(Obj(K("content" + t))); }
            Input("nav", "SimpleUIToggleGroup", F(ui, "NavBar").gameObject, new JObject
            {
                ["UdonBehaviours"] = new JArray(B($"p{s}")), ["VariableName"] = "_settingsNavbar", ["NetworkVariable"] = true,
                ["Toggles"] = new JArray(Tabs.Select(t => (JToken)Obj(K("tab" + t)))), ["Contents"] = contents,
            });
            for (int i = 0; i < Tabs.Length; i++) stage.Event(F(ui, $"NavBar/{Tabs[i]}").gameObject, "uiToggle", tokens[$"p{s}_nav"], $"_Toggle{i}");
            // Open Settings (a click on the table edge, reach 1 m)
            Input("open", "SimpleUIInteract", F(player, "Fixture UI/Button Open Settings").gameObject, new JObject
            {
                ["UdonBehaviours"] = new JArray(B($"p{s}")), ["EventName"] = "ToggleSettings",
            });
        }

        static GameObject ButtonUnder(Transform selector, string name)
        {
            // upstream names one of them "Right " (with a space) on some selectors
            var t = selector.Cast<Transform>().FirstOrDefault(c => c.name.Trim() == name && c.GetComponent<UnityEngine.UI.Button>() != null)
                    ?? selector.GetComponentsInChildren<UnityEngine.UI.Button>(true).Select(b => b.transform).FirstOrDefault(c => c.name.Trim() == name);
            if (t == null) throw new Exception($"no button '{name}' under {selector.name}");
            if (t.name != name) t.name = name;
            return t.gameObject;
        }

        static GameObject HandleText(Transform slider)
        {
            var text = slider.GetComponentsInChildren<UnityEngine.UI.Text>(true).FirstOrDefault(t => t.transform.parent != null && t.transform.parent.name == "Handle");
            if (text == null) throw new Exception($"no handle text under {slider.name}");
            return text.gameObject;
        }

        /// <summary>An inactive copy of the cup under a rack anchor: the relay's spawn op copies it (game ops cupPlace, cupInside).</summary>
        void Template(GameObject source, Transform anchor)
        {
            var copy = Object.Instantiate(source, anchor, false);
            copy.name = CupTemplate;
            copy.transform.localPosition = Vector3.zero;
            copy.transform.localRotation = Quaternion.identity;
            copy.transform.localScale = source.transform.localScale;
            foreach (var mb in copy.GetComponents<MonoBehaviour>()) if (mb != null && stage.IsStandIn(mb)) Object.DestroyImmediate(mb);
            var inside = copy.transform.Find("[ThryBP]InsideCollider");
            if (inside != null) inside.gameObject.SetActive(false);
            foreach (var mesh in copy.GetComponents<MeshCollider>()) { mesh.convex = true; mesh.enabled = true; }
            copy.SetActive(false);
        }

        // ------------------------------------------------------------------ balls

        void Ball(int i)
        {
            var ball = F(bp.transform, BallNames[i]).gameObject;
            string key = $"ball{i}";
            O(ball, key, sync: "transform", grab: true);
            var body = ball.GetComponent<Rigidbody>();
            if (body == null) body = ball.AddComponent<Rigidbody>();
            // the owner's physics flies the ball (PORT.md 0.1); at rest and on other clients it is kinematic (set by the page)
            body.isKinematic = true;
            // upstream's collider is off in the prefab and switched on by Ball.cs at run time (Init): on here
            foreach (var c in ball.GetComponents<Collider>()) c.enabled = true;
            var at = ball.transform.localPosition;
            ball.transform.localPosition = new Vector3(at.x, Mathf.Max(at.y, tableTop + ballRadius + 0.003f), at.z);
            body.useGravity = true;
            body.mass = 1f;
            body.linearDamping = 0f;
            body.angularDamping = 0.5f;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            // continuous, not speculative: speculative contacts fire OnCollisionEnter (and deflect the ball) near a cup it never touches (seen in Play mode)
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            var audio = ball.GetComponent<AudioSource>();
            if (audio != null) { audio.playOnAwake = false; audio.spatialBlend = 1f; audio.volume = 0.5f; }

            // the desktop charge bar (PORT.md 0.6: replaces StrengthIndicator.shader)
            var bar = stage.Primitive(PrimitiveType.Quad, "StrengthBar", ball.transform);
            Object.DestroyImmediate(bar.GetComponent<Collider>());
            float s = ball.transform.lossyScale.x;
            bar.transform.localPosition = new Vector3(0f, 0.09f / s, 0f);
            bar.transform.localRotation = Quaternion.identity;
            bar.transform.localScale = new Vector3(0.14f / s, 0.022f / s, 1f);
            var barRenderer = bar.GetComponent<MeshRenderer>();
            barRenderer.sharedMaterial = BarMaterial();
            barRenderer.shadowCastingMode = ShadowCastingMode.Off;
            barRenderer.receiveShadows = false;
            O(bar, key + "Bar");

            Beh(key, "Ball", ball);
            var f = fields[key];
            f["index"] = i;
            f["_throwVelocityMultiplierVR"] = 1.5;
            f["_throwVelocityMultiplierDekstop"] = 1;
            f["_gameManager"] = B("game");
            f["_renderer"] = Comp(key, "Renderer");
            f["_splashParticles"] = Comp("splash", "ParticleSystem");
            f["_audioSource"] = Comp(key, "AudioSource");
            f["_strengthIndicatorDesktop"] = Comp(key + "Bar", "Renderer");
            f["_audio_collision_table"] = Clip(ball, key, LoadClip("bp_table.ogg"));
            f["_audio_collision_glass"] = Clip(ball, key, LoadClip("bp_glass.ogg"));
            f["_audio_water_splash"] = Clip(ball, key, LoadClip("bp_splash.ogg"));
            stage.Event(ball, "collisionEnter", tokens[key], "OnBallCollision");

            var variables = ball.GetComponent<Variables>();
            if (variables == null) variables = ball.AddComponent<Variables>();
            variables.declarations.Set(RespawnVariable, F(bp.transform, "RespawnHeight").gameObject);
            variables.declarations.Set(LaunchVariable, Vector3.zero);
            variables.declarations.Set(LaunchPendingVariable, false);
            stage.AddGraph(ball, "ball" + i, BallGraph.Build(i, key));          // one asset per ball: the graph knows its index
        }

        public const string RespawnVariable = "BpRespawn";
        public const string LaunchVariable = "BpLaunch";
        public const string LaunchPendingVariable = "BpLaunchPending";

        static AudioClip LoadClip(string file) =>
            AssetDatabase.LoadAssetAtPath<AudioClip>($"{SoundFolder}/{file}") ?? throw new Exception($"no sound {SoundFolder}/{file}");

        /// <summary>
        /// {"$clip": n, "on": key} for a plain behaviour's field (KitStage does the same for a stand-in's AudioClip field): the
        /// clip in the holder's BS Audio Source list and in its PkClips variable, which the relay's audio op reads.
        /// </summary>
        JObject Clip(GameObject holder, string holderKey, AudioClip clip, float volume = 1f)
        {
            O(holder, holderKey);
            var source = holder.GetComponent<AudioSource>();
            if (source == null) { source = holder.AddComponent<AudioSource>(); source.playOnAwake = false; source.spatialBlend = 1f; source.volume = volume; }
            var bsType = GraphTypes.Find("BS.BSAudioSource");
            var bs = holder.GetComponent(bsType);
            if (bs == null) bs = holder.AddComponent(bsType);
            var so = new SerializedObject(bs);
            var clips = so.FindProperty("clips");
            for (int i = 0; i < clips.arraySize; i++)
                if (clips.GetArrayElementAtIndex(i).objectReferenceValue == clip) return new JObject { ["$clip"] = i, ["on"] = holderKey };
            clips.arraySize++;
            clips.GetArrayElementAtIndex(clips.arraySize - 1).objectReferenceValue = clip;
            var playOnAwake = so.FindProperty("playOnAwake");
            if (playOnAwake != null) playOnAwake.boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
            var variables = holder.GetComponent<Variables>();
            if (variables == null) variables = holder.AddComponent<Variables>();
            var mirror = variables.declarations.IsDefined(RelayGraph.ClipsVariable) ? variables.declarations.Get(RelayGraph.ClipsVariable) as AotList : null;
            if (mirror == null) { mirror = new AotList(); variables.declarations.Set(RelayGraph.ClipsVariable, mirror); }
            mirror.Add(clip);
            return new JObject { ["$clip"] = clips.arraySize - 1, ["on"] = holderKey };
        }

        /// <summary>Upstream emits 20 particles at the ball (Ball.cs:186-189): one burst of 20 when the page plays the system.</summary>
        static void SplashBurst(ParticleSystem ps)
        {
            if (ps == null) return;
            var main = ps.main;
            // particles live 1 s, not 2: they have fallen under the table by then, and the kit's bounds (its footprint and
            // photo) are not stretched 12 m down by two seconds of falling
            main.startLifetime = new ParticleSystem.MinMaxCurve(1f);
            main.loop = false;
            main.playOnAwake = false;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            emission.rateOverDistance = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)20) });
        }

        // ------------------------------------------------------------------ relay ops of the game's own (PortOps.ts)

        public override void RelayOps(RelayGraph.Ops ops)
        {
            var g = ops.g;
            // cupPlace | @<cup> | lx | ly | lz | scale | r | g | b
            ops.Add("cupPlace", () =>
            {
                var t = g.Keep(g.Get(typeof(GameObject), "transform", ops.Target));
                g.Set(typeof(Transform), "localPosition", t, g.V3(ops.Number(0), ops.Number(1), ops.Number(2)));
                var s = g.Keep(ops.Number(3));
                g.Set(typeof(Transform), "localScale", t, g.V3(s, s, s));
                var colour = g.Keep(g.Rgba(ops.Number(4), ops.Number(5), ops.Number(6), 1f));
                g.ForEach(t, typeof(Transform), child =>
                    g.If(g.StartsWith(g.Get(typeof(Transform), "name", child), "Glass"), () =>
                    {
                        var r = g.Keep(g.ComponentOf(g.Get(typeof(Transform), "gameObject", child), typeof(Renderer)));
                        g.IfNotNull(r, () => g.Do(typeof(Material), "SetColor", new[] { typeof(string), typeof(Color) }, g.Get(typeof(Renderer), "material", r), "_BaseColor", colour));
                    }));
            });
            // bpLaunch | <ball> | vx | vy | vz: the body leaves kinematic; its ball graph sets the velocity in the next physics
            // step (a velocity set in the frame the body leaves kinematic is lost: seen in Play mode)
            ops.Add("bpLaunch", () => ops.With(typeof(Rigidbody), rb =>
            {
                var velocity = g.Keep(g.V3(ops.Number(0), ops.Number(1), ops.Number(2)));
                g.Set(typeof(Rigidbody), "isKinematic", rb, false);
                g.SetObjVar(LaunchVariable, velocity, ops.Target, typeof(Vector3));
                g.SetObjVar(LaunchPendingVariable, true, ops.Target, typeof(bool));
            }));
            // cupInside | @<cup> | 1/0: the throw collider off and the inner colliders on, or the other way round
            ops.Add("cupInside", () =>
            {
                var inside = g.Keep(ops.Flag(0));
                ops.With(typeof(MeshCollider), c => g.Set(typeof(Collider), "enabled", c, g.Not(inside)));
                g.ForEach(g.Get(typeof(GameObject), "transform", ops.Target), typeof(Transform), child =>
                    g.If(g.Same(g.Get(typeof(Transform), "name", child), "[ThryBP]InsideCollider"), () =>
                        g.Do(typeof(GameObject), "SetActive", new[] { typeof(bool) }, g.Get(typeof(Transform), "gameObject", child), inside)));
            });
        }

        // ------------------------------------------------------------------ text, UI, credits

        protected override void Finishing(KitStage s)
        {
            KitText.ToTextMeshPro(bp, fontFor: _ => dosis, report: s.Report);
            var fallback = KitText.DefaultFont();
            foreach (var tmp in bp.GetComponentsInChildren<TMP_Text>(true))
                if (tmp.font == null) tmp.font = fallback;
        }

        /// <summary>Labels hold localisation keys upstream ("bp:rows"); the English of beerpong_localization.csv goes in (item 92).</summary>
        void Labels()
        {
            var csv = AssetDatabase.LoadAssetAtPath<TextAsset>(Csv) ?? throw new Exception($"no {Csv}");
            var english = new Dictionary<string, string>();
            foreach (var line in csv.text.Split('\n'))
            {
                var parts = line.TrimEnd('\r').Split(',');
                if (parts.Length >= 2 && parts[0].StartsWith("bp:") && !parts[0].EndsWith("[]")) english[parts[0]] = parts[1];
            }
            int n = 0;
            foreach (var text in bp.GetComponentsInChildren<UnityEngine.UI.Text>(true))
                if (english.TryGetValue(text.text.Trim(), out var label)) { text.text = label; n++; }
            foreach (var text in bp.GetComponentsInChildren<TMP_Text>(true))
                if (english.TryGetValue(text.text.Trim(), out var label)) { text.text = label; n++; }
            stage.Report.AppendLine($"   {n} labels from beerpong_localization.csv (English)");
        }

        void UiCleanup()
        {
            int listeners = 0;
            foreach (var selectable in bp.GetComponentsInChildren<UnityEngine.UI.Selectable>(true))
            {
                UnityEngine.Events.UnityEventBase e = selectable is UnityEngine.UI.Button b ? b.onClick
                    : selectable is UnityEngine.UI.Toggle t ? t.onValueChanged
                    : selectable is UnityEngine.UI.Slider sl ? sl.onValueChanged : (UnityEngine.Events.UnityEventBase)null;
                if (e == null) continue;
                for (int i = e.GetPersistentEventCount() - 1; i >= 0; i--) { UnityEditor.Events.UnityEventTools.RemovePersistentListener(e, i); listeners++; }
            }
            stage.Report.AppendLine($"   {listeners} UnityEvent calls removed (the relay graph reports the controls instead)");
            foreach (var image in bp.GetComponentsInChildren<UnityEngine.UI.Image>(true))
                if (image.sprite != null && AssetDatabase.GetAssetPath(image.sprite).StartsWith("Resources/unity_builtin_extra")) { image.sprite = null; image.type = UnityEngine.UI.Image.Type.Simple; }
            foreach (var canvas in bp.GetComponentsInChildren<Canvas>(true))
            {
                // the settings panels are clicked; the score plates and popups are only read
                bool panel = canvas.name == "UI" && canvas.transform.parent != null && canvas.transform.parent.name == "Panel";
                foreach (var box in canvas.GetComponents<Collider>()) Object.DestroyImmediate(box);
                if (!panel) { foreach (var r in canvas.GetComponents<UnityEngine.UI.GraphicRaycaster>()) Object.DestroyImmediate(r); continue; }
                if (canvas.GetComponent<UnityEngine.UI.GraphicRaycaster>() == null) canvas.gameObject.AddComponent<UnityEngine.UI.GraphicRaycaster>();
                foreach (var t in canvas.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 5;
            }
        }

        const string CreditsText =
            "<b>Beer Pong</b>: a port of the beer pong table in Thryrallo's UdonPrefabs (github.com/Thryrallo/UdonPrefabs), MIT licence, " +
            "Copyright (c) 2022 Thryrallo. Table and cup models and textures: TsunaMoo (tsunamoo.booth.pm), in the same repository.\n" +
            "Changed for Altspace: URP materials, TextMesh Pro text, a physics ball owned by the thrower, a charge bar by the ball.\n" +
            "Sounds: Kenney Impact Sounds and Interface Sounds (kenney.nl, CC0); water splash by ezwa (OpenGameArt, CC0).\n" +
            "Font: Dosis by Edgar Tolentino, Pablo Impallari and Igino Marini, SIL Open Font License 1.1.";

        void Credits()
        {
            foreach (var name in PlayerNames)
            {
                var credits = F(bp.transform, $"Players/{name}/Fixture UI/Slider/Panel/UI/Main/Credits");
                var go = stage.Create("PortCredits", credits);
                go.layer = 5;
                var rect = go.AddComponent<RectTransform>();
                var parentRect = credits.GetComponent<RectTransform>();
                rect.anchorMin = new Vector2(0f, 0f);
                rect.anchorMax = new Vector2(1f, 0f);
                rect.pivot = new Vector2(0.5f, 0f);
                rect.sizeDelta = new Vector2(-40f, parentRect != null ? parentRect.rect.height * 0.42f : 300f);
                rect.anchoredPosition = new Vector2(0f, 10f);
                var text = go.AddComponent<TextMeshProUGUI>();
                text.font = dosis;
                text.fontSize = 34;
                text.color = Color.white;
                text.alignment = TextAlignmentOptions.BottomLeft;
                text.textWrappingMode = TextWrappingModes.Normal;
                text.raycastTarget = false;
                text.text = CreditsText;
            }
        }

        // ------------------------------------------------------------------ materials and textures

        readonly Dictionary<Material, Material> converted = new Dictionary<Material, Material>();

        void Materials()
        {
            Directory.CreateDirectory(MaterialFolder);
            converted.Clear();
            foreach (var renderer in bp.GetComponentsInChildren<Renderer>(true))
            {
                var shared = renderer.sharedMaterials;
                for (int i = 0; i < shared.Length; i++) if (shared[i] != null) shared[i] = Convert(shared[i], renderer is ParticleSystemRenderer);
                if (renderer is ParticleSystemRenderer psr && psr.trailMaterial != null) psr.trailMaterial = Convert(psr.trailMaterial, true);
                renderer.sharedMaterials = shared;
            }
            AssetDatabase.SaveAssets();
            stage.Report.AppendLine($"   {converted.Count} materials made for URP: {string.Join(", ", converted.Values.Select(m => m.name))}");
        }

        Material Convert(Material source, bool particles)
        {
            if (converted.TryGetValue(source, out var done)) return done;
            // only the built-in pipeline's Standard and particle shaders are remade; anything else (TextMesh Pro, URP) stays
            string shaderName = source.shader != null ? source.shader.name : "";
            bool standard = shaderName == "Standard" || shaderName == "Standard (Specular setup)";
            bool builtInParticle = shaderName.StartsWith("Particles/") || shaderName.StartsWith("Legacy Shaders/Particles") || shaderName.StartsWith("Mobile/Particles");
            if (!standard && !builtInParticle) return source;
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var particle = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            string name = "BP " + source.name;
            Material m;
            if (particles)
            {
                m = new Material(particle) { name = name };
                m.SetTexture("_BaseMap", source.HasProperty("_MainTex") ? source.GetTexture("_MainTex") : null);
                m.SetColor("_BaseColor", source.HasProperty("_TintColor") ? source.GetColor("_TintColor") * 2f : source.HasProperty("_Color") ? source.GetColor("_Color") : Color.white);
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", 2f);                                           // additive
            }
            else
            {
                m = new Material(lit) { name = name };
                Color colour = source.HasProperty("_Color") ? source.GetColor("_Color") : Color.white;
                m.SetColor("_BaseColor", colour);
                if (source.HasProperty("_MainTex")) { m.SetTexture("_BaseMap", source.GetTexture("_MainTex")); m.SetTextureScale("_BaseMap", source.GetTextureScale("_MainTex")); }
                if (source.HasProperty("_BumpMap") && source.GetTexture("_BumpMap") != null) { m.SetTexture("_BumpMap", source.GetTexture("_BumpMap")); m.SetFloat("_BumpScale", source.GetFloat("_BumpScale")); }
                if (source.HasProperty("_Metallic")) m.SetFloat("_Metallic", source.GetFloat("_Metallic"));
                if (source.HasProperty("_Glossiness")) m.SetFloat("_Smoothness", source.GetFloat("_Glossiness"));
                if (source.IsKeywordEnabled("_EMISSION") && source.HasProperty("_EmissionColor"))
                {
                    m.EnableKeyword("_EMISSION");
                    m.SetColor("_EmissionColor", source.GetColor("_EmissionColor"));
                    m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                }
                // the indicator material's emission is recoloured at run time (Game.cs:530-531): keep emission on
                if (source.name.StartsWith("PlayerIndicator")) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", colour); m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None; }
                float mode = source.HasProperty("_Mode") ? source.GetFloat("_Mode") : 0f;
                if (mode >= 2f)
                {
                    m.SetFloat("_Surface", 1f);
                    m.SetFloat("_Blend", 0f);
                }
                else if (mode >= 1f)
                {
                    m.SetFloat("_AlphaClip", 1f);
                    m.SetFloat("_Cutoff", source.HasProperty("_Cutoff") ? source.GetFloat("_Cutoff") : 0.5f);
                }
            }
            m.enableInstancing = false;
            m = SaveMaterial(m);
            if (m.shader == lit) BaseShaderGUI.SetMaterialKeywords(m, UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);
            else BaseShaderGUI.SetMaterialKeywords(m);
            EditorUtility.SetDirty(m);
            return converted[source] = m;
        }

        static Material SaveMaterial(Material m)
        {
            string path = $"{MaterialFolder}/{m.name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing == null) { AssetDatabase.CreateAsset(m, path); return m; }
            existing.shader = m.shader;
            existing.CopyPropertiesFromMaterial(m);
            existing.shaderKeywords = m.shaderKeywords;
            EditorUtility.SetDirty(existing);
            return existing;
        }

        /// <summary>URP Unlit with alpha clipping on a red-to-green strip whose alpha falls from 1 to 0 (Ball.ts ShowStrength).</summary>
        Material BarMaterial()
        {
            string texPath = $"{MaterialFolder}/BP StrengthBar.png";
            if (!File.Exists(texPath))
            {
                var tex = new Texture2D(64, 4, TextureFormat.RGBA32, false);
                for (int x = 0; x < 64; x++)
                {
                    float u = x / 63f;
                    var c = Color.Lerp(new Color(0.9f, 0.1f, 0.05f), new Color(0.15f, 0.85f, 0.1f), u);
                    c.a = 1f - u * 0.99f;
                    for (int y = 0; y < 4; y++) tex.SetPixel(x, y, c);
                }
                tex.Apply();
                File.WriteAllBytes(texPath, tex.EncodeToPNG());
                AssetDatabase.ImportAsset(texPath);
                var importer = (TextureImporter)AssetImporter.GetAtPath(texPath);
                importer.alphaIsTransparency = false;
                importer.mipmapEnabled = false;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.filterMode = FilterMode.Point;
                importer.textureCompression = TextureImporterCompression.Uncompressed;
                importer.SaveAndReimport();
            }
            string path = $"{MaterialFolder}/BP StrengthBar.mat";
            var m = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { name = "BP StrengthBar" };
            m.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(texPath));
            m.SetColor("_BaseColor", Color.white);
            m.SetFloat("_AlphaClip", 1f);
            m.SetFloat("_Cutoff", 1.01f);
            m.SetFloat("_Cull", 0f);
            m = SaveMaterial(m);
            BaseShaderGUI.SetMaterialKeywords(m);
            m.SetFloat("_Cutoff", 1.01f);
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>PORT.md 6: Android textures at most 1024 (the wood maps are 2048), at most 2048 everywhere.</summary>
        void TextureSizes()
        {
            var textures = new HashSet<string>();
            foreach (var renderer in bp.GetComponentsInChildren<Renderer>(true))
                foreach (var m in renderer.sharedMaterials)
                {
                    if (m == null) continue;
                    foreach (var name in m.GetTexturePropertyNames())
                    {
                        var t = m.GetTexture(name);
                        var path = t != null ? AssetDatabase.GetAssetPath(t) : null;
                        if (!string.IsNullOrEmpty(path) && path.StartsWith("Assets/")) textures.Add(path);
                    }
                }
            foreach (var graphic in bp.GetComponentsInChildren<UnityEngine.UI.Image>(true))
                if (graphic.sprite != null && AssetDatabase.GetAssetPath(graphic.sprite).StartsWith("Assets/")) textures.Add(AssetDatabase.GetAssetPath(graphic.sprite));
            foreach (var path in textures)
            {
                if (!(AssetImporter.GetAtPath(path) is TextureImporter importer)) continue;
                var android = importer.GetPlatformTextureSettings("Android");
                int want = Math.Min(1024, importer.maxTextureSize);
                bool changed = !android.overridden || android.maxTextureSize != want;
                android.overridden = true;
                android.maxTextureSize = want;
                android.format = TextureImporterFormat.ASTC_6x6;
                importer.SetPlatformTextureSettings(android);
                if (importer.maxTextureSize > 2048) { importer.maxTextureSize = 2048; changed = true; }
                if (changed) importer.SaveAndReimport();
            }
            stage.Report.AppendLine($"   {textures.Count} textures: Android at most 1024 px (ASTC 6x6), at most 2048 px elsewhere");
        }
    }
}
