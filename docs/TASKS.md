# Задачи

Обновлено: 10.11.2026.

Единая доска задач двух агентов. Правила работы — в `docs/COLLABORATION.md`.

## Как обновлять

- Каждый агент редактирует **только свою секцию**.
- Не переставлять чужие строки и не менять чужие ID.
- Новую задачу можно добавить только в свою секцию со статусом `PROPOSED`; это не разрешение начинать.
- В `TODO` задачу переводит пользователь или Агент A после согласования.
- При старте: `TODO` → `IN PROGRESS`, указать ветку и дату.
- При сдаче: `REVIEW`, указать commit и что проверено.
- После мержа Агент A ставит `DONE`.
- При проблеме: `BLOCKED` + причина.
- `PROPOSED` и `BACKLOG` не начинать без команды пользователя.

Статусы: `PROPOSED`, `TODO`, `IN PROGRESS`, `REVIEW`, `BLOCKED`, `DONE`, `BACKLOG`.

## Агент A

Сюда Агент A добавляет свои задачи и `PROPOSED`-идеи. Чужие строки не редактировать.

| ID | Задача | Статус | Ветка | Коммит / заметки |
|---|---|---|---|---|
| A-1 | Windows-тесты, `npm test`, CI, repository URL в `package.json` | DONE | `agent-a/A-1` | `efd2799` + `b61243d`: `path.posix` в песочнице; чтение `src/` от `__dirname`; `npm test`; CI (Ubuntu/Windows/macOS, Node 22) — success; URL `7grach/Desktop-Helper`; 24/24 pass |
| A-2 | Защита от мошенников: детект AnyDesk/TeamViewer/RustDesk и предупреждение кота | IN PROGRESS | `agent-a/A-2` | `src/remote-watch.js`, `src/main.js`, `src/preload.js`, `src/renderer/app.js`, `src/renderer/i18n.js`, `tools/test-remote-watch.js`; `package.json` не трогать до мержа B-3 |

> Для B-1: A-1 уже в `develop`. После rebase запускай `npm test` — все 24 проверки проходят, включая `test-ai-settings.js`.

## Агент B

Сюда Агент B добавляет свои задачи и `PROPOSED`-идеи. Если идея касается зоны Агента A (например, `package.json` или `src/main.js`), добавь её сюда с пометкой «для A» — секцию A редактировать нельзя.

| ID | Задача | Статус | Ветка | Коммит / заметки |
|---|---|---|---|---|
| B-1 | README: новый URL репозитория, npm 12/Electron, раздел тестов | DONE | `agent-b/B-1` | PR #1 merged: `8b765fa`; `npm test` 24/24, включая `test-ai-settings` после A-1; `package.json` не тронут |
| B-2 | Тесты на «Домик навыков» и открытку | DONE | `agent-b/B-2` | PR #2 merged: `376c9d7`; `npm test` 43/43 (24 старых + 19 новых) |
| B-3 | Тесты календаря и напоминаний | IN PROGRESS | `agent-b/B-3` | 10.11.2026 — старт; `tools/test-calendar.js`, `package.json`, `README.md`, `docs/TASKS.md`; без сети; `src/calendar.js` и `main.js` не менять без согласования; если найден баг — `PROPOSED` для A. `package.json` можно менять: A-2 не трогает его до мержа B-3 |

## Ближайший порядок

1. `A-1` — инфраструктура тестов и CI. DONE.
2. `B-1` — документация. DONE.
3. `B-2` — тесты «Домика навыков» и открытки. DONE.
4. `B-3` — тесты календаря и напоминаний; `A-2` — продуктовая фича. Можно параллельно: B-3 не трогает `src/`.

**Задачи в `TODO` не означают разрешение начинать: старт — по команде пользователя.**
