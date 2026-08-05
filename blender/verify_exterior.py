"""Verify the normalized Phase 0 exterior BLEND and its GLB export."""

import json
import math
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


def _uv_summary(mesh_objects):
    layers = []
    for obj in mesh_objects:
        for layer in obj.data.uv_layers:
            values = [item.uv for item in layer.data]
            if values:
                minimum = (min(value.x for value in values), min(value.y for value in values))
                maximum = (max(value.x for value in values), max(value.y for value in values))
            else:
                minimum = maximum = (0.0, 0.0)
            layers.append({"object": obj.name, "name": layer.name, "min": minimum, "max": maximum})
    return layers


def _material_summary():
    values = []
    for material in bpy.data.materials:
        nodes = material.node_tree.nodes if material.use_nodes else []
        links = material.node_tree.links if material.use_nodes else []
        principled = [node for node in nodes if node.type == "BSDF_PRINCIPLED"]
        output = [node for node in nodes if node.type == "OUTPUT_MATERIAL"]
        base_color_links = []
        for node in principled:
            socket = node.inputs.get("Base Color")
            if socket:
                base_color_links.extend(link.from_node.name for link in links if link.to_socket == socket)
        values.append({
            "name": material.name,
            "principled_count": len(principled),
            "output_count": len(output),
            "base_color_links": base_color_links,
            "native_principled": bool(principled and output),
        })
    return values


def _blend_report(blend_path):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    root = bpy.data.objects.get("Exterior_Root")
    source_root = bpy.data.objects.get("A380_low")
    landing_root = bpy.data.objects.get("LandingGear")
    body = bpy.data.objects.get("A380")
    gear_parts = [obj for obj in mesh_objects if obj.name.startswith("LandingGear_Part_")]
    uv_layers = _uv_summary(mesh_objects)
    bounds = _bounds(mesh_objects)
    body_vertices = len(body.data.vertices) if body else 0
    body_polygons = len(body.data.polygons) if body else 0
    gear_vertices = sum(len(obj.data.vertices) for obj in gear_parts)
    gear_polygons = sum(len(obj.data.polygons) for obj in gear_parts)
    root_rotation = list(root.rotation_euler) if root else None
    root_location = list(root.location) if root else None
    uv_in_unit_square = all(
        -1e-6 <= uv[axis] <= 1.000001
        for layer in uv_layers
        for uv in (layer["min"], layer["max"])
        for axis in (0, 1)
    )
    checks = {
        "blend_reopened": True,
        "single_transform_root": bool(
            root
            and source_root
            and source_root.parent == root
            and root_rotation is not None
            and abs(root_rotation[0] + math.pi / 2.0) < 1e-5
            and abs(root_rotation[1]) < 1e-5
            and abs(root_rotation[2]) < 1e-5
        ),
        "source_hierarchy_preserved": bool(source_root and body and body.parent == source_root),
        "landing_gear_hierarchy": bool(
            landing_root
            and landing_root.parent == source_root
            and len(gear_parts) >= 2
            and all(part.parent == landing_root for part in gear_parts)
        ),
        "all_meshes_have_uv": bool(mesh_objects) and all(bool(obj.data.uv_layers) for obj in mesh_objects),
        "uv_bounds_inside_unit_square": uv_in_unit_square,
        "source_geometry_counts_preserved": body_vertices == 22145 and body_polygons == 20990 and gear_vertices == 14135 and gear_polygons == 13032,
        "packed_source_images": bool(bpy.data.images) and all(bool(image.packed_file) for image in bpy.data.images),
        "native_principled_material": any(item["native_principled"] for item in _material_summary()),
        "expected_metric_bounds": bool(
            bounds
            and abs(bounds["extent"][0] - 79.68066406) < 0.01
            and abs(bounds["extent"][1] - 24.68604279) < 0.01
            and abs(bounds["extent"][2] - 72.9998703) < 0.01
        ),
    }
    return {
        "file": blend_path,
        "object_count": len(bpy.data.objects),
        "mesh_object_count": len(mesh_objects),
        "gear_part_count": len(gear_parts),
        "bounds": bounds,
        "root": {"name": root.name if root else None, "location": root_location, "rotation_euler": root_rotation},
        "body_counts": {"vertices": body_vertices, "polygons": body_polygons},
        "gear_counts": {"vertices": gear_vertices, "polygons": gear_polygons},
        "uv_layer_count": len(uv_layers),
        "materials": _material_summary(),
        "images": [{"name": image.name, "packed": bool(image.packed_file), "size": list(image.size)} for image in bpy.data.images],
        "checks": checks,
        "all_checks_pass": all(checks.values()),
    }


def _glb_report(glb_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    bounds = _bounds(mesh_objects)
    return {
        "file": glb_path,
        "object_count": len(bpy.data.objects),
        "mesh_object_count": len(mesh_objects),
        "material_count": len(bpy.data.materials),
        "image_count": len(bpy.data.images),
        "bounds": bounds,
        "all_meshes_have_uv": bool(mesh_objects) and all(bool(obj.data.uv_layers) for obj in mesh_objects),
        "all_checks_pass": bool(mesh_objects) and bool(bounds) and all(bool(obj.data.uv_layers) for obj in mesh_objects),
    }


def main():
    blend_path = os.path.abspath(_arg_value("--blend", "/tmp/phase0_exterior_working.blend"))
    glb_path = os.path.abspath(_arg_value("--glb", "/tmp/phase0_exterior_working.glb"))
    output = _arg_value("--output", "")
    report = {"blend": _blend_report(blend_path), "glb": _glb_report(glb_path)}
    report["all_checks_pass"] = report["blend"]["all_checks_pass"] and report["glb"]["all_checks_pass"]
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if output:
        output = os.path.abspath(output)
        os.makedirs(os.path.dirname(output), exist_ok=True)
        with open(output, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
        print("REPORT_WRITTEN", output)


if __name__ == "__main__":
    main()
