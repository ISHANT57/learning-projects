import sys, json, colorsys
import numpy as np
from PIL import Image
from collections import deque, defaultdict

def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(int)

def label(mask):
    H, W = mask.shape
    lab = np.zeros((H, W), int)
    n = 0
    comps = []
    for y in range(H):
        for x in range(W):
            if mask[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)]); lab[y, x] = n; cnt = 0; xs = []; ys = []
                while q:
                    cy, cx = q.popleft(); cnt += 1; xs.append(cx); ys.append(cy)
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = cy+dy, cx+dx
                        if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                comps.append((n, cnt, min(xs), min(ys), max(xs), max(ys)))
    return lab, comps

def loops(mask):
    # directed boundary edges with the foreground on the left; link into closed loops
    H, W = mask.shape
    nxt = {}
    def fg(y, x): return 0 <= y < H and 0 <= x < W and mask[y, x]
    for y in range(H):
        for x in range(W):
            if not mask[y, x]: continue
            if not fg(y-1, x): nxt.setdefault((x, y), []).append((x+1, y))       # top edge, goes right
            if not fg(y, x+1): nxt.setdefault((x+1, y), []).append((x+1, y+1))   # right edge, goes down
            if not fg(y+1, x): nxt.setdefault((x+1, y+1), []).append((x, y+1))   # bottom edge, goes left
            if not fg(y, x-1): nxt.setdefault((x, y+1), []).append((x, y))       # left edge, goes up
    out = []
    while nxt:
        s = next(iter(nxt)); path = [s]; cur = s
        while True:
            lst = nxt.get(cur)
            if not lst: break
            n = lst.pop()
            if not lst: del nxt[cur]
            if n == s: break
            path.append(n); cur = n
        out.append(path)
    return out

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a = np.array(pts[0], float); b = np.array(pts[-1], float)
    ab = b - a; L = np.hypot(*ab)
    best = -1; bi = 0
    for i in range(1, len(pts)-1):
        p = np.array(pts[i], float)
        d = abs(ab[0]*(a[1]-p[1]) - ab[1]*(a[0]-p[0]))/L if L else np.hypot(*(p-a))
        if d > best: best, bi = d, i
    if best > eps:
        return rdp(pts[:bi+1], eps)[:-1] + rdp(pts[bi:], eps)
    return [pts[0], pts[-1]]

def area(p):
    return 0.5*sum(p[i][0]*p[(i+1) % len(p)][1] - p[(i+1) % len(p)][0]*p[i][1] for i in range(len(p)))

def trace_board(path, thr=232):
    im = load(path)
    # work at half resolution for speed
    sm = im[::2, ::2]
    bg = (sm.min(axis=2) > thr)
    fgm = ~bg
    lab, comps = label(fgm)
    big = max(comps, key=lambda c: c[1])
    fgm = lab == big[0]
    # holes: background components not touching the border
    blab, bcomps = label(~fgm)
    H, W = fgm.shape
    holes = np.zeros_like(fgm)
    for n, cnt, x0, y0, x1, y1 in bcomps:
        if x0 > 0 and y0 > 0 and x1 < W-1 and y1 < H-1 and cnt > 40:
            holes |= (blab == n)
    solid = fgm | holes
    outer = max(loops(solid), key=lambda p: abs(area(p)))
    hole_loops = []
    for n, cnt, x0, y0, x1, y1 in bcomps:
        if x0 > 0 and y0 > 0 and x1 < W-1 and y1 < H-1 and cnt > 40:
            ls = loops(blab == n)
            hole_loops.append(max(ls, key=lambda p: abs(area(p))))
    sim = lambda p: [(x*2, y*2) for x, y in rdp(p + [p[0]], 1.4)[:-1]]
    return {'size': [im.shape[1], im.shape[0]], 'outer': sim(outer), 'holes': [sim(h) for h in hole_loops], 'bbox': [big[2]*2, big[3]*2, big[4]*2, big[5]*2]}

def boxes(path):
    im = load(path)
    H, W, _ = im.shape
    out = {}
    hue_ranges = {'red': [(0, 12), (345, 360)], 'orange': [(16, 38)], 'yellow': [(44, 62)], 'green': [(125, 165)], 'cyan': [(184, 204)], 'blue': [(214, 240)]}
    r, g, b = im[..., 0]/255, im[..., 1]/255, im[..., 2]/255
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    v = mx; s = np.where(mx > 0, (mx-mn)/np.maximum(mx, 1e-6), 0)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g-b)/d) % 6, np.where(mx == g, (b-r)/d + 2, (r-g)/d + 4))*60
    for name, rs in hue_ranges.items():
        m = np.zeros((H, W), bool)
        for a, bb in rs: m |= (h >= a) & (h <= bb)
        m &= (s > 0.6) & (v > 0.5)
        sm = m[::2, ::2]
        lab, comps = label(sm)
        comps = [c for c in comps if c[1] > 60]
        if comps:
            c = max(comps, key=lambda c: (c[4]-c[2])*(c[5]-c[3]))
            out[name] = [c[2]*2, c[3]*2, c[4]*2, c[5]*2]
    return out

if __name__ == '__main__':
    p = sys.argv[1]
    res = {'board': trace_board(p), 'boxes': boxes(p)}
    json.dump(res, open(sys.argv[2], 'w'))
    b = res['board']
    print(p, 'outer pts', len(b['outer']), 'holes', [len(h) for h in b['holes']], 'bbox', b['bbox'])
    print(res['boxes'])
