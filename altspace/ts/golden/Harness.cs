// Golden vectors for beer-pong: upstream's CupsManager.cs (_Internal/BeerPong/scripts, MIT), unchanged, driven through
// its private rack methods with reflection, on portkit's stand-ins (ts/portkit/golden/UdonStubs.cs: Mathf, Vector3 ==, Unity's
// Random) plus VRC's Utilities.IsValid, which the shared stand-ins do not have. Writes ts/vectors/upstream.json;
// test/racks.test.ts compares the TypeScript with it.
//
//   dotnet run --project golden -c Release -- vectors/upstream.json      (npm run golden)
//
// A rack is written as 242 characters, one per grid position in upstream order (index = row * 22 + column):
// '.' for 255 (no cup), otherwise the owner's slot digit.
//
// What is "C# semantics", not Udon's: float maths in single precision on .NET 8, and `(int)` of NaN (x64: int.MinValue),
// which the empty-rack rerack path takes (CupsManager.cs:209-222).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using UdonSharp;
using UnityEngine;

namespace Thry.Udon
{
    /// <summary>_Scripts/Helpers.cs: Collections.Duplicate.</summary>
    public static class Collections
    {
        public static T[] Duplicate<T>(T[] a) => (T[])a.Clone();
    }
}

namespace Thry.Udon.UI
{
    /// <summary>The base class, without the SimpleUI wiring (not part of the rack rules).</summary>
    public abstract class SimpleUISetterExtension : UdonSharpBehaviour
    {
        protected abstract string LogPrefix { get; }
        protected void VariableChangedFromBehaviour(string name) { }
        protected static GameObject Instantiate(GameObject original)
        {
            var copy = new GameObject(original.name + "(Clone)");
            copy.AddComponent<Thry.Udon.BeerPong.Cup>();
            return copy;
        }
    }
}

namespace Thry.Udon.BeerPong
{
    // ---- a shadow of the one VRC member portkit's stand-ins lack (C# finds it before the usings) ----

    public static class Utilities
    {
        public static bool IsValid(object o) => o != null;
    }

    // ---- the other gameplay classes, as far as CupsManager touches them ----

    public enum GameMode { Normal = 0, KingOfTheHill = 1, BigPong = 2, Mayham = 3 }

    public class Game : UdonSharpBehaviour
    {
        public GameMode Gamemode;
        public Player[] Players;
    }

    public class Player : UdonSharpBehaviour
    {
        public int PlayerIndex;
        public Game GameManager;
        public bool DoRandomColor;
    }

    public class Cup : UdonSharpBehaviour
    {
        public Player PlayerCupOwner;
        public Player PlayerAnchorSide;
        public int Row, Column, Anchor_id;
        public Vector3 Position_offset;
        public float LocalRadius = 0.052f, LocalDiameter = 0.104f, LocalCircumfrence = 0.4775f, LocalHeight = 0.152f;
        public Transform TableScaleTransform;
        public float GlobalHeight => LocalHeight;
        public void InitPrefab() { }
        public void UpdateColor(int index) { }
    }
}

namespace GoldenBeerPong
{
    using Thry.Udon.BeerPong;

    static class Program
    {
        const BindingFlags Any = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        static readonly string[] Shapes = { "triangle", "square", "circle", "hashtag" };
        static readonly string[] PlaceMethods = { "PlaceCupsAsPyramid", "PlaceCupsAsSquare", "PlaceCupsAsCircle", "PlaceCupsAsHashtag" };

        static void Set(object o, string field, object value) => o.GetType().GetField(field, Any).SetValue(o, value);
        static object Get(object o, string field) => o.GetType().GetField(field, Any).GetValue(o);

        /// <summary>A CupsManager as Init leaves it (CupsManager.cs:56-82), for the side with index `side`.</summary>
        static CupsManager NewManager(int side, GameMode mode)
        {
            var game = new GameObject("BeerPong").AddComponent<Game>();
            game.Gamemode = mode;
            game.Players = new Player[4];
            for (int i = 0; i < 4; i++)
            {
                game.Players[i] = new GameObject(i == 0 ? "Player" : $"Player ({i})").AddComponent<Player>();
                game.Players[i].PlayerIndex = i;
                game.Players[i].GameManager = game;
            }
            var manager = new GameObject("CupsManager").AddComponent<CupsManager>();
            manager.Player = game.Players[side];
            manager.Glass = new GameObject("[ThryBP]glass").AddComponent<Cup>();
            Set(manager, "X_PER_ROW", 22);
            var owners = new byte[242];
            for (int i = 0; i < owners.Length; i++) owners[i] = 255;
            Set(manager, "_cupOwnersAtPositions", owners);
            Set(manager, "_activeCupsByPosition", new Cup[242]);
            Set(manager, "_activeCupsList", new Cup[242]);
            // SyncGlasses would walk the grid one position per (stubbed) frame: mark it busy so the vectors are only the rules.
            Set(manager, "syncing", true);
            return manager;
        }

        static string Cells(CupsManager m)
        {
            var owners = (byte[])Get(m, "_cupOwnersAtPositions");
            var sb = new StringBuilder();
            foreach (var b in owners) sb.Append(b == 255 ? '.' : (char)('0' + b));
            return sb.ToString();
        }

        static int Main(string[] args)
        {
            var output = new Dictionary<string, object>();
            var placements = new Dictionary<string, object>();
            var reracks = new Dictionary<string, object>();
            for (int s = 0; s < Shapes.Length; s++)
            {
                // PlaceCupsAs* (CupsManager.cs:294-419) for rows 0..12, on side 1 (so the owner digit is not 0)
                var list = new List<object>();
                for (int rows = 0; rows <= 12; rows++)
                {
                    var m = NewManager(1, GameMode.Normal);
                    int count = (int)typeof(CupsManager).GetMethod(PlaceMethods[s], Any).Invoke(m, new object[] { rows });
                    list.Add(new Dictionary<string, object> { ["rows"] = rows, ["count"] = count, ["cells"] = Cells(m) });
                }
                placements[Shapes[s]] = list;

                // RerackInternal (CupsManager.cs:195-240) for every remaining count 0..121
                var rr = new List<object>();
                for (int n = 0; n <= 121; n++)
                {
                    var m = NewManager(1, GameMode.Normal);
                    m._shape = (CupsShape)s;
                    Set(m, "_existing_glasses_count", n);
                    typeof(CupsManager).GetMethod("RerackInternal", Any).Invoke(m, null);
                    rr.Add(new Dictionary<string, object> { ["n"] = n, ["cells"] = Cells(m) });
                }
                reracks[Shapes[s]] = rr;
            }

            // ResetGlassesInternal with the overwrites Game.ConfigureCups sets (Game.cs:651-689)
            var resets = new List<object>();
            void Reset(string name, int side, int rows, CupsShape shape, int overwriteRows, CupsShape overwriteShape)
            {
                var m = NewManager(side, GameMode.Normal);
                m._rows = rows;
                m._shape = shape;
                Set(m, "_overwriteRows", overwriteRows);
                Set(m, "_overwriteShape", overwriteShape);
                typeof(CupsManager).GetMethod("ResetGlassesInternal", Any).Invoke(m, null);
                resets.Add(new Dictionary<string, object> { ["name"] = name, ["side"] = side, ["count"] = m.SyncedCount, ["cells"] = Cells(m) });
            }
            for (int i = 0; i < 4; i++) Reset($"king of the hill tier {i}", i, 5, CupsShape.Triangle, 10 - i * 2, CupsShape.Circle);
            Reset("big pong, side 0", 0, 5, CupsShape.Triangle, 1, CupsShape.None);
            Reset("big pong, side 0 with hashtag", 0, 5, CupsShape.HashTag, 1, CupsShape.None);
            Reset("inactive side", 3, 7, CupsShape.Square, 0, CupsShape.None);
            Reset("normal, square 4", 2, 4, CupsShape.Square, -1, CupsShape.None);

            output["source"] = "_Internal/BeerPong/scripts/CupsManager.cs (Thryrallo/UdonPrefabs bd0b6ab), compiled unchanged with dotnet against portkit/golden/UdonStubs.cs";
            output["placements"] = placements;
            output["reracks"] = reracks;
            output["resets"] = resets;
            string json = JsonSerializer.Serialize(output, new JsonSerializerOptions { WriteIndented = true });
            string path = args.Length > 0 ? args[0] : "upstream.json";
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            File.WriteAllText(path, json + "\n");
            Console.WriteLine($"wrote {path}");
            return 0;
        }
    }
}
