"""Render a neutral visual QA preview of the Phase 0 blockout."""

import bpy
from mathutils import Vector


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.045, 0.055, 0.07)
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    camera_data = bpy.data.cameras.new("Phase0_QA_Camera")
    camera = bpy.data.objects.new("Phase0_QA_Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, 1.55, 8.0)
    camera_data.lens = 32
    look_at(camera, (0.0, 1.05, 30.0))
    scene.camera = camera

    # QA view: open the side of the blockout so the longitudinal layout is visible.
    for name in ("Economy_LeftWall", "Economy_RightWall", "Economy_Ceiling"):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = True

    for name, location, energy, size in [
        ("QA_Key", (6.0, 7.0, 8.0), 1500.0, 6.0),
        ("QA_Fill", (-6.0, 4.5, 26.0), 1000.0, 8.0),
        ("QA_Rim", (0.0, 6.0, 48.0), 1200.0, 7.0),
    ]:
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = location
        look_at(light, (0.0, 1.0, 20.0))

    scene.render.filepath = "/workspace/scratch/0c720a8a1acf/artifacts/phase0_interior_preview.png"
    bpy.ops.render.render(write_still=True)
    print("PHASE0_PREVIEW_RENDERED", scene.render.filepath)


if __name__ == "__main__":
    render()
