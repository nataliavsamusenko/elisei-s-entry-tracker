# Быстрая история для страницы `/dynamics`

Страница `/dynamics` должна оставаться совместимой со старым ответом Apps Script:

```text
/exec?groupId=<ID группы>
```

Фронтенд продолжает ждать поля `snapshot`, `generalPosition` и `activeRank`. Поэтому быстрый обработчик не должен возвращать укороченный формат `date` / `position`: от него пропадают даты, первая/текущая позиция и график.

## Что меняется в Apps Script

В `doGet(e)` запрос с `groupId` нужно направлять сразу в быстрый обработчик:

```javascript
function doGet(e) {
  const groupId = String(
    e &&
    e.parameter &&
    e.parameter.groupId
      ? e.parameter.groupId
      : ''
  ).trim();

  const payload = groupId
    ? buildFastGroupHistoryPayload_(groupId)
    : buildAdmissionApiPayload_();

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

`buildFastGroupHistoryPayload_(groupId)` должен:

- читать только лист `Снимки`;
- фильтровать строки только по выбранному `groupId`;
- не запускать пересчёт, обновление `Реестр`, обновление `Дашборд`, чтение Drive или `buildCanonicalHistories_`;
- удалять дубли снимков по `Хеш содержимого`, а если хеша нет, по дате и общей позиции;
- кэшировать ответ через `CacheService` на 300 секунд по ключу `history:<groupId>`.

## Формат ответа

Быстрый ответ должен сохранять старую структуру:

```javascript
{
  groupId: 'SPBGEU-P-02',
  history: [
    {
      groupId: 'SPBGEU-P-02',
      snapshot: '05.07.2026 17:58:24',
      generalPosition: 795,
      activeRank: null,
      activeSource: 'Предварительно по общей позиции',
      generalChange: 'Лучше на 4',
      activeChange: 'Нет сопоставимой активной позиции',
      score: 194,
      priority: 2,
      status: 'Участвуете в конкурсе',
      consent: 'Не опубликовано',
      contract: 'Да',
      consentsCount: null,
      consentsAbove: null,
      consentsAboveHigherPriority: null,
      contractsCount: 611,
      contractsAbove: 610,
      contractsAboveHigherPriority: 42,
      seats: 432,
      gap: 'Ниже квоты на 363',
      zone: 'Резерв',
      recommendation: 'Следить за динамикой согласий или договоров.'
    }
  ]
}
```

Поля `consentsCount` и `contractsCount` тоже сохраняются, хотя они не были отдельно перечислены в задаче: текущая таблица истории использует их для строки «Согласия / договоры».

## Проверка после деплоя

После сохранения кода в Apps Script нужно сделать **Deploy → Manage deployments → Edit → New version → Deploy**. Затем на `/dynamics` проверить:

- даты списка отображаются в карточках, таблице и на оси графика;
- первая позиция отображается;
- текущая позиция отображается;
- график строится по общей и активной позиции;
- в Network запрос `exec?groupId=...` выполняется примерно за 1-3 секунды.
