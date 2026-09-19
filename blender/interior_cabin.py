"""Round 6 registered cabin. Metres; X lateral, Y up, Z toward tail.
Original representative interior, not an airline/certified engineering model.
The historical interior_blockout entry point supplies reusable mesh helpers.
"""
import json
import math
import os
import bpy
from mathutils import Vector


def build_registered(h):
    h['clear_scene']()
    h['scene_setup']()
    root = h['collection']('Interior_Root', bpy.context.scene.collection)
    mats = h['build_materials']()
    zones = {n: h['collection']('Zone_' + n, root) for n in ['Cockpit', 'Economy', 'Stair', 'UpperDeck']}
    anchors = {'cockpit': [0, 0, 0], 'economy': [0, 0, 8], 'stair': [-1.32, 0, 26], 'upperDeck': [0, 2.45, 32], 'exit': [-2.78, 4.05, 40.5]}
    windows = []
    def box(name, size, pos, zone, mat='panel', bevel=.012):
        obj = h['box'](name, size, pos, zones[zone], mats[mat], bevel=bevel, bevel_segments=1)
        obj['zone'] = zone
        obj['structural'] = not ('Seat' in name or 'Window' in name or 'Light' in name)
        return obj
    def surface(name, profile, z0, z1, zone, mat='ceiling'):
        verts = [(x,y,z) for z in [z0,z1] for x,y in profile]
        n = len(profile)
        faces = [(i,i+1,n+i+1,n+i) for i in range(n-1)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces); mesh.update()
        obj = bpy.data.objects.new(name, mesh); zones[zone].objects.link(obj)
        obj.data.materials.append(mats[mat]); obj['zone']=zone; obj['structural']=True
        # Two-sided lining; explicit normals remain consistent along Z.
        mats[mat].use_backface_culling = False
        return obj
    def lining(zone, z0,z1, half, floor, height, door=False):
        # Curved shoulder and crown, separate from sidewall/window apertures.
        profile=[]
        for i in range(25):
            a=math.pi*i/24
            profile.append((half*math.cos(a),floor+height-.55+.55*math.sin(a)))
        if door:
            surface(zone+'_Ceiling',profile,z0,39.8,zone)
            surface(zone+'_CeilingDoor',[(x,y) for x,y in profile if x > -2.25],39.8,41.2,zone)
            surface(zone+'_Ceiling',profile,41.2,z1,zone)
        else:
            surface(zone+'_Ceiling', profile,z0,z1,zone)
        for side in [-1,1]:
            x=side*half
            # Leave upper port exit open from 39.8 to 41.2.
            end=39.8 if door and side==-1 else z1
            box(zone+'_LowerSide',(.08,.95,end-z0),(x,floor+.475,(z0+end)/2),zone,'panel')
            box(zone+'_UpperSide',(.08,.28,end-z0),(x,floor+1.88,(z0+end)/2),zone,'panel')
            z=z0
            while z<end-.01:
                span=min(1.6,end-z)
                box(zone+'_WindowPier',(.08,.72,.55),(x,floor+1.34,z+.275),zone,'panel')
                if span>.7:
                    wz=z+.55+(span-.55)/2
                    box(zone+'_WindowFrame',(.075,.78,span-.54),(x-side*.025,floor+1.34,wz),zone,'metal')
                    box(zone+'_Window',(.08,.60,span-.72),(x-side*.075,floor+1.34,wz),zone,'window_glow')
                    windows.append({'x':x-side*.075,'y':floor+1.34,'z':wz,'side':side})
                z+=span
            # Bins are over the outboard seats, never across either aisle.
            box(zone+'_OverheadBin',(.55,.30,end-z0), (side*(half-.32),floor+1.95,(z0+end)/2),zone,'panel',.07)
        for x in [-1.32,1.32]:
            box(zone+'_Aisle',(.59,.014,z1-z0),(x,floor+.025,(z0+z1)/2),zone,'aisle',0)
            box(zone+'_Light',(.045,.025,z1-z0),(x,floor+height-.04,(z0+z1)/2),zone,'emissive',0)
    # Main cabin and cockpit floors are separate; no ceiling spans 42 metres.
    box('Cockpit_Floor',(4.65,.10,8),(0,-.05,4),'Cockpit','floor')
    box('Economy_Floor',(6.4,.10,18),(0,-.05,17),'Economy','floor')
    box('UpperDeck_Floor',(5.56,.12,9.5),(0,2.39,36.75),'UpperDeck','floor')
    lining('Economy',8,26,3.2,0,2.28)
    box('Economy_AftBulkheadLeft',(1.16,2.28,.10),(-2.62,1.14,26),'Economy','panel')
    box('Economy_AftBulkheadRight',(3.8,2.28,.10),(1.3,1.14,26),'Economy','panel')
    box('Economy_Galley',(.80,1.75,.65),(1.8,.875,25.5),'Economy','galley',.04)
    lining('UpperDeck',32,41.5,2.78,2.45,2.24,True)
    # Cockpit instruments and windshield face the nose (-Z). A central
    # passage behind the pilots reaches the aft doorway at Z=7.5.
    surface('Cockpit_Ceiling',[(2.3,1.85),(1.9,2.25),(0,2.45),(-1.9,2.25),(-2.3,1.85)],.2,7.5,'Cockpit')
    for side in [-1,1]:
        box('Cockpit_Side',(.10,1.9,7.3),(side*2.3,.95,3.85),'Cockpit','shell')
        panel=box('Cockpit_MainPanel',(1.35,.55,.32),(side*.93,.92,1.38),'Cockpit','shell')
        for col in [-.34,.05,.44]:
            screen=box('Cockpit_Display',(.31,.27,.012),(side*.93+col,1.0,1.555),'Cockpit','display',.008)
        box('Cockpit_Windshield',(1.4,.64,.035),(side*.99,1.76,.72),'Cockpit','window_glow',.06)
        box('Cockpit_AftBulkhead',(1.7,2.15,.10),(side*1.5,1.075,7.5),'Cockpit','panel')
    box('Cockpit_CentralWindshield',(.66,.64,.035),(0,1.76,.72),'Cockpit','window_glow',.03)
    box('Cockpit_WindshieldMullion',(.04,.68,.045),(0,1.76,.75),'Cockpit','shell',.005)
    box('Cockpit_Pedestal',(.46,.57,1.15),(0,.285,2.12),'Cockpit','shell')
    # Compact linked seat: three material primitives, 252 triangles/seat.
    parts=[]
    for name,size,pos,mat in [
        ('Seat_Cushion',(.46,.13,.45),(0,.43,0),'seat'),
        ('Seat_Back',(.46,.68,.095),(0,.82,.20),'seat'),
        ('Seat_Headrest',(.36,.16,.13),(0,1.19,.18),'seat_accent'),
        ('Seat_Base',(.33,.33,.32),(0,.165,0),'seat_shell'),
        ('Seat_ArmL',(.035,.045,.43),(-.225,.64,0),'seat_shell'),
        ('Seat_ArmR',(.035,.045,.43),(.225,.64,0),'seat_shell')]:
        parts.append(box(name,size,pos,'Cockpit',mat,.02))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
    master=parts[0]; master.name='Seat_Master'
    # Bake master vertices into origin so linked placement has a clear contract.
    master.data.transform(master.matrix_world); master.matrix_world.identity()
    main_x=[-2.87,-2.36,-1.85,-.765,-.255,.255,.765,1.85,2.36,2.87]
    upper_x=[-2.4,-1.89,-.765,-.255,.255,.765,1.89,2.4]
    count=0
    for zone,xs,rows,start,pitch,floor in [('Economy',main_x,20,8.9,.82,0),('UpperDeck',upper_x,8,32.9,.90,2.45),('Cockpit',[-.93,.93],1,2.5,1,0)]:
        for r in range(rows):
            for c,x in enumerate(xs):
                obj=bpy.data.objects.new(f'{zone}_Seat_{r:02d}_{c:02d}',master.data)
                zones[zone].objects.link(obj); obj.location=(x,floor,start+r*pitch)
                obj['seat_instance']=True; obj['zone']=zone; obj['block']=r//5; obj['row']=r; obj['column']=c
                count+=1
    bpy.data.objects.remove(master,do_unlink=True)
    # 16 broad steps, same axis as the port aisle, with a genuine landing.
    rise=2.45/16; run=6/16
    for i in range(16):
        box('Stair_Main',(1.35,rise*(i+1),run),(-1.32,rise*(i+1)/2,26+run*(i+.5)),'Stair','floor',.005)
        box('Stair_Nosing',(1.32,.018,.025),(-1.32,rise*(i+1)+.015,26+run*i+.02),'Stair','metal',0)
    for x in [-2.04,-.60]:
        surface('Stair_Wall',[(x,0),(x,4.65)],26,32,'Stair','panel')
        h['tube_between']('Stair_Handrail',(x,1.0,26),(x,3.45,32),.035,zones['Stair'],mats['metal'])
    surface('Stair_Ceiling',[(-2.04,4.68),(-.6,4.68)],26,32,'Stair')
    # The upper floor itself forms the landing, without coplanar geometry.
    # Rear bulkhead and doorway stay forward of the exterior tail intrusion.
    profile=[(-2.78,2.45),(2.78,2.45)]
    profile += [(2.78*math.cos(math.pi*i/24),2.45+2.24-.55+.55*math.sin(math.pi*i/24)) for i in range(25)]
    mesh=bpy.data.meshes.new('UpperDeck_AftBulkhead')
    mesh.from_pydata([(x,y,41.5) for x,y in profile],[],[tuple(range(len(profile)))]);mesh.update()
    cap=bpy.data.objects.new('UpperDeck_AftBulkhead',mesh);zones['UpperDeck'].objects.link(cap)
    mesh.materials.append(mats['panel']);cap['zone']='UpperDeck';cap['structural']=True
    for z in [39.8,41.2]: box('UpperDeck_ExitFrame',(.12,2.1,.10),(-2.78,3.5,z),'UpperDeck','metal')
    box('UpperDeck_ExitLintel',(.12,.10,1.5),(-2.78,4.55,40.5),'UpperDeck','metal')
    # Export real named anchors. They survive processing as scene nodes.
    for name,loc in anchors.items():
        obj=h['empty']('Anchor_'+name,loc,zones['Cockpit']);obj['anchor']=name
    bpy.context.view_layer.update()
    # Join static structure by zone/material, leaving seat instances separate.
    for zone,coll in zones.items():
        static=[o for o in coll.objects if o.type=='MESH' and not o.get('seat_instance')]
        for mat in mats.values():
            objects=[o for o in coll.objects if o.type=='MESH' and not o.get('seat_instance') and o.data.materials and o.data.materials[0]==mat]
            if not objects: continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
            objects[0].name=f'{zone}_Structure_{mat.name}';objects[0]['zone']=zone;objects[0]['structural']=True
    manifest={'version':6,'axis':'X lateral / Y up / Z aft','localOffset':[0,-3,-30],'flightPosition':[0,40,-80],'flightPitchDeg':-3,'anchors':anchors,'aisles':[-1.32,1.32],'seatWidth':.46,'main':{'layout':[3,4,3],'centers':main_x,'rows':20,'pitch':.82},'upper':{'layout':[2,4,2],'centers':upper_x,'rows':8,'pitch':.90},'seatInstances':count,'windows':windows}
    dest=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(dest,'src/lib/interior-manifest.json'),'w') as f:json.dump(manifest,f,indent=2);f.write('\n')
    output=os.environ.get('A380_BLOCKOUT_OUTPUT',os.path.join(dest,'artifacts/phase6/interior.blend'))
    glb=os.environ.get('A380_EXPORT_GLB',os.path.join(dest,'artifacts/phase6/interior-source.glb'))
    os.makedirs(os.path.dirname(output),exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
    print('REGISTERED_CABIN',json.dumps({'seats':count,'blend':output,'glb':glb}))
