/* Новый кот: спрайт-листы 64×64 (design/cats/*.aseprite → assets/cats/*.png).
   Лист 14 кадров в ширину, одна анимация на строку. Подписи строк в design/cats/*_labeled.png.
   Важно: в подписях «Walk right/left» перепутаны местами, здесь всё названо по тому,
   куда кот смотрит на экране (L = влево, R = вправо). */
(function (root) {
  const SIZE = 64;
  const COLS = 14;
  const COLORS = ['ginger', 'white', 'black'];

  // Нижний край лап в каждой строке (px внутри кадра 64×64), чтобы кот стоял на полу ровно.
  const FEET = [48, 53, 55, 53, 48, 48, 46, 49, 60, 54, 48, 48, 48, 47, 48, 46, 53, 48, 48, 48, 48, 48, 48, 53, 51, 48,
    48, 47, 47, 56, 56, 51, 48, 48, 48, 48, 50, 50, 48, 48, 48, 48, 48, 48, 46, 46, 45, 45, 42, 42, 42, 42, 44, 44, 45,
    45, 53, 51, 48, 48, 48, 48, 52, 48, 48, 48];

  // row: строка листа; frames: номера кадров (по умолчанию 0..n-1); fps; once: проиграть один раз и замереть.
  const seq = (n) => Array.from({ length: n }, (_, i) => i);
  const A = {
    // статичные позы
    sitF: { row: 0, frames: [0] }, sitB: { row: 0, frames: [1] }, sitL: { row: 0, frames: [2] }, sitR: { row: 0, frames: [3] },
    standF: { row: 1, frames: [0] }, standB: { row: 1, frames: [1] }, standL: { row: 1, frames: [2] }, standR: { row: 1, frames: [3] },
    lieF_L: { row: 6, frames: [0] }, lieF_R: { row: 6, frames: [1] },
    sitTail: { row: 7, frames: [0] }, lieL: { row: 7, frames: [1] }, lieR: { row: 7, frames: [2] },
    // ходьба и бег
    walkDown: { row: 2, frames: seq(6), fps: 8 }, walkUp: { row: 3, frames: seq(6), fps: 8 },
    walkL: { row: 4, frames: seq(6), fps: 9 }, walkR: { row: 5, frames: seq(6), fps: 9 },
    runDown: { row: 8, frames: seq(4), fps: 11 }, runUp: { row: 9, frames: seq(4), fps: 11 },
    runR: { row: 10, frames: seq(5), fps: 12 }, runL: { row: 11, frames: seq(5), fps: 12 },
    // умывание, мяуканье, чесание
    lickSit: { row: 12, frames: seq(8), fps: 7 }, lickLie: { row: 13, frames: seq(8), fps: 7 },
    meowSit: { row: 14, frames: [0, 1, 2, 2, 1, 0], fps: 8 }, meowLie: { row: 15, frames: [0, 1, 2, 2, 1, 0], fps: 8 },
    meowStand: { row: 16, frames: [0, 1, 2, 2, 1, 0], fps: 8 },
    scratchL: { row: 17, frames: seq(8), fps: 10 }, scratchR: { row: 18, frames: seq(8), fps: 10 },
    // хвост
    wagSitF: { row: 19, frames: seq(5), fps: 6 }, wagSitB: { row: 20, frames: seq(5), fps: 6 },
    wagSitL: { row: 21, frames: seq(5), fps: 6 }, wagSitR: { row: 22, frames: seq(5), fps: 6 },
    wagStandF: { row: 23, frames: seq(5), fps: 6 }, wagStandB: { row: 24, frames: seq(5), fps: 6 },
    wagStandL: { row: 25, frames: seq(5), fps: 6 }, wagStandR: { row: 26, frames: seq(5), fps: 6 },
    wagLieL: { row: 27, frames: seq(3), fps: 4 }, wagLieR: { row: 28, frames: seq(3), fps: 4 },
    // взмах лапой: так кот показывает на кнопку и играет
    swipeStandF: { row: 29, frames: seq(11), fps: 12 }, swipeStandF2: { row: 30, frames: seq(11), fps: 12 },
    swipeStandB: { row: 31, frames: seq(5), fps: 8 },
    swipeStandL: { row: 32, frames: seq(11), fps: 12 }, swipeStandL2: { row: 33, frames: seq(11), fps: 12 },
    swipeStandR: { row: 34, frames: seq(11), fps: 12 }, swipeStandR2: { row: 35, frames: seq(11), fps: 12 },
    swipeSitF: { row: 36, frames: seq(11), fps: 12 }, swipeSitF2: { row: 37, frames: seq(11), fps: 12 },
    swipeSitB: { row: 38, frames: seq(5), fps: 8 },
    swipeSitL: { row: 39, frames: seq(11), fps: 12 }, swipeSitL2: { row: 40, frames: seq(11), fps: 12 },
    swipeSitR: { row: 41, frames: seq(11), fps: 12 }, swipeSitR2: { row: 42, frames: seq(11), fps: 12 },
    // зевок и сон (6 разных поз сна)
    yawn: { row: 43, frames: seq(7), fps: 6, once: true },
    sleep1L: { row: 44, frames: [0, 1], fps: 1.2 }, sleep1R: { row: 45, frames: [0, 1], fps: 1.2 },
    sleepBackL: { row: 46, frames: [0, 1], fps: 1.2 }, sleepBackR: { row: 47, frames: [0, 1], fps: 1.2 },
    sleep2L: { row: 48, frames: [0, 1], fps: 1.2 }, sleep2R: { row: 49, frames: [0, 1], fps: 1.2 },
    sleep3L: { row: 50, frames: [0, 1], fps: 1.2 }, sleep3R: { row: 51, frames: [0, 1], fps: 1.2 },
    sleep4L: { row: 52, frames: [0, 1], fps: 1.2 }, sleep4R: { row: 53, frames: [0, 1], fps: 1.2 },
    sleep5L: { row: 54, frames: [0, 1], fps: 1.2 }, sleep5R: { row: 55, frames: [0, 1], fps: 1.2 },
    // еда, шипение, прыжки, стойка на задних лапах
    eatF: { row: 56, frames: seq(10), fps: 8 }, eatB: { row: 57, frames: seq(8), fps: 8 },
    eatL: { row: 58, frames: seq(10), fps: 8 }, eatR: { row: 59, frames: seq(10), fps: 8 },
    hissL: { row: 60, frames: [0, 1], fps: 4 }, hissR: { row: 61, frames: [0, 1], fps: 4 },
    jumpB: { row: 62, frames: seq(3), fps: 6 }, jumpL: { row: 63, frames: seq(5), fps: 8 }, jumpR: { row: 64, frames: seq(5), fps: 8 },
    hind: { row: 65, frames: [0, 1, 2, 3, 2, 1], fps: 6 },
  };

  // dirAnim('walk', -1) → 'walkL'
  const dirAnim = (base, dir) => `${base}${dir < 0 ? 'L' : 'R'}`;

  class CatSprite {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = SIZE;
      canvas.height = SIZE;
      this.ctx.imageSmoothingEnabled = false;
      this.sheets = {};
      this.color = 'white';
      this.shown = '';
    }

    setColor(color, base) {
      if (!COLORS.includes(color)) color = 'white';
      this.color = color;
      if (!this.sheets[color]) {
        const img = new Image();
        img.src = `${base}${color}.png`;
        this.sheets[color] = img;
      }
      this.shown = '';
    }

    // t: время от начала анимации в мс. Возвращает true, если анимация once закончилась.
    draw(name, t) {
      const a = A[name] || A.sitF;
      const fps = a.fps || 1;
      let i = Math.floor((t / 1000) * fps);
      const done = a.once && i >= a.frames.length;
      i = a.once ? Math.min(i, a.frames.length - 1) : i % a.frames.length;
      this.frame(a.row, a.frames[i]);
      return done;
    }

    // Нарисовать конкретный кадр (для прыжка, где кадр зависит от фазы полёта).
    frame(row, col) {
      const img = this.sheets[this.color];
      const key = `${this.color}:${row}:${col}`;
      if (!img || !img.complete || !img.naturalWidth || key === this.shown) return;
      this.shown = key;
      const dy = SIZE - FEET[row] - 2; // ставим лапы на нижний край холста
      this.ctx.clearRect(0, 0, SIZE, SIZE);
      this.ctx.drawImage(img, col * SIZE, row * SIZE, SIZE, SIZE, 0, dy, SIZE, SIZE);
    }
  }

  root.Cats = { A, COLORS, SIZE, COLS, dirAnim, CatSprite };
})(window);
