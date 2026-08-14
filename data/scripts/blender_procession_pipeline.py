# -*- coding: utf-8 -*-
"""행렬 모델을 앱이 쓸 수 있는 형태로 굽는 Blender 파이프라인.

Blender 안에서 실행한다(스크립트 에디터 또는 blender MCP):

    exec(open(r"data/scripts/blender_procession_pipeline.py", encoding="utf-8").read(), globals())
    process("Naechwi")                       # 사람 — 다리 2개 스윙
    process("DanghagwanGunbok", kind="horse") # 말 탄 인물 — 말 네 다리 스윙

하는 일 (의장군에 손으로 적용한 절차를 그대로 함수화한 것)
 1. scene.gltf import → 메시 1개로 join, 빈 계층 제거
 2. 정면을 **-Y** 로, 원점을 **양발(네 발) 사이 바닥 중앙**으로
 3. 리깅 — 사람은 root + 다리 2개, 말은 root + 다리 4개
    옷자락/배 아래만 다리 본에 주고 그 위는 root 에 강체로 붙인다
 4. `walk` 액션 — 24fps · 25프레임 루프. 사람은 좌우 역위상,
    말은 대각선 짝(앞왼+뒤오른 / 앞오른+뒤왼)이 같은 위상
 5. 압축 — baseColor 만 남기고 리사이즈, Decimate 로 목표 face, Draco + JPEG 로 내보내기

전제: 스캔 리메시라 옷 안쪽/배 아래 다리가 온전하지 않을 수 있다. 그래서 다리를 관절로
꺾지 않고 엉덩이에서 **진자처럼 통째로 스윙**시킨다. 폭을 작게(11도) 두면 찢어지지 않는다.
"""

import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = r"C:\project\joseon-time-hnyoo"
SRC = os.path.join(ROOT, "tmp", "work", "models")
OUT = os.path.join(ROOT, "tmp", "work", "out")

FPS = 24
FRAMES = 24                  # 25번째 프레임 = 1번째 프레임(루프)
SWING_DEG = 11.0             # 다리 스윙 폭 — 키우면 스캔 메시가 찢어진다
BOB = 0.018                  # 상하 흔들림(m)
TARGET_FACES = 9000

# 자동 추정이 빗나간 모델의 보정각(도) — Blender 정면 뷰로 눈으로 확인해 정한 값.
FRONT_FIX = {
    "DanghagwanHeukdallyeong": -90.0,   # 90 이었으나 Cesium 실측 결과 뒤를 봐서 180 반전
    "GeumgunPodallyeong": 180.0,
    "JongheongwanJebok": -90.0,         # 90 이었으나 Cesium 실측 결과 뒤를 봐서 180 반전
    # MunmubaehyanggwanJobok: 자동 추정이 맞음(보정 불요). 180 을 넣었더니 오히려 뒤집혔다(렌더 검증).
    "UijangbongjiHeukdallyeong": -90.0,
    "KingMyeonbok": 90.0,               # -90 이었으나 렌더 검증 결과 뒤를 봐서 180 반전
}
MAIN_TEX = 1024              # 본체 baseColor 상한
PROP_TEX = 512               # 소품 baseColor 상한


# -- 씬 조작 도우미 -----------------------------------------------------------

def _obj_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def _select(objs, active=None):
    _obj_mode()
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def clear_scene():
    _obj_mode()
    for o in bpy.data.objects:
        o.select_set(True)
    if bpy.data.objects:
        bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.images, bpy.data.materials, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def bounds(obj):
    co = [obj.matrix_world @ v.co for v in obj.data.vertices]
    mn = Vector((min(c[i] for c in co) for i in range(3)))
    mx = Vector((max(c[i] for c in co) for i in range(3)))
    return mn, mx


# -- 1) import & join ---------------------------------------------------------

def import_and_join(folder, name):
    path = os.path.join(SRC, folder, "scene.gltf")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    bpy.ops.import_scene.gltf(filepath=path)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    _select(meshes)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name

    empties = [o for o in bpy.data.objects if o.type == 'EMPTY']
    if empties:
        _select(empties)
        bpy.ops.object.delete()

    _select([obj])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


# -- 2) 정면·원점 정규화 --------------------------------------------------------

def guess_front(obj, kind):
    """모델이 어느 쪽을 보고 있는지 추정한다.

    사람: 발끝이 정면으로 가장 많이 튀어나온다. 발 높이 띠에서 중심으로부터의
          편차가 가장 큰 수평 방향을 정면으로 본다.
    말  : 몸이 진행축으로 길다. 긴 축을 고르고, 머리(위쪽 앞으로 뻗은 덩어리)가
          있는 쪽을 정면으로 본다. 확신도가 낮으니 반드시 눈으로 확인할 것.
    """
    co = [v.co for v in obj.data.vertices]
    zs = [c.z for c in co]
    h = max(zs) - min(zs)
    cx = (max(c.x for c in co) + min(c.x for c in co)) / 2
    cy = (max(c.y for c in co) + min(c.y for c in co)) / 2

    if kind == 'human':
        band = [c for c in co if c.z <= min(zs) + 0.08 * h]
        cand = {
            '+X': max(c.x for c in band) - cx, '-X': cx - min(c.x for c in band),
            '+Y': max(c.y for c in band) - cy, '-Y': cy - min(c.y for c in band),
        }
        return max(cand, key=cand.get)

    # 말 — 긴 축을 먼저 고른다.
    ext_x = max(c.x for c in co) - min(c.x for c in co)
    ext_y = max(c.y for c in co) - min(c.y for c in co)
    axis = 'X' if ext_x > ext_y else 'Y'
    # 머리 높이 띠(어깨~머리)에서 축 방향으로 더 멀리 뻗은 쪽이 앞이다.
    band = [c for c in co if min(zs) + 0.55 * h <= c.z <= min(zs) + 0.85 * h]
    if axis == 'X':
        return '+X' if (max(c.x for c in band) - cx) > (cx - min(c.x for c in band)) else '-X'
    return '+Y' if (max(c.y for c in band) - cy) > (cy - min(c.y for c in band)) else '-Y'


_TO_MINUS_Y = {'+X': -90.0, '-X': 90.0, '+Y': 180.0, '-Y': 0.0}


def normalize(obj, front, turn=0.0):
    """정면을 -Y 로 돌리고, 원점을 발밑 바닥 중앙으로 옮긴다.

    turn 은 자동 추정이 틀렸을 때 눈으로 보고 더 돌리는 각(도). 스캔 모델은
    옷·소품 때문에 발끝 추정이 자주 빗나가므로 결과를 반드시 확인할 것.
    """
    deg = _TO_MINUS_Y[front] + turn
    if deg:
        obj.data.transform(Matrix.Rotation(math.radians(deg), 4, 'Z'))
    co = [v.co for v in obj.data.vertices]
    mn = Vector((min(c[i] for c in co) for i in range(3)))
    mx = Vector((max(c[i] for c in co) for i in range(3)))
    obj.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    obj.data.update()
    obj.location = (0, 0, 0)
    return bounds(obj)


# -- 3~4) 리깅 + walk ----------------------------------------------------------

def _new_armature(name):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = name
    arm.data.name = name
    arm.data.edit_bones.remove(arm.data.edit_bones[0])
    return arm


def find_hem(obj):
    """옷단 높이를 찾는다.

    도포·단령 길이가 모델마다 달라 고정 비율로 자르면 치맛자락이 갈라진다.
    아래에서 위로 훑으며 **좌우 폭이 몸통 폭의 절반을 넘는 순간**을 옷단으로 본다.
    그 아래는 바지·신발뿐이라 다리 본에 통째로 줘도 안전하다.
    """
    co = [v.co for v in obj.data.vertices]
    z0 = min(c.z for c in co)
    h = max(c.z for c in co) - z0
    step = 0.02 * h
    widths = []
    z = z0
    while z < z0 + 0.75 * h:
        band = [c.x for c in co if z <= c.z < z + step]
        widths.append((z, (max(band) - min(band)) if band else 0.0))
        z += step
    body = max(w for _, w in widths) if widths else 0.0
    hem = z0 + 0.20 * h                       # 못 찾으면 보수적인 기본값
    for zz, w in widths:
        if w > 0.5 * body:
            hem = zz
            break
    return max(z0 + 0.05 * h, min(hem, z0 + 0.45 * h))


def find_belly(obj):
    """말의 배 선을 찾는다.

    앞뒤 끝만 보면 네 다리가 몸통만큼 넓게 벌어져 있어 속는다. 그래서 **진행축을
    잘게 나눠 실제로 채워진 칸의 비율**을 본다. 다리 높이에서는 칸이 드문드문(4개)
    차지만, 배 위로는 거의 다 찬다. 점유율이 75%를 넘는 첫 높이를 배 선으로 본다.
    """
    co = [v.co for v in obj.data.vertices]
    z0 = min(c.z for c in co)
    h = max(c.z for c in co) - z0
    y0 = min(c.y for c in co)
    span = max(c.y for c in co) - y0
    bins = 24
    step = 0.02 * h
    belly = z0 + 0.42 * h
    z = z0
    while z < z0 + 0.8 * h:
        band = [c.y for c in co if z <= c.z < z + step]
        if band:
            filled = {min(bins - 1, int((y - y0) / span * bins)) for y in band}
            if len(filled) / bins > 0.75:
                belly = z
                break
        z += step
    return max(z0 + 0.20 * h, min(belly, z0 + 0.60 * h))


def rig_human(obj, name):
    """다리 2개. 옷자락 아래만 다리에 주고 위는 root 에 붙인다."""
    mn, mx = bounds(obj)
    h = mx.z - mn.z
    hip = 0.44 * h                     # 진자 회전 중심(엉덩이)
    hem = find_hem(obj)
    hem_top, hem_bot = hem, max(mn.z + 0.02 * h, hem - 0.06 * h)   # 이 구간에서 웨이트를 섞는다

    # 옷단이 발목까지 내려온 인물은 드러난 게 신발뿐이라, 다리를 흔들면 신발만 따로
    # 떠다니는 꼴이 된다. 그런 모델은 다리를 묶어 두고 상하 흔들림만 준다.
    legs_visible = (hem - mn.z) >= 0.12 * h
    half = 0.03 * h                    # 두 다리 사이 블렌딩 폭

    arm = _new_armature(name + "_Rig")
    eb = arm.data.edit_bones
    root = eb.new("root"); root.head = (0, 0, hip); root.tail = (0, 0, hip + 0.15)
    for side, sy in (("L", 1), ("R", -1)):
        b = eb.new("leg." + side)
        b.head = (sy * 0.04 * h, 0, hip)
        b.tail = (sy * 0.04 * h, 0, 0.01)
        b.parent = root
    bpy.ops.object.mode_set(mode='OBJECT')

    groups = {n: obj.vertex_groups.new(name=n) for n in ("root", "leg.L", "leg.R")}
    for v in obj.data.vertices:
        z = v.co.z
        w = 0.0 if z >= hem_top else (1.0 if z <= hem_bot else (hem_top - z) / (hem_top - hem_bot))
        t = min(1.0, max(0.0, (v.co.x + half) / (2 * half)))   # -Y 정면이므로 좌우는 X
        groups["root"].add([v.index], 1.0 - w, 'REPLACE')
        groups["leg.L"].add([v.index], w * t, 'REPLACE')
        groups["leg.R"].add([v.index], w * (1.0 - t), 'REPLACE')
    return arm, (["leg.L", "leg.R"] if legs_visible else [])


def rig_horse(obj, name):
    """말 네 다리. 배 아래만 다리에 주고, 몸통과 기수는 root 에 강체로 붙인다.

    다리 구분은 배 아래 정점을 앞뒤(Y)·좌우(X) 로 4등분해서 한다. 스캔이라
    네 다리가 서로 붙어 있을 수 있어 경계는 부드럽게 섞는다.
    """
    mn, mx = bounds(obj)
    h = mx.z - mn.z
    belly_top = find_belly(obj)                 # 배 선 — 이 아래가 다리
    belly_bot = max(mn.z + 0.03 * h, belly_top - 0.10 * h)
    arm = _new_armature(name + "_Rig")
    eb = arm.data.edit_bones
    root = eb.new("root"); root.head = (0, 0, belly_top); root.tail = (0, 0, belly_top + 0.15)

    legs = []
    for fb, sy in (("F", -1), ("B", 1)):        # -Y 가 정면이므로 앞다리는 -Y 쪽
        for lr, sx in (("L", 1), ("R", -1)):
            n = "leg.%s%s" % (fb, lr)
            b = eb.new(n)
            b.head = (sx * 0.10 * h, sy * 0.20 * h, belly_top)
            b.tail = (sx * 0.10 * h, sy * 0.20 * h, 0.01)
            b.parent = root
            legs.append(n)
    bpy.ops.object.mode_set(mode='OBJECT')

    groups = {n: obj.vertex_groups.new(name=n) for n in ["root"] + legs}
    hx = 0.04 * h
    hy = 0.08 * h
    for v in obj.data.vertices:
        z = v.co.z
        w = 0.0 if z >= belly_top else (1.0 if z <= belly_bot else (belly_top - z) / (belly_top - belly_bot))
        tx = min(1.0, max(0.0, (v.co.x + hx) / (2 * hx)))   # 1 = 왼쪽(+X)
        ty = min(1.0, max(0.0, (v.co.y + hy) / (2 * hy)))   # 1 = 뒤(+Y)
        groups["root"].add([v.index], 1.0 - w, 'REPLACE')
        for n, f in (("leg.FL", (1 - ty) * tx), ("leg.FR", (1 - ty) * (1 - tx)),
                     ("leg.BL", ty * tx), ("leg.BR", ty * (1 - tx))):
            groups[n].add([v.index], w * f, 'REPLACE')
    return arm, legs


def bind(obj, arm):
    md = obj.modifiers.new("Armature", 'ARMATURE')
    md.object = arm
    obj.parent = arm


def animate_walk(arm, legs, phases):
    """다리별 위상(phases: 본이름 → 0 또는 0.5)으로 한 걸음 주기를 만든다."""
    _select([arm], arm)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)

    act = bpy.data.actions.new("walk")
    arm.animation_data_create()
    arm.animation_data.action = act

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, FRAMES + 1
    amp = math.radians(SWING_DEG)

    for i in range(FRAMES + 1):
        f = 1 + i
        ph = 2 * math.pi * (i / FRAMES)
        scene.frame_set(f)
        for n in legs:
            # -Y 정면이므로 앞뒤 스윙은 본 로컬 X 축 회전이다(장다리 기준 검증한 축).
            arm.pose.bones[n].rotation_euler = (amp * math.cos(ph + 2 * math.pi * phases[n]), 0, 0)
            arm.pose.bones[n].keyframe_insert("rotation_euler", frame=f)
        arm.pose.bones["root"].location = (0, BOB * abs(math.sin(ph)), 0)  # 본 로컬 Y = 전역 Z
        arm.pose.bones["root"].keyframe_insert("location", frame=f)

    bpy.ops.object.mode_set(mode='OBJECT')
    scene.frame_set(1)
    return act


# -- 5) 압축 -------------------------------------------------------------------

def compress(obj, target_faces=TARGET_FACES):
    # metallicRoughness·normal 은 이 축척에서 보이지 않는다 — 노드째 제거
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == 'TEX_IMAGE' and node.image and (
                    'metallicRoughness' in node.image.name or 'normal' in node.image.name):
                mat.node_tree.nodes.remove(node)
    for im in list(bpy.data.images):
        if im.users == 0 and im.name != 'Render Result':
            bpy.data.images.remove(im)

    # baseColor 는 본체만 크게 남긴다(면적이 가장 큰 텍스처를 본체로 본다).
    imgs = [im for im in bpy.data.images if im.name != 'Render Result' and im.size[0]]
    if imgs:
        main = max(imgs, key=lambda i: i.size[0] * i.size[1])
        for im in imgs:
            cap = MAIN_TEX if im is main else PROP_TEX
            w, h = im.size
            if max(w, h) > cap:
                s = cap / max(w, h)
                im.scale(max(1, int(w * s)), max(1, int(h * s)))

    faces = len(obj.data.polygons)
    if faces > target_faces:
        _select([obj], obj)
        dec = obj.modifiers.new("Decimate", 'DECIMATE')
        dec.ratio = target_faces / faces
        while obj.modifiers[0] != dec:
            bpy.ops.object.modifier_move_up(modifier=dec.name)
        bpy.ops.object.modifier_apply(modifier=dec.name)
    return faces, len(obj.data.polygons)


def export(obj, arm, folder):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, folder + ".glb")
    _select([obj, arm], arm)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_yup=True, export_animations=True, export_frame_range=True,
        export_animation_mode='ACTIONS', export_bake_animation=True, export_apply=False,
        export_image_format='JPEG', export_jpeg_quality=75,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=12, export_draco_normal_quantization=8,
        export_draco_texcoord_quantization=10, export_draco_generic_quantization=12,
    )
    return path, os.path.getsize(path) / 1024 / 1024


# -- 전체 -----------------------------------------------------------------------

def process(folder, kind="human", front=None, turn=None, target_faces=TARGET_FACES, name=None):
    """폴더 하나를 굽는다.

    front 를 주면 자동 추정 대신 그 값을 쓰고('+X'/'-X'/'+Y'/'-Y'),
    turn 은 결과를 보고 더 돌릴 각(도) — 눈으로 확인한 뒤 FRONT_FIX 에 적어 두면
    다음부터는 생략해도 자동 적용된다.
    """
    name = name or folder
    if turn is None:
        turn = FRONT_FIX.get(folder, 0.0)
    clear_scene()
    obj = import_and_join(folder, name)
    guessed = guess_front(obj, kind)
    used = front or guessed
    mn, mx = normalize(obj, used, turn)

    if kind == 'horse':
        arm, legs = rig_horse(obj, name)
        phases = {"leg.FL": 0.0, "leg.BR": 0.0, "leg.FR": 0.5, "leg.BL": 0.5}  # 대각선 짝
    else:
        arm, legs = rig_human(obj, name)
        phases = {"leg.L": 0.0, "leg.R": 0.5}
    bind(obj, arm)
    animate_walk(arm, legs, phases)

    before, after = compress(obj, target_faces)
    path, mb = export(obj, arm, folder)

    motion = ("다리 %d개 스윙" % len(legs)) if legs else "상하 흔들림만(옷단이 낮음)"
    print("%-28s 정면=%s(추정 %s) 키 %.2fm  %s  face %d→%d  %.2f MB"
          % (folder, used, guessed, mx.z - mn.z, motion, before, after, mb))
    return {"folder": folder, "front": used, "guessed": guessed, "motion": motion,
            "height": mx.z - mn.z, "faces": after, "mb": mb}
