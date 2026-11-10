# AGENTS.md — правила для AI-агентов

Этот файл — основная инструкция для любого AI-агента, который работает с репозиторием «Пушик» (`Desktop-Helper`). Подробный процесс — в `docs/COLLABORATION.md`, список задач — в `docs/TASKS.md`.

## Проект

- Electron 33, чистый JavaScript, без сборки; приложение запускается из `src/`.
- Node.js 18 или новее.
- Запуск: `npm start`.
- Тесты: `node --test tools/test-file-help.js`, `node --test tools/test-screen-capture.js`, `node --test tools/test-ai-settings.js`.

## Перед началом работы

0. Если репозиторий только что склонирован, переключись на интеграционную ветку:
   ```powershell
   git switch develop
   git pull origin develop
   ```
   Если нет прав на push — сделай fork, инструкция в `docs/COLLABORATION.md`.
1. Прочитай `docs/COLLABORATION.md` и `docs/TASKS.md`.
2. Возьми задачу из своей секции. Если подходящей нет, можешь добавить новую в **свою** секцию со статусом `PROPOSED`; начинать её можно только после перевода в `TODO` пользователем или Агентом A.
3. Создай ветку от свежего `origin/develop`:
   ```powershell
   git fetch origin
   git switch -c agent-a/<task-id> origin/develop
   ```
   Для второго агента — `agent-b/<task-id>`.
4. Как можно раньше открой draft PR в `develop`, чтобы второй агент видел прогресс.

## Ветки и мерж

- `main` — стабильная ветка, `develop` — интеграционная.
- В `main` и `develop` напрямую не коммитить и не пушить.
- Одна задача — одна ветка и один PR.
- **Агент A** — интегратор: проверяет и мержит PR в `develop`, пушит `develop`.
- **Агент B** — работает только в своей ветке; в `develop` не мержит.
- Перед review: `git fetch origin`, `git rebase origin/develop`, прогнать тесты.

## Задачи и TODO

- Единый список задач — `docs/TASKS.md`.
- Каждый агент редактирует **только свою секцию** (A или B), не переставляет чужие строки.
- Любой агент может добавлять свои идеи только в свою секцию со статусом `PROPOSED`. Это не разрешение начинать.
- `PROPOSED` → `TODO` переводит пользователь или Агент A после согласования.
- Статусы: `PROPOSED` → `TODO` → `IN PROGRESS` → `REVIEW` → `DONE`; при проблеме — `BLOCKED`.
- При старте укажи ветку и дату; при review — commit и что проверено.

## Границы изменений

- Меняй только файлы своей задачи. Чужие файлы не рефактори без необходимости.
- Новые зависимости — только после согласования с пользователем.
- Не коммить `node_modules`, `assets/vosk`, `team.json`, `dist`.
- Если две задачи пересекаются по файлам — одна ждёт; напиши об этом в `docs/TASKS.md`.
- Не запускай `npm audit fix --force`: можно сломать `electron-builder`.

## Definition of Done

- Ветка от свежего `origin/develop`.
- Изменены только файлы задачи.
- Тесты проходят; если что-то не проходит — честно указано в PR и `docs/TASKS.md`.
- README/комментарии обновлены, если менялось поведение.
- `docs/TASKS.md` переведён в `REVIEW`.
- Нет секретов, `node_modules`, `assets/vosk`, `team.json`, `dist` в коммите.

## Окружение

```powershell
npm install
npm start
```

Если npm 12 не установил Electron и `electron.exe` отсутствует:

```powershell
node node_modules\electron\install.js
```

Известная проблема: `tools/test-ai-settings.js` на Windows даёт 5 падений из-за POSIX-путей в тестовом харнессе. Это исправляется в задаче `A-1`; до неё надёжные проверки — `test-file-help.js` и `test-screen-capture.js`.
