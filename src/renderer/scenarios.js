/* Готовые сценарии для кнопок-задач. Работают без ИИ и без интернета:
   кнопки на экране кот находит через системную «доступность» (src/locate.js).

   Шаг сценария:
     say      что кот говорит (одно действие, до 12 слов). {contact}, {drive} подставляются.
     find     что показать лапкой: { scope, name (регулярка), types }.
              scope: taskbar (панель задач / Dock), top (окно сверху), start (меню «Пуск»), proc:<имя программы>.
     wait     когда шаг сделан: { next: true } (появилась кнопка следующего шага), { top: 'регулярка программы' },
              { drive: true } (вставили флешку), { gone: true } (кнопка пропала), { focus: true } (курсор в поле),
              { titleChange: true } (у окна сменился заголовок), { find: {...} },
              { volumeUp: true } (звук стал громче), { volumeMax: true } (звук уже на максимуме),
              { any: [условия] } (хватит любого), { manual: true } (только кнопкой).
     sayNoContact что сказать, если имя контакта в настройках не задано.
     optional шаг можно пропустить, если кнопки нет (например, папки DCIM на флешке нет).
     open     «Открой за меня»: что открыть, если человек не справился (адрес или 'drive').
     skipIf   пропустить шаг, если условие уже выполнено (то же, что wait).
     btn      надпись на главной кнопке шага вместо «Сделал(а)» (ключ i18n), например 'g.next'.
*/
(function (root) {
  const BROWSERS = 'msedge|chrome|firefox|browser|yandex|opera|Safari|Google Chrome|Яндекс';

  const finder = (name, types = ['Button']) => ({ scope: 'proc:^Finder$', firstWindow: true, name, types });
  // Проводник Windows: только окно с папкой, рядом с котом других окон может быть много
  const explorer = (name, types = ['Button']) => ({ scope: 'proc:^explorer$', name, types });
  const SCENARIOS = [
    {
      id: 'files-learn', fileLesson: true, place: 'practice',
      match: /обуч.*(папк|файл|finder|проводник)|науч.*папк/i,
      skill: { ru: 'Папки, файлы и поиск', en: 'Folders, files and search' },
      words: 'обучение папки файлы проводник finder',
      mac: [
        { say: 'Нажми два раза на папку «Мои открытки».',
          find: finder('Мои открытки', ['ListItem']), wait: { filePlace: 'postcards' },
          hint: 'Это учебные файлы. Быстро нажми на название папки два раза.' },
        { say: 'Нажми стрелку «Назад» слева вверху.',
          find: finder('назад|back|previous'), wait: { filePlace: 'practice' },
          hint: 'Стрелка возвращает в предыдущую папку. Ещё можно нажать ⌘ и [.' },
        { say: 'Нажми два раза на «Привет от Пушика.txt».',
          find: finder('Привет от Пушика', ['ListItem']), wait: { top: 'TextEdit|Текстовый редактор|CotEditor|BBEdit|Code' },
          allowConfirm: true,
          hint: 'Откроется короткое письмо. Прочитай его и нажми «Сделал».' },
        { say: 'Вернёмся к учебной папке. Нажми «Открыть папку».',
          wait: { filePlace: 'practice', foreground: true }, openFolder: 'practice',
          hint: 'Документ можно оставить открытым: сейчас снова нужен Finder.' },
        { say: 'Нажми на лупу справа вверху окна Finder.',
          find: finder('поиск|search', ['Button', 'Edit']), wait: { focus: true },
          allowConfirm: true,
          hint: 'Если лупы нет, нажми ⌘ и F. Затем нажми «Сделал».' },
        { say: 'Напиши «Привет от Пушика» в строке поиска.',
          find: finder('поиск|search', ['Edit']), wait: { manual: true },
          hint: 'Если предлагается искать на всём Mac, выбери учебную папку. Когда увидишь файл, нажми «Нашёл файл».' },
      ],
      win: [
        { say: 'Это Проводник: в нём лежат папки и файлы. Нажми два раза на папку «Мои открытки».',
          find: explorer('^Мои открытки$', ['ListItem', 'DataItem']), wait: { filePlace: 'postcards' },
          hint: 'Это учебные файлы, их не жалко. Быстро нажми два раза левой кнопкой мыши.' },
        { say: 'Нажми стрелку «Назад» слева вверху окна.',
          find: explorer('^(Назад|Back)'), wait: { filePlace: 'practice' },
          hint: 'Стрелка влево возвращает в прошлую папку. Ещё можно нажать Alt и стрелку влево.' },
        { say: 'Нажми два раза на файл «Привет от Пушика».',
          find: explorer('Привет от Пушика', ['ListItem', 'DataItem']), wait: { top: 'notepad|Notepad|wordpad|winword|code' },
          allowConfirm: true,
          hint: 'Откроется короткое письмо. Прочитай его и нажми «Сделал».' },
        { say: 'Вернёмся к учебной папке. Нажми «Открыть папку».',
          wait: { filePlace: 'practice', foreground: true }, openFolder: 'practice',
          hint: 'Письмо можно не закрывать: сейчас снова нужен Проводник.' },
        { say: 'Нажми на строку поиска справа вверху окна, где лупа.',
          find: explorer('Поиск|Search', ['Edit']), wait: { focus: true }, allowConfirm: true,
          hint: 'Если строки не видно, нажми Ctrl и F. Затем нажми «Сделал».' },
        { say: 'Напиши в ней «Привет». Проводник сам покажет файл.',
          find: explorer('Поиск|Search', ['Edit']), wait: { manual: true },
          hint: 'Когда увидишь файл в списке, нажми «Нашёл файл».' },
      ],
      done: 'Мур! Ты потренировался открывать папки, возвращаться назад и искать файлы.',
    },
    {
      id: 'files-downloads', fileLesson: true, place: 'downloads',
      match: /скачан|загрузк|download/i,
      skill: { ru: 'Найти скачанный файл', en: 'Find a downloaded file' },
      words: 'скачанный скачал загрузки документ файл',
      mac: [
        { say: 'Это «Загрузки». Здесь обычно лежит скачанное из интернета.',
          find: finder('Загрузки|Downloads', ['ListItem']), wait: { manual: true },
          hint: 'Посмотри на имена файлов. Если нужного нет, поищем по названию.' },
        { say: 'Нажми на лупу справа вверху.',
          find: finder('поиск|search', ['Button', 'Edit']), wait: { focus: true }, allowConfirm: true,
          hint: 'Если лупы не видно, нажми ⌘ и F.' },
        { say: 'Напиши часть имени файла. Выбери поиск в «Загрузках».',
          find: finder('поиск|search', ['Edit']), wait: { manual: true },
          hint: 'Когда найдёшь файл, нажми «Нашёл файл». Если не помнишь имя, вернись назад и просмотри список.' },
        { say: 'Нажми два раза на найденный файл.', wait: { manual: true }, allowConfirm: true,
          hint: 'Нажми «Сделал», только если файл открылся. Если не вышло, я повторю подсказку.' },
      ],
      win: [
        { say: 'Это папка «Загрузки». Сюда попадает всё, что скачано из интернета.',
          find: explorer('^(Загрузки|Downloads)$', ['TreeItem', 'ListItem']), wait: { manual: true },
          hint: 'Посмотри на имена файлов. Самые новые обычно сверху. Если нужного нет, поищем по имени.' },
        { say: 'Нажми на строку поиска справа вверху, где лупа.',
          find: explorer('Поиск|Search', ['Edit']), wait: { focus: true }, allowConfirm: true,
          hint: 'Если строки не видно, нажми Ctrl и F.' },
        { say: 'Напиши часть имени файла.',
          find: explorer('Поиск|Search', ['Edit']), wait: { manual: true },
          hint: 'Когда найдёшь файл, нажми «Нашёл файл». Если не помнишь имя, просто просмотри список.' },
        { say: 'Нажми два раза на найденный файл.', wait: { manual: true }, allowConfirm: true,
          hint: 'Нажми «Сделал», когда файл откроется. Если не вышло, я повторю подсказку.' },
      ],
      done: 'Теперь ты знаешь, где искать скачанное и как открыть найденный файл.',
    },
    {
      // Обзор компьютера: кот показывает главное при первом запуске. Человек жмёт «Дальше».
      id: 'tour',
      match: /обзор|что где|покажи компьютер|tour/i,
      skill: { ru: 'Обзор компьютера', en: 'Computer tour' },
      words: 'обзор компьютера покажи компьютер',
      win: [
        { say: 'Это рабочий стол. На нём лежат значки программ и файлов', btn: 'g.next', wait: { manual: true } },
        { say: 'Это кнопка «Пуск». Через неё открываются все программы', btn: 'g.next', wait: { manual: true },
          find: { scope: 'taskbar', name: '^(Пуск|Start)$', types: ['Button'] } },
        { say: 'Внизу панель задач. Тут значки открытых программ: нажми, и окно появится', btn: 'g.next', wait: { manual: true },
          find: { scope: 'taskbar', name: 'Проводник|File Explorer|Edge|Chrome|Яндекс', types: ['Button', 'ListItem'] } },
        { say: 'Справа внизу часы, звук и интернет', btn: 'g.next', wait: { manual: true },
          find: { scope: 'taskbar', name: '\\d{1,2}:\\d{2}|Часы|Clock', types: ['Button', 'Text', 'Pane'] } },
        { say: 'У каждого окна справа вверху крестик. Он закрывает окно, если ты запутался', btn: 'g.next', wait: { manual: true },
          find: { scope: 'top', name: '^(Закрыть|Close)$', types: ['Button'] } },
      ],
      mac: [
        { say: 'Это рабочий стол. На нём лежат файлы и папки', btn: 'g.next', wait: { manual: true } },
        { say: 'Внизу Док. Тут значки программ: нажми один раз, и программа откроется', btn: 'g.next', wait: { manual: true },
          find: { scope: 'taskbar', name: 'Finder', types: ['Button'] } },
        { say: 'Вверху строка меню: справа там часы, звук и интернет', btn: 'g.next', wait: { manual: true } },
        { say: 'У каждого окна слева вверху красный кружок. Он закрывает окно', btn: 'g.next', wait: { manual: true } },
      ],
      done: 'Это самое главное! Всё остальное я покажу в «Уроках»',
    },
    {
      id: 'photos',
      match: /фото|флеш|картин|снимк|photo|usb|stick/i,
      skill: { ru: 'Посмотреть фото с флешки', en: 'View photos from a USB stick' },
      words: 'посмотреть фото фотографии картинки снимки с флешки флешка',
      win: [
        { say: 'Вставь флешку в ноутбук, в разъём сбоку', wait: { drive: true }, skipIf: { drive: true } },
        { say: 'Вижу флешку! Нажми на жёлтую папку внизу экрана',
          find: { scope: 'taskbar', name: 'Проводник|File Explorer|Explorer', types: ['Button', 'ListItem', 'MenuItem'] },
          wait: { top: '^explorer$' }, skipIf: { top: '^explorer$' }, open: 'drive' },
        { say: 'Слева найди флешку {drive} и нажми на неё один раз',
          find: { scope: 'top', name: '\\({drive}:\\)|{label}', types: ['TreeItem', 'ListItem'] },
          wait: { titleChange: true }, open: 'drive' },
        { say: 'Нажми два раза на папку с фотографиями', optional: true,
          find: { scope: 'top', name: '^(DCIM|Фото|Photos|Pictures|Изображения|Camera|Камера)', types: ['ListItem', 'DataItem'] },
          wait: { titleChange: true } },
        { say: 'Нажми два раза на любую картинку',
          find: { scope: 'top', name: '\\.(jpe?g|png|heic|bmp|gif)$|^(IMG|DSC|PXL|Photo|Фото)', types: ['ListItem', 'DataItem'] },
          wait: { top: '^(?!explorer$).+' } },
      ],
      mac: [
        { say: 'Вставь флешку в ноутбук, в разъём сбоку', wait: { drive: true }, skipIf: { drive: true } },
        { say: 'Вижу флешку! Нажми на синее улыбающееся лицо внизу экрана',
          find: { scope: 'taskbar', name: 'Finder', types: ['Button'] }, wait: { top: '^Finder$' }, open: 'drive' },
        { say: 'Слева найди флешку {label} и нажми на неё',
          find: { scope: 'top', name: '{label}', types: ['ListItem'] }, wait: { titleChange: true }, open: 'drive' },
        { say: 'Нажми два раза на любую картинку',
          find: { scope: 'top', name: '\\.(jpe?g|png|heic)$|^(IMG|DSC)', types: ['ListItem'] }, wait: { top: '^(Preview|Просмотр|Photos|Фото)$' } },
      ],
      done: 'Ура! Стрелочками справа и слева можно листать фото',
    },
    {
      id: 'call',
      match: /звон|позвон|видео|внук|внучк|whatsapp|ватсап|вотсап|call/i,
      skill: { ru: 'Позвонить по видео', en: 'Make a video call' },
      words: 'позвонить позвони звонок видео по видео видеозвонок другу подруге маме папе сыну дочке внуку внучке ватсап whatsapp',
      win: [
        { say: 'Нажми на зелёный кружок с трубкой внизу экрана',
          find: { scope: 'taskbar', name: 'WhatsApp', types: ['Button', 'ListItem'] },
          wait: { top: 'WhatsApp' }, skipIf: { top: 'WhatsApp' }, open: 'whatsapp:' },
        { say: 'Нажми на имя «{contact}» в списке слева', sayNoContact: 'Слева список людей. Нажми на того, кому хочешь позвонить',
          find: { scope: 'proc:WhatsApp', name: '{contact}', types: ['ListItem', 'Button', 'Text', 'DataItem'] },
          wait: { next: true } },
        { say: 'Нажми на камеру справа сверху',
          find: { scope: 'proc:WhatsApp', name: 'Видеозвонок|Video call|Видео', types: ['Button'] },
          wait: { gone: true } },
      ],
      mac: [
        { say: 'Нажми на зелёный кружок с трубкой внизу экрана',
          find: { scope: 'taskbar', name: 'WhatsApp', types: ['Button'] }, wait: { top: 'WhatsApp' }, skipIf: { top: 'WhatsApp' }, open: 'whatsapp:' },
        { say: 'Нажми на имя «{contact}» в списке слева', sayNoContact: 'Слева список людей. Нажми на того, кому хочешь позвонить',
          find: { scope: 'proc:WhatsApp', name: '{contact}', types: ['ListItem', 'Button', 'Text'] }, wait: { next: true } },
        { say: 'Нажми на камеру справа сверху',
          find: { scope: 'proc:WhatsApp', name: 'Видеозвонок|Video call|Видео', types: ['Button'] }, wait: { gone: true } },
      ],
      done: 'Звонок пошёл! Когда наговоришься, нажми красную трубку',
    },
    {
      id: 'search',
      match: /найти|найд|поиск|интернет|погод|рецепт|новост|сайт|search|internet/i,
      skill: { ru: 'Найти в интернете', en: 'Search the internet' },
      words: 'найти в интернете интернет поиск погода погоду новости рецепт',
      win: [
        { say: 'Нажми на цветной круглый значок браузера внизу экрана',
          find: { scope: 'taskbar', name: 'Edge|Chrome|Яндекс|Yandex|Firefox|Opera|Браузер', types: ['Button', 'ListItem'] },
          wait: { top: `^(${BROWSERS})$` }, skipIf: { top: `^(${BROWSERS})$` }, open: 'https://ya.ru' },
        { say: 'Нажми на длинную строку вверху окна',
          find: { scope: 'top', name: 'адрес|Address|поиск|Search|Введите', types: ['Edit', 'ComboBox'] },
          wait: { focus: true } },
        { say: 'Напечатай, что ищешь, например «погода», и нажми большую клавишу Enter',
          find: { scope: 'top', name: 'адрес|Address|поиск|Search|Введите', types: ['Edit', 'ComboBox'] },
          wait: { titleChange: true } },
      ],
      mac: [
        { say: 'Нажми на синий компас внизу экрана',
          find: { scope: 'taskbar', name: 'Safari|Chrome|Яндекс|Firefox', types: ['Button'] }, wait: { top: `^(${BROWSERS})$` }, skipIf: { top: `^(${BROWSERS})$` }, open: 'https://ya.ru' },
        { say: 'Нажми на длинную строку вверху окна',
          find: { scope: 'top', name: 'адрес|Address|поиск|Search|Smart', types: ['Edit'] }, wait: { focus: true } },
        { say: 'Напечатай, что ищешь, например «погода», и нажми большую клавишу Enter',
          find: { scope: 'top', name: 'адрес|Address|поиск|Search|Smart', types: ['Edit'] }, wait: { titleChange: true } },
      ],
      done: 'Нашлось! Колёсиком мышки можно листать страницу вниз',
    },
    {
      id: 'volume',
      match: /звук|громк|тихо|не слыш|volume|sound|louder/i,
      skill: { ru: 'Сделать звук громче', en: 'Turn the sound up' },
      words: 'сделать звук громче громкость погромче тихо не слышно',
      // кот сам меряет громкость системы и замечает, что стало громче
      win: [
        { say: 'Нажми на значок динамика внизу справа, рядом с часами',
          find: { scope: 'taskbar', name: 'Громк|Динамик|Volume|Speakers|Звук|Sound', types: ['Button', 'MenuItem'] },
          wait: { any: [{ next: true }, { volumeUp: true }] }, skipIf: { volumeMax: true }, open: 'ms-settings:sound' },
        { say: 'Потяни кружок на полоске вправо. Чем правее, тем громче',
          find: { scope: 'popup', name: 'Громк|Динамик|Volume|Speakers', types: ['Slider'] },
          wait: { volumeUp: true }, skipIf: { any: [{ volumeMax: true }, { volumeUp: true }] }, open: 'ms-settings:sound' },
      ],
      mac: [
        { say: 'Нажми клавишу с громким динамиком вверху клавиатуры. Каждое нажатие делает громче',
          wait: { volumeUp: true }, skipIf: { volumeMax: true } },
      ],
      done: 'Готово! Если стало слишком громко, потяни кружок обратно влево',
    },
    {
      id: 'bigger',
      match: /крупн|больш|буквы|шрифт|текст|не вижу|мелк|bigger|font|text/i,
      skill: { ru: 'Сделать буквы крупнее', en: 'Make text bigger' },
      words: 'сделать буквы крупнее больше шрифт текст мелко не вижу',
      win: [
        { say: 'Нажми на кнопку с четырьмя квадратиками внизу экрана',
          find: { scope: 'taskbar', name: '^(Пуск|Start)$', types: ['Button'] },
          wait: { find: { scope: 'start', name: 'Поиск|Search|Введите|Type', types: ['Edit'] } }, open: 'ms-settings:easeofaccess-display' },
        { say: 'Напечатай слова «размер текста»',
          wait: { find: { scope: 'start', name: 'Размер текста|Text size|Увеличить размер текста|Make text bigger', types: ['ListItem', 'Button', 'Text'] } },
          open: 'ms-settings:easeofaccess-display' },
        { say: 'Нажми на «Размер текста»',
          find: { scope: 'start', name: 'Размер текста|Text size|Увеличить размер текста|Make text bigger', types: ['ListItem', 'Button', 'Text'] },
          wait: { top: 'SystemSettings|ApplicationFrameHost' }, open: 'ms-settings:easeofaccess-display' },
        { say: 'Потяни кружок на полоске вправо',
          find: { scope: 'top', name: 'Размер текста|Text size|Увеличить', types: ['Slider'] },
          wait: { find: { scope: 'top', name: '^(Применить|Apply)$', types: ['Button'], enabled: true } } },
        { say: 'Нажми «Применить»',
          find: { scope: 'top', name: '^(Применить|Apply)$', types: ['Button'] },
          wait: { gone: true } },
      ],
      mac: [
        { say: 'Зажми клавишу ⌘ и нажми плюсик. Так буквы станут крупнее в браузере', wait: { manual: true } },
      ],
      done: 'Готово! Буквы стали крупнее. Если слишком крупно, подвинь кружок обратно',
    },
  ];

  // Слова, которые офлайн-распознаватель ждёт услышать (так он почти не ошибается).
  const COMMON = 'я хочу мне нужно помоги помогите пожалуйста как запутался запуталась не понимаю что делать котик';

  function grammar(extra = '') {
    const words = new Set(`${COMMON} ${SCENARIOS.map((s) => s.words).join(' ')} ${extra}`.toLowerCase().split(/\s+/).filter(Boolean));
    return [...words, '[unk]'];
  }

  // Какой сценарий подходит к тексту задачи («📞 Позвонить по видео» → call).
  function match(text) {
    const t = String(text || '');
    if (/запута|не понима|lost|confused/i.test(t)) return { id: 'lost' };
    // уроки про файлы точнее общего «найти в интернете»: «найти скачанный файл» — это файлы
    return SCENARIOS.find((s) => s.fileLesson && s.match.test(t)) || SCENARIOS.find((s) => s.match.test(t)) || null;
  }

  // уроки от простого к сложному
  const ORDER = ['tour', 'volume', 'bigger', 'search', 'call', 'photos', 'files-learn', 'files-downloads'];
  SCENARIOS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

  root.Scenarios = { list: SCENARIOS, match, grammar, byId: (id) => SCENARIOS.find((s) => s.id === id) };
})(window);
