# Обновление read-only API: стоимость, приоритеты и полная динамика

В Apps Script откройте `Code.gs` и выполните три действия.

1. Замените текущую `doGet()`.
2. Замените `buildAdmissionApiPayload_()` и `registryRecordToApi_()`.
3. Добавьте остальные функции из блока ниже в конец файла.

После сохранения: **Deploy → Manage deployments → Edit → New version → Deploy**. Адрес `/exec` останется тем же.

API дополнительно отдаёт:

- `consentsAboveHigherPriority` — сколько абитуриентов выше Елисея с поданным согласием имеют приоритет конкурса выше, чем у Елисея;
- `contractsAboveHigherPriority` — сколько абитуриентов выше Елисея с договором имеют приоритет конкурса выше, чем у Елисея.

```javascript
function doGet(e) {
  const groupId = String(
    (e && e.parameter && e.parameter.groupId) || ''
  ).trim();

  const payload = groupId
    ? buildGroupHistoryPayload_(groupId)
    : buildAdmissionApiPayload_();

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
  const priority = apiNumber_(
    value('Приоритет', null)
  );
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

  const sourceFileId = String(
    value('Последний файл ID', '')
  ).trim();

  const activeAboveHigherPriority = countActiveAboveHigherPriority_(
    sourceFileId,
    basis,
    priority
  );

  return {
    id: record.id,
    groupId: record.id,
    university: record.university,
    basis: basis,
    group: record.name,
    priority: priority,
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
    consentsAboveHigherPriority: basis === 'Бюджет'
      ? activeAboveHigherPriority
      : null,
    consentRank: consentRank,
    contract: contract,
    contractsCount: apiNumber_(value('Договоров всего', null)),
    contractsAbove: apiNumber_(value('Договоров выше Елисея', null)),
    contractsAboveHigherPriority: basis === 'Платное'
      ? activeAboveHigherPriority
      : null,
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
      consentsAboveHigherPriority: item.consentsAboveHigherPriority,
      contractsCount: item.contractsCount,
      contractsAbove: item.contractsAbove,
      contractsAboveHigherPriority: item.contractsAboveHigherPriority,
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

  const sourceFileId = String(
    value('ID файла Drive', '')
  ).trim();

  const activeAboveHigherPriority = countActiveAboveHigherPriority_(
    sourceFileId,
    basis,
    null
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
    consentsAboveHigherPriority: basis === 'Бюджет'
      ? activeAboveHigherPriority
      : null,
    contractsCount: apiNumber_(value('Договоров всего', null)),
    contractsAbove: apiNumber_(value('Договоров выше Елисея', null)),
    contractsAboveHigherPriority: basis === 'Платное'
      ? activeAboveHigherPriority
      : null,
    seats: apiNumber_(value('Мест', null))
  };
}


function countActiveAboveHigherPriority_(fileId, basis, applicantPriority) {
  const knownPriority = apiNumber_(applicantPriority);

  if (knownPriority !== null && knownPriority <= 1) {
    return 0;
  }

  if (!fileId) {
    return null;
  }

  const rows = readSourceRowsByFileId_(fileId);

  if (!rows || rows.length < 2) {
    return null;
  }

  const header = rows[0];
  const participantIndex = headerIndexByNames_(header, [
    'ID участника',
    '№ абитуриента',
    'Номер абитуриента',
    'Абитуриент'
  ]);
  const priorityIndex = headerIndexByNames_(header, [
    'Приоритет конкурса',
    'Приоритет'
  ]);
  const activityIndex = basis === 'Бюджет'
    ? headerIndexByNames_(header, [
      'Подано согласие',
      'Согласие',
      'Согласие на зачисление'
    ])
    : headerIndexByNames_(header, [
      'Наличие договора',
      'Договор',
      'Заключён договор'
    ]);

  if (
    participantIndex === -1 ||
    priorityIndex === -1 ||
    activityIndex === -1
  ) {
    return null;
  }

  const activeRowsAbove = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (isApplicantId_(row[participantIndex])) {
      const targetPriority = knownPriority !== null
        ? knownPriority
        : apiNumber_(row[priorityIndex]);

      if (targetPriority === null) {
        return null;
      }

      if (targetPriority <= 1) {
        return 0;
      }

      return activeRowsAbove.filter(function (item) {
        return item.priority !== null &&
          item.priority < targetPriority &&
          item.active;
      }).length;
    }

    activeRowsAbove.push({
      priority: apiNumber_(row[priorityIndex]),
      active: isActiveForBasis_(basis, row[activityIndex])
    });
  }

  return null;
}


function readSourceRowsByFileId_(fileId) {
  try {
    readSourceRowsByFileId_.cache = readSourceRowsByFileId_.cache || {};

    if (readSourceRowsByFileId_.cache[fileId]) {
      return readSourceRowsByFileId_.cache[fileId];
    }

    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();
    let rows = null;

    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      rows = SpreadsheetApp
        .openById(fileId)
        .getSheets()[0]
        .getDataRange()
        .getValues();
    } else {
      const text = file.getBlob().getDataAsString('UTF-8');
      const delimiter = detectCsvDelimiter_(text);

      rows = Utilities.parseCsv(text, delimiter);
    }

    readSourceRowsByFileId_.cache[fileId] = rows;

    return rows;
  } catch (error) {
    return null;
  }
}


function detectCsvDelimiter_(text) {
  const firstLine = String(text || '').split(/\r?\n/)[0] || '';
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;

  candidates.forEach(function (delimiter) {
    const count = firstLine.split(delimiter).length;

    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  });

  return best;
}


function headerIndexByNames_(header, names) {
  const normalizedHeader = header.map(function (value) {
    return normalizeHeaderName_(value);
  });

  for (let i = 0; i < names.length; i++) {
    const normalizedName = normalizeHeaderName_(names[i]);
    const index = normalizedHeader.indexOf(normalizedName);

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}


function normalizeHeaderName_(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function isApplicantId_(value) {
  return String(value || '').replace(/\D/g, '') ===
    String(CFG.applicantId || '').replace(/\D/g, '');
}


function isActiveForBasis_(basis, value) {
  return basis === 'Бюджет'
    ? isConfirmedConsent_(value)
    : isConfirmedContract_(value);
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
```
