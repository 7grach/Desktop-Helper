"""Вырезает кадры Пуша из референса (design/ref/reference.jpg) и чистит их:
убирает сетку и фон, оставляет 3 цвета (контур, белый, жёлтый) с прозрачностью."""
import os
from collections import deque
from PIL import Image

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, '..', 'design', 'ref', 'reference.jpg')
OUT = os.path.join(HERE, '..', 'design', 'ref')
SPR = os.path.join(HERE, '..', 'assets', 'sprites', 'ref')
INK, WHITE, YEL = (27, 29, 34, 255), (255, 255, 255, 255), (255, 205, 50, 255)

# (имя, рамка в референсе)
BOXES = {
    'idle': (287, 110, 803, 582),
    'walk0': (6, 727, 208, 930),
    'walk1': (224, 727, 427, 930),
    'walk2': (443, 727, 646, 930),
    'walk3': (662, 727, 865, 930),
    'walk4': (881, 727, 1083, 930),
}


def classify(p):
    r, g, b = p
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    if lum < 120:
        return 'k'
    if r > 170 and g > 130 and b < 110:
        return 'y'
    return 'w'


def clean(crop, closed_bottom=None):
    w, h = crop.size
    src = crop.load()
    cls = [[classify(src[x, y]) for x in range(w)] for y in range(h)]
    # фон = всё светлое, до чего можно дойти от края рамки, не пересекая контур
    bg = [[False] * w for _ in range(h)]
    # у позы «анфас» тело уходит за нижний край: низ между линиями тела не считаем фоном
    bottom = [x for x in range(w) if not closed_bottom or not (closed_bottom[0] <= x <= closed_bottom[1])]
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in bottom] +
              [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or bg[y][x] or cls[y][x] != 'w':
            continue
        bg[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                continue
            o[x, y] = {'k': INK, 'y': YEL, 'w': WHITE}[cls[y][x]]
    return out


def main():
    os.makedirs(SPR, exist_ok=True)
    im = Image.open(REF).convert('RGB')
    for name, box in BOXES.items():
        c = clean(im.crop(box), (93, 420) if name == 'idle' else None)
        c = c.crop(c.getbbox())
        c.save(os.path.join(OUT, f'{name}.png'))
        if name != 'idle':  # анфас теперь берётся из листа поведения (extract_ref2.py)
            c.save(os.path.join(SPR, f'{name}.png'))
        print(name, c.size)


if __name__ == '__main__':
    main()


def to_pixels(img, cols):
    """Сводит картинку к настоящей пиксельной сетке шириной cols пикселей."""
    w, h = img.size
    rows = round(h * cols / w)
    def frac(fn):
        m = Image.new('L', img.size)
        m.putdata([255 if fn(p) else 0 for p in img.get_flattened_data()])
        return list(m.resize((cols, rows), Image.BOX).get_flattened_data())
    op = frac(lambda p: p[3] > 0)
    ink = frac(lambda p: p[3] > 0 and p[0] < 100)
    yel = frac(lambda p: p[3] > 0 and p[2] < 150 and p[0] > 150)
    out = Image.new('RGBA', (cols, rows), (0, 0, 0, 0))
    out.putdata([(0, 0, 0, 0) if o < 110 else INK if k > 70 else YEL if y > 100 else WHITE
                 for o, k, y in zip(op, ink, yel)])
    return out
