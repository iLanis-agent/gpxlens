#!/usr/bin/env python3
"""Build the GPX corpus and emit expected facts computed independently
(ElementTree parse + python haversine), not by the JS engine."""
import json, math, os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

R = 6371000
def hav(a, b):
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dla, dlo = math.radians(b[0]-a[0]), math.radians(b[1]-a[1])
    h = math.sin(dla/2)**2 + math.cos(la1)*math.cos(la2)*math.sin(dlo/2)**2
    return 2*R*math.asin(min(1, math.sqrt(h)))

os.makedirs('tests/corpus', exist_ok=True)
expected = []

def build(name, tracks, waypoints=(), routes=(), creator='gpxlens-test', warn_partial_ele=False):
    """tracks: list of (name, [segments]) ; segment = [(lat,lon,ele,iso|None)]"""
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           f'<gpx version="1.1" creator="{creator}" xmlns="http://www.topografix.com/GPX/1/1">']
    for wname, wlat, wlon in waypoints:
        out.append(f'  <wpt lat="{wlat}" lon="{wlon}"><name>{wname}</name></wpt>')
    for rname, rpts in routes:
        out.append(f'  <rte><name>{rname}</name>' + ''.join(f'<rtept lat="{a}" lon="{b}"/>' for a, b in rpts) + '</rte>')
    for tname, segs in tracks:
        out.append(f'  <trk><name>{tname}</name>')
        for seg in segs:
            out.append('    <trkseg>')
            for lat, lon, ele, iso in seg:
                inner = (f'<ele>{ele}</ele>' if ele is not None else '') + (f'<time>{iso}</time>' if iso else '')
                out.append(f'      <trkpt lat="{lat}" lon="{lon}">{inner}</trkpt>')
            out.append('    </trkseg>')
        out.append('  </trk>')
    out.append('</gpx>')
    open(f'tests/corpus/{name}', 'w').write('\n'.join(out) + '\n')
    # expected facts via independent parse
    tree = ET.parse(f'tests/corpus/{name}')
    ns = '{http://www.topografix.com/GPX/1/1}'
    root = tree.getroot()
    exp_tracks = []
    for trk in root.findall(f'{ns}trk'):
        tname = trk.find(f'{ns}name').text
        segs_exp = []
        for seg in trk.findall(f'{ns}trkseg'):
            pts = []
            for p in seg.findall(f'{ns}trkpt'):
                ele = p.find(f'{ns}ele')
                tim = p.find(f'{ns}time')
                pts.append((float(p.get('lat')), float(p.get('lon')),
                            float(ele.text) if ele is not None else None,
                            tim.text if tim is not None else None))
            dist = sum(hav((pts[i-1][0], pts[i-1][1]), (pts[i][0], pts[i][1])) for i in range(1, len(pts)))
            gain = sum(max(0.0, pts[i][2]-pts[i-1][2]) for i in range(1, len(pts)) if pts[i][2] is not None and pts[i-1][2] is not None)
            loss = sum(max(0.0, pts[i-1][2]-pts[i][2]) for i in range(1, len(pts)) if pts[i][2] is not None and pts[i-1][2] is not None)
            eles = [p[2] for p in pts if p[2] is not None]
            times = [datetime.fromisoformat(p[3].replace('Z', '+00:00')).timestamp() for p in pts if p[3]]
            dur = (times[-1]-times[0]) if times else None
            segs_exp.append({
                'points': len(pts), 'distance_m': round(dist, 3),
                'gain_m': round(gain, 3), 'loss_m': round(loss, 3),
                'min_ele': min(eles) if eles else None, 'max_ele': max(eles) if eles else None,
                'duration_s': dur,
                'avg_speed': round(dist/dur, 6) if dur else None,
                'ele_points': len(eles)})
        tot = {
            'name': tname,
            'points': sum(s['points'] for s in segs_exp),
            'distance_m': round(sum(s['distance_m'] for s in segs_exp), 3),
            'gain_m': round(sum(s['gain_m'] for s in segs_exp), 3),
            'loss_m': round(sum(s['loss_m'] for s in segs_exp), 3),
            'duration_s': sum(s['duration_s'] or 0 for s in segs_exp),
            'min_ele': min((s['min_ele'] for s in segs_exp if s['min_ele'] is not None), default=None),
            'max_ele': max((s['max_ele'] for s in segs_exp if s['max_ele'] is not None), default=None),
        }
        tot['avg_speed'] = round(tot['distance_m']/tot['duration_s'], 6) if tot['duration_s'] else None
        tot['segments'] = segs_exp
        exp_tracks.append(tot)
    item = {'file': name, 'creator': creator, 'version': '1.1',
            'track_count': len(exp_tracks), 'tracks': exp_tracks,
            'waypoint_count': len(waypoints), 'route_count': len(routes)}
    expected.append(item)

# 1. morning loop: one segment, full ele + time (Old City stroll, ~1 km)
loop = [
    (31.7780, 35.2354, 760.0, '2026-05-01T06:00:00Z'),
    (31.7775, 35.2362, 764.5, '2026-05-01T06:03:12Z'),
    (31.7769, 35.2371, 758.2, '2026-05-01T06:06:40Z'),
    (31.7774, 35.2380, 762.8, '2026-05-01T06:10:05Z'),
    (31.7782, 35.2372, 766.1, '2026-05-01T06:13:22Z'),
    (31.7780, 35.2354, 760.0, '2026-05-01T06:16:30Z'),
]
build('morning-loop.gpx', [('Morning Loop', [loop])])

# 2. hill climb: two segments with a gap, partial elevation on seg 2
seg1 = [
    (32.0853, 34.7818, 12.0, '2026-05-02T16:00:00Z'),
    (32.0861, 34.7825, 18.5, '2026-05-02T16:02:00Z'),
    (32.0870, 34.7831, 25.0, '2026-05-02T16:04:00Z'),
]
seg2 = [
    (32.0890, 34.7845, 40.0, '2026-05-02T16:12:00Z'),
    (32.0898, 34.7852, None, '2026-05-02T16:14:00Z'),
    (32.0906, 34.7860, 55.0, '2026-05-02T16:16:00Z'),
]
build('hill-climb.gpx', [('Hill Climb', [seg1, seg2])],
      waypoints=[('Trailhead', 32.0853, 34.7818)],
      routes=[('Shortcut', [(32.0853, 34.7818), (32.0906, 34.7860)])])

# 3. no-elevation: flat walk, no ele, no time
flat = [
    (40.7580, -73.9855, None, None),
    (40.7586, -73.9846, None, None),
    (40.7592, -73.9837, None, None),
]
build('flat-walk.gpx', [('Flat Walk', [flat])])

# 4. empty track: no points -> warning
open('tests/corpus/empty-track.gpx', 'w').write(
'<?xml version="1.0"?>\n<gpx version="1.1" creator="gpxlens-test"><trk><name>Empty</name><trkseg></trkseg></trk></gpx>\n')
expected.append({'file': 'empty-track.gpx', 'expect_warning': 'no usable points'})

# 5. not gpx: html -> error
open('tests/corpus/not-gpx.gpx', 'w').write('<html><body>nope</body></html>\n')
expected.append({'file': 'not-gpx.gpx', 'expect_error': 'no <gpx> root'})

json.dump({'items': expected}, open('tests/expected.json', 'w'), indent=1)
print('corpus:', [e['file'] for e in expected])
