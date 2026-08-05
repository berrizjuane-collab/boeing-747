"""Audit an imported exterior source file without changing its geometry.

Run with Blender's already-open file:

    blender -b source.blend --python audit_exterior.py -- --output report.json

The report is evidence for the Phase 0 asset gate.  It intentionally reports
limitations (for example, an albedo-only material) instead of upgrading them
to passes.
"""

import json
import math
import os
import re
import sys
from collections import defaultdict

import bpy
from mathutils import Euler, Vector


GEAR_RE = re.compile(r"gear|wheel|tire|tyre|landing|bogie|strut|undercarriage", re.I)
PBR_INPUTS = ("Base Color", "Metallic", "Roughness", "Normal", "Emission Color", "Alpha")


def _json_value(value):
    if isinstance(value, Vector):
        return [round(float(x), 8) for x in value]
    if isinstance(value, Euler):
        return [round(float(x), 8) for x in value]
    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes, dict)):
        try:
            return [round(float(x), 8) for x in value]
        except (TypeError, ValueError):
            pass
    if isinstance(value, (tuple, list)):
        return [_json_value(x) for x in value]
    if isinstance(value, float):
        return round(value, 8)
    return value


def _bounds_for_objects(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    if not points:
        return None
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return {
        "min": _json_value(minimum),
        "max": _json_value(maximum),
        "extent": _json_value(maximum - minimum),
        "vertex_count": len(points),
    }


def _union_find_components(mesh):
    """Return polygon connected components using shared vertices."""
    count = len(mesh.polygons)
    if not count:
        return []
    parent = list(range(count))
    size = [1] * count

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        left = find(left)
        right = find(right)
        if left == right:
            return
        if size[left] < size[right]:
            left, right = right, left
        parent[right] = left
        size[left] += size[right]

    first_polygon_for_vertex = [-1] * len(mesh.vertices)
    for polygon_index, polygon in enumerate(mesh.polygons):
        for vertex_index in polygon.vertices:
            first = first_polygon_for_vertex[vertex_index]
            if first == -1:
                first_polygon_for_vertex[vertex_index] = polygon_index
            else:
                union(polygon_index, first)

    components = defaultdict(list)
    for polygon_index in range(count):
        components[find(polygon_index)].append(polygon_index)
    return sorted((len(indices) for indices in components.values()), reverse=True)


def _uv_metrics(obj):
    mesh = obj.data
    layers = []
    for layer in mesh.uv_layers:
        if layer.data:
            uv_min = Vector((min(item.uv.x for item in layer.data), min(item.uv.y for item in layer.data)))
            uv_max = Vector((max(item.uv.x for item in layer.data), max(item.uv.y for item in layer.data)))
        else:
            uv_min = Vector((0.0, 0.0))
            uv_max = Vector((0.0, 0.0))
        degenerate = 0
        for polygon in mesh.polygons:
            if len(polygon.loop_indices) < 3:
                degenerate += 1
                continue
            first = layer.data[polygon.loop_indices[0]].uv
            for index in range(1, len(polygon.loop_indices) - 1):
                second = layer.data[polygon.loop_indices[index]].uv
                third = layer.data[polygon.loop_indices[index + 1]].uv
                area = abs((second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x))
                if area <= 1e-12:
                    degenerate += 1
                    break
        layers.append({
            "name": layer.name,
            "loop_count": len(layer.data),
            "min": _json_value(uv_min),
            "max": _json_value(uv_max),
            "degenerate_polygon_count": degenerate,
        })

    overlap = None
    if mesh.uv_layers:
        previous_active = bpy.context.view_layer.objects.active
        previous_selected = list(bpy.context.selected_objects)
        previous_mode = obj.mode
        try:
            if previous_mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            operator_result = bpy.ops.uv.select_overlap(extend=False)
            bpy.ops.object.mode_set(mode="OBJECT")
            overlap = {
                "operator_result": str(operator_result),
                "selected_face_count": sum(1 for polygon in mesh.polygons if polygon.select),
                "method": "bpy.ops.uv.select_overlap",
            }
        except Exception as error:  # Background Blender builds may lack an Image Editor context.
            overlap = {"error": str(error), "method": "bpy.ops.uv.select_overlap"}
        finally:
            try:
                if obj.mode != "OBJECT":
                    bpy.ops.object.mode_set(mode="OBJECT")
            except Exception:
                pass
            bpy.ops.object.select_all(action="DESELECT")
            for selected in previous_selected:
                if selected and selected.name in bpy.data.objects:
                    selected.select_set(True)
            if previous_active and previous_active.name in bpy.data.objects:
                bpy.context.view_layer.objects.active = previous_active
    return {"layer_count": len(layers), "layers": layers, "overlap": overlap}


def _material_metrics(material):
    if not material or not material.use_nodes:
        return {"name": material.name if material else None, "use_nodes": False}
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = [node for node in nodes if node.type == "BSDF_PRINCIPLED"]
    output = [node for node in nodes if node.type == "OUTPUT_MATERIAL"]
    channels = {}
    for node in principled:
        for input_name in PBR_INPUTS:
            socket = node.inputs.get(input_name)
            if not socket:
                continue
            channel_links = [link for link in links if link.to_socket == socket]
            channels[input_name] = [
                {
                    "from_node": link.from_node.name,
                    "from_type": link.from_node.type,
                    "image": link.from_node.image.name if link.from_node.type == "TEX_IMAGE" and link.from_node.image else None,
                }
                for link in channel_links
            ]
    return {
        "name": material.name,
        "use_nodes": True,
        "node_types": sorted(node.type for node in nodes),
        "principled_count": len(principled),
        "material_output_count": len(output),
        "texture_channels": channels,
        "native_principled_graph": bool(principled and output),
        "image_texture_count": sum(1 for node in nodes if node.type == "TEX_IMAGE"),
    }


def _object_metrics(obj):
    mesh = obj.data if obj.type == "MESH" else None
    return {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "children": sorted(child.name for child in obj.children),
        "collections": sorted(collection.name for collection in obj.users_collection),
        "location": _json_value(obj.location),
        "rotation_euler": _json_value(obj.rotation_euler),
        "dimensions": _json_value(obj.dimensions),
        "hide_render": obj.hide_render,
        "hide_viewport": obj.hide_viewport,
        "vertices": len(mesh.vertices) if mesh else None,
        "polygons": len(mesh.polygons) if mesh else None,
        "uv": _uv_metrics(obj) if mesh else None,
        "materials": sorted(material.name for material in mesh.materials if material) if mesh else [],
        "connected_polygon_components": _union_find_components(mesh) if mesh else [],
    }


def build_report():
    scene = bpy.context.scene
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    gear_objects = [obj for obj in bpy.data.objects if GEAR_RE.search(obj.name)]
    materials = [_material_metrics(material) for material in bpy.data.materials]
    object_reports = [_object_metrics(obj) for obj in bpy.data.objects]
    images = [
        {
            "name": image.name,
            "filepath": image.filepath,
            "absolute_filepath": bpy.path.abspath(image.filepath),
            "size": list(image.size),
            "source": image.source,
            "packed": bool(image.packed_file),
        }
        for image in bpy.data.images
    ]
    root_objects = [obj.name for obj in bpy.data.objects if obj.parent is None]
    return {
        "source_file": bpy.data.filepath,
        "blender_version": bpy.app.version_string,
        "scene": {
            "name": scene.name,
            "unit_system": scene.unit_settings.system,
            "scale_length": scene.unit_settings.scale_length,
            "length_unit": scene.unit_settings.length_unit,
            "object_count": len(bpy.data.objects),
            "mesh_object_count": len(mesh_objects),
            "mesh_datablock_count": len(bpy.data.meshes),
            "material_count": len(bpy.data.materials),
            "image_count": len(bpy.data.images),
            "root_objects": sorted(root_objects),
        },
        "world_bounds": _bounds_for_objects(mesh_objects),
        "objects": object_reports,
        "gear_candidates": [obj.name for obj in gear_objects],
        "gear_candidate_mesh_objects": [obj.name for obj in gear_objects if obj.type == "MESH"],
        "gear_candidate_parented": [obj.name for obj in gear_objects if obj.parent],
        "materials": materials,
        "images": images,
        "checks": {
            "source_loaded": True,
            "mesh_objects_have_uv_layers": all(bool(obj.data.uv_layers) for obj in mesh_objects),
            "uv_degenerate_polygons_zero": all(
                layer["degenerate_polygon_count"] == 0
                for obj in object_reports
                if obj["type"] == "MESH"
                for layer in obj["uv"]["layers"]
            ),
            "has_separate_wheels_mesh_object": any(obj.name.lower() == "wheels" and obj.type == "MESH" for obj in bpy.data.objects),
            "has_parented_wheels": any(obj.name.lower() == "wheels" and obj.parent for obj in bpy.data.objects),
            "has_native_principled_material": any(item.get("native_principled_graph") for item in materials),
            "full_pbr_texture_channels_present": any(
                all(item.get("texture_channels", {}).get(channel) for channel in ("Base Color", "Roughness", "Normal"))
                for item in materials
            ),
        },
    }


def main():
    report = build_report()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
        if "--output" in args:
            output = args[args.index("--output") + 1]
            os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
            with open(output, "w", encoding="utf-8") as handle:
                json.dump(report, handle, indent=2, ensure_ascii=False)
            print("REPORT_WRITTEN", os.path.abspath(output))


if __name__ == "__main__":
    main()
