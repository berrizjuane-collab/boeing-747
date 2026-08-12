"""Render reproducible PBR QA views of all four Option-B interior zones.

Usage:
    A380_PREVIEW_DIR=/tmp/meridian-interior-previews \
      blender --background /tmp/a380-option-b.blend \
      --python blender/render_preview.py

The script deliberately renders from the same eye-height/forward-facing
positions used by the web walkthrough. It does not hide walls or ceiling to
manufacture readability; passing evidence must show the actual enclosed view.
"""

import json
import os

import bpy
from mathutils import Vector


VIEWS = {
    "cockpit": {
        "position": (0.0, 1.52, 1.7),
        "target": (0.0, 1.42, 6.6),
        "lens": 27,
    },
    "economy": {
        "position": (0.0, 1.55, 11.0),
        "target": (0.0, 1.42, 24.0),
        "lens": 25,
    },
    "stair": {
        "position": (0.0, 1.55, 34.45),
        "target": (0.0, 3.15, 39.35),
        "lens": 24,
    },
    "upper-deck": {
        "position": (0.0, 3.88, 42.0),
        "target": (0.0, 3.76, 53.5),
        "lens": 25,
    },
}


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, target, energy, size, color):
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.shape = "RECTANGLE"
    light_data.size = size
    light_data.size_y = size * 0.35
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    look_at(light, target)
    return light


def configure_scene():
    scene = bpy.context.scene
    # Cycles CPU is slower than Eevee but deterministic in headless Linux;
    # Eevee may block waiting for an EGL surface on CI/software renderers.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 720
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    look_options = {item.identifier for item in scene.view_settings.bl_rna.properties["look"].enum_items}
    scene.view_settings.look = "Medium High Contrast" if "Medium High Contrast" in look_options else "None"

    camera_data = bpy.data.cameras.new("OptionB_QA_Camera")
    camera = bpy.data.objects.new("OptionB_QA_Camera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.sensor_width = 36
    scene.camera = camera

    # Named, explicit preview rig. These lights are QA-only and are not
    # exported; the web scene's own equivalent inventory lives in
    # InteriorLighting.tsx.
    add_area_light(
        "QA · Cockpit key · 3300K",
        (0.0, 3.3, 3.0),
        (0.0, 1.3, 5.5),
        520.0,
        2.8,
        (1.0, 0.63, 0.38),
    )
    add_area_light(
        "QA · Economy practical · 3600K",
        (0.0, 3.15, 20.0),
        (0.0, 1.0, 22.0),
        680.0,
        8.0,
        (1.0, 0.72, 0.52),
    )
    add_area_light(
        "QA · Stair key · 4300K",
        (0.0, 5.0, 37.0),
        (0.0, 2.5, 38.0),
        600.0,
        4.0,
        (1.0, 0.82, 0.67),
    )
    add_area_light(
        "QA · Upper-deck fill · 5200K",
        (0.0, 5.65, 49.0),
        (0.0, 3.2, 51.0),
        620.0,
        7.0,
        (0.76, 0.86, 1.0),
    )
    return scene, camera


def render():
    output_dir = os.path.abspath(os.environ.get("A380_PREVIEW_DIR", "/tmp/meridian-interior-previews"))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = configure_scene()
    report = {}

    for name, view in VIEWS.items():
        camera.location = view["position"]
        camera.data.lens = view["lens"]
        look_at(camera, view["target"])
        output = os.path.join(output_dir, name + ".png")
        scene.render.filepath = output
        bpy.ops.render.render(write_still=True)
        report[name] = {
            "output": output,
            "position": view["position"],
            "target": view["target"],
            "lens_mm": view["lens"],
            "size_bytes": os.path.getsize(output),
        }

    print("OPTION_B_INTERIOR_PREVIEWS " + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    render()
