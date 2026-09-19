"""Compare actual imported GLB anchors against the shared transform."""
import bpy,json,math,os
from mathutils import Matrix,Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(ROOT)
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('artifacts/phase6/registered.blend'))
m=json.load(open('src/lib/interior-manifest.json'))
transform=Matrix.Translation(m['flightPosition']) @ Matrix.Rotation(math.radians(m['flightPitchDeg']),4,'X') @ Matrix.Translation(m['localOffset'])
errors={}
for name,position in m['anchors'].items():
    anchor=bpy.data.objects.get('Anchor_'+name)
    assert anchor is not None,name
    errors[name]=(anchor.matrix_world.translation-transform@Vector(position)).length
assert max(errors.values())<.00001,errors
report={'anchorErrors':errors,'result':'PASS'}
with open('artifacts/phase6/registration-report.json','w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
