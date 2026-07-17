
## Что меняем

### 1. Слой данных — `src/data/applications.ts`
- В интерфейс `Application` добавить сырые поля `consentRaw: string` и `contractRaw: string` (сейчас они схлопываются в единое поле `consent: "Согласие: …"` / `"Договор: …"`, отдельно оригинал не сохранён).
- В `mapApplication` записать `consentRaw = app.consent ?? ""`, `contractRaw = app.contract ?? ""`.
- Экспортировать хелперы:
  - `hasBudgetConsent(app)` — `basis === "Бюджет"` и нормализованный `consentRaw` ∈ {`электронное`, `бумажное`} (trim + toLowerCase + свёртка пробелов).
  - `hasPaidContract(app)` — `basis === "Платное"` и нормализованный `contractRaw === "да"`.

### 2. Главная — `src/pages/Index.tsx`
- Посчитать `consentsCount = apps.filter(hasBudgetConsent).length` и `contractsCount = apps.filter(hasPaidContract).length`.
- В сетке KPI заменить карточку «Нужны данные» на новую **`ConfirmationsKpiCard`**:
  - Заголовок «Подтверждения Елисея».
  - Две строки: `Согласий: X` и `Договоров: Y`.
  - Обёрнута в `<Link to="/confirmations" target="_blank" rel="noopener">` — открывается в новой вкладке.
  - Визуально выделена (акцентная рамка/фон), сохраняем спокойный стиль дашборда.
- Старую метрику `missingData` («Нужны данные») перенести вниз страницы — новая секция **«Полнота данных»** отдельным спокойным блоком (`Card`, приглушённый), рядом с «Следующей контрольной точкой» или под ней. Никаких KPI-акцентов.

### 3. Новая страница — `src/pages/Confirmations.tsx`
- Загружает `getDashboardData()` (тот же паттерн, что `Index`/`Dynamics`).
- Считает два списка: `budgetConsents = apps.filter(hasBudgetConsent)`, `paidContracts = apps.filter(hasPaidContract)`.
- Две визуально разделённые секции (разные заголовки, разный акцент бейджа Бюджет/Платное, разделитель):
  - «Поданные согласия (бюджет)» — только если `budgetConsents.length > 0`.
  - «Заключённые договоры (платное)» — только если `paidContracts.length > 0`.
- Пустые секции не рендерятся вовсе. Если оба списка пусты — единое сообщение «Пока нет ни согласий, ни договоров».
- Карточка направления: вуз, конкурсная группа, приоритет, балл, общая позиция, тип подтверждения (`consentRaw`/`contractRaw`), ссылка «История» на `/dynamics?groupId=…`.
- Шапка страны в том же стиле, что `Dynamics`/`Changes`, с ссылкой «← На главную».

### 4. Роутинг — `src/App.tsx`
- Добавить `<Route path="/confirmations" element={<Confirmations />} />` и импорт.

## Уточнения / допущения
- Нормализация: `trim`, `toLowerCase`, свёртка внутренних пробелов; сравнение точно с `электронное`/`бумажное`/`да`. Значения типа «нет», «-», «—», пусто → не считаются. Если встретятся другие живые значения (напр. `Подано`) — расскажите, добавим.
- KPI-карточка открывается **в новой вкладке** (по ТЗ). Внутренняя навигация SPA при `target="_blank"` работать не будет — используем `<a href="/confirmations" target="_blank">` вместо `<Link>`, чтобы вкладка открылась корректно.
- Данные о согласии/договоре берём из тех же полей API (`consent`, `contract`), которые уже приходят в `ApiApplication`. Отдельных изменений в GAS не требуется.

## Файлы
- edit: `src/data/applications.ts`, `src/pages/Index.tsx`, `src/App.tsx`
- create: `src/pages/Confirmations.tsx`
