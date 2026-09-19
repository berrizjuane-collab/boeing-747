"""Reproducible inspection scene using the runtime's canonical frame.
Run scripts/extract-hull.mjs first for a texture-free exterior inspection copy.
Published exterior geometry/materials are not changed.
"""
import bpy, json, math, os
from mathutils import Matrix
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(ROOT)
m=json.load(open('src/lib/interior-manifest.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
flight=Matrix.Translation(m['flightPosition']) @ Matrix.Rotation(math.radians(m['flightPitchDeg']),4,'X')
for name,path,offset in [('Exterior','artifacts/phase6/exterior-geometry.glb',[0,-8.5,-35]),('Interior','public/models/interior.glb',m['localOffset'])]:
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    imported=set(bpy.context.scene.objects)-before
    for obj in imported:
        if obj.parent not in imported: obj.matrix_world=flight @ Matrix.Translation(offset) @ obj.matrix_world
    bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('artifacts/phase6/registered.blend'))
