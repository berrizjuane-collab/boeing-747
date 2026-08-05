"""Create the Phase 0 exterior working copy from an audited source BLEND.

The source file is only read.  This script writes a separate working BLEND,
keeps the original A380_low hierarchy, puts the source under one transform
root, and separates disconnected landing-gear pieces into named child nodes.
"""

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


def _world_bounds(objects):
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return minimum, maximum


def _set_parent_preserving_world(child, parent):
    world_matrix = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world_matrix


def _split_landing_gear(root):
    wheels = next((obj for obj in root.children if obj.name.lower() == "wheels"), None)
    if wheels is None or wheels.type != "MESH":
        raise RuntimeError("Expected a parented mesh named Wheels in the audited source")

    bpy.ops.object.select_all(action="DESELECT")
    wheels.select_set(True)
    bpy.context.view_layer.objects.active = wheels
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = sorted(
        [obj for obj in bpy.context.selected_objects if obj.type == "MESH"],
        key=lambda obj: (obj.name != wheels.name, obj.name),
    )
    if len(parts) < 2:
        raise RuntimeError("Landing gear did not split into separate loose parts")

    landing_root = bpy.data.objects.get("LandingGear")
    if landing_root is None:
        landing_root = bpy.data.objects.new("LandingGear", None)
        bpy.context.collection.objects.link(landing_root)
    _set_parent_preserving_world(landing_root, root)

    for index, part in enumerate(parts, start=1):
        part.name = f"LandingGear_Part_{index:03d}"
        if part.data:
            part.data.name = f"LandingGear_PartMesh_{index:03d}"
        _set_parent_preserving_world(part, landing_root)

    return landing_root, parts


def _pack_images():
    packed = []
    for image in bpy.data.images:
        if image.source == "FILE":
            image.pack()
            packed.append(image.name)
    return packed


def main():
    output_blend = os.path.abspath(_arg_value("--blend", "/tmp/phase0_exterior_working.blend"))
    output_glb = os.path.abspath(_arg_value("--glb", "/tmp/phase0_exterior_working.glb"))
    os.makedirs(os.path.dirname(output_blend), exist_ok=True)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)

    root = bpy.data.objects.get("A380_low")
    body = bpy.data.objects.get("A380")
    if not root or root.type != "EMPTY" or not body or body.type != "MESH":
        raise RuntimeError("Audited source hierarchy A380_low -> A380 was not found")

    original_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    source_minimum, source_maximum = _world_bounds(original_meshes)

    exterior_root = bpy.data.objects.get("Exterior_Root")
    if exterior_root is None:
        exterior_root = bpy.data.objects.new("Exterior_Root", None)
        bpy.context.collection.objects.link(exterior_root)
    _set_parent_preserving_world(root, exterior_root)

    landing_root, gear_parts = _split_landing_gear(root)

    # Source axes are x=lateral, y=longitudinal, z=up.  Project axes are
    # x=lateral, y=up, z=longitudinal.  One root rotation preserves hierarchy.
    exterior_root.rotation_euler = (-math.pi / 2.0, 0.0, 0.0)
    exterior_root.location = (0.0, 0.0, float(source_maximum.y))

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"

    exterior_root["asset_name"] = "Airbus A380"
    exterior_root["asset_author"] = "Brout"
    exterior_root["asset_license"] = "CC BY 4.0"
    exterior_root["asset_source_url"] = "https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889"
    exterior_root["adaptation"] = "Phase 0: one transform root, packed source image, landing gear split by loose components"
    exterior_root["source_bounds_xyz_m"] = list(source_maximum - source_minimum)

    packed_images = _pack_images()

    bpy.ops.wm.save_as_mainfile(filepath=output_blend)
    export_result = None
    try:
        export_result = str(
            bpy.ops.export_scene.gltf(
                filepath=output_glb,
                export_format="GLB",
                export_texcoords=True,
                export_normals=True,
                export_materials="EXPORT",
                export_animations=False,
                export_lights=False,
                use_selection=False,
            )
        )
    except Exception as error:
        export_result = f"ERROR: {error}"

    print("WORKING_BLEND_WRITTEN", output_blend)
    print("WORKING_GLB_RESULT", export_result, output_glb)
    print("SOURCE_BOUNDS", list(source_maximum - source_minimum))
    print("GEAR_PART_COUNT", len(gear_parts))
    print("PACKED_IMAGES", packed_images)


if __name__ == "__main__":
    main()
