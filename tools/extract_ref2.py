"""Вырезает все позы Пуша из листа поведения (design/ref/reference2.jpg).

Фон (белый и голубая сетка), до которого можно дойти от края клетки, становится
прозрачным; цвета самих поз (розовые щёки, миска, клубок) сохраняются.
Результат: assets/sprites/ref/<имя>.png
"""
import os
from collections import deque
from PIL import Image

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, '..', 'design', 'ref', 'reference2.jpg')
SPR = os.path.join(HERE, '..', 'assets', 'sprites', 'ref')
INK = (27, 29, 34, 255)

COLS = [(2, 176), (180, 359), (363, 543), (547, 726), (730, 909), (913, 1086)]
ROW1, ROW2 = (575, 731), (783, 930)
BOXES = {
    'frontSit': (475, 160, 645, 325),
    'back': (700, 160, 845, 312),
    'frontWalk0': (695, 325, 860, 472),
    'frontWalk1': (890, 325, 1058, 472),
}
for i, n in enumerate(['sleeping', 'eating', 'jumping', 'grooming', 'happy', 'angry']):
    BOXES[n] = (COLS[i][0], ROW1[0], COLS[i][1], ROW1[1])
for i, n in enumerate(['playing', 'sleepBack', 'sitProfile', 'rolling', 'scared', 'headpat']):
    BOXES[n] = (COLS[i][0], ROW2[0], COLS[i][1], ROW2[1])


def is_bg(p):
    r, g, b = p
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    if lum < 165:
        return False
    return max(p) - min(p) < 40 or (b > r + 12 and b > 195 and r < 235)


# у этих поз тело уходит за нижний край клетки: низ между линиями тела не фон
OPEN_BOTTOM = {'happy', 'angry', 'headpat'}


def clean(crop, open_bottom=False, keep_blue=False, cut=()):
    """cut: края клетки, которыми рисунок обрезан (left/bottom/…): с них фон не заливаем."""
    w, h = crop.size
    src = crop.load()
    dark = lambda x, y: 0.3 * src[x, y][0] + 0.59 * src[x, y][1] + 0.11 * src[x, y][2] < 110
    if open_bottom:
        # обрезаем клетку по нижнему краю линий тела, чтобы низ тела был «открыт» ровно по краю
        last = max(y for y in range(h) if sum(dark(x, y) for x in range(w)) >= 4)
        crop = crop.crop((0, 0, w, last - 1))
        w, h = crop.size
        src = crop.load()
    bg = [[False] * w for _ in range(h)]
    bottom = list(range(w))
    if open_bottom:
        ink = [x for x in range(w) if dark(x, h - 1)]
        if ink:
            bottom = [x for x in range(w) if x < min(ink) or x > max(ink)]
    if 'bottom' in cut:
        bottom = []
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in bottom] +
              ([] if 'left' in cut else [(0, y) for y in range(h)]) +
              ([] if 'right' in cut else [(w - 1, y) for y in range(h)]))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or bg[y][x] or not is_bg(src[x, y]):
            continue
        bg[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                continue
            r, g, b = src[x, y]
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            if not keep_blue and lum > 150 and b > r + 25:
                continue  # остатки голубой сетки
            if lum < 90:
                o[x, y] = INK
            elif lum > 205 and max(r, g, b) - min(r, g, b) < 30:
                o[x, y] = (255, 255, 255, 255)
            else:
                o[x, y] = (r, g, b, 255)
    # одиночные пиксели-соринки по краям убираем
    a = out.copy().load()
    for y in range(h):
        for x in range(w):
            if a[x, y][3] and sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                                  if 0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy][3]) <= 1:
                o[x, y] = (0, 0, 0, 0)
    # мелкие островки (шум JPEG вокруг рисунка) убираем
    seen = [[False] * w for _ in range(h)]
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or not o[x0, y0][3]:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and o[nx, ny][3]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) < 25:
                for x, y in comp:
                    o[x, y] = (0, 0, 0, 0)
    return out.crop(out.getbbox())


def main():
    os.makedirs(SPR, exist_ok=True)
    im = Image.open(REF).convert('RGB')
    for name, box in BOXES.items():
        c = clean(im.crop(box), name in OPEN_BOTTOM, name in ('eating', 'sleeping'))
        c.save(os.path.join(SPR, f'{name}.png'))
        print(name, c.size)


if __name__ == '__main__':
    main()
