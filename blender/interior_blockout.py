"""Procedural Phase 0 blockout for the bespoke A380 interior.

Run with Blender 3.6+ or 4.x:
    blender --background --python blender/interior_blockout.py

Optional environment variables:
    A380_BLOCKOUT_OUTPUT=/absolute/path/interior_blockout.blend
    A380_EXPORT_GLB=/absolute/path/interior_blockout.glb

The script intentionally creates a controlled, neutral blockout. It does not
copy an airline cabin or import third-party geometry.
"""

import math
import os

import bpy
from mathutils import Vector


PROJECT_ROOT = "Interior_Root"
COLLECTION_NAMES = (
    "Zone_Cockpit",
    "Zone_Economy",
    "Zone_Stair",
    "Zone_UpperDeck",
    "Technical",
)

COLORS = {
    "shell": (0.055, 0.075, 0.095, 1.0),
    "shell_light": (0.18, 0.22, 0.27, 1.0),
    "ceiling": (0.32, 0.35, 0.39, 1.0),
    "seat": (0.035, 0.10, 0.16, 1.0),
    "seat_accent": (0.05, 0.32, 0.44, 1.0),
    "glass": (0.02, 0.12, 0.18, 1.0),
    "emissive": (0.04, 0.55, 0.72, 1.0),
    "metal": (0.28, 0.31, 0.35, 1.0),
    "floor": (0.025, 0.03, 0.04, 1.0),
}


def material(name, color, metallic=0.0, roughness=0.55, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
        if emission is not None:
            principled.inputs["Emission Color"].default_value = emission
            principled.inputs["Emission Strength"].default_value = 2.0
    return mat


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def collection(name, parent):
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    result = bpy.data.collections.new(name)
    parent.children.link(result)
    return result


def link_to(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)


def apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def box(name, size, location, target, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    apply_scale(obj)
    link_to(obj, target)
    obj.data.materials.append(mat)

    if bevel > 0.0:
        modifier = obj.modifiers.new(name="EdgeSoftness", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    return obj


def cylinder(name, radius, depth, location, target, mat, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    link_to(obj, target)
    obj.data.materials.append(mat)
    return obj


def empty(name, location, target):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.5
    obj.location = location
    target.objects.link(obj)
    return obj


def create_seat_master(target, mats):
    parts = []

    parts.append(
        box(
            "Seat_Base_Frame",
            (0.48, 0.12, 0.52),
            (0.0, 0.06, 0.0),
            target,
            mats["seat_accent"],
            bevel=0.04,
        )
    )
    parts.append(
        box(
            "Seat_Cushion",
            (0.44, 0.18, 0.48),
            (0.0, 0.22, -0.01),
            target,
            mats["seat"],
            bevel=0.035,
        )
    )
    parts.append(
        box(
            "Seat_Back",
            (0.44, 0.78, 0.12),
            (0.0, 0.62, 0.18),
            target,
            mats["seat"],
            bevel=0.035,
        )
    )
    parts.append(
        box(
            "Seat_Headrest",
            (0.40, 0.20, 0.10),
            (0.0, 1.02, 0.18),
            target,
            mats["seat_accent"],
            bevel=0.025,
        )
    )

    # Join the blockout pieces into one reusable mesh. Linked copies of this
    # object are used below so the eventual export can be instanced/optimized.
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    master = parts[0]
    master.name = "Seat_Base"
    master["instance_ready"] = True
    master["design_dimensions_m"] = [0.48, 1.15, 0.52]
    return master


def linked_seat(master, name, location, target):
    seat = master.copy()
    seat.data = master.data
    seat.name = name
    seat.location = location
    target.objects.link(seat)
    return seat


def create_cockpit(zone, mats):
    box("Cockpit_Floor", (6.20, 0.12, 8.0), (0.0, -0.06, 4.0), zone, mats["floor"])
    box("Cockpit_FrontShell", (6.20, 2.20, 0.14), (0.0, 1.10, 0.10), zone, mats["shell"])
    box("Cockpit_Ceiling", (6.20, 0.12, 8.0), (0.0, 2.20, 4.0), zone, mats["ceiling"])

    box("Cockpit_MainPanel", (5.40, 0.95, 0.18), (0.0, 1.25, 0.55), zone, mats["shell_light"], bevel=0.05)
    box("Cockpit_Console_Left", (1.15, 0.75, 1.50), (-1.95, 0.50, 2.10), zone, mats["shell_light"], bevel=0.06)
    box("Cockpit_Console_Right", (1.15, 0.75, 1.50), (1.95, 0.50, 2.10), zone, mats["shell_light"], bevel=0.06)

    for index, x in enumerate((-1.80, -0.90, 0.0, 0.90, 1.80)):
        box(
            "Cockpit_Display_{:02d}".format(index + 1),
            (0.62, 0.36, 0.04),
            (x, 1.72, 0.48),
            zone,
            mats["emissive"],
            bevel=0.02,
        )

    for index, x in enumerate((-2.25, -1.50, 1.50, 2.25)):
        box(
            "Cockpit_Window_{:02d}".format(index + 1),
            (0.62, 0.72, 0.04),
            (x, 1.42, 0.16),
            zone,
            mats["glass"],
            bevel=0.02,
        )


def create_main_cabin(zone, mats):
    box("Economy_Floor", (6.20, 0.12, 26.0), (0.0, -0.06, 21.0), zone, mats["floor"])
    box("Economy_LeftWall", (0.12, 2.20, 26.0), (-3.10, 1.10, 21.0), zone, mats["shell"])
    box("Economy_RightWall", (0.12, 2.20, 26.0), (3.10, 1.10, 21.0), zone, mats["shell"])
    box("Economy_Ceiling", (6.20, 0.12, 26.0), (0.0, 2.20, 21.0), zone, mats["ceiling"])

    # Repeated window and overhead modules are deliberately low-detail.
    for index, z in enumerate(range(9, 35, 2)):
        for x, side in ((-3.03, "L"), (3.03, "R")):
            box(
                "Panel_Window_Module_{}_{}".format(side, index + 1),
                (0.04, 0.62, 1.25),
                (x, 1.45, z),
                zone,
                mats["glass"],
                bevel=0.02,
            )
        box(
            "Panel_Ceiling_Module_{:02d}".format(index + 1),
            (5.90, 0.18, 1.85),
            (0.0, 2.03, z),
            zone,
            mats["shell_light"],
            bevel=0.04,
        )

    for x in (-2.55, 2.55):
        box("Economy_Overhead_Bin_{}".format(x), (0.72, 0.42, 25.2), (x, 1.78, 21.0), zone, mats["shell_light"], bevel=0.05)


def create_stair(zone, mats):
    box("Stair_Floor", (6.20, 0.12, 6.0), (0.0, -0.06, 37.0), zone, mats["floor"])

    step_count = 16
    step_width = 1.05
    step_depth = 0.29
    step_height = 0.14
    start_z = 35.0
    start_y = 0.08

    box("Stair_Main", (1.20, 0.08, 4.80), (0.0, 0.04, 37.20), zone, mats["floor"])

    for index in range(step_count):
        y = start_y + index * step_height
        z = start_z + index * step_depth
        box(
            "Stair_Step_{:02d}".format(index + 1),
            (step_width, step_height, step_depth),
            (0.0, y, z),
            zone,
            mats["shell_light"],
            bevel=0.02,
        )

    for x in (-0.63, 0.63):
        cylinder(
            "Stair_Railing_{}".format(x),
            0.035,
            2.25,
            (x, 1.30, 37.15),
            zone,
            mats["metal"],
            rotation=(math.pi / 2.0, 0.0, 0.0),
        )


def create_upper_deck(zone, mats):
    box("UpperDeck_Floor", (5.50, 0.12, 18.0), (0.0, 2.35, 49.0), zone, mats["floor"])
    box("UpperDeck_LeftWall", (0.12, 2.05, 18.0), (-2.75, 3.38, 49.0), zone, mats["shell"])
    box("UpperDeck_RightWall", (0.12, 2.05, 18.0), (2.75, 3.38, 49.0), zone, mats["shell"])
    box("UpperDeck_Ceiling", (5.50, 0.12, 18.0), (0.0, 4.40, 49.0), zone, mats["ceiling"])

    for index, z in enumerate(range(41, 59, 2)):
        for x, side in ((-2.68, "L"), (2.68, "R")):
            box(
                "Panel_Window_Module_Upper_{}_{}".format(side, index + 1),
                (0.04, 0.58, 1.15),
                (x, 3.72, z),
                zone,
                mats["glass"],
                bevel=0.02,
            )


def seat_rows(master, zone, start_z, end_z, xs, prefix):
    row_index = 0
    for z in [start_z + 0.79 * i for i in range(int((end_z - start_z) / 0.79))]:
        row_index += 1
        for side_index, x in enumerate(xs):
            linked_seat(
                master,
                "{}_{:02d}_{}".format(prefix, row_index, side_index + 1),
                (x, 0.0, z),
                zone,
            )


def scene_setup():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene["project"] = "boeing-747"
    scene["aircraft_reference"] = "Airbus A380-800"
    scene["phase"] = "Phase 0 blockout"
    scene["layout_source"] = "INTERIOR_LAYOUT.md"
    scene["geometry_status"] = "blockout"

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.005, 0.008, 0.012, 1.0)
        background.inputs["Strength"].default_value = 0.18


def build():
    clear_scene()
    scene_setup()

    scene_root = bpy.context.scene.collection
    root = collection(PROJECT_ROOT, scene_root)
    zones = {name: collection(name, root) for name in COLLECTION_NAMES}

    mats = {
        "shell": material("Mat_Shell", COLORS["shell"], roughness=0.6),
        "shell_light": material("Mat_ShellLight", COLORS["shell_light"], metallic=0.1, roughness=0.45),
        "ceiling": material("Mat_Ceiling", COLORS["ceiling"], roughness=0.7),
        "seat": material("Mat_Seat", COLORS["seat"], roughness=0.5),
        "seat_accent": material("Mat_SeatAccent", COLORS["seat_accent"], metallic=0.05, roughness=0.4),
        "glass": material("Mat_Glass", COLORS["glass"], metallic=0.0, roughness=0.15),
        "emissive": material("Mat_Emissive", COLORS["emissive"], roughness=0.35, emission=COLORS["emissive"]),
        "metal": material("Mat_Metal", COLORS["metal"], metallic=0.75, roughness=0.25),
        "floor": material("Mat_Floor", COLORS["floor"], roughness=0.85),
    }

    empty("Cockpit_Anchor", (0.0, 0.0, 0.0), zones["Technical"])
    empty("Economy_Anchor", (0.0, 0.0, 8.0), zones["Technical"])
    empty("Stair_Anchor", (0.0, 0.0, 34.0), zones["Technical"])
    empty("UpperDeck_Anchor", (0.0, 2.35, 40.0), zones["Technical"])

    create_cockpit(zones["Zone_Cockpit"], mats)
    create_main_cabin(zones["Zone_Economy"], mats)
    create_stair(zones["Zone_Stair"], mats)
    create_upper_deck(zones["Zone_UpperDeck"], mats)

    master = create_seat_master(zones["Zone_Economy"], mats)
    seat_rows(master, zones["Zone_Economy"], 10.0, 33.5, (-2.0, -1.48, -0.96, 0.96, 1.48, 2.0), "Economy_Seat")
    seat_rows(master, zones["Zone_UpperDeck"], 42.0, 57.5, (-1.55, -1.02, 1.02, 1.55), "UpperDeck_Seat")

    # The master is kept at the origin as the canonical instancing source.
    master.hide_render = True
    master.hide_viewport = True

    bpy.context.view_layer.objects.active = root.objects[0] if root.objects else None

    output = os.environ.get(
        "A380_BLOCKOUT_OUTPUT",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "interior_blockout.blend"),
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(output))

    glb_output = os.environ.get("A380_EXPORT_GLB")
    if glb_output:
        bpy.ops.export_scene.gltf(
            filepath=os.path.abspath(glb_output),
            export_format="GLB",
            use_selection=False,
        )

    print("A380 Phase 0 blockout saved to {}".format(output))
    if glb_output:
        print("GLB export saved to {}".format(glb_output))


if __name__ == "__main__":
    build()
