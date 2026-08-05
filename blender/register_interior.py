"""Register the verified interior blockout inside the normalized exterior.

This produces a disposable combined BLEND used for the Phase 0 spatial
check.  The interior remains project-owned geometry; the exterior remains the
CC-BY source under its own transform root.
"""

import json
import os
import sys

import bpy
from mathutils import Matrix, Vector


REGISTRATION_TRANSLATION = (0.0, 3.2, 0.3)


def _arg_value(name, default):
    if "--" not in sys.argv:
        return default
    args = sys.argv[sys.argv.index("--") + 1 :]
    if name not in args:
        return default
    index = args.index(name) + 1
    return args[index] if index < len(args) else default


def _bounds(objects):
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    if not points:
        return None
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return {
        "min": [round(float(value), 8) for value in minimum],
        "max": [round(float(value), 8) for value in maximum],
        "extent": [round(float(value), 8) for value in maximum - minimum],
        "vertex_count": len(points),
    }


def _parent_preserving_world(child, parent):
    # Objects loaded from a library are not evaluated into a scene yet; their
    # matrix_world can still be identity while matrix_basis carries location.
    world = child.matrix_world.copy() if child.parent else child.matrix_basis.copy()
    child.parent = parent
    child.matrix_world = world


def _link_top_level_collections(collections):
    scene_collection = bpy.context.scene.collection
    nested_names = {child.name for collection in collections for child in collection.children}
    for collection in collections:
        if collection.name in nested_names:
            continue
        if collection.name not in {child.name for child in scene_collection.children}:
            scene_collection.children.link(collection)


def main():
    exterior_path = os.path.abspath(_arg_value("--exterior", "/tmp/phase0_exterior_working.blend"))
    interior_path = os.path.abspath(_arg_value("--interior", "/tmp/phase0_interior_blockout.blend"))
    output_path = os.path.abspath(_arg_value("--output", "/tmp/phase0_registered_scene.blend"))
    report_path = os.path.abspath(_arg_value("--report", "/tmp/phase0_registration.json"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    os.makedirs(os.path.dirname(report_path), exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=exterior_path)
    existing_objects = set(bpy.data.objects)
    with bpy.data.libraries.load(interior_path, link=False) as (data_from, data_to):
        data_to.collections = list(data_from.collections)
    loaded_collections = [collection for collection in data_to.collections if collection]
    _link_top_level_collections(loaded_collections)

    interior_objects = [obj for obj in bpy.data.objects if obj not in existing_objects]
    if not interior_objects:
        raise RuntimeError("The interior blockout did not load")

    registration_root = bpy.data.objects.new("Interior_Registration_Root", None)
    bpy.context.collection.objects.link(registration_root)
    registration_root.location = REGISTRATION_TRANSLATION
    for obj in interior_objects:
        local_matrix = obj.matrix_basis.copy()
        obj.parent = registration_root
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = local_matrix
    bpy.context.view_layer.update()
    registration_root["registration_basis"] = "Exterior_Root axes: x lateral, y up, z longitudinal"
    registration_root["translation_m"] = list(REGISTRATION_TRANSLATION)
    registration_root["note"] = "Phase 0 coarse registration; final threshold/door fit remains a Phase 4 spike"

    exterior_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj not in interior_objects]
    interior_meshes = [
        obj
        for obj in interior_objects
        if obj.type == "MESH" and not obj.hide_viewport and not obj.hide_render
    ]
    exterior_bounds = _bounds(exterior_meshes)
    interior_bounds = _bounds(interior_meshes)
    checks = {
        "combined_scene_saved": True,
        "interior_loaded": sum(1 for obj in interior_objects if obj.type == "MESH") == 353,
        "single_registration_root": all(obj.parent == registration_root for obj in interior_objects),
        "interior_within_exterior_envelope": all(
            interior_bounds["min"][axis] >= exterior_bounds["min"][axis] - 1e-4
            and interior_bounds["max"][axis] <= exterior_bounds["max"][axis] + 1e-4
            for axis in range(3)
        ),
        "axis_contract_preserved": bool(
            bpy.data.objects.get("Exterior_Root")
            and abs(bpy.data.objects["Exterior_Root"].rotation_euler[0] + 1.57079632679) < 1e-5
        ),
    }
    bpy.ops.wm.save_as_mainfile(filepath=output_path)
    report = {
        "exterior_file": exterior_path,
        "interior_file": interior_path,
        "registered_file": output_path,
        "registration_translation_m": list(REGISTRATION_TRANSLATION),
        "interior_object_count": len(interior_objects),
        "interior_mesh_count": len(interior_meshes),
        "interior_mesh_count_total": sum(1 for obj in interior_objects if obj.type == "MESH"),
        "hidden_interior_meshes_excluded_from_bounds": [
            obj.name
            for obj in interior_objects
            if obj.type == "MESH" and (obj.hide_viewport or obj.hide_render)
        ],
        "exterior_bounds": exterior_bounds,
        "registered_interior_bounds": interior_bounds,
        "checks": checks,
        "all_checks_pass": all(checks.values()),
    }
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("REGISTRATION_REPORT_WRITTEN", report_path)


if __name__ == "__main__":
    main()
