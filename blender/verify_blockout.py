"""Headless verification for the Phase 0 A380 interior blockout."""

import json

import bpy
from mathutils import Vector


REQUIRED_COLLECTIONS = [
    "Interior_Root",
    "Zone_Cockpit",
    "Zone_Economy",
    "Zone_Stair",
    "Zone_UpperDeck",
    "Technical",
]


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return minimum, maximum


def check():
    missing = [name for name in REQUIRED_COLLECTIONS if bpy.data.collections.get(name) is None]
    assert not missing, "missing collections: {}".format(missing)

    collection_counts = {
        name: len(bpy.data.collections[name].objects) for name in REQUIRED_COLLECTIONS
    }
    populated = [name for name in REQUIRED_COLLECTIONS if name != "Interior_Root"]
    assert all(collection_counts[name] > 0 for name in populated), collection_counts

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    assert len(mesh_objects) >= 100, len(mesh_objects)

    seat_master = bpy.data.objects.get("Seat_Base")
    assert seat_master is not None, "Seat_Base missing"
    assert seat_master.get("instance_ready") is True, "Seat_Base is not instance-ready"
    linked_seats = [
        obj for obj in mesh_objects
        if obj.name.startswith(("Economy_Seat_", "UpperDeck_Seat_"))
        and obj.data == seat_master.data
    ]
    assert len(linked_seats) >= 50, len(linked_seats)
    assert seat_master.data.users >= len(linked_seats) + 1, seat_master.data.users

    scene = bpy.context.scene
    assert scene.unit_settings.system == "METRIC"
    assert scene.unit_settings.length_unit == "METERS"
    assert scene.get("phase") == "Phase 0 blockout"
    assert scene.get("aircraft_reference") == "Airbus A380-800"

    anchors = [
        "Cockpit_Anchor",
        "Economy_Anchor",
        "Stair_Anchor",
        "UpperDeck_Anchor",
    ]
    assert all(bpy.data.objects.get(name) is not None for name in anchors), anchors

    minimum, maximum = world_bounds(mesh_objects)
    extent = maximum - minimum
    assert extent.x > 6.0 and extent.z > 55.0, tuple(round(value, 3) for value in extent)

    result = {
        "file": bpy.data.filepath,
        "blender": bpy.app.version_string,
        "collections": collection_counts,
        "mesh_objects": len(mesh_objects),
        "linked_seats": len(linked_seats),
        "seat_mesh_users": seat_master.data.users,
        "world_bounds_min": [round(value, 3) for value in minimum],
        "world_bounds_max": [round(value, 3) for value in maximum],
        "world_extent": [round(value, 3) for value in extent],
        "verification": "PASS",
    }
    print("PHASE0_BLOCKOUT_VERIFICATION " + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    check()
