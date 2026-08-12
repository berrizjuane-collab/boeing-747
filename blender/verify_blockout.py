"""Headless verification for the procedural F0 option-B A380 interior."""

import json
import math

import bpy
from mathutils import Vector


REQUIRED_COLLECTIONS = (
    "Interior_Root",
    "Zone_Cockpit",
    "Zone_Economy",
    "Zone_Stair",
    "Zone_UpperDeck",
    "Technical",
)

EXPECTED_ANCHORS = {
    "Cockpit_Anchor": (0.0, 0.0, 0.0),
    "Economy_Anchor": (0.0, 0.0, 8.0),
    "Stair_Anchor": (0.0, 0.0, 34.0),
    "UpperDeck_Anchor": (0.0, 2.35, 40.0),
}

REQUIRED_OBJECTS = {
    "Zone_Cockpit": (
        "Cockpit_Floor",
        "Cockpit_Aisle",
        "Cockpit_LeftWall",
        "Cockpit_RightWall",
        "Cockpit_Ceiling",
        "Cockpit_MainPanel",
        "Cockpit_Display_01",
        "Cockpit_Window_01",
        "Cockpit_Console_Left",
        "Cockpit_Console_Right",
        "Cockpit_OverheadPanel",
        "Cockpit_AftPortal",
        "Cockpit_Seat_Captain",
        "Cockpit_Seat_FirstOfficer",
    ),
    "Zone_Economy": (
        "Economy_Floor",
        "Economy_Aisle",
        "Economy_LeftWall",
        "Economy_RightWall",
        "Economy_Ceiling",
        "Panel_Ceiling_Module_01",
        "Panel_Window_Module_L_01",
        "Economy_Overhead_Bin_L_01",
        "Galley_Left",
        "Galley_Right",
        "Economy_AftPortal",
    ),
    "Zone_Stair": (
        "Stair_Floor",
        "Stair_Main",
        "Stair_Wall_Left",
        "Stair_Wall_Right",
        "Stair_Wall_Panel_Left",
        "Stair_Wall_Panel_Right",
        "Stair_Ceiling",
        "Stair_Ceiling_Light",
        "Stair_Edge_Lighting",
        "Stair_UpperLanding",
        "Stair_Railing_Left",
        "Stair_Railing_Right",
        "Stair_UpperPortal",
    ),
    "Zone_UpperDeck": (
        "UpperDeck_Floor",
        "UpperDeck_Aisle",
        "UpperDeck_LeftWall",
        "UpperDeck_RightWall",
        "UpperDeck_Ceiling",
        "Panel_Ceiling_Module_Upper_01",
        "Panel_Window_Module_Upper_L_01",
        "UpperDeck_Overhead_Bin_L_01",
        "UpperDeck_ExitFrame",
        "UpperDeck_AftBulkhead",
    ),
    "Technical": ("Seat_Base", "Seat_Screen"),
}

REQUIRED_MATERIALS = {
    "Mat_Shell": "structural_shell",
    "Mat_ShellLight": "moulded_cabin_panel",
    "Mat_Ceiling": "acoustic_ceiling",
    "Mat_Seat": "woven_seat_fabric",
    "Mat_SeatAccent": "seat_accent",
    "Mat_SeatShell": "seat_polymer_shell",
    "Mat_Leather": "headrest_leather",
    "Mat_Glass": "window_glazing",
    "Mat_WindowGlow": "cool_window_guide",
    "Mat_Emissive": "warm_cabin_luminaire",
    "Mat_Display": "information_display",
    "Mat_Metal": "brushed_metal",
    "Mat_Floor": "hardwearing_floor",
    "Mat_Aisle": "aisle_carpet",
    "Mat_Galley": "galley_laminate",
    "Mat_SafetyAccent": "wayfinding_accent",
}

MODULE_REQUIREMENTS = (
    ("Zone_Economy", "Panel_Ceiling_Module_", 11),
    ("Zone_Economy", "Panel_Window_Module_", 26),
    ("Zone_Economy", "Economy_Overhead_Bin_", 22),
    ("Zone_UpperDeck", "Panel_Ceiling_Module_Upper_", 8),
    # One port module is intentionally removed for the camera-aligned exit.
    ("Zone_UpperDeck", "Panel_Window_Module_Upper_", 17),
    ("Zone_UpperDeck", "UpperDeck_Overhead_Bin_", 16),
)

ZONE_Z_RANGES = {
    "Zone_Cockpit": (0.0, 8.0),
    "Zone_Economy": (8.0, 34.0),
    "Zone_Stair": (34.0, 40.0),
    "Zone_UpperDeck": (40.0, 58.0),
}


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    assert points, "no mesh bounds to evaluate"
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def local_mesh_extent(obj):
    assert obj.type == "MESH" and obj.data.vertices, "{} has no mesh vertices".format(obj.name)
    minimum = Vector(tuple(min(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)))
    maximum = Vector(tuple(max(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)))
    return maximum - minimum


def material_names(obj):
    return {slot.material.name for slot in obj.material_slots if slot.material is not None}


def require_object(name, collection_name, object_type=None):
    obj = bpy.data.objects.get(name)
    assert obj is not None, "{} missing".format(name)
    assert bpy.data.collections[collection_name] in obj.users_collection, (
        "{} is not in {}".format(name, collection_name)
    )
    if object_type is not None:
        assert obj.type == object_type, "{} type is {}, expected {}".format(name, obj.type, object_type)
    return obj


def check_collections_and_objects():
    missing = [name for name in REQUIRED_COLLECTIONS if bpy.data.collections.get(name) is None]
    assert not missing, "missing collections: {}".format(missing)

    root = bpy.data.collections["Interior_Root"]
    root_children = {child.name for child in root.children}
    assert set(REQUIRED_COLLECTIONS[1:]).issubset(root_children), root_children

    for collection_name, names in REQUIRED_OBJECTS.items():
        for name in names:
            require_object(name, collection_name)

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        memberships = [
            collection.name
            for collection in obj.users_collection
            if collection.name in REQUIRED_COLLECTIONS[1:]
        ]
        assert len(memberships) == 1, "{} zone memberships: {}".format(obj.name, memberships)

    return {name: len(bpy.data.collections[name].objects) for name in REQUIRED_COLLECTIONS}


def check_anchors():
    technical = bpy.data.collections["Technical"]
    report = {}
    for name, expected in EXPECTED_ANCHORS.items():
        anchor = require_object(name, "Technical", "EMPTY")
        delta = anchor.location - Vector(expected)
        assert delta.length <= 1e-6, "{} moved: {} != {}".format(name, tuple(anchor.location), expected)
        assert all(abs(value) <= 1e-7 for value in anchor.rotation_euler), "{} rotated".format(name)
        assert all(abs(value - 1.0) <= 1e-7 for value in anchor.scale), "{} scaled".format(name)
        assert anchor.get("anchor_contract") == "INTERIOR_LAYOUT.md", "{} lacks contract metadata".format(name)
        assert technical in anchor.users_collection
        report[name] = [round(value, 3) for value in anchor.location]
    return report


def check_materials(mesh_objects):
    missing = [name for name in REQUIRED_MATERIALS if bpy.data.materials.get(name) is None]
    assert not missing, "missing materials: {}".format(missing)

    used = {name for obj in mesh_objects for name in material_names(obj)}
    unused = sorted(set(REQUIRED_MATERIALS) - used)
    assert not unused, "required materials are unused: {}".format(unused)

    roles = {}
    for name, expected_role in REQUIRED_MATERIALS.items():
        mat = bpy.data.materials[name]
        assert mat.use_nodes, "{} is not node-based".format(name)
        assert mat.node_tree.nodes.get("Principled BSDF") is not None, "{} is not Principled PBR".format(name)
        assert mat.get("pbr_role") == expected_role, "{} role mismatch".format(name)
        assert mat.get("neutral_original_design") is True, "{} lacks neutral-design marker".format(name)
        roughness = float(mat.get("roughness_value", -1.0))
        metallic = float(mat.get("metallic_value", -1.0))
        assert 0.0 <= roughness <= 1.0, "{} roughness invalid".format(name)
        assert 0.0 <= metallic <= 1.0, "{} metallic invalid".format(name)
        roles[name] = expected_role

    assert float(bpy.data.materials["Mat_Metal"].get("metallic_value")) >= 0.75
    assert float(bpy.data.materials["Mat_Floor"].get("roughness_value")) >= 0.85
    assert float(bpy.data.materials["Mat_Aisle"].get("roughness_value")) >= 0.90
    assert float(bpy.data.materials["Mat_Glass"].get("transmission_value")) >= 0.75
    assert float(bpy.data.materials["Mat_Emissive"].get("emission_strength")) >= 4.0
    assert float(bpy.data.materials["Mat_WindowGlow"].get("emission_strength")) >= 2.0
    assert float(bpy.data.materials["Mat_Display"].get("emission_strength")) >= 3.0
    assert float(bpy.data.materials["Mat_SafetyAccent"].get("emission_strength")) >= 1.0
    return roles


def check_seats(mesh_objects):
    seat_master = require_object("Seat_Base", "Technical", "MESH")
    assert seat_master.get("instance_ready") is True, "Seat_Base is not instance-ready"
    assert seat_master.hide_viewport and seat_master.hide_render, "Seat_Base source must stay hidden"
    assert seat_master.location.length <= 1e-7, tuple(seat_master.location)
    assert seat_master.get("origin_contract") == "footprint centre at floor Y=0"

    design_dimensions = list(seat_master.get("design_dimensions_m", []))
    assert len(design_dimensions) == 3
    assert all(
        abs(actual - expected) <= 1e-6
        for actual, expected in zip(design_dimensions, (0.48, 1.15, 0.52))
    ), design_dimensions

    components = set(json.loads(seat_master.get("component_names", "[]")))
    required_components = {"cushion", "back", "headrest", "arms", "legs", "screen", "tray_latch"}
    assert required_components.issubset(components), sorted(components)

    screen = require_object("Seat_Screen", "Technical", "EMPTY")
    assert screen.get("integrated_in") == "Seat_Base"
    assert screen.get("material") == "Mat_Display"
    assert screen.hide_viewport and screen.hide_render

    linked_seats = [
        obj
        for obj in mesh_objects
        if obj.get("seat_instance") is True
        and obj.name.startswith(("Cockpit_Seat_", "Economy_Seat_", "UpperDeck_Seat_"))
    ]
    assert len(linked_seats) >= 230, "only {} linked seats".format(len(linked_seats))
    assert all(obj.data == seat_master.data for obj in linked_seats), "seat mesh was duplicated"
    assert seat_master.data.users >= len(linked_seats) + 1, seat_master.data.users

    seat_materials = material_names(seat_master)
    required_seat_materials = {
        "Mat_Seat",
        "Mat_SeatAccent",
        "Mat_SeatShell",
        "Mat_Leather",
        "Mat_Display",
        "Mat_Metal",
    }
    assert required_seat_materials.issubset(seat_materials), sorted(seat_materials)

    extent = local_mesh_extent(seat_master)
    assert 0.46 <= extent.x <= 0.52, tuple(extent)
    assert 1.08 <= extent.y <= 1.22, tuple(extent)
    assert 0.45 <= extent.z <= 0.62, tuple(extent)

    economy = [obj for obj in linked_seats if obj.name.startswith("Economy_Seat_")]
    upper = [obj for obj in linked_seats if obj.name.startswith("UpperDeck_Seat_")]
    cockpit = [obj for obj in linked_seats if obj.name.startswith("Cockpit_Seat_")]
    assert len(cockpit) == 2, len(cockpit)
    assert len(economy) >= 150 and len(upper) >= 70, (len(economy), len(upper))

    economy_clear = 2.0 * (min(abs(obj.location.x) for obj in economy) - extent.x * 0.5)
    upper_clear = 2.0 * (min(abs(obj.location.x) for obj in upper) - extent.x * 0.5)
    assert economy_clear >= 1.20, economy_clear
    assert upper_clear >= 1.20, upper_clear

    return {
        "total": len(linked_seats),
        "cockpit": len(cockpit),
        "economy": len(economy),
        "upper_deck": len(upper),
        "mesh_users": seat_master.data.users,
        "mesh_extent": [round(value, 3) for value in extent],
        "economy_aisle_clear_m": round(economy_clear, 3),
        "upper_aisle_clear_m": round(upper_clear, 3),
    }


def check_linked_modules():
    report = {}
    for collection_name, prefix, minimum_count in MODULE_REQUIREMENTS:
        objects = [
            obj
            for obj in bpy.data.collections[collection_name].objects
            if obj.type == "MESH" and obj.name.startswith(prefix)
        ]
        assert len(objects) >= minimum_count, "{} has {} objects".format(prefix, len(objects))
        mesh_names = {obj.data.name for obj in objects}
        assert len(mesh_names) == 1, "{} is not linked: {}".format(prefix, sorted(mesh_names))
        assert objects[0].data.users >= len(objects), "{} mesh users too low".format(prefix)
        assert all(not obj.hide_viewport and not obj.hide_render for obj in objects)
        report[prefix] = {"instances": len(objects), "unique_meshes": len(mesh_names)}
    return report


def check_stair_enclosure():
    stair = bpy.data.collections["Zone_Stair"]
    main = require_object("Stair_Main", "Zone_Stair", "MESH")
    left = require_object("Stair_Wall_Left", "Zone_Stair", "MESH")
    right = require_object("Stair_Wall_Right", "Zone_Stair", "MESH")
    ceiling = require_object("Stair_Ceiling", "Zone_Stair", "MESH")
    require_object("Stair_Wall_Panel_Left", "Zone_Stair", "MESH")
    require_object("Stair_Wall_Panel_Right", "Zone_Stair", "MESH")
    require_object("Stair_Railing_Left", "Zone_Stair", "MESH")
    require_object("Stair_Railing_Right", "Zone_Stair", "MESH")

    assert main.get("step_count") == 16
    assert main.get("mid_landing") is True
    assert float(main.get("clear_width_m", 0.0)) >= 1.05
    assert left.get("enclosure_role") == "side_wall"
    assert right.get("enclosure_role") == "side_wall"
    assert ceiling.get("enclosure_role") == "raked_ceiling"
    assert "Mat_Shell" in material_names(left) and "Mat_Shell" in material_names(right)
    assert "Mat_Ceiling" in material_names(ceiling)
    assert "Mat_Emissive" in material_names(bpy.data.objects["Stair_Ceiling_Light"])
    assert "Mat_SafetyAccent" in material_names(bpy.data.objects["Stair_Edge_Lighting"])

    left_min, left_max = world_bounds([left])
    right_min, right_max = world_bounds([right])
    ceiling_min, ceiling_max = world_bounds([ceiling])
    assert left_min.x < -1.05 and left_max.x <= -0.94, (tuple(left_min), tuple(left_max))
    assert right_min.x >= 0.94 and right_max.x > 1.05, (tuple(right_min), tuple(right_max))
    assert left_max.z - left_min.z >= 5.6 and right_max.z - right_min.z >= 5.6
    assert left_max.y - left_min.y >= 4.2 and right_max.y - right_min.y >= 4.2
    assert ceiling_max.x - ceiling_min.x >= 1.95
    assert ceiling_max.z - ceiling_min.z >= 5.2

    galley_left = require_object("Galley_Left", "Zone_Economy", "MESH")
    galley_right = require_object("Galley_Right", "Zone_Economy", "MESH")
    assert galley_left.get("aisle_readable") is True and galley_right.get("aisle_readable") is True
    assert galley_left.location.x < -1.5 and galley_right.location.x > 1.5
    assert 31.0 <= galley_left.location.z <= 33.0 and 31.0 <= galley_right.location.z <= 33.0

    return {
        "objects": len(stair.objects),
        "step_count": main.get("step_count"),
        "mid_landing_z": round(float(main.get("mid_landing_z")), 3),
        "wall_span_z_m": round(left_max.z - left_min.z, 3),
        "ceiling_span_z_m": round(ceiling_max.z - ceiling_min.z, 3),
        "closed": True,
    }


def check_upper_exit():
    forward = require_object("UpperDeck_LeftWall", "Zone_UpperDeck", "MESH")
    aft = require_object("UpperDeck_LeftWall_Aft", "Zone_UpperDeck", "MESH")
    frame = require_object("UpperDeck_ExitFrame", "Zone_UpperDeck", "MESH")
    forward_min, forward_max = world_bounds([forward])
    aft_min, aft_max = world_bounds([aft])
    frame_min, frame_max = world_bounds([frame])

    assert forward_max.z <= 55.12, tuple(forward_max)
    assert aft_min.z >= 57.28, tuple(aft_min)
    assert frame_min.z <= 55.05 and frame_max.z >= 57.35, (tuple(frame_min), tuple(frame_max))
    assert bpy.data.objects.get("Panel_Window_Module_Upper_L_09") is None
    assert frame.get("module_kind") == "camera_aligned_exit"

    return {
        "opening_z": [round(forward_max.z, 3), round(aft_min.z, 3)],
        "frame_z": [round(frame_min.z, 3), round(frame_max.z, 3)],
        "window_module_removed": True,
    }


def check_zone_bounds():
    report = {}
    for collection_name, (expected_min, expected_max) in ZONE_Z_RANGES.items():
        objects = [
            obj
            for obj in bpy.data.collections[collection_name].objects
            if obj.type == "MESH" and not obj.hide_viewport and not obj.hide_render
        ]
        minimum, maximum = world_bounds(objects)
        assert minimum.z >= expected_min - 0.18, "{} starts at {}".format(collection_name, minimum.z)
        assert maximum.z <= expected_max + 0.18, "{} ends at {}".format(collection_name, maximum.z)
        assert maximum.z - minimum.z >= (expected_max - expected_min) - 0.35
        report[collection_name] = [round(minimum.z, 3), round(maximum.z, 3)]
    return report


def check_optimization(mesh_objects):
    unique_meshes = {obj.data.name: obj.data for obj in mesh_objects}
    unique_vertex_count = sum(len(mesh.vertices) for mesh in unique_meshes.values())
    ratio = len(unique_meshes) / len(mesh_objects)
    assert 250 <= len(mesh_objects) <= 450, len(mesh_objects)
    assert len(unique_meshes) <= 100, len(unique_meshes)
    assert ratio <= 0.30, ratio
    assert unique_vertex_count <= 150000, unique_vertex_count
    assert all(len(obj.modifiers) == 0 for obj in mesh_objects), "unapplied modifiers remain"
    assert all(obj.data.materials for obj in mesh_objects), "unmaterialed mesh found"
    assert not [obj for obj in bpy.data.objects if obj.type in {"LIGHT", "CAMERA"}], "runtime lights/cameras exported"

    banned_trade_dress = ("emirates", "qatar", "lufthansa", "singapore", "british", "air_france")
    authored_names = [obj.name.lower() for obj in bpy.data.objects]
    authored_names.extend(material.name.lower() for material in bpy.data.materials)
    assert not [name for name in authored_names if any(token in name for token in banned_trade_dress)]

    return {
        "mesh_objects": len(mesh_objects),
        "unique_meshes": len(unique_meshes),
        "unique_mesh_ratio": round(ratio, 4),
        "unique_vertices": unique_vertex_count,
    }


def check():
    bpy.context.view_layer.update()
    collection_counts = check_collections_and_objects()
    anchors = check_anchors()

    scene = bpy.context.scene
    assert scene.unit_settings.system == "METRIC"
    assert scene.unit_settings.length_unit == "METERS"
    assert scene.get("project") == "MERIDIAN — Airbus A380-800"
    assert scene.get("phase") == "Round 2 option B final interior"
    assert scene.get("aircraft_reference") == "Airbus A380-800"
    assert scene.get("geometry_status") == "F0 option B procedural remodel"
    assert scene.get("model_version") == 2
    assert scene.get("design_origin") == "original neutral cabin; no airline trade dress"

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    visible_meshes = [obj for obj in mesh_objects if not obj.hide_viewport and not obj.hide_render]
    materials = check_materials(mesh_objects)
    seats = check_seats(mesh_objects)
    modules = check_linked_modules()
    stair = check_stair_enclosure()
    upper_exit = check_upper_exit()
    zone_bounds = check_zone_bounds()
    optimization = check_optimization(mesh_objects)

    assert scene.get("linked_seat_instances") == seats["total"]
    assert scene.get("mesh_object_count") == optimization["mesh_objects"]
    assert scene.get("unique_mesh_count") == optimization["unique_meshes"]

    minimum, maximum = world_bounds(visible_meshes)
    extent = maximum - minimum
    assert 6.0 <= extent.x <= 6.4, tuple(extent)
    assert 4.35 <= extent.y <= 4.85, tuple(extent)
    assert 57.7 <= extent.z <= 58.2, tuple(extent)
    assert minimum.z >= -0.1 and maximum.z <= 58.1, (tuple(minimum), tuple(maximum))

    result = {
        "file": bpy.data.filepath,
        "blender": bpy.app.version_string,
        "collections": collection_counts,
        "anchors": anchors,
        "materials": materials,
        "seats": seats,
        "linked_modules": modules,
        "stair_enclosure": stair,
        "upper_exit": upper_exit,
        "zone_z_bounds": zone_bounds,
        "optimization": optimization,
        "world_bounds_min": [round(value, 3) for value in minimum],
        "world_bounds_max": [round(value, 3) for value in maximum],
        "world_extent": [round(value, 3) for value in extent],
        "verification": "PASS",
    }
    print("F0_OPTION_B_INTERIOR_VERIFICATION " + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    check()
