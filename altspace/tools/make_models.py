"""Makes beer pong's table, its fittings and the cups in Blender, from nothing, and the wood texture.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup \
        --python altspace/tools/make_models.py [-- --preview <png>]

writes
    altspace/Assets/Kit/Models/bp_table.fbx    bp_table2, bp_table3, bp_table4 (and a convex collider mesh each,
                                               bp_table<n>_collider), the barrier rails and panes for 2, 3 and 4 sides
                                               (bp_divider<n>_rail, bp_divider<n>_pane), the settings fitting under each
                                               side's end (bp_fixture, bp_fixture_slider, bp_fixture_panel) and the
                                               table-edge "Open Settings" button (bp_settings_button)
    altspace/Assets/Kit/Models/bp_cup.fbx      bp_cup_lod0..2, bp_liquid_lod0..2, bp_cup_collider
    altspace/Assets/Kit/Textures/bp_wood.png   1024 x 1024 planks, tiling every metre

They replace the table, cup and texture files of upstream's _Internal/BeerPong (table.dae, glass.dae and their wood
and glass maps), which came with no licence of their own (PORT.md 0.8). Written for this port; same licence as the
port (MIT). Only sizes were taken from upstream, so that every collider, anchor, animation and rule number stays as it
was: the table's outline (1.51 m arms, 1.48 m from the centre; 2 sides a straight table, 3 a Y, 4 a cross), its top at
0.8197 m, the convex collider over that outline (as upstream's convex mesh collider), the barrier panes (0.34 m high),
the settings fitting, and the cup (10.4 cm across the rim, 15.2 cm high, the same radius profile). Each object is
built in Unity's own coordinates (metres, Y up, the pivot of the object it replaces); the axis change is baked into the
meshes, so every object comes in with no rotation and scale 1.

Material slots, in the order the kit builder fills them:
    tables      0 metal, 1 wood, 2 dark shell, 3 side indicator (recoloured at run time, Game.cs:524-532)
    panes       0 metal, 1 glass          panel   0 metal, 1 wood          button  0 button (recoloured)
    cups        0 rim and foot (recoloured per side, cupPlace), 1 glass     liquid  0 liquid
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "..", "Assets", "Kit")

# ---- upstream's numbers (measured from table.dae / glass.dae and the prefab; PORT.md 0.8) ----
ARM_HALF_WIDTH = 0.757
ARM_LENGTH = 1.4795
TABLE_TOP = 0.8197          # the top of the convex collider: where the ball rolls
WOOD_TOP = 0.8152
APRON_BOTTOM = 0.69


# ------------------------------------------------------------------------------------------------ mesh building

class Part:
    """A mesh in Unity's coordinates: vertices, faces (vertex index lists), a material slot and smoothness per face."""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []

    def v(self, x, y, z):
        self.verts.append((x, y, z))
        return len(self.verts) - 1

    def face(self, idx, mat, smooth=False):
        self.faces.append((list(idx), mat, smooth))

    # -- solids (each one closed, so outward normals can be worked out) --

    def prism(self, poly, y0, y1, top, side, bottom):
        """A polygon (x, z points, any orientation, concave allowed) extruded from y0 to y1."""
        lo = [self.v(x, y0, z) for x, z in poly]
        hi = [self.v(x, y1, z) for x, z in poly]
        self.face(hi, top)
        self.face(list(reversed(lo)), bottom)
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            self.face([lo[i], lo[j], hi[j], hi[i]], side)

    def ring(self, outer, inner, y0, y1, top, side, bottom, inner_side=None):
        """The solid between two polygons with as many points (inner inside outer), from y0 to y1."""
        ol = [self.v(x, y0, z) for x, z in outer]
        oh = [self.v(x, y1, z) for x, z in outer]
        il = [self.v(x, y0, z) for x, z in inner]
        ih = [self.v(x, y1, z) for x, z in inner]
        n = len(outer)
        for i in range(n):
            j = (i + 1) % n
            self.face([oh[i], oh[j], ih[j], ih[i]], top)
            self.face([ol[i], il[i], il[j], ol[j]], bottom)
            self.face([ol[i], ol[j], oh[j], oh[i]], side)
            self.face([il[j], il[i], ih[i], ih[j]], side if inner_side is None else inner_side)

    def box(self, centre, size, mat, yaw=0.0):
        """A box, turned by `yaw` degrees about Y (Unity's sense: +yaw turns +Z towards +X)."""
        cx, cy, cz = centre
        sx, sy, sz = (s / 2 for s in size)
        c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        pts = []
        for dx, dz in ((-sx, -sz), (sx, -sz), (sx, sz), (-sx, sz)):
            pts.append((cx + dx * c + dz * s, cz - dx * s + dz * c))
        self.prism(pts, cy - sy, cy + sy, mat, mat, mat)

    def lathe(self, profile, segments, phase=0.0):
        """A solid of revolution about Y: profile = [(radius, y, material, smooth)], a closed outline from the axis
        back to the axis (each point's material is used for the band from it to the next point)."""
        rings = []
        for r, y, _, _ in profile:
            if r <= 1e-9:
                rings.append([self.v(0.0, y, 0.0)])
            else:
                rings.append([self.v(r * math.sin(phase + 2 * math.pi * k / segments), y,
                                     r * math.cos(phase + 2 * math.pi * k / segments)) for k in range(segments)])
        for a in range(len(profile) - 1):
            ra, rb = rings[a], rings[a + 1]
            mat, smooth = profile[a][2], profile[a][3]
            for k in range(segments):
                k2 = (k + 1) % segments
                if len(ra) == 1:
                    self.face([ra[0], rb[k2], rb[k]], mat, smooth)
                elif len(rb) == 1:
                    self.face([ra[k], ra[k2], rb[0]], mat, smooth)
                else:
                    self.face([ra[k], ra[k2], rb[k2], rb[k]], mat, smooth)


def to_blender(part, materials, wood_uv_scale=1.0):
    """The part as a Blender object: Unity (x, y, z) is Blender (-x, -z, y) (FBX export: -Z forward, Y up; Unity's
    importer then mirrors X), triangulated, normals outward, a planar UV per face (wood: 1 m per texture)."""
    bm = bmesh.new()
    bv = [bm.verts.new((-x, -z, y)) for x, y, z in part.verts]
    bm.verts.ensure_lookup_table()
    made = []
    for idx, mat, smooth in part.faces:
        try:
            f = bm.faces.new([bv[i] for i in idx])
        except ValueError:
            continue  # a face that exists already (two solids sharing one): leave it
        f.material_index = mat
        f.smooth = smooth
        made.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            bx, by, bz = loop.vert.co
            ux, uy, uz = -bx, bz, -by
            if abs(n.z) >= max(abs(n.x), abs(n.y)):     # Blender Z = Unity Y: a top or bottom
                loop[uv].uv = (ux * wood_uv_scale + 0.5, uz * wood_uv_scale)
            elif abs(n.x) >= abs(n.y):                  # Blender X = Unity -X: a side facing X
                loop[uv].uv = (uz * wood_uv_scale, uy * wood_uv_scale)
            else:
                loop[uv].uv = (ux * wood_uv_scale, uy * wood_uv_scale)
    mesh = bpy.data.meshes.new(part.name)
    bm.to_mesh(mesh)
    bm.free()
    for m in materials:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(part.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------------------------------------ 2D helpers

def area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def inset(poly, d):
    """The polygon moved inwards by d (mitred corners; concave corners move outwards along their bisector)."""
    ccw = area(poly) > 0
    out = []
    n = len(poly)
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        normals = []
        for a, b in ((p0, p1), (p1, p2)):
            ex, ez = b[0] - a[0], b[1] - a[1]
            length = math.hypot(ex, ez)
            nx, nz = (-ez / length, ex / length) if ccw else (ez / length, -ex / length)
            normals.append((nx, nz))
        (ax, az), (bx, bz) = normals
        k = d / (1 + ax * bx + az * bz)
        out.append((p1[0] + (ax + bx) * k, p1[1] + (az + bz) * k))
    return out


def hull(points):
    pts = sorted(set((round(x, 6), round(z, 6)) for x, z in points))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 1e-12:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 1e-12:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def turned(vec, degrees):
    """(x, z) turned about Y as Unity turns it (+degrees takes +Z towards +X)."""
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    x, z = vec
    return (x * c + z * s, -x * s + z * c)


def arms(sides):
    """The arm directions (x, z) of a table: side 0 at -Z, the others turned as Team2.. are (Game's team poses)."""
    return [turned((0.0, -1.0), 360.0 * k / sides) for k in range(sides)]


def outline(sides):
    """The table's top seen from above: a rounded rectangle (2 sides), a Y (3) or a cross (4)."""
    w, length = ARM_HALF_WIDTH, ARM_LENGTH
    if sides == 2:
        r, steps = 0.04, 6
        pts = []
        for cx, cz, start in ((w - r, length - r, 0), (-(w - r), length - r, 90), (-(w - r), -(length - r), 180), (w - r, -(length - r), 270)):
            for k in range(steps + 1):
                a = math.radians(start + 90.0 * k / steps)
                pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
        return pts
    dirs = sorted(arms(sides), key=lambda d: math.atan2(d[1], d[0]))
    half_gap = math.pi / sides
    pts = []
    for k, d in enumerate(dirs):
        nxt = dirs[(k + 1) % len(dirs)]
        p = (d[1], -d[0])
        a = (d[0] * length + p[0] * w, d[1] * length + p[1] * w)
        b = (d[0] * length - p[0] * w, d[1] * length - p[1] * w)
        if a[0] * nxt[0] + a[1] * nxt[1] < b[0] * nxt[0] + b[1] * nxt[1]:
            a, b = b, a
        pts += [b, a]
        bis = (d[0] + nxt[0], d[1] + nxt[1])
        bl = math.hypot(*bis)
        r = w / math.sin(half_gap)
        pts.append((bis[0] / bl * r, bis[1] / bl * r))
    return pts


# ------------------------------------------------------------------------------------------------ the pieces

METAL, WOOD, SHELL, INDICATOR = 0, 1, 2, 3


def table(sides):
    part = Part(f"bp_table{sides}")
    edge = outline(sides)
    rim_inner = inset(edge, 0.035)
    # the metal rim round the top (its top is where upstream's collider is), the wood inside it, 4.5 mm lower
    part.ring(edge, rim_inner, 0.800, TABLE_TOP, METAL, METAL, METAL, inner_side=METAL)
    part.prism(inset(edge, 0.033), 0.785, WOOD_TOP, WOOD, WOOD, WOOD)
    # the apron under the top, with the side's indicator strip round it
    apron = inset(edge, 0.012)
    part.prism(apron, APRON_BOTTOM, 0.800, SHELL, SHELL, SHELL)
    part.ring(inset(edge, 0.006), inset(edge, 0.016), 0.744, 0.762, INDICATOR, INDICATOR, INDICATOR, inner_side=INDICATOR)
    # legs at each arm's end, with a crossbar and feet
    for d in arms(sides):
        p = (d[1], -d[0])
        end = (d[0] * (ARM_LENGTH - 0.16), d[1] * (ARM_LENGTH - 0.16))
        legs = []
        for side in (-1, 1):
            x = end[0] + p[0] * side * (ARM_HALF_WIDTH - 0.13)
            z = end[1] + p[1] * side * (ARM_HALF_WIDTH - 0.13)
            legs.append((x, z))
            part.box((x, (0.03 + APRON_BOTTOM) / 2, z), (0.06, APRON_BOTTOM - 0.03, 0.06), METAL)
            part.box((x, 0.015, z), (0.085, 0.03, 0.085), SHELL)
        yaw = math.degrees(math.atan2(p[0], p[1]))
        span = math.hypot(legs[1][0] - legs[0][0], legs[1][1] - legs[0][1])
        part.box(((legs[0][0] + legs[1][0]) / 2, 0.16, (legs[0][1] + legs[1][1]) / 2), (0.03, 0.03, span), METAL, yaw=yaw)
    if sides > 2:
        # a centre column under the middle of a Y or a cross
        part.lathe([(0.0, 0.0, SHELL, False), (0.16, 0.0, SHELL, False), (0.16, 0.03, METAL, False), (0.05, 0.04, METAL, True),
                    (0.05, APRON_BOTTOM, METAL, False), (0.0, APRON_BOTTOM, METAL, False)], 24)
    collider = Part(f"bp_table{sides}_collider")
    collider.prism(hull(edge), 0.0, TABLE_TOP, 0, 0, 0)
    return part, collider


def pane(part, direction, r0, r1, frame_out=True):
    """A barrier pane along `direction` from r0 to r1 from the centre (local y 0.001..0.3403): frame and glass."""
    d = direction
    yaw = math.degrees(math.atan2(d[0], d[1]))
    mid = (r0 + r1) / 2
    length = r1 - r0
    at = lambda r: (d[0] * r, d[1] * r)
    x, z = at(mid)
    part.box((x, 0.3253, z), (0.042, 0.030, length), METAL, yaw=yaw)          # top bar
    part.box((x, 0.0155, z), (0.042, 0.029, length), METAL, yaw=yaw)          # bottom bar
    if frame_out:
        ex, ez = at(r1 - 0.015)
        part.box((ex, 0.1707, ez), (0.042, 0.339, 0.030), METAL, yaw=yaw)     # end post
    gx, gz = at(mid - 0.0075)
    part.box((gx, 0.1705, gz), (0.008, 0.281, length - 0.015), 1, yaw=yaw)    # glass


def dividers():
    parts = []
    # 2 sides: one pane across the middle (along X), a rail in the table top
    rail = Part("bp_divider2_rail")
    rail.box((0.0, 0.8135, 0.0), (1.365, 0.016, 0.06), METAL)
    pane2 = Part("bp_divider2_pane")
    for d in ((1.0, 0.0), (-1.0, 0.0)):
        pane(pane2, d, 0.0, 0.675)
    parts += [rail, pane2]
    # 3 sides: three panes between the arms (rail object at y 0.8046, pane object at 0.8)
    rail = Part("bp_divider3_rail")
    pane3 = Part("bp_divider3_pane")
    for d in arms(3):
        b = (-d[0], -d[1])   # between the other two arms
        x, z = b[0] * 0.415, b[1] * 0.415
        yaw = math.degrees(math.atan2(b[0], b[1]))
        rail.box((x, 0.0089, z), (0.06, 0.016, 0.83), METAL, yaw=yaw)
        pane(pane3, b, 0.0, 0.82)
    rail.lathe([(0.0, 0.0009, METAL, False), (0.05, 0.0009, METAL, False), (0.05, 0.0169, METAL, False), (0.0, 0.0169, METAL, False)], 16)
    parts += [rail, pane3]
    # 4 sides: four panes along the diagonals
    rail = Part("bp_divider4_rail")
    pane4 = Part("bp_divider4_pane")
    for k in range(4):
        b = turned((0.0, 1.0), 45.0 + 90.0 * k)
        x, z = b[0] * 0.5, b[1] * 0.5
        yaw = math.degrees(math.atan2(b[0], b[1]))
        rail.box((x, 0.8135, z), (0.05, 0.016, 1.0), METAL, yaw=yaw)
        pane(pane4, b, 0.0, 1.0)
    rail.lathe([(0.0, 0.8055, METAL, False), (0.045, 0.8055, METAL, False), (0.045, 0.8215, METAL, False), (0.0, 0.8215, METAL, False)], 16)
    parts += [rail, pane4]
    return parts


def rounded_rect(hx, hz, r, steps=6):
    pts = []
    for cx, cz, start in ((hx - r, hz - r, 0), (-(hx - r), hz - r, 90), (-(hx - r), -(hz - r), 180), (hx - r, -(hz - r), 270)):
        for k in range(steps + 1):
            a = math.radians(start + 90.0 * k / steps)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def fittings():
    """The settings fitting under a side's end: bracket, slide, panel (the uGUI canvas lies on it), and the button."""
    bracket = Part("bp_fixture")
    bracket.box((0.0, -0.1475, -1.0917), (1.2312, 0.0457, 0.1844), METAL)
    slider = Part("bp_fixture_slider")
    for side in (-1, 1):
        slider.box((side * 0.5921, -0.1558, -0.9404), (0.04, 0.0222, 0.606), METAL)
    slider.box((0.0, -0.1558, -1.2284), (1.2242, 0.0222, 0.03), METAL)
    panel = Part("bp_fixture_panel")
    outer = rounded_rect(0.6455, 0.1618, 0.05)
    panel.prism(outer, -0.078, -0.0705, METAL, METAL, METAL)
    panel.ring(outer, inset(outer, 0.009), -0.0705, -0.040, METAL, METAL, METAL)
    panel.prism(inset(outer, 0.009), -0.0705, -0.0471, 1, 1, 1)
    button = Part("bp_settings_button")
    cx, cz = -0.5530, -1.3108
    b = Part("tmp")
    b.lathe([(0.0, 0.8145, 0, False), (0.0155, 0.8145, 0, False), (0.0155, 0.8225, 0, True), (0.0135, 0.8266, 0, True), (0.0, 0.8266, 0, False)], 24)
    button.verts = [(x + cx, y, z + cz) for x, y, z in b.verts]
    button.faces = b.faces
    return [bracket, slider, panel, button]


def cup(lod, segments):
    """A party cup: coloured foot and rim (slot 0), glass wall (slot 1), the radius profile of upstream's glass."""
    C, G = 0, 1
    part = Part(f"bp_cup_lod{lod}")
    part.lathe([
        (0.0, 0.0, C, False),
        (0.0390, 0.0, C, True), (0.0425, 0.003, C, True), (0.0425, 0.020, C, True), (0.0405, 0.024, G, True),
        (0.0483, 0.1440, C, True), (0.0515, 0.1455, C, True), (0.0521, 0.1480, C, True), (0.0515, 0.1505, C, True),
        (0.0483, 0.1520, C, True), (0.0465, 0.1505, C, True), (0.0463, 0.1440, G, True),
        (0.0386, 0.0100, C, False),
        (0.0, 0.0100, C, False),
    ], segments)
    liquid = Part(f"bp_liquid_lod{lod}")
    liquid.lathe([(0.0, 0.0073, 0, False), (0.0371, 0.0073, 0, True), (0.0429, 0.0929, 0, False), (0.0, 0.0929, 0, False)], max(10, segments * 2 // 3))
    return part, liquid


def cup_collider():
    part = Part("bp_cup_collider")
    part.lathe([(0.0, 0.0, 0, False), (0.0390, 0.0, 0, False), (0.0425, 0.003, 0, False), (0.0425, 0.006, 0, False),
                (0.0521, 0.1480, 0, False), (0.0483, 0.1520, 0, False), (0.0, 0.1520, 0, False)], 16)
    return part


# ------------------------------------------------------------------------------------------------ the wood texture

def periodic_noise(rng, size, sigma_u, sigma_v):
    """Smooth noise that tiles: white noise filtered in the frequency domain (wide along v: grain runs along v)."""
    white = rng.standard_normal((size, size))
    fu = np.fft.fftfreq(size)[None, :]
    fv = np.fft.fftfreq(size)[:, None]
    filt = np.exp(-0.5 * ((fu * size / sigma_u) ** 2 + (fv * size / sigma_v) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    return (out - out.mean()) / (out.std() + 1e-9)


def wood_texture(path, size=1024, planks=6, seed=7):
    rng = np.random.default_rng(seed)
    v, u = np.mgrid[0:size, 0:size] / size          # rows: v (along the planks), columns: u (across)
    plank = np.floor(u * planks).astype(int)
    within = u * planks - plank
    tone = rng.uniform(-0.07, 0.07, planks)[plank]
    warp = periodic_noise(rng, size, 6.0, 1.5)       # slow bends of the grain
    fine = periodic_noise(rng, size, 180.0, 6.0)     # fine fibres
    rings = np.sin(2 * np.pi * (within * 7.0 + plank * 0.37 + warp * 0.35))
    grain = 0.5 + 0.5 * rings
    base = np.array([0.66, 0.47, 0.29])
    dark = np.array([0.47, 0.31, 0.18])
    mix = np.clip(grain ** 3 * 0.75 + fine * 0.06, 0, 1)[..., None]
    rgb = base[None, None, :] * (1 - mix) + dark[None, None, :] * mix
    rgb = rgb * (1 + tone[..., None])
    # seams between planks, and one end joint per plank at its own place along v
    seam = np.minimum(within, 1 - within) * size / planks
    rgb = rgb * (1 - 0.45 * np.exp(-(seam / 1.2) ** 2))[..., None]
    joints = rng.uniform(0, 1, planks)[plank]
    dj = np.abs(((v - joints + 0.5) % 1.0) - 0.5) * size
    rgb = rgb * (1 - 0.4 * np.exp(-(dj / 1.0) ** 2))[..., None]
    rgb = np.clip(rgb, 0, 1)
    rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2)
    img = bpy.data.images.new("bp_wood", size, size, alpha=False)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())   # Blender's rows go bottom up
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print("wrote", os.path.normpath(path))


# ------------------------------------------------------------------------------------------------ export and preview

def material(name, rgba, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.metallic = metallic
    m.roughness = roughness
    return m


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"MESH"}, apply_unit_scale=True,
                             apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True, axis_forward="-Z", axis_up="Y",
                             mesh_smooth_type="FACE", use_mesh_modifiers=False, add_leaf_bones=False, bake_anim=False,
                             path_mode="STRIP", use_custom_props=False)
    print("wrote", os.path.normpath(path), [o.name for o in objects])


def preview(path, objects):
    """A Workbench picture of every piece laid out (for a look at what was made; not shipped)."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.filepath = path
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (5.5, -7.5, 5.0)
    cam.rotation_euler = (math.radians(60), 0, math.radians(36))
    cam.data.lens = 30
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    preview_path = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(os.path.join(KIT, "Models"), exist_ok=True)
    os.makedirs(os.path.join(KIT, "Textures"), exist_ok=True)
    metal = material("bp_metal", (0.62, 0.64, 0.66, 1), 0.8, 0.35)
    wood = material("bp_wood", (0.6, 0.42, 0.25, 1), 0.0, 0.6)
    shell = material("bp_shell", (0.13, 0.14, 0.15, 1), 0.5, 0.5)
    indicator = material("bp_indicator", (0.95, 0.95, 0.95, 1))
    glass = material("bp_glass", (0.75, 0.85, 0.9, 0.35), 0.0, 0.05)
    rim = material("bp_cup_rim", (0.75, 0.1, 0.12, 1), 0.0, 0.4)
    liquid = material("bp_liquid", (0.85, 0.55, 0.12, 1), 0.0, 0.2)
    button = material("bp_button", (0.9, 0.9, 0.9, 1), 0.0, 0.4)

    table_objects = []
    for sides in (2, 3, 4):
        body, collider = table(sides)
        table_objects.append(to_blender(body, [metal, wood, shell, indicator]))
        table_objects.append(to_blender(collider, [metal]))
    for part in dividers():
        table_objects.append(to_blender(part, [metal] if part.name.endswith("rail") else [metal, glass]))
    for part in fittings():
        mats = {"bp_fixture_panel": [metal, wood], "bp_settings_button": [button]}.get(part.name, [metal])
        table_objects.append(to_blender(part, mats))
    export(os.path.join(KIT, "Models", "bp_table.fbx"), table_objects)

    cup_objects = []
    for lod, segments in ((0, 48), (1, 24), (2, 16)):
        body, drink = cup(lod, segments)
        cup_objects.append(to_blender(body, [rim, glass]))
        cup_objects.append(to_blender(drink, [liquid]))
    cup_objects.append(to_blender(cup_collider(), [rim]))
    export(os.path.join(KIT, "Models", "bp_cup.fbx"), cup_objects)

    wood_texture(os.path.join(KIT, "Textures", "bp_wood.png"))

    if preview_path:
        # lay the pieces out side by side (Blender X is Unity -X)
        offsets = {"bp_table2": (0, 0), "bp_table3": (4, 0), "bp_table4": (8.5, 0)}
        for o in table_objects + cup_objects:
            if o.name.endswith("_collider"):
                o.hide_render = True
                continue
            base = o.name.split("_")[1] if o.name.startswith("bp_divider") else o.name
            if o.name.startswith("bp_divider"):
                n = int(o.name[len("bp_divider")])
                o.location = (-[0, 0, 0, 4, 8.5][n], 0, 0.8 if o.name.endswith("pane") and n != 3 else (0.8 if n == 3 else 0))
                if o.name.endswith("pane"):
                    o.location.z += 0.35
            elif o.name.startswith("bp_cup") or o.name.startswith("bp_liquid"):
                lod = int(o.name[-1])
                o.scale = (8, 8, 8)
                o.location = (2.0 + lod * 1.0, 3.0, 0)
            elif o.name.startswith("bp_fixture") or o.name == "bp_settings_button":
                o.location = (0, -3.0, 0.9 if o.name != "bp_settings_button" else 0.1)
            elif base in offsets:
                o.location = (-offsets[base][0], offsets[base][1], 0)
        preview(preview_path, table_objects + cup_objects)


main()
