# Обновление read-only API: стоимость и полная динамика

В Apps Script откройте `Code.gs` и выполните три действия.

1. Замените текущую `doGet()`.
2. Замените `buildAdmissionApiPayload_()` и `registryRecordToApi_()`.
3. Добавьте остальные функции из блока ниже в конец файла.

После сохранения: **Deploy → Manage deployments → Edit → New version → Deploy**. Адрес `/exec` останется тем же.

## Быстрый endpoint для страницы `/dynamics`

Для страницы динамики используйте отдельный лёгкий запрос:

```text
/exec?action=history&groupId=<ID группы>
```

Эта ветка `doGet(e)` должна:

- читать только лист `Снимки`;
- фильтровать строки только по выбранному `groupId`;
- возвращать короткий JSON с полями `date`, `position`, `score`, `priority`, `status`, `consentsAbove`, `consentsAboveHigherPriority`, `contractsAbove`, `contractsAboveHigherPriority`;
- не запускать пересчёт, обновление `Реестр`, обновление `Дашборд`, чтение Drive или `buildCanonicalHistories_`;
- кэшировать ответ через `CacheService` на 300 секунд по ключу `history:<groupId>`.

```javascript
function doGet(e) {
  const action = String(
    (e && e.parameter && e.parameter.action) || ''
  ).trim();

  const groupId = String(
    (e && e.parameter && e.parameter.groupId) || ''
  ).trim();

  let payload;

  if (action === 'history' && groupId) {
    payload = buildFastGroupHistoryPayload_(groupId);
  } else if (groupId) {
    payload = buildGroupHistoryPayload_(groupId);
  } else {
    payload = buildAdmissionApiPayload_();
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


function buildAdmissionApiPayload_() {
  const ss = SpreadsheetApp.openById(CFG.spreadsheetId);
  const registrySheet = ss.getSheetByName(CFG.sheets.registry);
  const registry = getRegistry_(registrySheet);
  const planByGroup = getPlanDataByGroup_(ss);

  const applications = registry.records.map(function (record) {
    return registryRecordToApi_(
      record,
      registry.headers,
      planByGroup[record.id] || null
    );
  });

  const received = applications.filter(function (item) {
    return item.hasList;
  });

  const budget = applications.filter(function (item) {
    return item.basis === 'Бюджет';
  });

  const paid = applications.filter(function (item) {
    return item.basis === 'Платное';
  });

  let latestSnapshot = '';
  let latestTime = 0;

  applications.forEach(function (item) {
    const time = apiTimestamp_(item.snapshot);

    if (time > latestTime) {
      latestTime = time;
      latestSnapshot = item.snapshot;
    }
  });

  return {
    meta: {
      candidateId: CFG.applicantId,
      lastUpdate: latestSnapshot || 'Нет обработанных списков',
      generatedAt: formatDateTime_(new Date()),
      stage: 'Автоматическое обновление CSV',
      totalGroups: applications.length,
      receivedTotal: received.length,
      budgetTotal: budget.length,
      budgetReceived: budget.filter(function (item) {
        return item.hasList;
      }).length,
      paidTotal: paid.length,
      paidReceived: paid.filter(function (item) {
        return item.hasList;
      }).length
    },
    applications: applications,
    coverage: buildCoverage_(applications),
    topBudget: getTopPositions_(applications, 'Бюджет', 5),
    topPaid: getTopPositions_(applications, 'Платное', 5)
  };
}


function registryRecordToApi_(record, headers, plan) {
  const value = function (name, fallback) {
    const index = headers[name];

    if (index === undefined) {
      return fallback;
    }

    const result = record.row[index];

    return (
      result === '' ||
      result === null ||
      result === undefined
    )
      ? fallback
      : result;
  };

  const basis = record.basis;
  const generalPosition = apiNumber_(
    value('Позиция общая', null)
  );

  const consent = String(
    value('Согласие Елисея', 'Не опубликовано')
  );

  const contract = String(
    value('Договор Елисея', 'Не опубликовано')
  );

  const consentRank = apiNumber_(
    value('Позиция по согласию', null)
  );

  const contractRank = apiNumber_(
    value('Позиция по договору', null)
  );

  let activeRank = null;
  let activeSource = 'Предварительно по общей позиции';

  if (
    basis === 'Бюджет' &&
    isConfirmedConsent_(consent) &&
    consentRank !== null
  ) {
    activeRank = consentRank;
    activeSource = 'По поданным согласиям';
  }

  if (
    basis === 'Платное' &&
    isConfirmedContract_(contract) &&
    contractRank !== null
  ) {
    activeRank = contractRank;
    activeSource = 'По заключённым договорам';
  }

  const registrySeats = apiNumber_(
    value('Мест', null)
  );

  const seats = plan && plan.seats !== null
    ? plan.seats
    : registrySeats;

  const snapshot = displayDateValue_(
    value('Дата последнего списка', '')
  );

  return {
    id: record.id,
    groupId: record.id,
    university: record.university,
    basis: basis,
    group: record.name,
    priority: apiNumber_(value('Приоритет', null)),
    score: apiNumber_(value('Балл Елисея', null)),
    position: generalPosition,
    generalPosition: generalPosition,
    activeRank: activeRank,
    rankForDisplay: activeRank !== null
      ? activeRank
      : generalPosition,
    activeSource: activeSource,
    seats: seats,
    status: String(value('Статус Елисея', 'Нет данных')),
    snapshot: snapshot,
    consent: consent,
    consentsCount: apiNumber_(value('Согласий всего', null)),
    consentsAbove: apiNumber_(value('Согласий выше Елисея', null)),
    consentRank: consentRank,
    contract: contract,
    contractsCount: apiNumber_(value('Договоров всего', null)),
    contractsAbove: apiNumber_(value('Договоров выше Елисея', null)),
    contractRank: contractRank,
    gap: String(value('Разрыв до места', 'Не рассчитано')),
    trend: String(value('Тренд', 'Не рассчитано')),
    generalChange: apiMovementText_(
      value('Изменение общей позиции', 'Первый снимок')
    ),
    activeChange: apiMovementText_(
      value('Изменение активной позиции', 'Нет сопоставимой активной позиции')
    ),
    zone: String(value('Зона', 'Не рассчитано')),
    recommendation: String(value('Рекомендация', '')),
    comment: String(value('Комментарий', '')),
    semesterFeeText: plan ? plan.semesterFeeText : null,
    dataReadiness: plan
      ? plan.dataReadiness
      : 'Места и стоимость не сопоставлены',
    needsClarification: plan
      ? plan.needsClarification
      : true,
    sourceNote: plan && plan.sourceNote
      ? plan.sourceNote
      : activeSource,
    hasList: Boolean(snapshot)
  };
}


function getPlanDataByGroup_(ss) {
  const sheet = ss.getSheetByName(CFG.sheets.plan);
  const result = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }

  const header = headers_(sheet).map;
  const idIndex = header['ID группы в трекере'];
  const budgetSeatsIndex = header['Мест (бюджет)'];
  const paidSeatsIndex = header['Мест (платных)'];
  const feeIndex = header['Стоимость за семестр, ₽'];
  const readinessIndex = header['Готовность данных'];
  const clarificationIndex = header['Нужно уточнение'];
  const commentIndex = header['Комментарий'];
  const statusIndex = header['Статус сопоставления'];

  if (idIndex === undefined) {
    return result;
  }

  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ids = splitExactGroupIds_(row[idIndex]);

    ids.forEach(function (groupId) {
      const isBudget = groupId.indexOf('-B-') !== -1;
      const seatsIndex = isBudget
        ? budgetSeatsIndex
        : paidSeatsIndex;

      const seats = seatsIndex === undefined
        ? null
        : numberOrNull_(row[seatsIndex]);

      const fee = feeIndex === undefined
        ? null
        : formatSemesterFee_(row[feeIndex]);

      const dataReadiness = readinessIndex === undefined
        ? ''
        : String(row[readinessIndex] || '').trim();

      const needsClarification = clarificationIndex === undefined
        ? false
        : normalize_(row[clarificationIndex]) === 'да';

      const comment = commentIndex === undefined
        ? ''
        : String(row[commentIndex] || '').trim();

      const mappingStatus = statusIndex === undefined
        ? ''
        : String(row[statusIndex] || '').trim();

      result[groupId] = {
        seats: seats,
        semesterFeeText: fee,
        dataReadiness: dataReadiness || 'Данные из плана мест',
        needsClarification: needsClarification,
        sourceNote: comment || mappingStatus || 'План мест'
      };
    });
  }

  return result;
}


function formatSemesterFee_(value) {
  const number = numberOrNull_(value);

  if (number === null) {
    return null;
  }

  return Math.round(number)
    .toLocaleString('ru-RU') + ' ₽';
}


function buildGroupHistoryPayload_(groupId) {
  const ss = SpreadsheetApp.openById(CFG.spreadsheetId);
  const snapshotsSheet = ss.getSheetByName(CFG.sheets.snapshots);
  const header = headers_(snapshotsSheet).map;
  const groupIndex = header['ID группы'];

  if (groupIndex === undefined) {
    return {
      groupId: groupId,
      history: []
    };
  }

  const planByGroup = getPlanDataByGroup_(ss);
  const plan = planByGroup[groupId] || null;
  const rows = snapshotsSheet.getDataRange().getValues();
  const unique = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (String(row[groupIndex] || '') !== groupId) {
      continue;
    }

    const item = snapshotRowToHistoryItem_(row, header, i + 1);
    const dedupeKey = item.hash
      ? 'hash|' + item.hash
      : 'fallback|' + item.snapshot + '|' + item.generalPosition;

    const existing = unique[dedupeKey];

    if (
      !existing ||
      item.sortDate > existing.sortDate ||
      (item.sortDate === existing.sortDate && item.rowNumber > existing.rowNumber)
    ) {
      unique[dedupeKey] = item;
    }
  }

  const ordered = Object.keys(unique)
    .map(function (key) {
      return unique[key];
    })
    .sort(function (a, b) {
      return a.sortDate - b.sortDate ||
        a.rowNumber - b.rowNumber;
    });

  let previous = null;

  const history = ordered.map(function (item) {
    const generalChange = previous
      ? apiRankMovement_(
        previous.generalPosition,
        item.generalPosition
      )
      : 'Первый снимок';

    const activeChange = previous
      ? apiRankMovement_(
        previous.activeRank,
        item.activeRank
      )
      : item.activeRank === null
        ? 'Активная позиция не сформирована'
        : 'Первый снимок';

    const snapshotSeats = item.seats;

    const result = {
      groupId: groupId,
      snapshot: item.snapshot,
      score: item.score,
      generalPosition: item.generalPosition,
      activeRank: item.activeRank,
      activeSource: item.activeSource,
      generalChange: generalChange,
      activeChange: activeChange,
      status: item.status,
      consentsCount: item.consentsCount,
      consentsAbove: item.consentsAbove,
      contractsCount: item.contractsCount,
      contractsAbove: item.contractsAbove,
      seats: snapshotSeats !== null
        ? snapshotSeats
        : plan
          ? plan.seats
          : null
    };

    previous = item;
    return result;
  });

  return {
    groupId: groupId,
    history: history
  };
}


function snapshotRowToHistoryItem_(row, header, rowNumber) {
  const value = function (name, fallback) {
    const index = header[name];

    if (index === undefined) {
      return fallback;
    }

    const result = row[index];

    return (
      result === '' ||
      result === null ||
      result === undefined
    )
      ? fallback
      : result;
  };

  const basis = String(value('Основа', ''));
  const consent = String(value('Согласие Елисея', ''));
  const contract = String(value('Договор Елисея', ''));
  const generalPosition = apiNumber_(
    value('Позиция общая', null)
  );

  let activeRank = null;
  let activeSource = 'Предварительно по общей позиции';

  const consentRank = apiNumber_(
    value('Позиция по согласию', null)
  );

  const contractRank = apiNumber_(
    value('Позиция по договору', null)
  );

  if (
    basis === 'Бюджет' &&
    isConfirmedConsent_(consent) &&
    consentRank !== null
  ) {
    activeRank = consentRank;
    activeSource = 'По поданным согласиям';
  }

  if (
    basis === 'Платное' &&
    isConfirmedContract_(contract) &&
    contractRank !== null
  ) {
    activeRank = contractRank;
    activeSource = 'По заключённым договорам';
  }

  const snapshot = displayDateValue_(
    value('Дата и время списка', '')
  );

  return {
    rowNumber: rowNumber,
    snapshot: snapshot,
    sortDate: snapshotSortDate_(snapshot, rowNumber),
    hash: String(value('Хеш содержимого', '')).trim(),
    score: apiNumber_(value('Балл Елисея', null)),
    generalPosition: generalPosition,
    activeRank: activeRank,
    activeSource: activeSource,
    status: String(value('Статус Елисея', 'Нет данных')),
    consentsCount: apiNumber_(value('Согласий всего', null)),
    consentsAbove: apiNumber_(value('Согласий выше Елисея', null)),
    contractsCount: apiNumber_(value('Договоров всего', null)),
    contractsAbove: apiNumber_(value('Договоров выше Елисея', null)),
    seats: apiNumber_(value('Мест', null))
  };
}


function apiRankMovement_(previousRank, currentRank) {
  if (previousRank === null || currentRank === null) {
    return 'Нет сопоставимой позиции';
  }

  const delta = previousRank - currentRank;

  if (delta > 0) {
    return 'Лучше на ' + delta;
  }

  if (delta < 0) {
    return 'Хуже на ' + Math.abs(delta);
  }

  return 'Без изменений';
}


function apiMovementText_(value) {
  const text = String(value || '').trim();

  if (!text || text === 'Первый снимок') {
    return text || 'Первый снимок';
  }

  if (/^\+\d+$/.test(text)) {
    return 'Лучше на ' + text.slice(1);
  }

  if (/^-\d+$/.test(text)) {
    return 'Хуже на ' + text.slice(1);
  }

  if (text === '0') {
    return 'Без изменений';
  }

  return text;
}


function buildFastGroupHistoryPayload_(groupId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'history:' + groupId;
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      // Если кэш повреждён, пересобираем ответ ниже.
    }
  }

  const ss = SpreadsheetApp.openById(CFG.spreadsheetId);
  const snapshotsSheet = ss.getSheetByName(CFG.sheets.snapshots);
  const payload = {
    groupId: groupId,
    history: []
  };

  if (!snapshotsSheet || snapshotsSheet.getLastRow() < 2) {
    cache.put(cacheKey, JSON.stringify(payload), 300);
    return payload;
  }

  const header = headers_(snapshotsSheet).map;
  const groupColumn = header['ID группы'];

  if (groupColumn === undefined) {
    cache.put(cacheKey, JSON.stringify(payload), 300);
    return payload;
  }

  const rows = snapshotsSheet.getDataRange().getValues();
  const unique = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (String(row[groupColumn] || '').trim() !== groupId) {
      continue;
    }

    const date = displayDateValue_(
      valueFromRow_(row, header, 'Дата и время списка', '')
    );

    const position = apiNumber_(
      valueFromRow_(row, header, 'Позиция общая', null)
    );

    const hash = String(
      valueFromRow_(row, header, 'Хеш содержимого', '')
    ).trim();

    const item = {
      rowNumber: i + 1,
      sortDate: snapshotSortDate_(date, i + 1),
      hash: hash,
      date: date,
      position: position,
      score: apiNumber_(valueFromRow_(row, header, 'Балл Елисея', null)),
      priority: apiNumber_(valueFromRow_(row, header, 'Приоритет', null)),
      status: String(valueFromRow_(row, header, 'Статус Елисея', 'Нет данных')),
      consentsAbove: apiNumber_(valueFromRow_(row, header, 'Согласий выше Елисея', null)),
      consentsAboveHigherPriority: apiNumber_(valueFromRow_(row, header, 'Согласий выше с более высоким приоритетом', null)),
      contractsAbove: apiNumber_(valueFromRow_(row, header, 'Договоров выше Елисея', null)),
      contractsAboveHigherPriority: apiNumber_(valueFromRow_(row, header, 'Договоров выше с более высоким приоритетом', null))
    };

    const dedupeKey = item.hash
      ? 'hash|' + item.hash
      : 'fallback|' + item.date + '|' + item.position;

    const existing = unique[dedupeKey];

    if (
      !existing ||
      item.sortDate > existing.sortDate ||
      (item.sortDate === existing.sortDate && item.rowNumber > existing.rowNumber)
    ) {
      unique[dedupeKey] = item;
    }
  }

  payload.history = Object.keys(unique)
    .map(function (key) {
      return unique[key];
    })
    .sort(function (first, second) {
      return first.sortDate - second.sortDate ||
        first.rowNumber - second.rowNumber;
    })
    .map(function (item) {
      return {
        date: item.date,
        position: item.position,
        score: item.score,
        priority: item.priority,
        status: item.status,
        consentsAbove: item.consentsAbove,
        consentsAboveHigherPriority: item.consentsAboveHigherPriority,
        contractsAbove: item.contractsAbove,
        contractsAboveHigherPriority: item.contractsAboveHigherPriority
      };
    });

  cache.put(cacheKey, JSON.stringify(payload), 300);

  return payload;
}
```
