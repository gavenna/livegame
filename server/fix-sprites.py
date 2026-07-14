"""
精灵图透明通道修复脚本

问题: AI 生成的 PNG 都是 RGB 模式（无 Alpha 通道），角色周围有白底/杂色。
修复: 检测图片四角的背景色 → 将相近色转为透明 → 保存为 RGBA PNG。
"""

from PIL import Image
import os
import sys

SPRITES_DIR = 'frontend/assets/sprites'

def get_background_color(img):
    """从图片四角和四边采样，推断背景色"""
    w, h = img.size
    samples = []
    # 四角
    for x, y in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
        samples.append(img.getpixel((x, y)))
    # 四边中点
    for x, y in [(w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2)]:
        samples.append(img.getpixel((x, y)))
    # 取 RGB 均值作为背景色
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    return (r, g, b)

def color_distance(c1, c2):
    return abs(c1[0]-c2[0]) + abs(c1[1]-c2[1]) + abs(c1[2]-c2[2])

def remove_background(img, threshold=60):
    """将接近背景色的像素变为透明"""
    img = img.convert('RGBA')
    bg = get_background_color(img)
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dist = color_distance((r, g, b), bg)
            if dist < threshold:
                # 背景色 → 透明
                alpha = int((dist / threshold) * 255)
                pixels[x, y] = (r, g, b, min(a, alpha))
            # 纯白/近白额外处理（很多 AI 图背景是纯白）
            elif r > 240 and g > 240 and b > 240:
                alpha = int((255 - (r+g+b)//3) / 15 * 255)
                pixels[x, y] = (r, g, b, min(a, max(0, alpha)))

    return img

def resize_to_spec(img, spec_key):
    """按 Art Bible 尺寸规范缩放"""
    specs = {
        'militia': (512, 512), 'swordsman': (512, 512), 'archer': (512, 512),
        'knight': (512, 512), 'royalGuard': (512, 512),
        'catapult': (768, 512),
        'giant': (768, 768), 'dragonKnight': (768, 768),
        'castle_red': (1024, 512), 'castle_blue': (1024, 512),
        'battlefield': (1920, 1080),
        'fireArrow_effect': (512, 512), 'wrathOfGod_effect': (512, 512),
        'siege_impact': (512, 512),
    }
    target = specs.get(spec_key.replace('.png', ''))
    if target and (img.width > target[0] or img.height > target[1]):
        img.thumbnail(target, Image.LANCZOS)
        canvas = Image.new('RGBA', target, (0, 0, 0, 0))
        ox = (target[0] - img.width) // 2
        oy = (target[1] - img.height) // 2
        canvas.paste(img, (ox, oy))
        return canvas
    return img

def main():
    if not os.path.isdir(SPRITES_DIR):
        print(f"Error: {SPRITES_DIR} not found")
        sys.exit(1)

    files = sorted(f for f in os.listdir(SPRITES_DIR) if f.endswith('.png'))
    print(f"处理 {len(files)} 张精灵图...\n")

    for f in files:
        path = os.path.join(SPRITES_DIR, f)
        img = Image.open(path)
        old_mode = img.mode
        old_size = img.size

        # 1. 去背景 → 透明
        if img.mode != 'RGBA':
            img = remove_background(img)
        else:
            img = img.convert('RGBA')

        # 2. 缩放到规范尺寸
        img = resize_to_spec(img, f)

        img.save(path, 'PNG')
        print(f"  {f:30s} {old_mode}->RGBA  {old_size[0]}x{old_size[1]}->{img.size[0]}x{img.size[1]}  OK")

    print(f"\nDone! All sprites converted to RGBA + transparent background")

if __name__ == '__main__':
    main()
