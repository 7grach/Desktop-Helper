"""Вырезает позы из третьего листа (design/ref/reference3.jpg): полный анфас,
новая ходьба, зевок, потягушки, кофе, птичка, хвост и т.д. -> assets/sprites/ref/"""
import os
from PIL import Image
from extract_ref2 import clean, SPR, HERE

REF = os.path.join(HERE, '..', 'design', 'ref', 'reference3.jpg')
C = [(2, 176), (180, 359), (363, 542), (546, 725), (729, 908), (912, 1086)]
R1, R2 = (585, 734), (808, 932)

# имя: (рамка, края, которыми рисунок обрезан; 'open' = тело уходит за нижний край)
BOXES = {
    'idle': ((28, 110, 342, 415), ()),
    'run0': ((368, 182, 532, 312), ()),
    'run1': ((362, 322, 532, 468), ()),
    'run2': ((C[0][0], R2[0], C[0][1], R2[1]), ()),
    'run3': ((534, 322, 704, 468), ()),
    'yawn': ((740, 182, 895, 338), ()),
    'pounce': ((900, 182, 1062, 338), ()),
    'coffee': ((C[0][0], R1[0], C[0][1], R1[1]), ('left', 'bottom')),
    'knocking': ((C[1][0], R1[0], C[1][1], R1[1]), ('left', 'bottom')),
    'birdWatching': ((C[2][0], R1[0], C[2][1], R1[1]), 'open'),
    'stretching': ((C[3][0], R1[0], C[3][1], R1[1]), ()),
    'begging': ((C[4][0], R1[0], C[4][1], R1[1]), ()),
    'tailChasing': ((C[5][0], R1[0], C[5][1], R1[1]), ()),
    'cursorHand': ((C[1][0], R2[0], C[1][1], R2[1]), ()),
    'scruff': ((C[3][0], R2[0], C[3][1], R2[1]), ()),
    'blush': ((C[5][0], R2[0], C[5][1], R2[1]), 'open'),
}


def main():
    im = Image.open(REF).convert('RGB')
    for name, (box, cut) in BOXES.items():
        if cut == 'open':
            c = clean(im.crop(box), open_bottom=True)
        else:
            c = clean(im.crop(box), cut=cut)
        c.save(os.path.join(SPR, f'{name}.png'))
        print(name, c.size)


if __name__ == '__main__':
    main()
