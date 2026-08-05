"""Reopen and verify the Phase 0 registered exterior/interior scene."""

import json
import os
import sys

import bpy
from mathutils import Vector


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
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return {
        "min": [round(float(value), 8) for value in minimum],
        "max": [round(float(value), 8) for value in maximum],
        "extent": [round(float(value), 8) for value in maximum - minimum],
    }


def main():
    scene_path = os.path.abspath(_arg_value("--scene", "/tmp/phase0_registered_scene.blend"))
    output_path = _arg_value("--output", "")
    bpy.ops.wm.open_mainfile(filepath=scene_path)
    exterior_root = bpy.data.objects.get("Exterior_Root")
    source_root = bpy.data.objects.get("A380_low")
    registration_root = bpy.data.objects.get("Interior_Registration_Root")
    interior_objects = [obj for obj in bpy.data.objects if obj.parent == registration_root] if registration_root else []
    interior_meshes_total = [obj for obj in interior_objects if obj.type == "MESH"]
    interior_meshes_visible = [obj for obj in interior_meshes_total if not obj.hide_viewport and not obj.hide_render]
    exterior_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj not in interior_objects]
    exterior_bounds = _bounds(exterior_meshes)
    interior_bounds = _bounds(interior_meshes_visible)
    checks = {
        "scene_reopened": True,
        "exterior_transform_root": bool(exterior_root and source_root and source_root.parent == exterior_root),
        "registration_root_present": bool(registration_root),
        "interior_object_count": len(interior_objects) == 357,
        "interior_mesh_count": len(interior_meshes_total) == 353,
        "registered_children_preserved": bool(interior_objects) and all(obj.parent == registration_root for obj in interior_objects),
        "registered_bounds_inside_exterior": all(
            interior_bounds["min"][axis] >= exterior_bounds["min"][axis] - 1e-4
            and interior_bounds["max"][axis] <= exterior_bounds["max"][axis] + 1e-4
            for axis in range(3)
        ),
        "registration_translation_recorded": bool(
            registration_root
            and all(abs(registration_root.location[index] - expected) < 1e-4 for index, expected in enumerate((0.0, 3.2, 0.3)))
        ),
    }
    report = {
        "scene": scene_path,
        "object_count": len(bpy.data.objects),
        "interior_object_count": len(interior_objects),
        "interior_mesh_count_total": len(interior_meshes_total),
        "interior_mesh_count_visible": len(interior_meshes_visible),
        "exterior_bounds": exterior_bounds,
        "registered_interior_bounds_visible": interior_bounds,
        "checks": checks,
        "all_checks_pass": all(checks.values()),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if output_path:
        output_path = os.path.abspath(output_path)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
        print("REPORT_WRITTEN", output_path)


if __name__ == "__main__":
    main()
