// Editor helper: writes the upstream prefab's (or the built kit's) hierarchy with each object's components to
// Logs/beerpong_dump.txt, for writing and checking the kit builder. Editor only.
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace BeerPong
{
    public static class BeerPongDump
    {
        [MenuItem("PortKit/Beer Pong/Dump Upstream")]
        public static void DumpUpstream() => Dump(BeerPongKitBuilder.UpstreamPrefab);

        [MenuItem("PortKit/Beer Pong/Dump Kit")]
        public static void DumpKit() => Dump("Assets/Kit/beer-pong.prefab");

        static void Dump(string path)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var scene = UnityEditor.SceneManagement.EditorSceneManager.NewPreviewScene();
            var go = asset == null ? null : (GameObject)Object.Instantiate(asset);
            if (go != null) UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(go, scene);
            var text = new StringBuilder();
            if (go == null) text.AppendLine("no prefab at " + path);
            else Walk(go.transform, 0, text);
            UnityEditor.SceneManagement.EditorSceneManager.ClosePreviewScene(scene);
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/beerpong_dump.txt", text.ToString());
        }

        static void Walk(Transform t, int depth, StringBuilder text)
        {
            var parts = t.GetComponents<Component>().Select(c => c == null ? "MISSING" : c.GetType().Name).Where(n => n != "Transform" && n != "RectTransform");
            string extra = "";
            var ui = t.GetComponent<UnityEngine.UI.Text>();
            if (ui != null) extra += " text='" + ui.text.Replace("\n", "\\n") + "'";
            var r = t.GetComponent<Renderer>();
            if (r != null && r.bounds.size.magnitude > 2f) extra += $" BIGBOUNDS c={r.bounds.center:F2} s={r.bounds.size:F2}";
            if (r != null) extra += " mats=" + string.Join(",", r.sharedMaterials.Select(m => m == null ? "null" : m.name + "(" + (m.shader != null ? m.shader.name : "?") + ")"));
            text.AppendLine(new string(' ', depth * 2) + t.name + (t.gameObject.activeSelf ? "" : " [off]") + " L" + t.gameObject.layer +
                            $" lp=({t.localPosition.x:F3},{t.localPosition.y:F3},{t.localPosition.z:F3}) le=({t.localEulerAngles.x:F0},{t.localEulerAngles.y:F0},{t.localEulerAngles.z:F0}) ls={t.localScale.x:F3}" +
                            " {" + string.Join(", ", parts) + "}" + extra);
            foreach (Transform c in t) Walk(c, depth + 1, text);
        }
    }
}
