"""Procedural F0 option-B interior for the bespoke A380 experience.

Run with Blender 3.6+ or 4.x:
    blender --background --factory-startup --python blender/interior_blockout.py

Optional environment variables:
    A380_BLOCKOUT_OUTPUT=/absolute/path/interior_blockout.blend
    A380_EXPORT_GLB=/absolute/path/interior_blockout.glb

The model is an original, neutral cabin design.  It deliberately favours the
four camera views used by the experience (cockpit, economy, enclosed stair and
upper deck), linked repetition and a small material vocabulary over invisible
detail or any real airline's trade dress.
"""

import json
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

ANCHOR_LOCATIONS = {
    "Cockpit_Anchor": (0.0, 0.0, 0.0),
    "Economy_Anchor": (0.0, 0.0, 8.0),
    "Stair_Anchor": (0.0, 0.0, 34.0),
    "UpperDeck_Anchor": (0.0, 2.35, 40.0),
}

COLORS = {
    "shell": (0.025, 0.040, 0.055, 1.0),
    "panel": (0.38, 0.43, 0.47, 1.0),
    "ceiling": (0.62, 0.65, 0.66, 1.0),
    "seat": (0.025, 0.075, 0.115, 1.0),
    "seat_accent": (0.035, 0.29, 0.34, 1.0),
    "seat_shell": (0.012, 0.018, 0.026, 1.0),
    "leather": (0.20, 0.13, 0.085, 1.0),
    "glass": (0.012, 0.075, 0.12, 0.72),
    "window_glow": (0.055, 0.30, 0.52, 1.0),
    "cabin_light": (1.0, 0.56, 0.24, 1.0),
    "display": (0.015, 0.40, 0.58, 1.0),
    "metal": (0.25, 0.29, 0.32, 1.0),
    "floor": (0.018, 0.023, 0.030, 1.0),
    "aisle": (0.060, 0.078, 0.085, 1.0),
    "galley": (0.31, 0.35, 0.38, 1.0),
    "safety": (0.62, 0.13, 0.055, 1.0),
}


def _set_principled_input(node, names, value):
    """Set a Principled input across Blender 3.6/4.x socket renames."""
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return True
    return False


def material(
    name,
    color,
    role,
    metallic=0.0,
    roughness=0.55,
    emission=None,
    emission_strength=0.0,
    transmission=0.0,
    ior=1.45,
    coat=0.0,
):
    """Create a compact, glTF-friendly PBR material with audit metadata."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("{} has no Principled BSDF".format(name))

    _set_principled_input(principled, ("Base Color",), color)
    _set_principled_input(principled, ("Metallic",), metallic)
    _set_principled_input(principled, ("Roughness",), roughness)
    _set_principled_input(principled, ("IOR",), ior)
    _set_principled_input(principled, ("Alpha",), color[3])
    _set_principled_input(principled, ("Transmission Weight", "Transmission"), transmission)
    _set_principled_input(principled, ("Coat Weight", "Clearcoat"), coat)
    if emission is not None and emission_strength > 0.0:
        _set_principled_input(principled, ("Emission Color", "Emission"), emission)
        _set_principled_input(principled, ("Emission Strength",), emission_strength)

    if color[3] < 0.999:
        # Blender 4.2 changed material surface settings.  The alpha value is
        # still exported to glTF even if a particular viewport blend setting
        # is unavailable, so this compatibility branch is intentionally soft.
        try:
            if hasattr(mat, "blend_method"):
                mat.blend_method = "BLEND"
        except (AttributeError, TypeError, ValueError):
            pass
        if hasattr(mat, "use_screen_refraction"):
            mat.use_screen_refraction = True

    mat["pbr_role"] = role
    mat["metallic_value"] = float(metallic)
    mat["roughness_value"] = float(roughness)
    mat["transmission_value"] = float(transmission)
    mat["emission_strength"] = float(emission_strength)
    mat["neutral_original_design"] = True
    return mat


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for current in list(bpy.data.collections):
        bpy.data.collections.remove(current)

    # Keep a rerun deterministic when the script is launched from a populated
    # file rather than with --factory-startup.
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


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


def _activate_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_scale(obj):
    _activate_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def _apply_bevel(obj, width, segments=2):
    if width <= 0.0:
        return
    modifier = obj.modifiers.new(name="EdgeSoftness", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    _activate_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def box(
    name,
    size,
    location,
    target,
    mat,
    bevel=0.0,
    rotation=(0.0, 0.0, 0.0),
    bevel_segments=None,
):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    apply_scale(obj)
    obj.rotation_euler = rotation
    link_to(obj, target)
    obj.data.materials.append(mat)
    segments = bevel_segments if bevel_segments is not None else (3 if bevel >= 0.025 else 2)
    _apply_bevel(obj, bevel, segments=segments)
    return obj


def cylinder(
    name,
    radius,
    depth,
    location,
    target,
    mat,
    rotation=(0.0, 0.0, 0.0),
    vertices=12,
    bevel=0.0,
    bevel_segments=2,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = rotation
    link_to(obj, target)
    obj.data.materials.append(mat)
    _apply_bevel(obj, bevel, segments=bevel_segments)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def tube_between(name, start, end, radius, target, mat, vertices=12):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    if direction.length <= 1e-6:
        raise ValueError("{} has zero-length endpoints".format(name))
    obj = cylinder(
        name,
        radius,
        direction.length,
        (start + end) * 0.5,
        target,
        mat,
        vertices=vertices,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "X")
    return obj


def extruded_profile_x(name, points_yz, center_x, thickness, target, mat, bevel=0.0):
    """Extrude a closed Y/Z profile across X; used for raked stair walls."""
    half = thickness * 0.5
    vertices = []
    for x in (center_x - half, center_x + half):
        vertices.extend((x, y, z) for y, z in points_yz)

    count = len(points_yz)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    _apply_bevel(obj, bevel, segments=2)
    return obj


def join_objects(parts, name):
    if not parts:
        raise ValueError("cannot join an empty object list")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    result = parts[0]
    result.name = name
    result.data.name = name + "_Mesh"
    result.select_set(False)
    return result


def rebase_mesh_origin(obj, origin):
    """Move an identity-rotated mesh origin without moving its world geometry."""
    assert obj.type == "MESH"
    assert all(abs(value) <= 1e-7 for value in obj.rotation_euler)
    assert all(abs(value - 1.0) <= 1e-7 for value in obj.scale)
    desired = Vector(origin)
    offset = obj.location - desired
    for vertex in obj.data.vertices:
        vertex.co += offset
    obj.location = desired
    obj.data.update()


def linked_copy(master, name, target, location=None, rotation=None, scale=None):
    result = master.copy()
    result.data = master.data
    result.name = name
    if location is not None:
        result.location = location
    if rotation is not None:
        result.rotation_euler = rotation
    if scale is not None:
        result.scale = scale
    result.hide_viewport = False
    result.hide_render = False
    result["instance_of"] = master.name
    target.objects.link(result)
    return result


def empty(name, location, target, display_size=0.5):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = display_size
    obj.location = location
    target.objects.link(obj)
    return obj


def create_arch(name, z, width, height, opening_width, opening_height, floor_y, target, mats):
    side_width = (width - opening_width) * 0.5
    parts = [
        box(
            name,
            (side_width, height, 0.12),
            (-(opening_width + side_width) * 0.5, floor_y + height * 0.5, z),
            target,
            mats["panel"],
            bevel=0.035,
        ),
        box(
            name + "_Right",
            (side_width, height, 0.12),
            ((opening_width + side_width) * 0.5, floor_y + height * 0.5, z),
            target,
            mats["panel"],
            bevel=0.035,
        ),
        box(
            name + "_Header",
            (opening_width, height - opening_height, 0.12),
            (0.0, floor_y + opening_height + (height - opening_height) * 0.5, z),
            target,
            mats["shell"],
            bevel=0.025,
        ),
        box(
            name + "_Light",
            (opening_width - 0.18, 0.025, 0.035),
            (0.0, floor_y + opening_height - 0.04, z - 0.07),
            target,
            mats["emissive"],
            bevel=0.008,
        ),
    ]
    result = join_objects(parts, name)
    result["module_kind"] = "portal_arch"
    return result


def create_ceiling_modules(
    zone,
    mats,
    prefix,
    z_values,
    y,
    center_width,
    shoulder_x,
    shoulder_width,
    module_length,
    shoulder_angle_deg,
):
    first_z = z_values[0]
    parts = [
        box(
            prefix + "_01",
            (center_width, 0.09, module_length),
            (0.0, y, first_z),
            zone,
            mats["ceiling"],
            bevel=0.025,
        )
    ]
    angle = math.radians(shoulder_angle_deg)
    parts.extend(
        [
            box(
                prefix + "_Shoulder_L",
                (shoulder_width, 0.09, module_length),
                (-shoulder_x, y - 0.08, first_z),
                zone,
                mats["panel"],
                bevel=0.025,
                rotation=(0.0, 0.0, angle),
            ),
            box(
                prefix + "_Shoulder_R",
                (shoulder_width, 0.09, module_length),
                (shoulder_x, y - 0.08, first_z),
                zone,
                mats["panel"],
                bevel=0.025,
                rotation=(0.0, 0.0, -angle),
            ),
            box(
                prefix + "_Light_L",
                (0.055, 0.025, module_length * 0.82),
                (-0.68, y - 0.07, first_z),
                zone,
                mats["emissive"],
                bevel=0.008,
            ),
            box(
                prefix + "_Light_R",
                (0.055, 0.025, module_length * 0.82),
                (0.68, y - 0.07, first_z),
                zone,
                mats["emissive"],
                bevel=0.008,
            ),
        ]
    )
    master = join_objects(parts, prefix + "_01")
    master["module_kind"] = "ceiling_panel"
    master["linked_module_master"] = True
    instances = [master]
    for index, z in enumerate(z_values[1:], start=2):
        instance = linked_copy(master, "{}_{:02d}".format(prefix, index), zone)
        instance.location.z += z - first_z
        instances.append(instance)
    return instances


def create_window_modules(zone, mats, prefix, z_values, x, y, height, width):
    first_z = z_values[0]
    frame = 0.065
    left_x = -abs(x)
    parts = [
        box(
            prefix + "_L_01",
            (0.045, height, width),
            (left_x, y, first_z),
            zone,
            mats["glass"],
            bevel=0.035,
        ),
        box(
            prefix + "_FrameTop",
            (0.075, frame, width + frame * 2.0),
            (left_x, y + height * 0.5 + frame * 0.5, first_z),
            zone,
            mats["panel"],
            bevel=0.018,
        ),
        box(
            prefix + "_FrameBottom",
            (0.075, frame, width + frame * 2.0),
            (left_x, y - height * 0.5 - frame * 0.5, first_z),
            zone,
            mats["panel"],
            bevel=0.018,
        ),
        box(
            prefix + "_FrameFront",
            (0.075, height, frame),
            (left_x, y, first_z - width * 0.5 - frame * 0.5),
            zone,
            mats["panel"],
            bevel=0.018,
        ),
        box(
            prefix + "_FrameRear",
            (0.075, height, frame),
            (left_x, y, first_z + width * 0.5 + frame * 0.5),
            zone,
            mats["panel"],
            bevel=0.018,
        ),
        box(
            prefix + "_Halo",
            (0.08, 0.024, width * 0.78),
            (left_x + 0.012, y - height * 0.5 + 0.06, first_z),
            zone,
            mats["window_glow"],
            bevel=0.006,
        ),
    ]
    master = join_objects(parts, prefix + "_L_01")
    master["module_kind"] = "window_panel"
    master["linked_module_master"] = True
    instances = [master]

    right = linked_copy(master, prefix + "_R_01", zone)
    right.location.x += abs(x) * 2.0
    instances.append(right)

    for index, z in enumerate(z_values[1:], start=2):
        for side, side_x in (("L", -abs(x)), ("R", abs(x))):
            instance = linked_copy(master, "{}_{}_{:02d}".format(prefix, side, index), zone)
            instance.location.x += side_x - left_x
            instance.location.z += z - first_z
            instances.append(instance)
    return instances


def create_bin_modules(zone, mats, prefix, z_values, x, y, width, height, length):
    first_z = z_values[0]
    left_x = -abs(x)
    parts = [
        box(
            prefix + "_L_01",
            (width, height, length),
            (left_x, y, first_z),
            zone,
            mats["panel"],
            bevel=0.065,
        ),
        box(
            prefix + "_Fascia",
            (width * 0.88, height * 0.58, length * 0.92),
            (left_x, y - 0.025, first_z),
            zone,
            mats["ceiling"],
            bevel=0.05,
        ),
        box(
            prefix + "_Seam",
            (width * 0.72, 0.025, 0.028),
            (left_x, y - height * 0.23, first_z),
            zone,
            mats["metal"],
            bevel=0.006,
        ),
        box(
            prefix + "_Downlight",
            (width * 0.55, 0.022, length * 0.74),
            (left_x, y - height * 0.5 - 0.025, first_z),
            zone,
            mats["emissive"],
            bevel=0.006,
        ),
    ]
    master = join_objects(parts, prefix + "_L_01")
    master["module_kind"] = "overhead_bin"
    master["linked_module_master"] = True
    instances = [master]

    right = linked_copy(master, prefix + "_R_01", zone)
    right.location.x += abs(x) * 2.0
    instances.append(right)

    for index, z in enumerate(z_values[1:], start=2):
        for side, side_x in (("L", -abs(x)), ("R", abs(x))):
            instance = linked_copy(master, "{}_{}_{:02d}".format(prefix, side, index), zone)
            instance.location.x += side_x - left_x
            instance.location.z += z - first_z
            instances.append(instance)
    return instances


def create_seat_master(target, mats):
    """Build one detailed multmaterial seat mesh for every linked instance."""
    parts = [
        box(
            "Seat_Base",
            (0.48, 0.075, 0.50),
            (0.0, 0.235, -0.005),
            target,
            mats["seat_shell"],
            bevel=0.035,
            bevel_segments=1,
        ),
        box(
            "Seat_Cushion",
            (0.43, 0.145, 0.43),
            (0.0, 0.335, -0.035),
            target,
            mats["seat"],
            bevel=0.045,
            bevel_segments=1,
        ),
        box(
            "Seat_BackShell",
            (0.46, 0.70, 0.075),
            (0.0, 0.68, 0.155),
            target,
            mats["seat_shell"],
            bevel=0.035,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
        box(
            "Seat_BackPad",
            (0.405, 0.545, 0.052),
            (0.0, 0.675, 0.105),
            target,
            mats["seat"],
            bevel=0.04,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
        box(
            "Seat_Headrest",
            (0.39, 0.20, 0.065),
            (0.0, 1.035, 0.19),
            target,
            mats["leather"],
            bevel=0.045,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
        box(
            "Seat_ScreenBezel",
            (0.335, 0.245, 0.026),
            (0.0, 0.735, 0.218),
            target,
            mats["seat_shell"],
            bevel=0.025,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
        box(
            "Seat_ScreenSurface",
            (0.285, 0.195, 0.014),
            (0.0, 0.742, 0.235),
            target,
            mats["display"],
            bevel=0.018,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
        box(
            "Seat_TrayLatch",
            (0.12, 0.035, 0.018),
            (0.0, 0.52, 0.224),
            target,
            mats["metal"],
            bevel=0.008,
            bevel_segments=1,
        ),
        box(
            "Seat_LumbarAccent",
            (0.38, 0.035, 0.035),
            (0.0, 0.925, 0.14),
            target,
            mats["seat_accent"],
            bevel=0.012,
            rotation=(math.radians(5.0), 0.0, 0.0),
            bevel_segments=1,
        ),
    ]

    for side, x in (("L", -0.2175), ("R", 0.2175)):
        parts.extend(
            [
                box(
                    "Seat_Arm_" + side,
                    (0.045, 0.065, 0.37),
                    (x, 0.54, -0.005),
                    target,
                    mats["seat_accent"],
                    bevel=0.02,
                    bevel_segments=1,
                ),
                box(
                    "Seat_ArmSupport_" + side,
                    (0.04, 0.255, 0.055),
                    (x, 0.39, 0.08),
                    target,
                    mats["seat_shell"],
                    bevel=0.014,
                    bevel_segments=1,
                ),
                cylinder(
                    "Seat_Leg_" + side,
                    0.032,
                    0.20,
                    (x * 0.68, 0.10, 0.025),
                    target,
                    mats["metal"],
                    rotation=(math.pi / 2.0, 0.0, 0.0),
                    vertices=10,
                    bevel=0.008,
                    bevel_segments=1,
                ),
            ]
        )

    parts.append(
        box(
            "Seat_LegCrossbar",
            (0.34, 0.045, 0.075),
            (0.0, 0.16, 0.025),
            target,
            mats["metal"],
            bevel=0.012,
            bevel_segments=1,
        )
    )

    master = join_objects(parts, "Seat_Base")
    # join() keeps the first primitive's origin.  Rebase explicitly so every
    # linked copy can be placed directly on a deck and the documented seat
    # origin remains the centre of its footprint at floor level.
    rebase_mesh_origin(master, (0.0, 0.0, 0.0))
    master["instance_ready"] = True
    master["origin_contract"] = "footprint centre at floor Y=0"
    master["design_dimensions_m"] = [0.48, 1.15, 0.52]
    master["component_names"] = json.dumps(
        ["cushion", "back", "headrest", "arms", "legs", "screen", "tray_latch"]
    )
    master["detail_strategy"] = "single linked multmaterial mesh"

    screen_locator = empty("Seat_Screen", (0.0, 0.742, 0.242), target, display_size=0.08)
    screen_locator["integrated_in"] = "Seat_Base"
    screen_locator["material"] = "Mat_Display"
    return master


def linked_seat(master, name, location, target):
    seat = linked_copy(master, name, target, location=location)
    seat["seat_instance"] = True
    return seat


def create_cockpit(zone, mats, seat_master):
    box("Cockpit_Floor", (6.20, 0.12, 8.0), (0.0, -0.06, 4.0), zone, mats["floor"])
    box("Cockpit_Aisle", (1.25, 0.022, 7.65), (0.0, 0.018, 4.1), zone, mats["aisle"], bevel=0.015)
    box("Cockpit_FrontShell", (6.20, 2.20, 0.14), (0.0, 1.10, 0.07), zone, mats["shell"])
    box("Cockpit_LeftWall", (0.12, 2.20, 8.0), (-3.10, 1.10, 4.0), zone, mats["shell"])
    box("Cockpit_RightWall", (0.12, 2.20, 8.0), (3.10, 1.10, 4.0), zone, mats["shell"])
    box("Cockpit_Ceiling", (4.50, 0.10, 8.0), (0.0, 2.18, 4.0), zone, mats["ceiling"], bevel=0.035)
    box(
        "Cockpit_Ceiling_Left",
        (1.25, 0.10, 8.0),
        (-2.45, 2.02, 4.0),
        zone,
        mats["panel"],
        bevel=0.035,
        rotation=(0.0, 0.0, math.radians(14.0)),
    )
    box(
        "Cockpit_Ceiling_Right",
        (1.25, 0.10, 8.0),
        (2.45, 2.02, 4.0),
        zone,
        mats["panel"],
        bevel=0.035,
        rotation=(0.0, 0.0, math.radians(-14.0)),
    )

    panel_parts = [
        box(
            "Cockpit_MainPanel",
            (1.55, 0.78, 0.18),
            (-1.42, 1.16, 6.38),
            zone,
            mats["seat_shell"],
            bevel=0.065,
            rotation=(math.radians(-8.0), 0.0, 0.0),
        ),
        box(
            "Cockpit_MainPanel_Right",
            (1.55, 0.78, 0.18),
            (1.42, 1.16, 6.38),
            zone,
            mats["seat_shell"],
            bevel=0.065,
            rotation=(math.radians(-8.0), 0.0, 0.0),
        ),
        box(
            "Cockpit_CenterPedestal",
            (0.54, 0.62, 1.15),
            (0.0, 0.36, 5.70),
            zone,
            mats["panel"],
            bevel=0.055,
        ),
        box(
            "Cockpit_GlareShield_L",
            (1.72, 0.11, 0.34),
            (-1.42, 1.57, 6.30),
            zone,
            mats["shell"],
            bevel=0.035,
        ),
        box(
            "Cockpit_GlareShield_R",
            (1.72, 0.11, 0.34),
            (1.42, 1.57, 6.30),
            zone,
            mats["shell"],
            bevel=0.035,
        ),
    ]
    join_objects(panel_parts, "Cockpit_MainPanel")["module_kind"] = "flight_deck_panel"

    display_master = box(
        "Cockpit_Display_01",
        (0.58, 0.34, 0.035),
        (-1.77, 1.28, 6.265),
        zone,
        mats["display"],
        bevel=0.025,
        rotation=(math.radians(-8.0), 0.0, 0.0),
    )
    for index, x in enumerate((-1.08, 1.08, 1.77), start=2):
        display = linked_copy(display_master, "Cockpit_Display_{:02d}".format(index), zone)
        display.location.x = x

    window_master = box(
        "Cockpit_Window_01",
        (0.72, 0.62, 0.045),
        (-2.12, 1.72, 6.62),
        zone,
        mats["glass"],
        bevel=0.045,
        rotation=(0.0, math.radians(-8.0), 0.0),
    )
    for index, (x, yaw) in enumerate(
        ((-1.28, -3.0), (1.28, 3.0), (2.12, 8.0)), start=2
    ):
        window = linked_copy(window_master, "Cockpit_Window_{:02d}".format(index), zone)
        window.location.x = x
        window.rotation_euler.y = math.radians(yaw)

    def console(name, x):
        side = -1.0 if x < 0.0 else 1.0
        parts = [
            box(name, (0.92, 0.64, 2.15), (x, 0.36, 4.95), zone, mats["panel"], bevel=0.07),
            box(
                name + "_Top",
                (0.82, 0.11, 1.90),
                (x - side * 0.035, 0.72, 4.95),
                zone,
                mats["seat_shell"],
                bevel=0.035,
                rotation=(math.radians(-4.0), 0.0, 0.0),
            ),
            box(
                name + "_Display",
                (0.52, 0.025, 0.54),
                (x - side * 0.10, 0.78, 4.72),
                zone,
                mats["display"],
                bevel=0.02,
            ),
            box(
                name + "_Accent",
                (0.055, 0.035, 1.55),
                (x - side * 0.46, 0.72, 4.95),
                zone,
                mats["seat_accent"],
                bevel=0.01,
            ),
        ]
        return join_objects(parts, name)

    console("Cockpit_Console_Left", -2.25)
    console("Cockpit_Console_Right", 2.25)

    linked_seat(seat_master, "Cockpit_Seat_Captain", (-1.05, 0.0, 5.18), zone)
    linked_seat(seat_master, "Cockpit_Seat_FirstOfficer", (1.05, 0.0, 5.18), zone)

    overhead_parts = [
        box(
            "Cockpit_OverheadPanel",
            (2.35, 0.10, 1.85),
            (0.0, 2.055, 5.10),
            zone,
            mats["seat_shell"],
            bevel=0.045,
        ),
        box(
            "Cockpit_OverheadDisplay",
            (1.60, 0.025, 1.15),
            (0.0, 1.99, 5.10),
            zone,
            mats["display"],
            bevel=0.025,
        ),
        box(
            "Cockpit_AmbientLight",
            (3.25, 0.025, 0.08),
            (0.0, 2.08, 3.80),
            zone,
            mats["emissive"],
            bevel=0.008,
        ),
    ]
    join_objects(overhead_parts, "Cockpit_OverheadPanel")
    create_arch("Cockpit_AftPortal", 7.92, 6.08, 2.12, 1.48, 1.96, 0.0, zone, mats)


def create_galley_side(name, x, zone, mats):
    side = -1.0 if x < 0.0 else 1.0
    aisle_face = x - side * 0.61
    parts = [
        box(name, (1.18, 2.02, 1.52), (x, 1.01, 32.22), zone, mats["galley"], bevel=0.055),
        box(
            name + "_Worktop",
            (1.22, 0.09, 1.45),
            (x, 1.02, 32.22),
            zone,
            mats["metal"],
            bevel=0.025,
        ),
        box(
            name + "_OvenUpper",
            (0.045, 0.42, 0.52),
            (aisle_face, 1.60, 31.91),
            zone,
            mats["seat_shell"],
            bevel=0.022,
        ),
        box(
            name + "_OvenLower",
            (0.045, 0.42, 0.52),
            (aisle_face, 1.60, 32.54),
            zone,
            mats["seat_shell"],
            bevel=0.022,
        ),
        box(
            name + "_TaskLight",
            (0.055, 0.035, 1.12),
            (aisle_face - side * 0.015, 1.12, 32.22),
            zone,
            mats["emissive"],
            bevel=0.008,
        ),
        box(
            name + "_Status",
            (0.055, 0.22, 0.32),
            (aisle_face - side * 0.025, 1.73, 32.22),
            zone,
            mats["display"],
            bevel=0.018,
        ),
        box(
            name + "_Handle",
            (0.075, 0.025, 0.48),
            (aisle_face - side * 0.03, 0.55, 32.22),
            zone,
            mats["metal"],
            bevel=0.008,
        ),
    ]
    result = join_objects(parts, name)
    result["module_kind"] = "galley"
    result["aisle_readable"] = True
    return result


def create_main_cabin(zone, mats):
    box("Economy_Floor", (6.20, 0.12, 26.0), (0.0, -0.06, 21.0), zone, mats["floor"])
    box("Economy_Aisle", (1.38, 0.022, 25.75), (0.0, 0.018, 21.0), zone, mats["aisle"], bevel=0.014)
    box("Economy_LeftWall", (0.12, 2.20, 26.0), (-3.10, 1.10, 21.0), zone, mats["shell"])
    box("Economy_RightWall", (0.12, 2.20, 26.0), (3.10, 1.10, 21.0), zone, mats["shell"])
    box("Economy_LeftLiner", (0.055, 1.62, 25.75), (-3.015, 1.06, 21.0), zone, mats["panel"], bevel=0.025)
    box("Economy_RightLiner", (0.055, 1.62, 25.75), (3.015, 1.06, 21.0), zone, mats["panel"], bevel=0.025)
    box("Economy_Ceiling", (4.35, 0.08, 26.0), (0.0, 2.20, 21.0), zone, mats["ceiling"], bevel=0.025)

    ceiling_z = [9.15 + 2.30 * index for index in range(11)]
    window_z = [9.05 + 1.95 * index for index in range(13)]
    create_ceiling_modules(
        zone,
        mats,
        "Panel_Ceiling_Module",
        ceiling_z,
        2.105,
        3.25,
        2.30,
        1.25,
        2.12,
        12.0,
    )
    create_window_modules(zone, mats, "Panel_Window_Module", window_z, 3.01, 1.40, 0.54, 0.86)
    create_bin_modules(
        zone,
        mats,
        "Economy_Overhead_Bin",
        ceiling_z,
        2.38,
        1.82,
        1.02,
        0.42,
        2.05,
    )

    for side, x in (("Left", -2.84), ("Right", 2.84)):
        box(
            "Economy_FloorLight_" + side,
            (0.045, 0.035, 24.8),
            (x, 0.12, 21.0),
            zone,
            mats["window_glow"],
            bevel=0.008,
        )

    create_galley_side("Galley_Left", -2.35, zone, mats)
    create_galley_side("Galley_Right", 2.35, zone, mats)
    create_arch("Economy_AftPortal", 33.92, 6.08, 2.12, 2.10, 2.00, 0.0, zone, mats)


def create_stair(zone, mats):
    box("Stair_Floor", (6.20, 0.12, 6.0), (0.0, -0.06, 37.0), zone, mats["floor"])
    box("Stair_Vestibule_Left", (1.70, 2.20, 5.70), (-2.15, 1.10, 37.0), zone, mats["panel"], bevel=0.045)
    box("Stair_Vestibule_Right", (1.70, 2.20, 5.70), (2.15, 1.10, 37.0), zone, mats["panel"], bevel=0.045)

    wall_profile = [
        (0.0, 34.18),
        (2.18, 34.18),
        (4.42, 39.65),
        (4.42, 40.0),
        (0.0, 40.0),
    ]
    left_wall = extruded_profile_x(
        "Stair_Wall_Left", wall_profile, -1.02, 0.12, zone, mats["shell"], bevel=0.025
    )
    right_wall = extruded_profile_x(
        "Stair_Wall_Right", wall_profile, 1.02, 0.12, zone, mats["shell"], bevel=0.025
    )
    left_wall["enclosure_role"] = "side_wall"
    right_wall["enclosure_role"] = "side_wall"

    liner_profile = [
        (0.14, 34.25),
        (2.08, 34.25),
        (4.28, 39.63),
        (4.28, 39.86),
        (0.14, 39.86),
    ]
    extruded_profile_x("Stair_Wall_Panel_Left", liner_profile, -0.945, 0.035, zone, mats["panel"], bevel=0.012)
    extruded_profile_x("Stair_Wall_Panel_Right", liner_profile, 0.945, 0.035, zone, mats["panel"], bevel=0.012)

    rise = 2.18
    run = 5.35
    ceiling_angle = -math.atan2(rise, run)
    ceiling = box(
        "Stair_Ceiling",
        (2.02, 0.10, math.sqrt(rise * rise + run * run)),
        (0.0, 3.29, 36.93),
        zone,
        mats["ceiling"],
        bevel=0.025,
        rotation=(ceiling_angle, 0.0, 0.0),
    )
    ceiling["enclosure_role"] = "raked_ceiling"
    box(
        "Stair_Ceiling_Light",
        (0.18, 0.025, math.sqrt(rise * rise + run * run) * 0.88),
        (0.0, 3.20, 36.95),
        zone,
        mats["emissive"],
        bevel=0.008,
        rotation=(ceiling_angle, 0.0, 0.0),
    )

    step_count = 16
    step_width = 1.34
    step_depth = 0.25
    step_height = 0.14
    first_z = 34.72
    landing_depth = 0.65
    stair_parts = []
    edge_parts = []
    for index in range(step_count):
        flight_offset = landing_depth if index >= 8 else 0.0
        z = first_z + index * step_depth + flight_offset
        top_y = (index + 1) * step_height
        stair_parts.extend(
            [
                box(
                    "Stair_Main" if index == 0 else "Stair_Tread_{:02d}".format(index + 1),
                    (step_width, 0.055, step_depth),
                    (0.0, top_y - 0.0275, z),
                    zone,
                    mats["floor"],
                    bevel=0.012,
                ),
                box(
                    "Stair_Riser_{:02d}".format(index + 1),
                    (step_width, step_height, 0.045),
                    (0.0, top_y - step_height * 0.5, z - step_depth * 0.5),
                    zone,
                    mats["panel"],
                    bevel=0.008,
                ),
            ]
        )
        if index % 2 == 0:
            edge_parts.append(
                box(
                    "Stair_Edge_{:02d}".format(index + 1),
                    (step_width * 0.82, 0.018, 0.025),
                    (0.0, top_y + 0.012, z - step_depth * 0.43),
                    zone,
                    mats["safety"],
                    bevel=0.004,
                )
            )

    landing_y = 8 * step_height
    landing_z = first_z + 8 * step_depth + landing_depth * 0.5 - step_depth * 0.5
    stair_parts.append(
        box(
            "Stair_MidLanding_Part",
            (step_width, 0.065, landing_depth),
            (0.0, landing_y - 0.0325, landing_z),
            zone,
            mats["floor"],
            bevel=0.012,
        )
    )
    stair_main = join_objects(stair_parts, "Stair_Main")
    stair_main["step_count"] = step_count
    stair_main["clear_width_m"] = 1.20
    stair_main["mid_landing"] = True
    stair_main["mid_landing_z"] = float(landing_z)
    join_objects(edge_parts, "Stair_Edge_Lighting")["module_kind"] = "step_wayfinding"

    box(
        "Stair_UpperLanding",
        (1.72, 0.10, 0.72),
        (0.0, 2.30, 39.64),
        zone,
        mats["aisle"],
        bevel=0.02,
    )

    for side, x in (("Left", -0.80), ("Right", 0.80)):
        rail_parts = [
            tube_between(
                "Stair_Railing_" + side,
                (x, 1.04, 34.62),
                (x, 2.04, 36.60),
                0.035,
                zone,
                mats["metal"],
            ),
            tube_between(
                "Stair_Railing_{}_Landing".format(side),
                (x, 2.04, 36.60),
                (x, 2.04, 37.26),
                0.035,
                zone,
                mats["metal"],
            ),
            tube_between(
                "Stair_Railing_{}_Upper".format(side),
                (x, 2.04, 37.26),
                (x, 3.16, 39.32),
                0.035,
                zone,
                mats["metal"],
            ),
        ]
        for post_index, (y, z) in enumerate(((0.72, 34.78), (1.70, 36.30), (2.72, 38.55)), start=1):
            rail_parts.append(
                tube_between(
                    "Stair_Railing_{}_Post_{:02d}".format(side, post_index),
                    (x, y, z),
                    (x, y + 0.55, z),
                    0.025,
                    zone,
                    mats["metal"],
                    vertices=10,
                )
            )
        railing = join_objects(rail_parts, "Stair_Railing_" + side)
        railing["module_kind"] = "continuous_handrail"

    create_arch("Stair_UpperPortal", 39.92, 2.00, 2.05, 1.48, 1.90, 2.35, zone, mats)


def create_upper_deck(zone, mats):
    box("UpperDeck_Floor", (5.50, 0.12, 18.0), (0.0, 2.29, 49.0), zone, mats["floor"])
    box("UpperDeck_Aisle", (1.48, 0.022, 17.72), (0.0, 2.368, 49.0), zone, mats["aisle"], bevel=0.014)
    # Port wall is split around the authored S6 exit at local z=56.2. The
    # previous continuous 18 m slab made the camera pass through a solid
    # liner even though the runtime portal was open in the exterior shell.
    box("UpperDeck_LeftWall", (0.12, 2.05, 15.10), (-2.75, 3.375, 47.55), zone, mats["shell"])
    box("UpperDeck_LeftWall_Aft", (0.12, 2.05, 0.70), (-2.75, 3.375, 57.65), zone, mats["shell"])
    box("UpperDeck_RightWall", (0.12, 2.05, 18.0), (2.75, 3.375, 49.0), zone, mats["shell"])
    box("UpperDeck_LeftLiner", (0.05, 1.48, 14.95), (-2.67, 3.34, 47.575), zone, mats["panel"], bevel=0.022)
    box("UpperDeck_LeftLiner_Aft", (0.05, 1.48, 0.55), (-2.67, 3.34, 57.725), zone, mats["panel"], bevel=0.022)
    box("UpperDeck_RightLiner", (0.05, 1.48, 17.72), (2.67, 3.34, 49.0), zone, mats["panel"], bevel=0.022)
    box("UpperDeck_Ceiling", (3.75, 0.09, 18.0), (0.0, 4.40, 49.0), zone, mats["ceiling"], bevel=0.025)

    ceiling_z = [41.10 + 2.18 * index for index in range(8)]
    window_z = [41.05 + 1.90 * index for index in range(9)]
    create_ceiling_modules(
        zone,
        mats,
        "Panel_Ceiling_Module_Upper",
        ceiling_z,
        4.31,
        2.80,
        1.92,
        0.98,
        2.00,
        13.0,
    )
    upper_window_modules = create_window_modules(
        zone,
        mats,
        "Panel_Window_Module_Upper",
        window_z,
        2.665,
        3.56,
        0.50,
        0.80,
    )
    for module in upper_window_modules:
        if module.name == "Panel_Window_Module_Upper_L_09":
            bpy.data.objects.remove(module, do_unlink=True)
            break
    create_bin_modules(
        zone,
        mats,
        "UpperDeck_Overhead_Bin",
        ceiling_z,
        2.02,
        4.04,
        0.84,
        0.34,
        1.92,
    )

    for side, x in (("Left", -2.52), ("Right", 2.52)):
        box(
            "UpperDeck_FloorLight_" + side,
            (0.042, 0.032, 16.9),
            (x, 2.48, 49.0),
            zone,
            mats["window_glow"],
            bevel=0.007,
        )

    exit_frame_parts = [
        box(
            "UpperDeck_ExitFrame",
            (0.16, 1.78, 0.14),
            (-2.69, 3.27, 55.10),
            zone,
            mats["metal"],
            bevel=0.025,
        ),
        box(
            "UpperDeck_ExitFrame_Aft",
            (0.16, 1.78, 0.14),
            (-2.69, 3.27, 57.30),
            zone,
            mats["metal"],
            bevel=0.025,
        ),
        box(
            "UpperDeck_ExitFrame_Header",
            (0.16, 0.24, 2.34),
            (-2.69, 4.20, 56.20),
            zone,
            mats["metal"],
            bevel=0.035,
        ),
        box(
            "UpperDeck_ExitFrame_Sill",
            (0.22, 0.07, 2.20),
            (-2.66, 2.43, 56.20),
            zone,
            mats["safety"],
            bevel=0.018,
        ),
        box(
            "UpperDeck_ExitFrame_Light",
            (0.08, 0.055, 1.92),
            (-2.57, 4.06, 56.20),
            zone,
            mats["emissive"],
            bevel=0.012,
        ),
    ]
    join_objects(exit_frame_parts, "UpperDeck_ExitFrame")["module_kind"] = "camera_aligned_exit"

    feature_parts = [
        box(
            "UpperDeck_AftBulkhead",
            (5.32, 1.98, 0.12),
            (0.0, 3.36, 57.92),
            zone,
            mats["panel"],
            bevel=0.045,
        ),
        box(
            "UpperDeck_AftFeature",
            (2.25, 0.82, 0.035),
            (0.0, 3.52, 57.84),
            zone,
            mats["seat_shell"],
            bevel=0.055,
        ),
        box(
            "UpperDeck_AftLight",
            (1.75, 0.055, 0.025),
            (0.0, 3.50, 57.81),
            zone,
            mats["emissive"],
            bevel=0.012,
        ),
        box(
            "UpperDeck_AftMark",
            (0.36, 0.36, 0.02),
            (0.0, 3.70, 57.79),
            zone,
            mats["seat_accent"],
            bevel=0.06,
        ),
    ]
    join_objects(feature_parts, "UpperDeck_AftBulkhead")["module_kind"] = "neutral_feature_wall"


def seat_rows(master, zone, start_z, end_z, xs, prefix, floor_y=0.0):
    row_index = 0
    z = start_z
    while z <= end_z + 1e-6:
        row_index += 1
        for position_index, x in enumerate(xs, start=1):
            seat = linked_seat(
                master,
                "{}_{:02d}_{:02d}".format(prefix, row_index, position_index),
                (x, floor_y, z),
                zone,
            )
            seat["row"] = row_index
            seat["position_in_row"] = position_index
        z += 0.79
    return row_index


def scene_setup():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene["project"] = "MERIDIAN — Airbus A380-800"
    scene["aircraft_reference"] = "Airbus A380-800"
    scene["phase"] = "Round 2 option B final interior"
    scene["layout_source"] = "INTERIOR_LAYOUT.md"
    scene["geometry_status"] = "F0 option B procedural remodel"
    scene["interior_modules"] = "cockpit,economy,stair,upper_deck"
    scene["design_origin"] = "original neutral cabin; no airline trade dress"
    scene["model_version"] = 2

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.004, 0.007, 0.012, 1.0)
        background.inputs["Strength"].default_value = 0.16


def build_materials():
    return {
        "shell": material("Mat_Shell", COLORS["shell"], "structural_shell", roughness=0.58),
        "panel": material(
            "Mat_ShellLight", COLORS["panel"], "moulded_cabin_panel", metallic=0.04, roughness=0.42, coat=0.12
        ),
        "ceiling": material("Mat_Ceiling", COLORS["ceiling"], "acoustic_ceiling", roughness=0.72),
        "seat": material("Mat_Seat", COLORS["seat"], "woven_seat_fabric", roughness=0.88),
        "seat_accent": material(
            "Mat_SeatAccent", COLORS["seat_accent"], "seat_accent", metallic=0.04, roughness=0.38, coat=0.18
        ),
        "seat_shell": material("Mat_SeatShell", COLORS["seat_shell"], "seat_polymer_shell", roughness=0.32),
        "leather": material("Mat_Leather", COLORS["leather"], "headrest_leather", roughness=0.62, coat=0.08),
        "glass": material(
            "Mat_Glass",
            COLORS["glass"],
            "window_glazing",
            roughness=0.10,
            emission=COLORS["window_glow"],
            emission_strength=0.55,
            transmission=0.82,
            ior=1.47,
            coat=0.20,
        ),
        "window_glow": material(
            "Mat_WindowGlow",
            COLORS["window_glow"],
            "cool_window_guide",
            roughness=0.28,
            emission=COLORS["window_glow"],
            emission_strength=2.4,
        ),
        "emissive": material(
            "Mat_Emissive",
            COLORS["cabin_light"],
            "warm_cabin_luminaire",
            roughness=0.30,
            emission=COLORS["cabin_light"],
            emission_strength=4.5,
        ),
        "display": material(
            "Mat_Display",
            COLORS["display"],
            "information_display",
            roughness=0.20,
            emission=COLORS["display"],
            emission_strength=3.2,
            coat=0.15,
        ),
        "metal": material("Mat_Metal", COLORS["metal"], "brushed_metal", metallic=0.82, roughness=0.27),
        "floor": material("Mat_Floor", COLORS["floor"], "hardwearing_floor", roughness=0.90),
        "aisle": material("Mat_Aisle", COLORS["aisle"], "aisle_carpet", roughness=0.96),
        "galley": material(
            "Mat_Galley", COLORS["galley"], "galley_laminate", metallic=0.18, roughness=0.36, coat=0.10
        ),
        "safety": material(
            "Mat_SafetyAccent",
            COLORS["safety"],
            "wayfinding_accent",
            roughness=0.40,
            emission=COLORS["safety"],
            emission_strength=1.25,
        ),
    }


def build():
    clear_scene()
    scene_setup()

    scene_root = bpy.context.scene.collection
    root = collection(PROJECT_ROOT, scene_root)
    zones = {name: collection(name, root) for name in COLLECTION_NAMES}
    mats = build_materials()

    for name, location in ANCHOR_LOCATIONS.items():
        anchor = empty(name, location, zones["Technical"])
        anchor["anchor_contract"] = "INTERIOR_LAYOUT.md"

    seat_master = create_seat_master(zones["Technical"], mats)

    create_cockpit(zones["Zone_Cockpit"], mats, seat_master)
    create_main_cabin(zones["Zone_Economy"], mats)
    create_stair(zones["Zone_Stair"], mats)
    create_upper_deck(zones["Zone_UpperDeck"], mats)

    economy_rows = seat_rows(
        seat_master,
        zones["Zone_Economy"],
        10.0,
        30.55,
        (-2.0, -1.48, -0.96, 0.96, 1.48, 2.0),
        "Economy_Seat",
    )
    upper_rows = seat_rows(
        seat_master,
        zones["Zone_UpperDeck"],
        41.50,
        55.72,
        (-1.55, -1.02, 1.02, 1.55),
        "UpperDeck_Seat",
        floor_y=2.35,
    )

    # The canonical source and its semantic screen locator remain available
    # to tooling, while only linked seat instances are visible in the cabin.
    seat_master.hide_render = True
    seat_master.hide_viewport = True
    bpy.data.objects["Seat_Screen"].hide_render = True
    bpy.data.objects["Seat_Screen"].hide_viewport = True

    bpy.context.view_layer.update()
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    linked_seats = [obj for obj in mesh_objects if obj.get("seat_instance") is True]
    unique_meshes = {obj.data.name for obj in mesh_objects}
    scene = bpy.context.scene
    scene["economy_rows"] = economy_rows
    scene["upper_deck_rows"] = upper_rows
    scene["linked_seat_instances"] = len(linked_seats)
    scene["mesh_object_count"] = len(mesh_objects)
    scene["unique_mesh_count"] = len(unique_meshes)

    output = os.path.abspath(
        os.environ.get(
            "A380_BLOCKOUT_OUTPUT",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "interior_blockout.blend"),
        )
    )
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)

    glb_output = os.environ.get("A380_EXPORT_GLB")
    if glb_output:
        glb_output = os.path.abspath(glb_output)
        os.makedirs(os.path.dirname(glb_output), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=glb_output,
            export_format="GLB",
            use_selection=False,
            # The canonical linked-seat master lives in Technical and is
            # hidden from viewport/render. Exporting hidden objects adds it
            # as a 241st seat instance at the origin after gltf-transform's
            # instancing pass, so visibility is part of the asset contract.
            use_visible=True,
            export_extras=True,
            export_yup=True,
            export_cameras=False,
            export_lights=False,
        )

    summary = {
        "blend": output,
        "glb": glb_output,
        "mesh_objects": len(mesh_objects),
        "unique_meshes": len(unique_meshes),
        "linked_seats": len(linked_seats),
        "economy_rows": economy_rows,
        "upper_deck_rows": upper_rows,
        "materials": len(bpy.data.materials),
    }
    print("A380_OPTION_B_INTERIOR " + json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    build()
