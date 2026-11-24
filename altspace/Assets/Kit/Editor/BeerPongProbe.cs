// Play-mode test readers of beer pong's own (portkit README "Probing Unity": a game adds its own commands):
//   PKTEST CMD <id> bpcups <holder>          the cup copies in Unity: "<side 0> <side 1> <side 2> <side 3> <centre>" (active copies)
//   PKTEST CMD <id> bpcupnames <holder> <n>  the names of the copies under side n's anchor (4: the centre), joined by ","
//   PKTEST CMD <id> bpball <holder> <i>      ball i's body: "<kinematic> <vx> <vy> <vz> <x> <y> <z>"
//   PKTEST CMD <id> bpcupcolor <holder> <side> <cup name>   _BaseColor of the copy's Glass_LOD0
//   PKTEST CMD <id> bpright <holder> <slider path> <f>       the world point a fraction f of the slider's width right of its centre
//   PKTEST CMD <id> bpmesh <holder> <path>   mesh names an object and its children draw and collide with
// Editor only: never in a kit.
using System;
using System.Collections;
using System.Globalization;
using System.Linq;
using PortKit;
using UnityEditor;
using UnityEngine;

namespace BeerPong
{
    [InitializeOnLoad]
    public static class BeerPongProbe
    {
        static readonly string[] PlayerNames = { "Player", "Player (1)", "Player (2)", "Player (3)" };

        static BeerPongProbe()
        {
            KitPlayTest.Commands["bpcups"] = (a, reply) => { reply(Cups(a[0])); return null; };
            KitPlayTest.Commands["bpcupnames"] = (a, reply) =>
            {
                var anchor = Anchor(a[0], int.Parse(a[1], CultureInfo.InvariantCulture));
                reply(anchor == null ? "error: not found" : string.Join(",", anchor.Cast<Transform>().Where(IsCup).Select(t => t.name)));
                return null;
            };
            KitPlayTest.Commands["bpball"] = (a, reply) => { reply(BallState(a[0], int.Parse(a[1], CultureInfo.InvariantCulture))); return null; };
            KitPlayTest.Commands["bpright"] = (a, reply) =>
            {
                var t = KitProbe.Find(a[0], a[1]);
                var rect = t == null ? null : t.GetComponent<RectTransform>();
                if (rect == null) { reply("error: not found"); return null; }
                float f = float.Parse(a[2], CultureInfo.InvariantCulture);
                var p = rect.TransformPoint(rect.rect.center + new Vector2(rect.rect.width * f, 0f));
                reply(string.Format(CultureInfo.InvariantCulture, "{0:F4} {1:F4} {2:F4}", p.x, p.y, p.z));
                return null;
            };
            KitPlayTest.Commands["bpray"] = (a, reply) =>
            {
                var cam = Camera.main;
                if (cam == null) { reply("error: no camera"); return null; }
                var target = new Vector3(float.Parse(a[0], CultureInfo.InvariantCulture), float.Parse(a[1], CultureInfo.InvariantCulture), float.Parse(a[2], CultureInfo.InvariantCulture));
                var from = cam.transform.position;
                var hits = Physics.RaycastAll(from, (target - from).normalized, 5f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Collide);
                reply($"from {from:F2}: " + string.Join("; ", hits.OrderBy(h => h.distance).Select(h =>
                    $"{h.collider.name} L{h.collider.gameObject.layer} {(h.collider.isTrigger ? "trigger " : "")}{h.distance:F2}")));
                return null;
            };
            KitPlayTest.Commands["bpvar"] = (a, reply) =>
            {
                var t = KitProbe.Find(a[0], a[1]);
                if (t == null) { reply("error: not found"); return null; }
                var vars = Unity.VisualScripting.Variables.Object(t.gameObject);
                reply(string.Join(", ", a.Skip(2).Select(n => n + "=" + (vars.IsDefined(n) ? Convert.ToString(vars.Get(n), CultureInfo.InvariantCulture) : "undefined"))));
                return null;
            };
            // the meshes an object and its children draw and collide with: "<renderer meshes> | <collider meshes>" (the
            // generated table and cups, never upstream's table.dae / glass.dae)
            KitPlayTest.Commands["bpmesh"] = (a, reply) =>
            {
                var t = KitProbe.Find(a[0], a[1]);
                if (t == null) { reply("error: not found"); return null; }
                var drawn = t.GetComponentsInChildren<MeshFilter>(true).Where(f => f.sharedMesh != null).Select(f => f.sharedMesh.name).Distinct();
                var colliding = t.GetComponentsInChildren<MeshCollider>(true).Where(c => c.sharedMesh != null).Select(c => c.sharedMesh.name).Distinct();
                reply(string.Join(",", drawn) + " | " + string.Join(",", colliding));
                return null;
            };
            KitPlayTest.Commands["bpcupcolor"] = (a, reply) =>
            {
                var anchor = Anchor(a[0], int.Parse(a[1], CultureInfo.InvariantCulture));
                var cup = anchor == null ? null : anchor.Cast<Transform>().LastOrDefault(t => t.name == string.Join(" ", a.Skip(2)).Replace("%20", " "));
                var r = cup == null ? null : cup.Find("Glass_LOD0")?.GetComponent<Renderer>();
                if (r == null) { reply("error: not found"); return null; }
                var c = r.material.GetColor("_BaseColor");
                reply(string.Format(CultureInfo.InvariantCulture, "{0:F3} {1:F3} {2:F3}", c.r, c.g, c.b));
                return null;
            };
        }

        static bool IsCup(Transform t) => t.name.StartsWith("[ThryBP]Cup ") && t.gameObject.activeSelf;

        static Transform Top(string holder)
        {
            var root = KitProbe.Find(holder, ".");
            return root == null ? null : root.Find(BeerPongKitBuilder.Top);
        }

        static Transform Anchor(string holder, int side)
        {
            var top = Top(holder);
            if (top == null) return null;
            return side >= 4 ? top.Find("KingOfTheHillPosition") : top.Find($"Players/{PlayerNames[side]}/[GamemodeNormal]Cups Anchor");
        }

        static string Cups(string holder)
        {
            if (Top(holder) == null) return "error: not found";
            return string.Join(" ", Enumerable.Range(0, 5).Select(s => Anchor(holder, s)).Select(a => a == null ? "-" : a.Cast<Transform>().Count(IsCup).ToString(CultureInfo.InvariantCulture)));
        }

        static string BallState(string holder, int i)
        {
            var top = Top(holder);
            var ball = top == null ? null : top.Find(i == 0 ? "Ball" : $"Ball ({i})");
            var body = ball == null ? null : ball.GetComponent<Rigidbody>();
            if (body == null) return "error: not found";
            var v = body.linearVelocity;
            var p = ball.position;
            return string.Format(CultureInfo.InvariantCulture, "{0} {1:F3} {2:F3} {3:F3} {4:F3} {5:F3} {6:F3}", body.isKinematic, v.x, v.y, v.z, p.x, p.y, p.z);
        }
    }
}
