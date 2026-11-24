// The ball graph, one per ball (BeerPongKitBuilder.Ball): what only Unity sees, reported to the page through the
// graph-to-page channel (portkit README, "Graph to page"). The page side is ts/src/Ball.ts.
//
//   bpRelease|<ball>|<vx>|<vy>|<vz>|<max angular deg/s>  On Release of a grab. Ball.cs:226-233 per frame while held
//       (a ring of the last 10 frame velocities and rotation rates), and :511-527 at the release: the mean of the
//       non-zero velocities, its length raised by min(1.5, the largest rotation rate / 2000). The page multiplies by
//       throw-vr (1.5, :547).
//   collisionEnter|<ball key>|<other name>|<px>|<py>|<pz>|<nx>|<ny>|<nz>|<own>|<bx>|<by>|<bz>|<vx>|<vy>|<vz>|<ox>|<oy>|<oz>|<other top y>
//       OnCollisionEnter (:982-1022): the kit's multi-argument collision event. The velocity is the body's at the last
//       physics step before the contact (upstream's last sample); "own" says whether the other collider is in this
//       kit (Game.AllowCollision's other-table test, Game.cs:480); the other's position and the top of its collider's
//       bounds are what a cup hit needs (Ball.cs:929-946).
//   (a throw itself is the kit's standard rbLaunch op, in the relay graph: kinematic off, the velocity on the second
//   physics step)
//   bpStill|<ball>, bpLow|<ball>  while the body is dynamic (the owner's throw): still (speed^2 <= 0.5) for over 1 s and
//       over 1 s since it went dynamic, and below RespawnHeight (Ball.cs:264-289), once each per flight.
using PortKit;
using Unity.VisualScripting;
using UnityEngine;

namespace BeerPong
{
    public static class BallGraph
    {
        const int Ring = 10;

        public static GraphWriter Build(int index, string key)
        {
            var g = new GraphWriter();
            var v3 = typeof(Vector3);
            g.Declare("Held", false);
            g.Declare("LastPos", Vector3.zero);
            g.Declare("LastRot", Quaternion.identity);
            for (int k = 0; k < Ring; k++) { g.Declare("V" + k, Vector3.zero); g.Declare("A" + k, 0f); }
            g.Declare("PrevVel", Vector3.zero);
            g.Declare("Dyn", false);
            g.Declare("DynSince", 0f);
            g.Declare("StillSince", 0f);
            g.Declare("SaidStill", false);
            g.Declare("SaidLow", false);

            Val Position() => g.Get(typeof(Transform), "position");
            Val Rotation() => g.Get(typeof(Transform), "rotation");

            // ---- held: the ring (Ball.cs:226-233) ----
            g.On(g.Platform("OnGrab"), _ =>
            {
                g.SetGraphVar("Held", true);
                g.SetGraphVar("Dyn", false);
                g.SetGraphVar("LastPos", Position(), v3);
                g.SetGraphVar("LastRot", Rotation(), typeof(Quaternion));
                for (int k = 0; k < Ring; k++) { g.SetGraphVar("V" + k, g.V3(0f, 0f, 0f), v3); g.SetGraphVar("A" + k, 0f); }
            });
            g.On(new Update(), _ => g.If(g.B("Held"), () =>
            {
                var pos = g.Keep(Position());
                var rot = g.Keep(Rotation());
                var dt = g.Keep(g.Max(g.Get(typeof(Time), "deltaTime"), 0.0001f));
                var sample = g.Keep(g.Scale(pos - g.GraphVar("LastPos", v3), 1f / dt));
                var angle = g.Keep(g.Call(typeof(Quaternion), "Angle", new[] { typeof(Quaternion), typeof(Quaternion) }, null, rot, g.GraphVar("LastRot", typeof(Quaternion))) / dt);
                for (int k = Ring - 1; k > 0; k--)
                {
                    g.SetGraphVar("V" + k, g.GraphVar("V" + (k - 1), v3), v3);
                    g.SetGraphVar("A" + k, g.F("A" + (k - 1)));
                }
                g.SetGraphVar("V0", sample, v3);
                g.SetGraphVar("A0", angle);
                g.SetGraphVar("LastPos", pos, v3);
                g.SetGraphVar("LastRot", rot, typeof(Quaternion));
            }));

            // ---- released: the drop velocity (Ball.cs:511-527) ----
            g.On(g.Platform("OnRelease"), _ =>
            {
                g.SetGraphVar("Held", false);
                g.SetGraphVar("Dyn", false);
                Val sum = g.GraphVar("V0", v3);
                for (int k = 1; k < Ring; k++) sum = sum + g.GraphVar("V" + k, v3);
                sum = g.Keep(sum);
                Val count = g.Select(g.Greater(g.Get(v3, "sqrMagnitude", g.GraphVar("V0", v3)), 0f), 1f, 0f);
                Val maxAngle = g.F("A0");
                for (int k = 1; k < Ring; k++)
                {
                    count = count + g.Select(g.Greater(g.Get(v3, "sqrMagnitude", g.GraphVar("V" + k, v3)), 0f), 1f, 0f);
                    maxAngle = g.Max(maxAngle, g.F("A" + k));
                }
                count = g.Keep(count);
                maxAngle = g.Keep(maxAngle);
                // (no sample: zero, where upstream divided by zero, :523)
                var mean = g.Keep(g.Select(g.Greater(count, 0f), g.Scale(sum, 1f / g.Max(count, 1f)), g.V3(0f, 0f, 0f), v3));
                var boost = g.Min(1.5f, maxAngle / 2000f);
                var velocity = g.Keep(g.Scale(g.Normalized(mean), g.Magnitude(mean) + boost));
                g.PageEvent("bpRelease", index, g.InvariantText(g.X(velocity)), g.InvariantText(g.Y(velocity)), g.InvariantText(g.Z(velocity)), g.InvariantText(maxAngle));
            });

            // ---- the owner's flight: the miss checks of Ball.cs:264-289 at the physics rate ----
            g.On(new FixedUpdate(), _ => g.If(g.Not(g.Get(typeof(Rigidbody), "isKinematic")), () =>
            {
                var now = g.Keep(g.Get(typeof(Time), "time"));
                g.If(g.Not(g.B("Dyn")), () =>
                {
                    g.SetGraphVar("Dyn", true);
                    g.SetGraphVar("DynSince", now);
                    g.SetGraphVar("StillSince", now);
                    g.SetGraphVar("SaidStill", false);
                    g.SetGraphVar("SaidLow", false);
                });
                var velocity = g.Keep(g.Get(typeof(Rigidbody), "linearVelocity"));
                g.SetGraphVar("PrevVel", velocity, v3);
                g.If(g.Greater(g.Get(v3, "sqrMagnitude", velocity), 0.5f),
                    () => g.SetGraphVar("StillSince", now),
                    () => g.If(g.And(g.And(g.Greater(now - g.F("StillSince"), 1f), g.Greater(now - g.F("DynSince"), 1f)), g.Not(g.B("SaidStill"))), () =>
                    {
                        g.SetGraphVar("SaidStill", true);
                        g.PageEvent("bpStill", index);
                    }));
                var respawn = g.Get(typeof(GameObject), "transform", g.ObjVar(BeerPongKitBuilder.RespawnVariable, typeof(GameObject)));
                var below = g.Less(g.Y(Position()), g.Y(g.Get(typeof(Transform), "position", respawn)));
                g.If(g.And(below, g.Not(g.B("SaidLow"))), () =>
                {
                    g.SetGraphVar("SaidLow", true);
                    g.PageEvent("bpLow", index);
                });
            }, () => g.SetGraphVar("Dyn", false)));

            // ---- contacts (Ball.cs:982-1022) ----
            g.On(new OnCollisionEnter(), u =>
            {
                var collider = g.Keep(g.EventOut(u, "collider", typeof(Collider)));
                var other = g.Keep(g.Get(typeof(Collider), "transform", collider));
                var contact = g.Keep(g.ListItem(g.EventOut(u, "contacts", typeof(ContactPoint[])), 0, typeof(ContactPoint)));
                var point = g.Keep(g.Get(typeof(ContactPoint), "point", contact));
                var normal = g.Keep(g.Get(typeof(ContactPoint), "normal", contact));
                var own = g.Call(typeof(Transform), "IsChildOf", new[] { typeof(Transform) }, other, g.Get(typeof(GameObject), "transform", g.KitRoot()));
                // the body's own position (the transform is interpolated, a frame behind at speed)
                var ball = g.Keep(g.Get(typeof(Rigidbody), "position"));
                var velocity = g.Keep(g.GraphVar("PrevVel", v3));
                var otherPosition = g.Keep(g.Get(typeof(Transform), "position", other));
                var top = g.Y(g.Get(typeof(Bounds), "max", g.Get(typeof(Collider), "bounds", collider)));
                Val T(Val f) => g.InvariantText(f);
                g.PageEvent("collisionEnter", key, g.EncodeArg(g.Get(typeof(Transform), "name", other)),
                    T(g.X(point)), T(g.Y(point)), T(g.Z(point)), T(g.X(normal)), T(g.Y(normal)), T(g.Z(normal)),
                    g.Select(own, "1", "0", typeof(string)),
                    T(g.X(ball)), T(g.Y(ball)), T(g.Z(ball)), T(g.X(velocity)), T(g.Y(velocity)), T(g.Z(velocity)),
                    T(g.X(otherPosition)), T(g.Y(otherPosition)), T(g.Z(otherPosition)), T(top));
            });
            return g;
        }
    }
}
