import os, math, subprocess
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
FPS = 10
BG = (10, 13, 18)
PANEL = (17, 21, 28)
STROKE = (38, 46, 58)
FG = (226, 232, 240)
DIM = (130, 143, 160)
ACC = (64, 220, 170)
ACC2 = (120, 180, 255)
WARN = (255, 196, 90)

F_MONO = "C:/Windows/Fonts/consola.ttf"
F_CJK = "C:/Windows/Fonts/msyh.ttc"
F_CJKB = "C:/Windows/Fonts/msyhbd.ttc"

def font(size, kind="mono"):
    path = {"mono": F_MONO, "cjk": F_CJK, "cjkb": F_CJKB}[kind]
    return ImageFont.truetype(path, size)

MONO_22 = font(22, "mono")
MONO_16 = font(16, "mono")
CJK_22 = font(22, "cjk")
CJK_20 = font(20, "cjk")
CJK_18 = font(18, "cjk")
CJK_46 = font(46, "cjkb")
CJK_30 = font(30, "cjkb")
CJK_64 = font(64, "cjkb")

def new_canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 4], fill=ACC)
    return img, d

def term_scene(title, lines, reveal):
    img, d = new_canvas()
    x0, y0, x1, y1 = 90, 90, W - 90, H - 90
    d.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=PANEL, outline=STROKE)
    for i, c in enumerate([(255, 106, 92), (255, 196, 90), (70, 200, 130)]):
        d.ellipse([x0 + 22 + i * 26, y0 + 20, x0 + 38 + i * 26, y0 + 36], fill=c)
    d.text((x0 + 110, y0 + 18), title, font=MONO_16, fill=DIM)
    y = y0 + 72
    shown = 0
    last_x, last_y = x0 + 36, y
    for text, kind, color in lines:
        fnt = MONO_22 if kind == "mono" else CJK_22
        if shown >= reveal:
            break
        chunk = text[: reveal - shown]
        shown += len(text)
        d.text((x0 + 36, y), chunk, font=fnt, fill=color)
        last_x = x0 + 36 + d.textlength(chunk, font=fnt)
        last_y = y
        y += 42
    if (reveal // 5) % 2 == 0:
        d.rectangle([last_x + 4, last_y + 4, last_x + 14, last_y + 28], fill=ACC)
    d.text((x1 - 250, y1 - 34), "measured 2026-11-16", font=MONO_16, fill=(90, 100, 115))
    return img

def title_frame(t):
    img, d = new_canvas()
    d.text((W / 2, 186), "dsh-purge", font=CJK_64, fill=FG, anchor="mm")
    d.text((W / 2, 250), "DeepSeek Harness · 0.2.2-rc.3", font=CJK_22, fill=ACC, anchor="mm")
    d.line([(W / 2 - 210, 306), (W / 2 + 210, 306)], fill=STROKE)
    d.text((W / 2, 356), "82 条宿主补丁 · 按模型提示词 · 一键还原", font=CJK_30, fill=FG, anchor="mm")
    d.text((W / 2, 414), "宿主层拦截 ≠ 模型拒答；补丁可观测、可回滚", font=CJK_20, fill=DIM, anchor="mm")
    d.text((W / 2, H - 56), "github.com/qiuqianyi66/dsh-purge", font=MONO_22, fill=ACC2, anchor="mm")
    return img

def problem_frame(t):
    img, d = new_canvas()
    d.text((90, 84), "现象：两种「不回答」长得一样", font=CJK_30, fill=FG)
    rows = [
        ("模型拒答", "你看到的是同一句话", DIM),
        ("宿主先拦", "审批门 / 沙箱策略 / 提示词被改写", WARN),
        ("结果", "分不清是谁拦的，也说不清改了什么", (200, 120, 120)),
    ]
    y = 150
    for label, desc, color in rows:
        d.rounded_rectangle([90, y, W - 90, y + 96], radius=12, fill=PANEL, outline=STROKE)
        d.text((120, y + 30), label, font=CJK_22, fill=color)
        d.text((320, y + 30), desc, font=CJK_22, fill=DIM)
        y += 114
    d.text((90, H - 78), "dsh-purge 的做法：把每一条宿主策略改成可观测、可还原的补丁", font=CJK_22, fill=ACC)
    return img

def patches_frame(t):
    img, d = new_canvas()
    d.text((90, 72), "82 条补丁 · 分组可见（节选）", font=CJK_30, fill=FG)
    items = [
        ("#82", "桌面双击启动缺 DSH_PROFILE，主进程兜底"),
        ("#13 / #35", "沙箱升级阶梯与「从不拒绝」判定"),
        ("#62", "官方工具审批 serviceAsk 的 fail-open 分支"),
        ("#36", "sandbox_permissions 的 justification 文案"),
    ]
    y = 140
    for pid, desc in items:
        d.rounded_rectangle([90, y, W - 90, y + 96], radius=12, fill=PANEL, outline=STROKE)
        d.text((118, y + 30), pid, font=MONO_22, fill=ACC)
        d.text((290, y + 30), desc, font=CJK_22, fill=FG)
        y += 112
    d.text((90, H - 74), "每条带 id / 名称 / 可读说明；载体缺失只跳过，不假装成功", font=CJK_18, fill=DIM)
    return img

def numbers_frame(t):
    img, d = new_canvas()
    d.text((90, 72), "rc.3 桌面版 · 真机实测（2026-11-16，只读命令）", font=CJK_22, fill=DIM)
    items = [("82", "补丁总数", FG), ("65", "载体键", FG), ("42", "文件核验命中", ACC),
             ("0", "漂移 / 改原文", ACC), ("0", "载体缺失", ACC), ("194", "单元测试通过", ACC2)]
    cw, ch = 350, 150
    for i, (num, label, color) in enumerate(items):
        col, row = i % 3, i // 3
        x = 90 + col * (cw + 20)
        y = 160 + row * (ch + 22)
        d.rounded_rectangle([x, y, x + cw, y + ch], radius=12, fill=PANEL, outline=STROKE)
        d.text((x + 26, y + 28), num, font=CJK_46, fill=color)
        d.text((x + 26, y + 96), label, font=CJK_18, fill=DIM)
    d.text((90, H - 62), "数字来自 --diagnose / audit-next / node --test，非估算", font=CJK_18, fill=(90, 100, 115))
    return img

def end_frame(t):
    img, d = new_canvas()
    d.text((W / 2, 196), "升级前先审计，装完看漂移", font=CJK_46, fill=FG, anchor="mm")
    d.text((W / 2, 262), "需重对齐 0 才建议升级宿主", font=CJK_22, fill=ACC, anchor="mm")
    d.rounded_rectangle([W / 2 - 390, 320, W / 2 + 390, 410], radius=12, fill=PANEL, outline=STROKE)
    d.text((W / 2, 365), "github.com/qiuqianyi66/dsh-purge", font=MONO_22, fill=ACC2, anchor="mm")
    d.text((W / 2, 462), "Apache-2.0 · 上游版权 YuJunZhiXue（保留于 LICENSE / NOTICE）", font=CJK_18, fill=DIM, anchor="mm")
    d.text((W / 2, 498), "仅限自有设备的授权评测；公网目标一律不放行", font=CJK_18, fill=WARN, anchor="mm")
    return img

TERM_SCENES = [
    ("dsh-purge · install", [
        ("$ dsh plugin --profile desktop add \\", "mono", DIM),
        ("    https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main", "mono", DIM),
        ("$ node -p \"require('./profiles/desktop/node_modules/dsh-purge/package.json').version\"", "mono", DIM),
        ("1.1.90", "mono", ACC),
    ], 34),
    ("dsh-purge · diagnose", [
        ("$ node node_modules/dsh-purge/bin/dsh-purge.js --diagnose", "mono", DIM),
        ("载体 56 个 ｜ 补丁 82 条 → 可命中 42", "cjk", FG),
        ("改过原文 0 ｜ 目标已消失 0 ｜ 载体缺失 0", "cjk", ACC),
    ], 30),
    ("dsh-purge · audit-next", [
        ("$ npm run audit:next -- --version 0.2.2-rc.3 --fail-on drift", "mono", DIM),
        ("载体 45 个键 ｜ 补丁 78 条", "cjk", FG),
        ("认得 56 条 ｜ 校验型 6 条 ｜ 需重对齐 0 条", "cjk", ACC),
    ], 30),
    ("dsh-purge · unit tests", [
        ("$ node --test", "mono", DIM),
        ("# pass 194", "mono", ACC),
        ("# fail 0", "mono", ACC),
    ], 18),
]

frames = []
frames += [title_frame(i) for i in range(12)]
frames += [problem_frame(i) for i in range(22)]
frames += [patches_frame(i) for i in range(24)]
for title, lines, n in TERM_SCENES:
    total_chars = sum(len(t) for t, _, _ in lines)
    for i in range(n):
        reveal = int(math.ceil((i + 1) / n * (total_chars + 3)))
        frames.append(term_scene(title, lines, reveal))
frames += [numbers_frame(i) for i in range(30)]
frames += [end_frame(i) for i in range(30)]
print("frames", len(frames), "seconds", round(len(frames) / FPS, 1))

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
out = os.path.join(root, "docs", "demo")
fdir = os.path.join(root, ".tmp", "demo", "frames")
os.makedirs(fdir, exist_ok=True)
for idx, fr in enumerate(frames):
    fr.save(os.path.join(fdir, "f%04d.png" % idx))

import imageio_ffmpeg as iff
ff = iff.get_ffmpeg_exe()
mp4 = os.path.join(out, "dsh-purge-demo.mp4")
subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", os.path.join(fdir, "f%04d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "medium", mp4],
               check=True, capture_output=True)
print("mp4 KB", round(os.path.getsize(mp4) / 1024))

small = [f.resize((960, 540), Image.LANCZOS).convert("P", palette=Image.ADAPTIVE, colors=64) for f in frames]
gif = os.path.join(out, "dsh-purge-demo.gif")
small[0].save(gif, save_all=True, append_images=small[1:], duration=int(1000 / FPS), loop=0, optimize=True, disposal=1)
print("gif KB", round(os.path.getsize(gif) / 1024))
