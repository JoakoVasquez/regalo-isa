import sys, json, struct
for p in sys.argv[1:]:
    with open(p,'rb') as f:
        magic, ver, length = struct.unpack('<4sII', f.read(12))
        clen, ctype = struct.unpack('<I4s', f.read(8))
        j = json.loads(f.read(clen))
    print('=====', p, magic, ver, length)
    print('generator', j.get('asset'))
    print('extensions', j.get('extensionsUsed'))
    nodes = j.get('nodes', [])
    print('scenes', j.get('scenes'))
    print('nodes', len(nodes), 'meshes', len(j.get('meshes', [])), 'skins', len(j.get('skins', [])), 'anims', [ (a.get('name'), len(a['channels'])) for a in j.get('animations', [])])
    print('materials', [(m.get('name'), m.get('alphaMode'), list(m.keys())) for m in j.get('materials', [])])
    print('textures', len(j.get('textures', [])), 'images', [(i.get('name'), i.get('mimeType')) for i in j.get('images', [])])
    acc = j.get('accessors', [])
    def walk(i, d):
        n = nodes[i]
        extra = ''
        if 'mesh' in n:
            m = j['meshes'][n['mesh']]
            prims = m['primitives']
            pos = acc[prims[0]['attributes']['POSITION']]
            extra = ' MESH %s prims=%d attrs=%s min=%s max=%s targets=%s' % (m.get('name'), len(prims), list(prims[0]['attributes'].keys()), pos.get('min'), pos.get('max'), len(prims[0].get('targets', [])))
        if 'skin' in n: extra += ' SKIN %d' % n['skin']
        tr = {k: n[k] for k in ('translation','rotation','scale','matrix') if k in n}
        print('  '*d + str(n.get('name')) + extra + ' ' + json.dumps(tr))
        for c in n.get('children', []): walk(c, d+1)
    for s in j.get('scenes', []):
        for r in s['nodes']: walk(r, 0)
    for s in j.get('skins', []):
        print('skin joints', [nodes[x].get('name') for x in s['joints']])
