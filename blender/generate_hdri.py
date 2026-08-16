"""Generate the three real HDRIs PLAN.md §5 calls for, procedurally, with
Cycles' Nishita sky: golden hour (S1-S2), high altitude (S3), sunset (S6).
The first two shipped with Fase 3; sunset was deferred to Fase 6 at the time
(S6's overlay/environment work hadn't started) and is added here.

Why procedural instead of downloading a real-world HDRI (e.g. Poly Haven):
this session's network gateway blocks polyhaven.com/dl.polyhaven.org (403),
and this project treats third-party asset licensing as a first-class concern
(see ASSET_AUDIT.md, blender/source/ATTRIBUTION.md) — hunting for an
alternate download source under network restrictions would trade a solved
problem for a licensing question. Cycles' Nishita sky model is a physically
based atmosphere simulation (Rayleigh/Mie scattering), not a photo — it is
generated content with no third-party rights to audit, and it is exactly the
same toolchain (Blender, headless/background) already used for every other
asset in this repo. Every preset below is tuned to this project's specific
narrative requirements (PLAN.md §3 S1/S3/S6, §10.1 grading table) rather than
picked from a catalog of whatever happens to exist.

Usage:
    blender --background --factory-startup --python blender/generate_hdri.py -- \
        --preset golden-hour --output public/hdri/golden-hour.hdr \
        [--preview /tmp/golden-hour-preview.png] [--width 4096] [--height 2048] [--samples 32]

    blender --background --factory-startup --python blender/generate_hdri.py -- \
        --preset high-altitude --output public/hdri/high-altitude.hdr \
        [--preview /tmp/high-altitude-preview.png]

    blender --background --factory-startup --python blender/generate_hdri.py -- \
        --preset sunset --output public/hdri/sunset.hdr \
        [--preview /tmp/sunset-preview.png]
"""

import math
import os
import sys

import bpy
import numpy as np


# Nishita parameters per preset. sun_elevation/sun_rotation in radians,
# altitude in meters. Chosen against PLAN.md's narrative description, not a
# generic "nice sky" default:
#
# golden-hour (S1 pista, S2 despegue): "sol bajo", grading key `#F0A860`
# warm amber, shadow `#1E3A44` teal (§10.1). Low sun elevation is what makes
# Nishita's Rayleigh scattering redden the light on its own — that's real
# atmospheric physics, not a color grade.
#
# high-altitude (S3 ascenso): "cielo azul profundo", "punto de máxima
# luminancia de todo el sitio" (§3), grading base `#7FB3D5` (§10.1). High
# sun elevation + cruise altitude (~10,700 m, inside the 43,100 ft / 13,136 m
# service ceiling from PLAN.md §9) thins the atmosphere Nishita simulates
# below the sample point, deepening zenith blue and raising overall
# brightness — again the physical model doing the narrative work, not a tint.
PRESETS = {
    "golden-hour": {
        "sun_elevation": math.radians(6.0),
        "sun_rotation": math.radians(70.0),
        "altitude": 200.0,
        "air_density": 1.15,
        "dust_density": 1.1,
        "ozone_density": 1.0,
        "sun_intensity": 0.9,
        "sun_size": math.radians(0.545),
        "background_strength": 1.0,
        "target_sky_body_mean_luminance": 1.0,
    },
    "high-altitude": {
        "sun_elevation": math.radians(68.0),
        "sun_rotation": math.radians(200.0),
        "altitude": 10700.0,
        "air_density": 0.75,
        "dust_density": 0.3,
        "ozone_density": 1.1,
        "sun_intensity": 1.3,
        "sun_size": math.radians(0.545),
        "background_strength": 1.35,
        "target_sky_body_mean_luminance": 1.25,
    },
    # sunset (S6 salida): PLAN.md §10.1 is explicit that this must *not* read
    # as S1/S3 repeated — "Frío al atardecer", base `#2B3A55` (cool blue-gray)
    # with the warm tone (`#E89B6C`) demoted to an accent, not the overall
    # key. The previous -3° elevation put the sun below the horizon and made
    # the shipped map effectively nocturnal. Keeping it just above the
    # horizon preserves a readable cool dusk with a warm low-angle accent.
    # Raised ozone deepens the blue-to-violet falloff while the calibration
    # pass below keeps its energy compatible with the other two maps.
    "sunset": {
        "sun_elevation": math.radians(2.5),
        "sun_rotation": math.radians(250.0),
        "altitude": 3000.0,
        "air_density": 1.2,
        "dust_density": 1.3,
        "ozone_density": 1.3,
        "sun_intensity": 1.0,
        "sun_size": math.radians(0.545),
        "background_strength": 0.55,
        "target_sky_body_mean_luminance": 0.65,
    },
}


def _arg_value(name, default):
    if "--" not in sys.argv:
        return default
    args = sys.argv[sys.argv.index("--") + 1 :]
    if name not in args:
        return default
    index = args.index(name) + 1
    return args[index] if index < len(args) else default


def _build_sky_world(preset):
    world = bpy.data.worlds.new(f"HDRI_{preset}")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    sky = nodes.new("ShaderNodeTexSky")
    sky_type_options = {item.identifier for item in sky.bl_rna.properties["sky_type"].enum_items}
    # Blender 5.0 renamed Nishita's production implementation to
    # MULTIPLE_SCATTERING. Keep the generator reproducible on both the 4.x
    # toolchain used originally and current LTS builds.
    sky.sky_type = "NISHITA" if "NISHITA" in sky_type_options else "MULTIPLE_SCATTERING"

    params = PRESETS[preset]
    sky.sun_elevation = params["sun_elevation"]
    sky.sun_rotation = params["sun_rotation"]
    sky.altitude = params["altitude"]
    sky.air_density = params["air_density"]
    if hasattr(sky, "dust_density"):
        sky.dust_density = params["dust_density"]
    else:
        sky.aerosol_density = params["dust_density"]
    sky.ozone_density = params["ozone_density"]
    sky.sun_intensity = params["sun_intensity"]
    sky.sun_size = params["sun_size"]
    sky.sun_disc = True

    background.inputs["Strength"].default_value = params["background_strength"]

    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    bpy.context.scene.world = world
    return world


def _sky_body_mean_luminance(image_path):
    """Read a rendered HDR as linear RGB and return the Rec.709 mean
    luminance of everything *except* the sun disc.

    plan3.md bug #3: a plain mean is dominated by Nishita's sun disc (five to
    six orders of magnitude brighter than the sky body around it, a few
    hundred pixels out of ~8M at 4096x2048) almost regardless of how bright
    the sky itself reads — calibrating three presets to comparable means left
    their *actual sky brightness* off by 3.3x (high-altitude's sky body came
    out the *darkest* of the three despite the preset targeting the
    *brightest*, PLAN.md's "máxima luminancia del sitio"). Median alone
    fixes the calibration but throws away the sun's real contribution to
    diffuse/rough-surface IBL reflections entirely, which turned the *mean*
    ratio between presets into 17.8x — a real problem for anything rougher
    than a mirror, since that's roughly what such a surface integrates over.
    Excluding only the sun disc itself (>50x this image's own median — every
    measured preset's p99 sits within ~19x, so that threshold clears actual
    sky glow by a wide margin and only cuts the disc and its immediate
    corona) keeps the mean meaningful for IBL while no longer letting a few
    hundred texels decide the whole image's calibrated brightness.
    """
    image = bpy.data.images.load(image_path, check_existing=False)
    try:
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgba = pixels.reshape((-1, 4))
        luminance = rgba[:, 0] * 0.2126 + rgba[:, 1] * 0.7152 + rgba[:, 2] * 0.0722
        median = float(np.median(luminance))
        sky_body = luminance[luminance <= median * 50.0]
        return float(np.mean(sky_body)), median, float(sky_body.size) / float(luminance.size)
    finally:
        bpy.data.images.remove(image)


def _normalize_world_energy(world, output_path, width, height, samples, target):
    """Calibrate each procedural sky to a declared, reproducible energy target.

    Nishita's sun disc can change mean radiance by orders of magnitude between
    elevations, which is exactly why this targets the sky body's *own* mean
    luminance (bug #3, excluding the sun disc — see
    _sky_body_mean_luminance) rather than the whole image's mean. Rendering
    and measuring a calibration pass, then scaling that same linear world,
    makes the contract explicit and avoids hand-tuned values that drift when
    a preset changes. Target numbers are unchanged from the original
    whole-image-mean calibration (golden=1.0, high-altitude=1.25, sunset=
    0.65) — same declared relative brightness (high-altitude brightest),
    now actually delivered because the metric they're matched against isn't
    dominated by the sun disc anymore.
    """
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    history = []
    last_diagnostics = None

    for _ in range(3):
        _render(output_path, width, height, samples, "HDR", "Raw")
        observed, median, sky_body_fraction = _sky_body_mean_luminance(output_path)
        last_diagnostics = {"median_luminance": median, "sky_body_pixel_fraction": sky_body_fraction}
        history.append(observed)
        if observed <= 0:
            raise RuntimeError(f"Rendered HDRI has invalid sky-body mean luminance {observed}")
        if abs(observed - target) / target <= 0.01:
            break
        background.inputs["Strength"].default_value *= target / observed

    return {
        "target_sky_body_mean_luminance": target,
        "measured_sky_body_mean_luminance": history[-1],
        "calibration_passes": len(history),
        "calibration_history": history,
        "final_background_strength": background.inputs["Strength"].default_value,
        **(last_diagnostics or {}),
    }


def _build_pano_camera():
    cam_data = bpy.data.cameras.new("HDRICam")
    cam_data.type = "PANO"
    # Not cam_data.cycles.panorama_type: that nesting is Blender <=3.x API.
    # In this Blender 4.0.2 build panorama_type lives directly on the camera
    # data-block (confirmed against bl_ui/properties_data_camera.py's own
    # `cam.panorama_type` usage) — the Cycles Python addon here also has a
    # separate, apparently-harmless registration quirk (properties.py's
    # register() collides with classes already registered by core on
    # startup), but that addon layer turned out to be irrelevant to this
    # property entirely, so it's not worked around, just not needed.
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam_obj = bpy.data.objects.new("HDRICam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.0, 0.0, 0.0)
    cam_obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    bpy.context.scene.camera = cam_obj
    return cam_obj


def _render(output_path, width, height, samples, file_format, view_transform):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = file_format
    if file_format == "HDR":
        scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = view_transform
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    scene.render.filepath = output_path
    scene.render.use_file_extension = False
    bpy.ops.render.render(write_still=True)


def main():
    preset = _arg_value("--preset", None)
    if preset not in PRESETS:
        raise RuntimeError(f"--preset must be one of {list(PRESETS)}, got {preset!r}")
    output_path = os.path.abspath(_arg_value("--output", f"/tmp/{preset}.hdr"))
    preview_path = _arg_value("--preview", "")
    # plan3.md B4: 4096x2048 is the canonical resolution as of this round —
    # 2048x1024 is still available via an explicit flag for a quick/cheap
    # regenerate, but it's no longer what a bare invocation produces.
    width = int(_arg_value("--width", "4096"))
    height = int(_arg_value("--height", "2048"))
    samples = int(_arg_value("--samples", "32"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Cycles' per-camera "cycles" RNA property group (panorama_type etc.)
    # only exists once the scene's active render engine is actually Cycles —
    # with --factory-startup the default engine is EEVEE, so this has to
    # happen before the camera is built, not just before rendering.
    bpy.context.scene.render.engine = "CYCLES"
    world = _build_sky_world(preset)
    _build_pano_camera()

    # Raw view transform: no filmic/AgX display curve baked in. The .hdr
    # must carry linear scene-referred radiance, matching the convention of
    # any real captured HDRI (e.g. Poly Haven), so the app's own ACES
    # Filmic tone mapping (PLAN.md render pipeline) is the only tone curve
    # applied, not two stacked on top of each other.
    calibration = _normalize_world_energy(
        world,
        output_path,
        width,
        height,
        samples,
        PRESETS[preset]["target_sky_body_mean_luminance"],
    )
    result = {
        "preset": preset,
        "output": output_path,
        "output_size_bytes": os.path.getsize(output_path),
        "resolution": [width, height],
        "samples": samples,
        "nishita_params": PRESETS[preset],
        "calibration": calibration,
    }

    if preview_path:
        preview_path = os.path.abspath(preview_path)
        # Second pass, display-referred, purely for human eyeballing — not shipped.
        _render(preview_path, min(width, 1024), min(height, 512), samples, "PNG", "Standard")
        result["preview"] = preview_path

    import json

    print("HDRI_GENERATION_REPORT", json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
