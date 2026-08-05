"""Render an exterior source or normalized working file for visual QA."""

import os
import sys

import bpy
from mathutils import Matrix, Vector


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
    return minimum, maximum


def _look_at(obj, target):
    forward = (target - obj.location).normalized()
    right = forward.cross(Vector((0.0, 1.0, 0.0))).normalized()
    true_up = right.cross(forward).normalized()
    obj.rotation_euler = Matrix((right, true_up, -forward)).transposed().to_euler()


def _add_area(name, location, target, energy, size):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    _look_at(light, target)
    return light


def main():
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.visible_get()]
    if not mesh_objects:
        raise RuntimeError("No visible mesh objects to render")
    minimum, maximum = _bounds(mesh_objects)
    center = (minimum + maximum) * 0.5
    extent = maximum - minimum
    normalized_axes = bpy.data.objects.get("Exterior_Root") is not None
    longitudinal_extent = extent.z if normalized_axes else extent.y
    vertical_extent = extent.y if normalized_axes else extent.z

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.02)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass

    camera_data = bpy.data.cameras.new("Phase0ExteriorCamera")
    camera = bpy.data.objects.new("Phase0ExteriorCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    if normalized_axes:
        camera_offset = Vector((extent.x * 1.55, 0.0, 0.0))
        target_offset = Vector((0.0, 0.0, 0.0))
    else:
        camera_offset = Vector((extent.x * 1.55, 0.0, 0.0))
        target_offset = Vector((0.0, 0.0, 0.0))
    camera.location = center + camera_offset
    camera_data.lens = 55
    camera_data.sensor_width = 36
    camera_data.clip_start = 0.1
    camera_data.clip_end = 1000.0
    _look_at(camera, center + target_offset)
    scene.camera = camera

    if normalized_axes:
        key_offset = Vector((extent.x * 0.4, vertical_extent * 4.0, longitudinal_extent * 0.7))
        fill_offset = Vector((-extent.x * 1.0, vertical_extent * 1.5, -longitudinal_extent * 0.2))
        rim_offset = Vector((0.0, vertical_extent * 2.5, -longitudinal_extent * 1.2))
    else:
        key_offset = Vector((extent.x * 0.4, -longitudinal_extent * 0.7, vertical_extent * 4.0))
        fill_offset = Vector((-extent.x * 1.0, longitudinal_extent * 0.2, vertical_extent * 1.5))
        rim_offset = Vector((0.0, longitudinal_extent * 1.2, vertical_extent * 2.5))
    _add_area("Phase0Key", center + key_offset, center, 1600, extent.x * 0.8)
    _add_area("Phase0Fill", center + fill_offset, center, 900, extent.x * 0.7)
    _add_area("Phase0Rim", center + rim_offset, center, 1200, extent.x * 0.6)

    output = os.path.abspath(_arg_value("--output", "/tmp/phase0_exterior_preview.png"))
    os.makedirs(os.path.dirname(output), exist_ok=True)
    scene.render.filepath = output
    bpy.ops.render.render(write_still=True)
    print("EXTERIOR_RENDER_WRITTEN", output)


if __name__ == "__main__":
    main()
