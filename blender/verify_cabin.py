"""Validate source and reimported final GLB with triangle-level clearance.
Run after scripts/export-cabin-route.mjs and scripts/extract-hull.mjs (see docs).
"""
import bpy
import json
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
route=json.load(open('artifacts/phase6/cabin-route.json'))

def inspect():
    bpy.context.view_layer.update()
    vertices=[];faces=[];owners=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles()
        start=len(vertices)
        vertices.extend([obj.matrix_world@v.co for v in mesh.vertices])
        for tri in mesh.loop_triangles:
            faces.append(tuple(start+i for i in tri.vertices));owners.append(obj.name)
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
    minimum={'distance':999};fail=[]
    for step in route:
        p=Vector(step['position'])
        hit,n,index,d=bvh.find_nearest(p)
        if d<minimum['distance']:minimum={'distance':d,'p':step['p'],'object':owners[index],'position':list(p)}
        if d<.23:fail.append({'p':step['p'],'distance':d,'object':owners[index]})
    return {'vertices':len(vertices),'triangles':len(faces),'bounds':[[min(v[i] for v in vertices) for i in range(3)],[max(v[i] for v in vertices) for i in range(3)]],'minimumClearance':minimum,'collisionSamples':len(fail),'firstCollisions':fail[:12]}

bpy.ops.wm.open_mainfile(filepath=os.path.abspath('artifacts/phase6/interior.blend'))
source=inspect()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath('public/models/interior.glb'))
final=inspect()
h=json.load(open('artifacts/phase6/hull.json'));hull=BVHTree.FromPolygons(h['vertices'],h['faces'],all_triangles=True)
hull_fail=[];nearest=999
for s in route:
    # Nose/exit are deliberate shader portals, checked separately by runtime.
    if not .50<=s['p']<=.827:continue
    _,_,_,d=hull.find_nearest(Vector(s['position']))
    nearest=min(nearest,d)
    if d<.23:hull_fail.append({'p':s['p'],'distance':d})
report={'radius':.18,'margin':.05,'samples':len(route),'source':source,'final':final,'hullMinimum':nearest,'hullCollisionSamples':len(hull_fail),'hullFirstCollisions':hull_fail[:12]}
with open('artifacts/phase6/geometry-report.json','w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
assert source['collisionSamples']==0 and final['collisionSamples']==0 and len(hull_fail)==0,'Camera clearance failed'
assert max(abs(source['bounds'][j][i]-final['bounds'][j][i]) for j in range(2) for i in range(3))<.01,'Export bounds drift'
