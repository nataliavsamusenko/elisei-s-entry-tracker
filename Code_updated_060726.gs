const CFG = {
  spreadsheetId: '18KEBrRA2QNFo3_1eq1acPYj_m1Nq__gXugmAOh4z29E',
  applicantId: '1431604',
  rootFolderId: '12SbS6N5dICiOkG5R4YS8b-E3XknSnY_Z',
  maxSnapshotsPerGroup: 20,
  applicantRebuildBatchSize: 6,

  sheets: {
    dashboard: 'Дашборд',
    registry: 'Реестр',
    snapshots: 'Снимки',
    changes: 'Изменения',
    journal: 'Журнал файлов',
    plan: 'План мест',
    state: 'CSV_состояние',
    allApplications: 'Все заявления',
    applicants: 'Поступающие',
    applicationsStaging: 'Все заявления_сборка'
  },

  ignoredFolders: ['планы мест'],

  planUseModes: [
    'Использовать сразу',
    'Использовать один раз для группы, не суммировать профили'
  ]
};


/* =========================================================
   МЕНЮ И ОСНОВНЫЕ ФУНКЦИИ
   ========================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Трекер поступления')
    .addItem('Обновить данные и Дашборд', 'scanNewLists')
    .addItem('Пересобрать Дашборд', 'refreshDashboardAndApi')
    .addItem('Дозаполнить текущие CSV', 'backfillCurrentLists')
    .addItem('Пересчитать изменения списков', 'backfillChangeMetrics')
    .addSeparator()
    .addItem('Начать сбор карты поступающих', 'startApplicantsRebuild')
    .addItem('Продолжить сбор карты поступающих', 'continueApplicantsRebuild')
    .addSeparator()
    .addItem('Включить обновление раз в час', 'createAutomaticUpdateTrigger')
    .addItem('Выключить обновление раз в час', 'deleteAutomaticUpdateTrigger')
    .addItem('Проверить API в журнале', 'testApi')
    .addToUi();
}


function initializeTracker() {
  const props = PropertiesService.getScriptProperties();

  if (!props.getProperty('STARTED_AT')) {
    props.setProperty('STARTED_AT', String(new Date().getTime()));
  }
}


function upgradeToV2() {
  const props = PropertiesService.getScriptProperties();

  props.setProperty('TRACKER_V2_READY', '1');

  SpreadsheetApp.openById(CFG.spreadsheetId).toast(
    'Базовая настройка уже активна.',
    'Трекер поступления',
    5
  );
}


/**
 * Быстро дочитывает CSV, которые уже попали в журнал,
 * но ещё отсутствуют в листе «Снимки».
 */
function backfillCurrentLists() {
  runTrackerUpdate_({
    mode: 'missingSnapshots',
    showToast: true
  });
}


/**
 * Обрабатывает новые или изменённые CSV,
 * обновляет сравнение позиций, Реестр и Дашборд.
 */
function scanNewLists() {
  runTrackerUpdate_({
    mode: 'incremental',
    showToast: true
  });
}


/**
 * Запускается триггером один раз в час.
 */
function runScheduledUpdate() {
  runTrackerUpdate_({
    mode: 'incremental',
    showToast: false
  });
}


/**
 * Пересобирает Реестр, сравнения, API и Дашборд
 * без повторного чтения CSV.
 */
function refreshDashboardAndApi() {
  withLock_(function () {
    const ss = SpreadsheetApp.openById(CFG.spreadsheetId);

    ensureSchemas_(ss);
    syncSeatsFromPlan_(ss);
    refreshComparisonsAndRegistry_(ss);
    refreshGoogleDashboard_(ss);

    SpreadsheetApp.flush();

    ss.toast(
      'Реестр, динамика и Дашборд обновлены.',
      'Трекер поступления',
      8
    );
  });
}


/**
 * Создаёт один автоматический запуск каждый час.
 */
function createAutomaticUpdateTrigger() {
  const handlers = [
    'scanNewLists',
    'runScheduledUpdate'
  ];

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runScheduledUpdate')
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.openById(CFG.spreadsheetId).toast(
    'Автоматическое обновление включено: один раз в час.',
    'Трекер поступления',
    8
  );
}


/**
 * Удаляет автоматические часовые запуски,
 * чтобы ручное восстановление не конфликтовало с триггером.
 */
function deleteAutomaticUpdateTrigger() {
  const handlers = [
    'scanNewLists',
    'runScheduledUpdate'
  ];

  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  SpreadsheetApp.openById(CFG.spreadsheetId).toast(
    removed
      ? 'Автоматическое обновление выключено. Удалено триггеров: ' + removed + '.'
      : 'Автоматических триггеров обновления не найдено.',
    'Трекер поступления',
    8
  );
}


/**
 * Проверка доступа к исходной папке.
 */
function testConnection() {
  const files = getAllCsvFiles_();
  const ss = SpreadsheetApp.openById(CFG.spreadsheetId);

  const sample = files.slice(0, 8).map(function (item) {
    const context = getFolderContext_(item.pathNames);

    return (
      (context
        ? context.university + ' · ' + context.basis
        : 'Не распознана папка') +
      ' — ' +
      item.file.getName()
    );
  });

  ss.toast(
    'Найдено CSV: ' + files.length + '\n' + sample.join('\n'),
    'Проверка подключения',
    15
  );
}


/**
 * Выводит в журнал API текущего состояния.
 */
function testApi() {
  Logger.log(
    JSON.stringify(buildAdmissionApiPayload_(), null, 2)
  );
}


/**
 * Read-only API для Lovable.
 *
 * /exec
 *   Текущее состояние всех групп.
 *
 * /exec?groupId=SPBGUPTD-P-03
 *   Быстрая история снимков конкретной группы в формате страницы динамики.
 *
 * /exec?action=history&groupId=SPBGUPTD-P-03
 *   Тот же быстрый ответ; оставлено для совместимости.
 *
 * /exec?action=changes
 *   Готовые изменения списков без чтения Drive.
 *
 * /exec?action=applicants
 *   Сводный обезличенный список поступающих с фильтрами.
 *
 * /exec?action=applicant&profileKey=...
 *   Карточка поступающего по безопасному ключу профиля.
 *
 * /exec?action=applicant&applicantId=1234567
 *   Точный поиск карточки по коду поступающего.
 */
function doGet(e) {
  const params =
    e &&
    e.parameter
      ? e.parameter
      : {};

  const action = String(
    params.action || ''
  ).trim();

  const groupId = String(
    params.groupId
      ? params.groupId
      : ''
  ).trim();

  let payload;

  if (action === 'changes') {
    payload = buildChangesPayload_(params);
  } else if (action === 'applicants') {
    payload = buildApplicantsPayload_(params);
  } else if (action === 'applicant') {
    payload = buildApplicantProfilePayload_(params);
  } else if (groupId) {
    payload = buildFastGroupHistoryPayload_(groupId);
  } else {
    payload = buildAdmissionApiPayload_();
  }

  return ContentService
    .createTextOutput(
      JSON.stringify(payload)
    )
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================================================
   ЕДИНЫЙ ЦИКЛ ОБНОВЛЕНИЯ
   ========================================================= */

function runTrackerUpdate_(options) {
  withLock_(function () {
    const ss = SpreadsheetApp.openById(CFG.spreadsheetId);

    ensureSchemas_(ss);
    syncSeatsFromPlan_(ss);

    const result = processCsvFiles_(ss, options.mode);

    refreshComparisonsAndRegistry_(ss);
    refreshGoogleDashboard_(ss);

    SpreadsheetApp.flush();

    if (options.showToast) {
      ss.toast(
        'Проверено CSV: ' + result.checked +
        '. Новых снимков: ' + result.added +
        '. Обновлено снимков: ' + result.updated +
        '. Дубликатов: ' + result.duplicate +
        '. Требуют сопоставления: ' + result.unmatched +
        '. Без Елисея: ' + result.applicantNotFound +
        '. Ошибок: ' + result.errors + '.',
        'Обработка завершена',
        15
      );
    }
  });
}


/* =========================================================
   ОБРАБОТКА CSV
   ========================================================= */

function processCsvFiles_(ss, mode) {
  const registrySheet = ss.getSheetByName(CFG.sheets.registry);
  const snapshotsSheet = ss.getSheetByName(CFG.sheets.snapshots);
  const journalSheet = ss.getSheetByName(CFG.sheets.journal);
  const stateSheet = ss.getSheetByName(CFG.sheets.state);

  const registry = getRegistry_(registrySheet);
  let snapshotIndex = buildSnapshotIndex_(snapshotsSheet);
  const known = getKnownKeys_(stateSheet);
  const applicationUpdates = {};

  const result = {
    checked: 0,
    added: 0,
    updated: 0,
    duplicate: 0,
    unmatched: 0,
    applicantNotFound: 0,
    errors: 0
  };

  getAllCsvFiles_().forEach(function (item) {
    result.checked++;

    try {
      const file = item.file;
      const text = getFileText_(file);
      const hash = makeHash_(text);
      const context = getFolderContext_(item.pathNames);

      if (!context) {
        const unknownKey =
          'UNKNOWN_FOLDER|' +
          normalize_(item.path) +
          '|' +
          hash;

        if (!known[unknownKey]) {
          appendJournal_(journalSheet, {
            context: null,
            group: null,
            file: file,
            hash: hash,
            key: unknownKey,
            path: item.path,
            extracted: 'Нет',
            added: 'Нет',
            mode: 'Папка не распознана',
            comment:
              'Название папки не содержит одновременно вуз и основу: бюджет или платное.'
          });

          appendState_(stateSheet, stateRow_(
            unknownKey,
            file,
            hash,
            item.path,
            'Папка не распознана'
          ));

          known[unknownKey] = true;
        }

        result.unmatched++;
        return;
      }

      const group = findGroup_(registry, context, file.getName());

      if (!group) {
        const unmatchedKey =
          'UNMATCHED|' +
          context.key +
          '|' +
          normalize_(item.path) +
          '|' +
          hash;

        if (!known[unmatchedKey]) {
          appendJournal_(journalSheet, {
            context: context,
            group: null,
            file: file,
            hash: hash,
            key: unmatchedKey,
            path: item.path,
            extracted: 'Нет',
            added: 'Нет',
            mode: 'Требует сопоставления',
            comment:
              'CSV не сопоставлен с конкурсной группой в листе «Реестр».'
          });

          appendState_(stateSheet, stateRow_(
            unmatchedKey,
            file,
            hash,
            item.path,
            'Требует сопоставления'
          ));

          known[unmatchedKey] = true;
        }

        result.unmatched++;
        return;
      }

      const dedupeKey = makeDedupeKey_(
        context,
        group,
        item.path,
        hash
      );

      const existingSnapshot = findSnapshotByHash_(
        snapshotIndex,
        group.id,
        hash
      );

      if (
        mode === 'incremental' &&
        (known[dedupeKey] || existingSnapshot)
      ) {
        if (!known[dedupeKey]) {
          appendState_(stateSheet, stateRow_(
            dedupeKey,
            file,
            hash,
            item.path,
            'Уже есть снимок'
          ));

          known[dedupeKey] = true;
        }

        result.duplicate++;
        return;
      }

      if (
        mode === 'missingSnapshots' &&
        existingSnapshot
      ) {
        if (!known[dedupeKey]) {
          appendState_(stateSheet, stateRow_(
            dedupeKey,
            file,
            hash,
            item.path,
            'Уже есть снимок'
          ));

          known[dedupeKey] = true;
        }

        result.duplicate++;
        return;
      }

      queueApplicationGroupUpdate_(
        applicationUpdates,
        registry,
        group,
        file,
        text,
        item.path,
        hash
      );

      const parsed = parseApplicant_(text);

      if (!parsed || !parsed.candidate) {
        if (!known[dedupeKey]) {
          appendJournal_(journalSheet, {
            context: context,
            group: group,
            file: file,
            hash: hash,
            key: dedupeKey,
            path: item.path,
            extracted: 'Нет',
            added: 'Нет',
            mode: 'Абитуриент не найден',
            comment:
              'Абитуриент №' + CFG.applicantId +
              ' не найден в CSV либо не распознаны заголовки.'
          });

          appendState_(stateSheet, stateRow_(
            dedupeKey,
            file,
            hash,
            item.path,
            'Абитуриент не найден'
          ));

          known[dedupeKey] = true;
        }

        result.applicantNotFound++;
        return;
      }

      const values = buildSnapshotValues_(
        registry,
        group,
        parsed,
        file,
        item.path,
        hash
      );

      if (existingSnapshot) {
        updateRowByHeaders_(
          snapshotsSheet,
          existingSnapshot.rowNumber,
          values
        );

        result.updated++;
      } else {
        appendSnapshot_(snapshotsSheet, values);

        snapshotIndex = buildSnapshotIndex_(snapshotsSheet);

        result.added++;
      }

      if (!known[dedupeKey]) {
        appendState_(stateSheet, stateRow_(
          dedupeKey,
          file,
          hash,
          item.path,
          existingSnapshot
            ? 'Обновлён существующий снимок'
            : 'Обработан'
        ));

        known[dedupeKey] = true;
      }

      if (mode !== 'missingSnapshots') {
        try {
          upsertChangeMetricsForCurrentSnapshot_(
            ss,
            snapshotsSheet,
            group,
            file,
            text,
            hash
          );
        } catch (changeError) {
          Logger.log(
            'Ошибка расчёта изменений для ' +
            group.id +
            ': ' +
            String(changeError)
          );
        }
      }

      if (!existingSnapshot) {
        appendJournal_(journalSheet, {
          context: context,
          group: group,
          file: file,
          hash: hash,
          key: dedupeKey,
          path: item.path,
          extracted: 'Да',
          added: 'Да',
          mode: 'Новый или изменённый CSV',
          comment:
            'Согласий: ' +
            valueOrText_(
              parsed.stats.consentsCount,
              'не опубликовано'
            ) +
            '; договоров: ' +
            valueOrText_(
              parsed.stats.contractsCount,
              'не опубликовано'
            ) +
            '.'
        });
      }

    } catch (error) {
      result.errors++;

      appendJournal_(journalSheet, {
        context: null,
        group: null,
        file: item.file,
        hash: '',
        key: 'ERROR|' + item.file.getId(),
        path: item.path,
        extracted: 'Нет',
        added: 'Нет',
        mode: 'Ошибка обработки CSV',
        comment: String(error)
      });
    }
  });

  trimSnapshots_(snapshotsSheet);
  applyApplicationGroupUpdates_(ss, applicationUpdates);

  return result;
}


/* =========================================================
   ПЛАН МЕСТ, СТОИМОСТЬ И ГОТОВНОСТЬ ДАННЫХ
   ========================================================= */

function syncSeatsFromPlan_(ss) {
  const planByGroup = getPlanDataByGroup_(ss);
  const registrySheet = ss.getSheetByName(CFG.sheets.registry);

  if (!registrySheet) {
    return;
  }

  const registryHeader = headers_(registrySheet);
  const idColumn = registryHeader.map['ID'];
  const seatsColumn = registryHeader.map['Мест'];

  if (
    idColumn === undefined ||
    seatsColumn === undefined
  ) {
    return;
  }

  const registryData = registrySheet.getDataRange().getValues();
  let changed = false;

  for (let i = 1; i < registryData.length; i++) {
    const groupId = String(
      registryData[i][idColumn] || ''
    ).trim();

    const plan = planByGroup[groupId];

    if (
      !groupId ||
      !plan ||
      plan.seats === null
    ) {
      continue;
    }

    if (
      numberOrNull_(registryData[i][seatsColumn]) !==
      plan.seats
    ) {
      registryData[i][seatsColumn] = plan.seats;
      changed = true;
    }
  }

  if (changed) {
    registrySheet
      .getRange(
        1,
        1,
        registryData.length,
        registryData[0].length
      )
      .setValues(registryData);
  }
}


/**
 * Возвращает данные «Плана мест» для каждого полного ID группы.
 *
 * Используются только строки с правилами:
 * - «Использовать сразу»
 * - «Использовать один раз для группы, не суммировать профили»
 */
function getPlanDataByGroup_(ss) {
  const sheet = ss.getSheetByName(CFG.sheets.plan);
  const result = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }

  const header = headers_(sheet).map;
  const idColumn = header['ID группы в трекере'];
  const budgetSeatsColumn = header['Мест (бюджет)'];
  const paidSeatsColumn = header['Мест (платных)'];
  const useColumn = header['Как использовать в дашборде'];
  const feeColumn = header['Стоимость за семестр, ₽'];
  const readinessColumn = header['Готовность данных'];
  const clarificationColumn = header['Нужно уточнение'];
  const commentColumn = header['Комментарий'];
  const mappingStatusColumn = header['Статус сопоставления'];

  if (idColumn === undefined) {
    return result;
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const useRule = useColumn === undefined
      ? ''
      : String(row[useColumn] || '').trim();

    if (
      useRule &&
      CFG.planUseModes.indexOf(useRule) === -1
    ) {
      continue;
    }

    const ids = splitExactGroupIds_(
      row[idColumn]
    );

    ids.forEach(function (groupId) {
      const isBudget =
        groupId.indexOf('-B-') !== -1;

      const seatsColumn = isBudget
        ? budgetSeatsColumn
        : paidSeatsColumn;

      const seats = seatsColumn === undefined
        ? null
        : numberOrNull_(row[seatsColumn]);

      const fee = feeColumn === undefined
        ? null
        : formatSemesterFee_(
          row[feeColumn]
        );

      const readiness = readinessColumn === undefined
        ? ''
        : String(
          row[readinessColumn] || ''
        ).trim();

      const needsClarification =
        clarificationColumn !== undefined &&
        normalize_(row[clarificationColumn]) === 'да';

      const comment = commentColumn === undefined
        ? ''
        : String(
          row[commentColumn] || ''
        ).trim();

      const mappingStatus =
        mappingStatusColumn === undefined
          ? ''
          : String(
            row[mappingStatusColumn] || ''
          ).trim();

      result[groupId] = {
        seats: seats,
        semesterFeeText: fee,
        dataReadiness:
          readiness ||
          'Данные из плана мест',
        needsClarification: needsClarification,
        sourceNote:
          comment ||
          mappingStatus ||
          'План мест'
      };
    });
  }

  return result;
}


function formatSemesterFee_(value) {
  const amount = numberOrNull_(value);

  if (amount === null) {
    return null;
  }

  return Math.round(amount)
    .toLocaleString('ru-RU') +
    ' ₽';
}


function splitExactGroupIds_(value) {
  return String(value || '')
    .split('/')
    .map(function (part) {
      return String(part).trim();
    })
    .filter(function (id) {
      return /^[A-Z]+-[BP]-\d{2}$/.test(id);
    });
}


/* =========================================================
   СРАВНЕНИЕ СНИМКОВ И ОБНОВЛЕНИЕ РЕЕСТРА
   ========================================================= */

/**
 * Создаёт полную хронологию по каждой группе.
 * Одинаковое содержимое CSV учитывается только один раз:
 * это устраняет влияние старых дублей снимков.
 */
function refreshComparisonsAndRegistry_(ss) {
  const registrySheet = ss.getSheetByName(CFG.sheets.registry);
  const snapshotsSheet = ss.getSheetByName(CFG.sheets.snapshots);

  const registry = getRegistry_(registrySheet);
  const planByGroup = getPlanDataByGroup_(ss);

  const histories = buildCanonicalHistories_(
    snapshotsSheet,
    planByGroup
  );

  Object.keys(histories).forEach(function (groupId) {
    const history = histories[groupId];

    history.forEach(function (item) {
      updateRowByHeaders_(
        snapshotsSheet,
        item.rowNumber,
        {
          'Мест': item.seats === null
            ? 'Не указано'
            : item.seats,

          'Приоритет':
            valueOrBlank_(item.priority),

          'Согласий выше с более высоким приоритетом':
            item.basis === 'Бюджет'
              ? valueOrText_(
                item.consentsAboveHigherPriority,
                'Не опубликовано'
              )
              : '—',

          'Договоров выше с более высоким приоритетом':
            item.basis === 'Платное'
              ? valueOrText_(
                item.contractsAboveHigherPriority,
                'Не опубликовано'
              )
              : '—',

          'Разрыв до места':
            item.decision.gap,

          'Зона':
            item.decision.zone,

          'Рекомендация':
            item.decision.recommendation,

          'Активная позиция':
            valueOrText_(
              item.positionInfo.rankForDisplay,
              'Не опубликовано'
            ),

          'Источник активности':
            item.positionInfo.source,

          'Предыдущая общая позиция':
            valueOrBlank_(
              item.comparison.previousGeneral
            ),

          'Изменение общей позиции':
            item.comparison.generalChange,

          'Предыдущая активная позиция':
            valueOrBlank_(
              item.comparison.previousActive
            ),

          'Изменение активной позиции':
            item.comparison.activeChange,

          'Комментарий к сравнению':
            item.comparison.note,

          'Тренд к прошлому списку':
            item.comparison.generalTrend
        }
      );
    });

    const group = registry.byId[groupId];
    const latest = history.length
      ? history[history.length - 1]
      : null;

    if (group && latest) {
      syncRegistryFromHistoryItem_(
        registrySheet,
        group,
        latest
      );
    }
  });
}


/**
 * Возвращает историю каждой группы без дублей одного и того же CSV.
 */
function buildCanonicalHistories_(
  snapshotsSheet,
  planByGroup
) {
  const header = headers_(snapshotsSheet);
  const rows = snapshotsSheet.getDataRange().getValues();

  const groupColumn = header.map['ID группы'];
  const dateColumn = header.map['Дата и время списка'];
  const hashColumn = header.map['Хеш содержимого'];

  const grouped = {};

  if (
    groupColumn === undefined ||
    dateColumn === undefined
  ) {
    return grouped;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const groupId = String(
      row[groupColumn] || ''
    ).trim();

    if (!groupId) {
      continue;
    }

    if (!grouped[groupId]) {
      grouped[groupId] = [];
    }

    grouped[groupId].push({
      rowNumber: i + 1,
      row: row,
      hash: hashColumn === undefined
        ? ''
        : String(
          row[hashColumn] || ''
        ).trim(),

      sortDate: snapshotSortDate_(
        row[dateColumn],
        i + 1
      )
    });
  }

  const result = {};

  Object.keys(grouped).forEach(function (groupId) {
    const canonicalByKey = {};

    grouped[groupId].forEach(function (item) {
      const fallbackKey =
        'fallback|' +
        item.sortDate +
        '|' +
        String(
          valueFromRow_(
            item.row,
            header.map,
            'Позиция общая',
            ''
          )
        );

      const key = item.hash
        ? 'hash|' + item.hash
        : fallbackKey;

      const existing = canonicalByKey[key];

      if (
        !existing ||
        item.sortDate > existing.sortDate ||
        (
          item.sortDate === existing.sortDate &&
          item.rowNumber > existing.rowNumber
        )
      ) {
        canonicalByKey[key] = item;
      }
    });

    const uniqueRows = Object.keys(canonicalByKey)
      .map(function (key) {
        return canonicalByKey[key];
      })
      .sort(function (first, second) {
        return (
          first.sortDate -
          second.sortDate
        ) || (
          first.rowNumber -
          second.rowNumber
        );
      });

    let previousInfo = null;

    result[groupId] = uniqueRows.map(function (item) {
      const plan = planByGroup[groupId] || null;

      const positionInfo =
        extractPositionInfoFromSnapshot_(
          item.row,
          header.map
        );

      const storedSeats = numberOrNull_(
        valueFromRow_(
          item.row,
          header.map,
          'Мест',
          null
        )
      );

      const seats =
        plan &&
        plan.seats !== null
          ? plan.seats
          : storedSeats;

      const basis = String(
        valueFromRow_(
          item.row,
          header.map,
          'Основа',
          ''
        )
      );

      const contractsCount = apiNumber_(
        valueFromRow_(
          item.row,
          header.map,
          'Договоров всего',
          null
        )
      );

      const candidateContract =
        valueFromRow_(
          item.row,
          header.map,
          'Договор Елисея',
          ''
        );

      const sourceFileId = String(
        valueFromRow_(
          item.row,
          header.map,
          'ID файла Drive',
          ''
        )
      ).trim();

      const storedPriority = apiNumber_(
        valueFromRow_(
          item.row,
          header.map,
          'Приоритет',
          null
        )
      );

      const priority = storedPriority !== null
        ? storedPriority
        : getApplicantPriorityByFileId_(sourceFileId);

      const consentsAboveHigherPriority = basis === 'Бюджет'
        ? resolveActiveAboveHigherPriority_(
          basis,
          sourceFileId,
          priority,
          valueFromRow_(
            item.row,
            header.map,
            'Согласий выше с более высоким приоритетом',
            null
          )
        )
        : null;

      const contractsAboveHigherPriority = basis === 'Платное'
        ? resolveActiveAboveHigherPriority_(
          basis,
          sourceFileId,
          priority,
          valueFromRow_(
            item.row,
            header.map,
            'Договоров выше с более высоким приоритетом',
            null
          )
        )
        : null;

      const comparison = comparePositions_(
        previousInfo,
        positionInfo
      );

      const decision = getDecisionFromStoredRanks_(
        basis,
        seats,
        positionInfo,
        contractsCount,
        candidateContract
      );

      const historyItem = {
        rowNumber: item.rowNumber,
        row: item.row,
        headers: header.map,
        groupId: groupId,
        sortDate: item.sortDate,
        snapshot: displayDateValue_(
          valueFromRow_(
            item.row,
            header.map,
            'Дата и время списка',
            ''
          )
        ),
        university: String(
          valueFromRow_(
            item.row,
            header.map,
            'Вуз',
            ''
          )
        ),
        basis: basis,
        group: String(
          valueFromRow_(
            item.row,
            header.map,
            'Конкурсная группа',
            ''
          )
        ),
        score: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Балл Елисея',
            null
          )
        ),
        priority: priority,
        generalPosition: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Позиция общая',
            null
          )
        ),
        status: String(
          valueFromRow_(
            item.row,
            header.map,
            'Статус Елисея',
            'Нет данных'
          )
        ),
        consent: String(
          valueFromRow_(
            item.row,
            header.map,
            'Согласие Елисея',
            'Не опубликовано'
          )
        ),
        consentsCount: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Согласий всего',
            null
          )
        ),
        consentsAbove: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Согласий выше Елисея',
            null
          )
        ),
        consentsAboveHigherPriority:
          consentsAboveHigherPriority,
        contract: String(
          valueFromRow_(
            item.row,
            header.map,
            'Договор Елисея',
            'Не опубликовано'
          )
        ),
        contractsCount: contractsCount,
        contractsAbove: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Договоров выше Елисея',
            null
          )
        ),
        contractsAboveHigherPriority:
          contractsAboveHigherPriority,
        consentRank: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Позиция по согласию',
            null
          )
        ),
        contractRank: apiNumber_(
          valueFromRow_(
            item.row,
            header.map,
            'Позиция по договору',
            null
          )
        ),
        positionInfo: positionInfo,
        seats: seats,
        comparison: comparison,
        decision: decision,
        plan: plan,
        sourceFileId: sourceFileId,
        processedAt:
          valueFromRow_(
            item.row,
            header.map,
            'Время обработки',
            ''
          )
      };

      previousInfo = positionInfo;

      return historyItem;
    });
  });

  return result;
}


function extractPositionInfoFromSnapshot_(
  row,
  headerMap
) {
  const basis = String(
    valueFromRow_(
      row,
      headerMap,
      'Основа',
      ''
    )
  );

  const generalPosition = apiNumber_(
    valueFromRow_(
      row,
      headerMap,
      'Позиция общая',
      null
    )
  );

  const consentValue = normalize_(
    valueFromRow_(
      row,
      headerMap,
      'Согласие Елисея',
      ''
    )
  );

  const contractValue = normalize_(
    valueFromRow_(
      row,
      headerMap,
      'Договор Елисея',
      ''
    )
  );

  const consentRank = apiNumber_(
    valueFromRow_(
      row,
      headerMap,
      'Позиция по согласию',
      null
    )
  );

  const contractRank = apiNumber_(
    valueFromRow_(
      row,
      headerMap,
      'Позиция по договору',
      null
    )
  );

  if (
    basis === 'Бюджет' &&
    isConfirmedConsent_(consentValue) &&
    consentRank !== null
  ) {
    return {
      general: generalPosition,
      active: consentRank,
      rankForDisplay: consentRank,
      source: 'По поданным согласиям',
      confirmed: true
    };
  }

  if (
    basis === 'Платное' &&
    contractValue === 'да' &&
    contractRank !== null
  ) {
    return {
      general: generalPosition,
      active: contractRank,
      rankForDisplay: contractRank,
      source: 'По заключённым договорам',
      confirmed: true
    };
  }

  return {
    general: generalPosition,
    active: null,
    rankForDisplay: generalPosition,
    source: 'Предварительно по общей позиции',
    confirmed: false
  };
}


/**
 * Общая позиция сопоставляется только с общей.
 * Активная — только с активной того же типа.
 */
function comparePositions_(previous, current) {
  if (!previous) {
    return {
      previousGeneral: '',
      generalChange: 'Первый снимок',
      generalTrend: 'Первый снимок',
      previousActive: '',
      activeChange:
        current.active === null
          ? 'Активная позиция не сформирована'
          : 'Первый снимок',

      note:
        'Нет предыдущего уникального списка для сравнения.'
    };
  }

  const general = compareRanks_(
    previous.general,
    current.general
  );

  let previousActive = '';
  let activeChange =
    'Нет сопоставимой активной позиции';

  let note =
    'Активная позиция не сопоставляется: используется ориентир по общей позиции.';

  if (
    previous.confirmed &&
    current.confirmed &&
    previous.source === current.source &&
    previous.active !== null &&
    current.active !== null
  ) {
    const active = compareRanks_(
      previous.active,
      current.active
    );

    previousActive = previous.active;
    activeChange = active.change;

    note =
      'Активная позиция сопоставлена: ' +
      current.source + '.';

  } else if (
    previous.confirmed &&
    current.confirmed &&
    previous.source !== current.source
  ) {
    previousActive = previous.active;
    activeChange = 'Не сопоставляется';

    note =
      'Тип активной позиции изменился: ранее «' +
      previous.source +
      '», сейчас «' +
      current.source + '».';
  }

  return {
    previousGeneral:
      previous.general === null
        ? ''
        : previous.general,

    generalChange: general.change,
    generalTrend: general.trend,

    previousActive: previousActive,
    activeChange: activeChange,
    note: note
  };
}


function compareRanks_(previousRank, currentRank) {
  if (
    previousRank === null ||
    currentRank === null
  ) {
    return {
      change: 'Нет сопоставимой позиции',
      trend: 'Не рассчитано'
    };
  }

  const delta = previousRank - currentRank;

  if (delta > 0) {
    return {
      change: 'Лучше на ' + delta,
      trend: 'Поднялся на ' + delta
    };
  }

  if (delta < 0) {
    return {
      change: 'Хуже на ' + Math.abs(delta),
      trend: 'Опустился на ' + Math.abs(delta)
    };
  }

  return {
    change: 'Без изменений',
    trend: 'Без изменений'
  };
}


function syncRegistryFromHistoryItem_(
  registrySheet,
  group,
  item
) {
  const positionInfo = item.positionInfo;
  const comparison = item.comparison;
  const decision = item.decision;

  updateRegistry_(registrySheet, group, {
    'Список': 'Получен',

    'Дата последнего списка':
      item.snapshot,

    'Статус Елисея':
      item.status,

    'Мест':
      item.seats === null
        ? 'Не указано'
        : item.seats,

    'Балл Елисея':
      valueOrBlank_(item.score),

    'Приоритет':
      valueOrBlank_(item.priority),

    'Позиция общая':
      valueOrBlank_(item.generalPosition),

    'Позиция по согласию':
      valueOrText_(
        item.consentRank,
        'Не опубликовано'
      ),

    'Разрыв до места':
      decision.gap,

    'Тренд':
      comparison.generalTrend,

    'Зона':
      decision.zone,

    'Рекомендация':
      decision.recommendation,

    'Комментарий':
      '№ ' + CFG.applicantId +
      '; статус: ' +
      item.status,

    'Согласие Елисея':
      item.consent,

    'Согласий всего':
      valueOrText_(
        item.consentsCount,
        'Не опубликовано'
      ),

    'Согласий выше Елисея':
      valueOrText_(
        item.consentsAbove,
        'Не опубликовано'
      ),

    'Согласий выше с более высоким приоритетом':
      item.basis === 'Бюджет'
        ? valueOrText_(
          item.consentsAboveHigherPriority,
          'Не опубликовано'
        )
        : '—',

    'Договор Елисея':
      item.contract,

    'Договоров всего':
      valueOrText_(
        item.contractsCount,
        'Не опубликовано'
      ),

    'Договоров выше Елисея':
      valueOrText_(
        item.contractsAbove,
        'Не опубликовано'
      ),

    'Договоров выше с более высоким приоритетом':
      item.basis === 'Платное'
        ? valueOrText_(
          item.contractsAboveHigherPriority,
          'Не опубликовано'
        )
        : '—',

    'Позиция по договору':
      valueOrText_(
        item.contractRank,
        'Не опубликовано'
      ),

    'Активная позиция':
      valueOrBlank_(
        positionInfo.rankForDisplay
      ),

    'Источник активности':
      positionInfo.source,

    'Последний файл ID':
      item.sourceFileId,

    'Последнее обновление CSV':
      item.processedAt,

    'Предыдущая общая позиция':
      comparison.previousGeneral,

    'Изменение общей позиции':
      comparison.generalChange,

    'Предыдущая активная позиция':
      comparison.previousActive,

    'Изменение активной позиции':
      comparison.activeChange,

    'Комментарий к сравнению':
      comparison.note
  });
}


function getDecisionFromStoredRanks_(
  basis,
  seats,
  positionInfo,
  contractsCount,
  candidateContract
) {
  if (seats === null) {
    return {
      gap:
        'Не рассчитано: квота не сопоставлена',

      zone:
        'Серая — нет квоты',

      recommendation:
        'Добавить или подтвердить количество мест в «Плане мест».'
    };
  }

  const rank = positionInfo.rankForDisplay;

  if (rank === null) {
    return {
      gap:
        'Не рассчитано: нет позиции',

      zone:
        'Серая — нет позиции',

      recommendation:
        'Проверить строку Елисея в опубликованном списке.'
    };
  }

  let gap = '';
  let zone = '';
  let recommendation = '';

  if (rank <= seats) {
    gap =
      'В пределах мест, запас ' +
      (seats - rank + 1);

    zone = positionInfo.confirmed
      ? 'В пределах квоты'
      : 'Ориентир: в пределах общей квоты';

    recommendation = positionInfo.confirmed
      ? 'Контролировать изменения списка.'
      : 'Следить за согласиями или договорами.';

  } else {
    gap =
      'Ниже квоты на ' +
      (rank - seats);

    zone = positionInfo.confirmed
      ? 'Резерв'
      : 'Ориентир: ниже общей квоты';

    recommendation = positionInfo.confirmed
      ? 'Оценивать движение активного списка.'
      : 'Следить за динамикой согласий или договоров.';
  }

  if (
    basis === 'Платное' &&
    contractsCount !== null &&
    normalize_(candidateContract) !== 'да'
  ) {
    const freeSeats = Math.max(
      0,
      seats - contractsCount
    );

    recommendation = freeSeats > 0
      ? 'Свободно по договорам: ' +
        freeSeats +
        '. Для участия требуется договор.'
      : 'Все места заняты договорами либо данные требуют проверки.';
  }

  return {
    gap: gap,
    zone: zone,
    recommendation: recommendation
  };
}


/* =========================================================
   СОЗДАНИЕ СНИМКА И РАЗБОР CSV
   ========================================================= */

function buildSnapshotValues_(
  registry,
  group,
  parsed,
  file,
  path,
  hash
) {
  const candidate = parsed.candidate;
  const stats = parsed.stats;

  const seats = numberOrNull_(
    group.row[
      registry.headers['Мест']
    ]
  );

  const positionInfo = getPositionInfoFromParsed_(
    group.basis,
    candidate,
    stats
  );

  const decision = getDecisionFromStoredRanks_(
    group.basis,
    seats,
    positionInfo,
    stats.contractsCount,
    candidate.contractValue
  );

  return {
    'Дата и время списка':
      getListDate_(file),

    'ID группы':
      group.id,

    'Вуз':
      group.university,

    'Основа':
      group.basis,

    'Конкурсная группа':
      group.name,

    '№ абитуриента':
      CFG.applicantId,

    'Статус Елисея':
      candidate.status || 'Статус не указан',

    'Балл Елисея':
      valueOrBlank_(candidate.score),

    'Приоритет':
      valueOrBlank_(candidate.priority),

    'Позиция общая':
      valueOrBlank_(candidate.position),

    'Мест':
      seats === null
        ? 'Не указано'
        : seats,

    'Выше с приоритетом/согласием':
      group.basis === 'Бюджет'
        ? valueOrText_(
          stats.consentsAbove,
          'Не опубликовано'
        )
        : valueOrText_(
          stats.contractsAbove,
          'Не опубликовано'
        ),

    'Позиция по согласию':
      valueOrText_(
        stats.consentRank,
        'Не опубликовано'
      ),

    'Разрыв до места':
      decision.gap,

    'Тренд к прошлому списку':
      'Ожидает сравнения',

    'Зона':
      decision.zone,

    'Рекомендация':
      decision.recommendation,

    'Источник / файл':
      group.university +
      ': ' +
      removeExtension_(file.getName()),

    'Комментарий':
      makeComment_(
        group.basis,
        candidate,
        stats
      ),

    'Согласие Елисея':
      displayValue_(
        candidate.consentValue,
        stats.hasConsentColumn
      ),

    'Согласий всего':
      valueOrText_(
        stats.consentsCount,
        'Не опубликовано'
      ),

    'Согласий выше Елисея':
      valueOrText_(
        stats.consentsAbove,
        'Не опубликовано'
      ),

    'Согласий выше с более высоким приоритетом':
      group.basis === 'Бюджет'
        ? valueOrText_(
          stats.consentsAboveHigherPriority,
          'Не опубликовано'
        )
        : '—',

    'Договор Елисея':
      displayValue_(
        candidate.contractValue,
        stats.hasContractColumn
      ),

    'Договоров всего':
      valueOrText_(
        stats.contractsCount,
        'Не опубликовано'
      ),

    'Договоров выше Елисея':
      valueOrText_(
        stats.contractsAbove,
        'Не опубликовано'
      ),

    'Договоров выше с более высоким приоритетом':
      group.basis === 'Платное'
        ? valueOrText_(
          stats.contractsAboveHigherPriority,
          'Не опубликовано'
        )
        : '—',

    'Позиция по договору':
      valueOrText_(
        stats.contractRank,
        'Не опубликовано'
      ),

    'Активная позиция':
      valueOrBlank_(
        positionInfo.rankForDisplay
      ),

    'Источник активности':
      positionInfo.source,

    'ID файла Drive':
      file.getId(),

    'Хеш содержимого':
      hash,

    'Путь к файлу':
      path,

    'Время обработки':
      formatDateTime_(new Date())
  };
}


function getPositionInfoFromParsed_(
  basis,
  candidate,
  stats
) {
  if (
    basis === 'Бюджет' &&
    isConfirmedConsent_(
      candidate.consentValue
    ) &&
    stats.consentRank !== null
  ) {
    return {
      general: candidate.position,
      active: stats.consentRank,
      rankForDisplay: stats.consentRank,
      source: 'По поданным согласиям',
      confirmed: true
    };
  }

  if (
    basis === 'Платное' &&
    isConfirmedContract_(
      candidate.contractValue
    ) &&
    stats.contractRank !== null
  ) {
    return {
      general: candidate.position,
      active: stats.contractRank,
      rankForDisplay: stats.contractRank,
      source: 'По заключённым договорам',
      confirmed: true
    };
  }

  return {
    general: candidate.position,
    active: null,
    rankForDisplay: candidate.position,
    source: 'Предварительно по общей позиции',
    confirmed: false
  };
}


function makeComment_(basis, candidate, stats) {
  const confirmation = basis === 'Бюджет'
    ? 'согласие: ' + displayValue_(
      candidate.consentValue,
      stats.hasConsentColumn
    )
    : 'договор: ' + displayValue_(
      candidate.contractValue,
      stats.hasContractColumn
    );

  return (
    '№ ' + CFG.applicantId +
    '; приоритет ' +
    (candidate.priority || 'не указан') +
    '; ' + confirmation +
    '; статус: ' +
    (candidate.status || 'не указан')
  );
}


function parseApplicant_(text) {
  const data = parseCsv_(text);

  if (!data || data.length < 2) {
    return null;
  }

  const headerRowIndex = findHeaderRow_(data);

  if (headerRowIndex === -1) {
    return null;
  }

  const headers = data[headerRowIndex]
    .map(normalize_);

  const idIndex = findHeader_(headers, [
    'id участника',
    'id абитуриента',
    'номер абитуриента',
    'код поступающего',
    'код абитуриента',
    'уникальный номер',
    'уникальный код',
    'идентификатор'
  ]);

  const positionIndex = findHeader_(headers, [
    'порядковый номер',
    'номер в ранжированном списке',
    'позиция',
    'место',
    'рейтинг'
  ]);

  const scoreIndex = findHeader_(headers, [
    'сумма конкурсных баллов',
    'сумма баллов',
    'конкурсный балл',
    'итоговый балл'
  ]);

  const priorityIndex = findHeader_(headers, [
    'приоритет зачисления',
    'приоритет конкурса',
    'приоритет'
  ]);

  const statusIndex = headers.indexOf('статус');

  const consentIndex =
    headers.indexOf('подано согласие');

  const contractIndex =
    headers.indexOf('наличие договора');

  if (
    idIndex === -1 ||
    positionIndex === -1
  ) {
    return null;
  }

  const rows = data.slice(headerRowIndex + 1);

  const hasConsentColumn = consentIndex !== -1;
  const hasContractColumn = contractIndex !== -1;

  let candidateRow = null;
  let consentsCount = 0;
  let contractsCount = 0;

  rows.forEach(function (row) {
    if (!row || !row.length) {
      return;
    }

    if (
      hasConsentColumn &&
      isConfirmedConsent_(
        row[consentIndex]
      )
    ) {
      consentsCount++;
    }

    if (
      hasContractColumn &&
      isConfirmedContract_(
        row[contractIndex]
      )
    ) {
      contractsCount++;
    }

    const id = String(
      row[idIndex] || ''
    ).replace(/\D/g, '');

    if (id === CFG.applicantId) {
      candidateRow = row;
    }
  });

  if (!candidateRow) {
    return {
      candidate: null,

      stats: {
        hasConsentColumn: hasConsentColumn,
        hasContractColumn: hasContractColumn,

        consentsCount: hasConsentColumn
          ? consentsCount
          : null,

        contractsCount: hasContractColumn
          ? contractsCount
          : null,

        consentsAbove: null,
        contractsAbove: null,
        consentsAboveHigherPriority: null,
        contractsAboveHigherPriority: null,
        consentRank: null,
        contractRank: null
      }
    };
  }

  const position = numberOrNull_(
    candidateRow[positionIndex]
  );

  const candidatePriority = priorityIndex === -1
    ? null
    : numberOrNull_(
      candidateRow[priorityIndex]
    );

  const consentValue = hasConsentColumn
    ? String(
      candidateRow[consentIndex] || ''
    ).trim()
    : '';

  const contractValue = hasContractColumn
    ? String(
      candidateRow[contractIndex] || ''
    ).trim()
    : '';

  let consentsAbove = null;
  let contractsAbove = null;

  const consentsAboveHigherPriority = hasConsentColumn
    ? countActiveAboveHigherPriorityFromRows_(
      data,
      'Бюджет',
      candidatePriority
    )
    : null;

  const contractsAboveHigherPriority = hasContractColumn
    ? countActiveAboveHigherPriorityFromRows_(
      data,
      'Платное',
      candidatePriority
    )
    : null;

  if (
    position !== null &&
    hasConsentColumn
  ) {
    consentsAbove = 0;

    rows.forEach(function (row) {
      const rowPosition = numberOrNull_(
        row[positionIndex]
      );

      if (
        rowPosition !== null &&
        rowPosition < position &&
        isConfirmedConsent_(
          row[consentIndex]
        )
      ) {
        consentsAbove++;
      }
    });
  }

  if (
    position !== null &&
    hasContractColumn
  ) {
    contractsAbove = 0;

    rows.forEach(function (row) {
      const rowPosition = numberOrNull_(
        row[positionIndex]
      );

      if (
        rowPosition !== null &&
        rowPosition < position &&
        isConfirmedContract_(
          row[contractIndex]
        )
      ) {
        contractsAbove++;
      }
    });
  }

  return {
    candidate: {
      position: position,

      score: scoreIndex === -1
        ? null
        : numberOrNull_(
          candidateRow[scoreIndex]
        ),

      priority: priorityIndex === -1
        ? ''
        : String(
          candidateRow[priorityIndex] || ''
        ).trim(),

      status: statusIndex === -1
        ? ''
        : String(
          candidateRow[statusIndex] || ''
        ).trim(),

      consentValue: consentValue,
      contractValue: contractValue
    },

    stats: {
      hasConsentColumn: hasConsentColumn,
      hasContractColumn: hasContractColumn,

      consentsCount: hasConsentColumn
        ? consentsCount
        : null,

      contractsCount: hasContractColumn
        ? contractsCount
        : null,

      consentsAbove: consentsAbove,
      contractsAbove: contractsAbove,
      consentsAboveHigherPriority: consentsAboveHigherPriority,
      contractsAboveHigherPriority: contractsAboveHigherPriority,

      consentRank:
        isConfirmedConsent_(
          consentValue
        ) &&
        consentsAbove !== null
          ? consentsAbove + 1
          : null,

      contractRank:
        isConfirmedContract_(
          contractValue
        ) &&
        contractsAbove !== null
          ? contractsAbove + 1
          : null
    }
  };
}


/**
 * Бюджет: точное значение «Электронное» или «Бумажное».
 */
function isConfirmedConsent_(value) {
  const normalized = normalize_(value);

  return (
    normalized === 'электронное' ||
    normalized === 'бумажное'
  );
}


/**
 * Платное: только точное значение «Да».
 */
function isConfirmedContract_(value) {
  return normalize_(value) === 'да';
}


/* =========================================================
   ИЗМЕНЕНИЯ СОСТАВА СПИСКОВ
   ========================================================= */

function backfillChangeMetrics() {
  withLock_(function () {
    const ss = SpreadsheetApp.openById(CFG.spreadsheetId);

    ensureSchemas_(ss);

    const snapshotsSheet = ss.getSheetByName(
      CFG.sheets.snapshots
    );

    const grouped = buildUniqueSnapshotRecordsByGroup_(
      snapshotsSheet
    );

    const result = {
      first: 0,
      processed: 0,
      added: 0,
      updated: 0,
      errors: 0
    };

    Object.keys(grouped).forEach(function (groupId) {
      const items = grouped[groupId];

      items.forEach(function (current, index) {
        const previous = index > 0
          ? items[index - 1]
          : null;

        try {
          const status = upsertChangeForSnapshotPair_(
            ss,
            current,
            previous,
            null
          );

          if (previous) {
            result.processed++;
          } else {
            result.first++;
          }

          if (status === 'updated') {
            result.updated++;
          } else {
            result.added++;
          }
        } catch (error) {
          result.errors++;

          Logger.log(
            'Ошибка backfill изменений для ' +
            groupId +
            ': ' +
            String(error)
          );
        }
      });
    });

    const message =
      'Первые снимки: ' + result.first +
      '. Пар сравнено: ' + result.processed +
      '. Добавлено: ' + result.added +
      '. Обновлено: ' + result.updated +
      '. Ошибок: ' + result.errors + '.';

    Logger.log(message);

    ss.toast(
      message,
      'Изменения списков пересчитаны',
      15
    );
  });
}


function upsertChangeMetricsForCurrentSnapshot_(
  ss,
  snapshotsSheet,
  group,
  file,
  currentText,
  currentHash
) {
  const grouped = buildUniqueSnapshotRecordsByGroup_(
    snapshotsSheet
  );

  const history = grouped[group.id] || [];
  const currentKey = makeSnapshotUniqueKey_(
    currentHash,
    getListDate_(file),
    ''
  );

  let currentIndex = -1;

  for (let i = 0; i < history.length; i++) {
    if (history[i].key === currentKey) {
      currentIndex = i;
      break;
    }
  }

  const current = currentIndex === -1
    ? {
      key: currentKey,
      rowNumber: 0,
      groupId: group.id,
      snapshot: getListDate_(file),
      sortDate: snapshotSortDate_(
        getListDate_(file),
        new Date().getTime()
      ),
      fileId: file.getId(),
      hash: currentHash,
      university: group.university,
      basis: group.basis,
      groupName: group.name
    }
    : history[currentIndex];

  const previous = currentIndex > 0
    ? history[currentIndex - 1]
    : null;

  return upsertChangeForSnapshotPair_(
    ss,
    current,
    previous,
    currentText
  );
}


function upsertChangeForSnapshotPair_(
  ss,
  current,
  previous,
  currentText
) {
  const changesSheet = getOrCreateChangesSheet_(ss);
  const currentState = currentText
    ? parseParticipantsState_(currentText)
    : parseParticipantsStateFromRows_(
      readSourceRowsByFileId_(current.fileId)
    );

  let previousState = null;
  let metrics = emptyChangeMetrics_();
  let comment = 'Первый снимок, сравнение отсутствует';

  if (previous) {
    previousState = parseParticipantsStateFromRows_(
      readSourceRowsByFileId_(previous.fileId)
    );

    if (
      !hasParticipantRows_(previousState) ||
      !hasParticipantRows_(currentState)
    ) {
      metrics = emptyChangeMetrics_();
      comment =
        'Не удалось распарсить полный состав одного из снимков; сравнение не рассчитано.';
    } else {
      metrics = calculateChangeMetrics_(
        previousState,
        currentState
      );

      comment = makeChangeMetricsComment_(
        previousState,
        currentState
      );
    }
  }

  const values = buildChangeRowValues_(
    current,
    previous,
    currentState,
    previousState,
    metrics,
    comment
  );

  const status = upsertChangeRow_(
    changesSheet,
    values
  );

  clearChangesCache_(
    current.groupId,
    current.university,
    current.basis
  );

  return status;
}


function parseParticipantsState_(text) {
  return parseParticipantsStateFromRows_(
    parseCsv_(text)
  );
}


function parseParticipantsStateFromRows_(data) {
  const result = {
    rows: {},
    hasConsentColumn: false,
    hasContractColumn: false,
    applicantPriority: null,
    applicantFound: false
  };

  if (!data || data.length < 2) {
    return result;
  }

  const headerRowIndex = findHeaderRow_(data);

  if (headerRowIndex === -1) {
    return result;
  }

  const headers = data[headerRowIndex]
    .map(normalize_);

  const idIndex = findHeader_(headers, [
    'id участника',
    'id абитуриента',
    'номер абитуриента',
    'код поступающего',
    'код абитуриента',
    'уникальный номер',
    'уникальный код',
    'идентификатор'
  ]);

  const positionIndex = findHeader_(headers, [
    'порядковый номер',
    'номер в ранжированном списке',
    'позиция',
    'место',
    'рейтинг'
  ]);

  const priorityIndex = findHeader_(headers, [
    'приоритет зачисления',
    'приоритет конкурса',
    'приоритет'
  ]);

  const scoreIndex = findHeader_(headers, [
    'сумма конкурсных баллов',
    'сумма баллов',
    'конкурсный балл',
    'итоговый балл'
  ]);

  const statusIndex = headers.indexOf('статус');

  const consentIndex = findHeader_(headers, [
    'подано согласие',
    'согласие на зачисление'
  ]);

  const contractIndex = findHeader_(headers, [
    'наличие договора',
    'заключен договор',
    'заключен договор',
    'договор'
  ]);

  if (idIndex === -1) {
    return result;
  }

  result.hasConsentColumn = consentIndex !== -1;
  result.hasContractColumn = contractIndex !== -1;

  const rows = data.slice(headerRowIndex + 1);

  rows.forEach(function (row) {
    if (!row || !row.length) {
      return;
    }

    const id = normalizeParticipantId_(row[idIndex]);

    if (!id) {
      return;
    }

    const priority = priorityIndex === -1
      ? null
      : numberOrNull_(row[priorityIndex]);

    const record = {
      id: id,

      position: positionIndex === -1
        ? null
        : numberOrNull_(row[positionIndex]),

      priority: priority,

      score: scoreIndex === -1
        ? null
        : numberOrNull_(row[scoreIndex]),

      status: statusIndex === -1
        ? ''
        : String(row[statusIndex] || '').trim(),

      consentValue: result.hasConsentColumn
        ? String(row[consentIndex] || '').trim()
        : '',

      contractValue: result.hasContractColumn
        ? String(row[contractIndex] || '').trim()
        : '',

      hasConsent: result.hasConsentColumn
        ? isConfirmedConsent_(row[consentIndex])
        : false,

      hasContract: result.hasContractColumn
        ? isConfirmedContract_(row[contractIndex])
        : false
    };

    result.rows[id] = record;

    if (isApplicantId_(id)) {
      result.applicantFound = true;
      result.applicantPriority = priority;
    }
  });

  return result;
}


function calculateChangeMetrics_(
  previousState,
  currentState
) {
  const previousRows = previousState.rows || {};
  const currentRows = currentState.rows || {};

  const previousIds = Object.keys(previousRows);
  const currentIds = Object.keys(currentRows);

  const newApplicationIds = currentIds.filter(function (id) {
    return !previousRows[id];
  });

  const leftApplicationIds = previousIds.filter(function (id) {
    return !currentRows[id];
  });

  const metrics = emptyChangeMetrics_();

  metrics.newApplications = newApplicationIds.length;
  metrics.newApplicationsHigherPriority =
    countHigherPriorityParticipants_(
      newApplicationIds,
      currentState
    );

  metrics.leftApplications = leftApplicationIds.length;
  metrics.leftApplicationsHigherPriority =
    countHigherPriorityParticipants_(
      leftApplicationIds,
      previousState
    );

  if (
    previousState.hasConsentColumn &&
    currentState.hasConsentColumn
  ) {
    const newConsentIds = currentIds.filter(function (id) {
      const previous = previousRows[id];
      const current = currentRows[id];

      return (
        current &&
        current.hasConsent &&
        !(previous && previous.hasConsent)
      );
    });

    metrics.newConsents = newConsentIds.length;
    metrics.newConsentsHigherPriority =
      countHigherPriorityParticipants_(
        newConsentIds,
        currentState
      );
  }

  if (currentState.hasContractColumn) {
    const canComparePreviousContracts =
      previousState.hasContractColumn;

    if (canComparePreviousContracts) {
      const newContractIds = currentIds.filter(function (id) {
        const previous = previousRows[id];
        const current = currentRows[id];

        return (
          current &&
          current.hasContract &&
          !(previous && previous.hasContract)
        );
      });

      metrics.newContracts = newContractIds.length;
      metrics.newContractsHigherPriority =
        countHigherPriorityParticipants_(
          newContractIds,
          currentState
        );
    }
  }

  if (previousState.hasConsentColumn) {
    const leftConsentIds = leftApplicationIds.filter(function (id) {
      return previousRows[id] && previousRows[id].hasConsent;
    });

    metrics.leftConsentsWithApplication = leftConsentIds.length;
    metrics.leftConsentsWithApplicationHigherPriority =
      countHigherPriorityParticipants_(
        leftConsentIds,
        previousState
      );
  }

  if (previousState.hasContractColumn) {
    const leftContractIds = leftApplicationIds.filter(function (id) {
      return previousRows[id] && previousRows[id].hasContract;
    });

    metrics.leftContractsWithApplication = leftContractIds.length;
    metrics.leftContractsWithApplicationHigherPriority =
      countHigherPriorityParticipants_(
        leftContractIds,
        previousState
      );
  }

  return metrics;
}


function emptyChangeMetrics_() {
  return {
    newApplications: null,
    newApplicationsHigherPriority: null,
    leftApplications: null,
    leftApplicationsHigherPriority: null,
    newConsents: null,
    newConsentsHigherPriority: null,
    newContracts: null,
    newContractsHigherPriority: null,
    leftConsentsWithApplication: null,
    leftConsentsWithApplicationHigherPriority: null,
    leftContractsWithApplication: null,
    leftContractsWithApplicationHigherPriority: null
  };
}


function hasParticipantRows_(state) {
  return Boolean(
    state &&
    state.rows &&
    Object.keys(state.rows).length
  );
}


function countHigherPriorityParticipants_(
  participantIds,
  state
) {
  const applicantPriority = apiNumber_(
    state.applicantPriority
  );

  if (applicantPriority === null) {
    return null;
  }

  let count = 0;

  participantIds.forEach(function (id) {
    const participant = state.rows[id];
    const priority = participant
      ? apiNumber_(participant.priority)
      : null;

    if (
      priority !== null &&
      priority < applicantPriority
    ) {
      count++;
    }
  });

  return count;
}


function buildUniqueSnapshotRecordsByGroup_(snapshotsSheet) {
  const grouped = {};

  if (!snapshotsSheet || snapshotsSheet.getLastRow() < 2) {
    return grouped;
  }

  const header = headers_(snapshotsSheet);
  const rows = snapshotsSheet.getDataRange().getValues();

  const groupColumn = header.map['ID группы'];
  const dateColumn = header.map['Дата и время списка'];
  const hashColumn = header.map['Хеш содержимого'];
  const fileColumn = header.map['ID файла Drive'];

  if (
    groupColumn === undefined ||
    dateColumn === undefined ||
    fileColumn === undefined
  ) {
    return grouped;
  }

  const byGroupAndKey = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const groupId = String(
      row[groupColumn] || ''
    ).trim();

    if (!groupId) {
      continue;
    }

    const snapshot = displayDateValue_(
      row[dateColumn]
    );

    const hash = hashColumn === undefined
      ? ''
      : String(row[hashColumn] || '').trim();

    const generalPosition = valueFromRow_(
      row,
      header.map,
      'Позиция общая',
      ''
    );

    const key = makeSnapshotUniqueKey_(
      hash,
      snapshot,
      generalPosition
    );

    const record = {
      key: key,
      rowNumber: i + 1,
      groupId: groupId,
      snapshot: snapshot,
      sortDate: snapshotSortDate_(
        row[dateColumn],
        i + 1
      ),
      fileId: String(row[fileColumn] || '').trim(),
      hash: hash,
      university: String(
        valueFromRow_(
          row,
          header.map,
          'Вуз',
          ''
        )
      ),
      basis: String(
        valueFromRow_(
          row,
          header.map,
          'Основа',
          ''
        )
      ),
      groupName: String(
        valueFromRow_(
          row,
          header.map,
          'Конкурсная группа',
          ''
        )
      )
    };

    const groupKey = groupId + '|' + key;
    const existing = byGroupAndKey[groupKey];

    if (
      !existing ||
      record.sortDate > existing.sortDate ||
      (
        record.sortDate === existing.sortDate &&
        record.rowNumber > existing.rowNumber
      )
    ) {
      byGroupAndKey[groupKey] = record;
    }
  }

  Object.keys(byGroupAndKey).forEach(function (key) {
    const record = byGroupAndKey[key];

    if (!grouped[record.groupId]) {
      grouped[record.groupId] = [];
    }

    grouped[record.groupId].push(record);
  });

  Object.keys(grouped).forEach(function (groupId) {
    grouped[groupId].sort(function (first, second) {
      return (
        first.sortDate - second.sortDate
      ) || (
        first.rowNumber - second.rowNumber
      );
    });
  });

  return grouped;
}


function makeSnapshotUniqueKey_(
  hash,
  snapshot,
  generalPosition
) {
  return hash
    ? 'hash|' + hash
    : 'fallback|' + snapshot + '|' + generalPosition;
}


function buildChangeRowValues_(
  current,
  previous,
  currentState,
  previousState,
  metrics,
  comment
) {
  const previousHash = previous
    ? previous.hash
    : 'FIRST';

  return {
    'Ключ изменения':
      current.groupId +
      '|' +
      previousHash +
      '|' +
      current.hash,

    'Дата текущего снимка': current.snapshot,
    'Дата предыдущего снимка': previous ? previous.snapshot : '',
    'ID группы': current.groupId,
    'Вуз': current.university,
    'Основа': current.basis,
    'Конкурсная группа': current.groupName,
    'ID текущего файла Drive': current.fileId,
    'ID предыдущего файла Drive': previous ? previous.fileId : '',
    'Хеш текущего CSV': current.hash,
    'Хеш предыдущего CSV': previous ? previous.hash : '',
    'Приоритет Елисея текущий':
      valueOrBlank_(currentState.applicantPriority),
    'Приоритет Елисея предыдущий':
      previousState
        ? valueOrBlank_(previousState.applicantPriority)
        : '',

    'Новых заявлений':
      metricForSheet_(metrics.newApplications),
    'Новых заявлений — из них приоритет выше':
      metricForSheet_(metrics.newApplicationsHigherPriority),

    'Ушло заявлений':
      metricForSheet_(metrics.leftApplications),
    'Ушло заявлений — из них приоритет выше':
      metricForSheet_(metrics.leftApplicationsHigherPriority),

    'Новых согласий':
      metricForSheet_(metrics.newConsents),
    'Новых согласий — из них приоритет выше':
      metricForSheet_(metrics.newConsentsHigherPriority),

    'Новых договоров':
      metricForSheet_(metrics.newContracts),
    'Новых договоров — из них приоритет выше':
      metricForSheet_(metrics.newContractsHigherPriority),

    'Ушло согласий вместе с заявлениями':
      metricForSheet_(metrics.leftConsentsWithApplication),
    'Ушло согласий вместе с заявлениями — из них приоритет выше':
      metricForSheet_(metrics.leftConsentsWithApplicationHigherPriority),

    'Ушло договоров вместе с заявлениями':
      metricForSheet_(metrics.leftContractsWithApplication),
    'Ушло договоров вместе с заявлениями — из них приоритет выше':
      metricForSheet_(metrics.leftContractsWithApplicationHigherPriority),

    'Комментарий': comment,

    'Количество участников в текущем снимке':
      Object.keys(currentState.rows || {}).length,

    'Количество участников в предыдущем снимке':
      previousState
        ? Object.keys(previousState.rows || {}).length
        : '',

    'Время расчёта': formatDateTime_(new Date())
  };
}


function upsertChangeRow_(sheet, values) {
  const rowNumber = findRowByHeaderValue_(
    sheet,
    'Ключ изменения',
    values['Ключ изменения']
  );

  if (rowNumber) {
    updateRowByHeaders_(
      sheet,
      rowNumber,
      values
    );

    return 'updated';
  }

  appendByHeaders_(
    sheet,
    values
  );

  return 'added';
}


function findRowByHeaderValue_(
  sheet,
  headerName,
  expectedValue
) {
  const header = headers_(sheet);
  const column = header.map[headerName];

  if (
    column === undefined ||
    sheet.getLastRow() < 2
  ) {
    return null;
  }

  const values = sheet
    .getRange(
      2,
      column + 1,
      sheet.getLastRow() - 1,
      1
    )
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(expectedValue)) {
      return i + 2;
    }
  }

  return null;
}


function makeChangeMetricsComment_(
  previousState,
  currentState
) {
  const comments = [];

  if (!previousState.applicantFound) {
    comments.push(
      'Елисей не найден в предыдущем снимке.'
    );
  }

  if (!currentState.applicantFound) {
    comments.push(
      'Елисей не найден в текущем снимке.'
    );
  }

  if (
    previousState.applicantPriority === null ||
    currentState.applicantPriority === null
  ) {
    comments.push(
      'Приоритет Елисея не найден; подпоказатели по приоритету могут быть не рассчитаны.'
    );
  }

  if (
    !previousState.hasConsentColumn ||
    !currentState.hasConsentColumn
  ) {
    comments.push(
      'Согласия не опубликованы в одном из снимков.'
    );
  }

  if (
    !previousState.hasContractColumn ||
    !currentState.hasContractColumn
  ) {
    comments.push(
      'Договоры не опубликованы в одном из снимков.'
    );
  }

  return comments.join(' ');
}


function metricForSheet_(value) {
  return value === null || value === undefined
    ? ''
    : value;
}


function normalizeParticipantId_(value) {
  return String(value || '').replace(/\D/g, '');
}


function clearChangesCache_(
  groupId,
  university,
  basis
) {
  try {
    const cache = CacheService.getScriptCache();

    cache.removeAll([
      'changes:all',
      'changes:group:' + groupId,
      'changes:' + (university || 'all') + ':' + (basis || 'all')
    ]);
  } catch (error) {
    // Кэш не должен мешать записи расчётов.
  }
}


/* =========================================================
   КАРТА ВСЕХ ПОСТУПАЮЩИХ
   ========================================================= */

const APPLICANTS_REBUILD_QUEUE_PROPERTY =
  'APPLICANTS_REBUILD_QUEUE';

const APPLICANTS_REBUILD_CURSOR_PROPERTY =
  'APPLICANTS_REBUILD_CURSOR';

const APPLICANTS_REBUILD_ERRORS_PROPERTY =
  'APPLICANTS_REBUILD_ERRORS';


/**
 * Начинает безопасную порционную сборку актуальных заявлений.
 * Рабочие данные заменяются только после обработки всей очереди.
 */
function startApplicantsRebuild() {
  withLock_(function () {
    const ss = SpreadsheetApp.openById(
      CFG.spreadsheetId
    );

    ensureSchemas_(ss);

    const queue = buildLatestApplicantSources_(ss);
    const props = PropertiesService.getScriptProperties();
    const staging = ss.getSheetByName(
      CFG.sheets.applicationsStaging
    );

    clearDataRows_(staging);

    props.setProperty(
      APPLICANTS_REBUILD_QUEUE_PROPERTY,
      JSON.stringify(queue)
    );

    props.setProperty(
      APPLICANTS_REBUILD_CURSOR_PROPERTY,
      '0'
    );

    props.setProperty(
      APPLICANTS_REBUILD_ERRORS_PROPERTY,
      '0'
    );

    removeApplicantRebuildTriggers_();

    const progress = continueApplicantsRebuildBatch_(ss);

    ss.toast(
      applicantRebuildProgressMessage_(progress),
      'Карта поступающих',
      15
    );
  });
}


/**
 * Продолжает ранее начатую сборку следующей порцией групп.
 */
function continueApplicantsRebuild() {
  withLock_(function () {
    const ss = SpreadsheetApp.openById(
      CFG.spreadsheetId
    );

    ensureSchemas_(ss);
    removeApplicantRebuildTriggers_();

    const progress = continueApplicantsRebuildBatch_(ss);

    ss.toast(
      applicantRebuildProgressMessage_(progress),
      'Карта поступающих',
      15
    );
  });
}


function continueApplicantsRebuildBatch_(ss) {
  const props = PropertiesService.getScriptProperties();
  const queueText = props.getProperty(
    APPLICANTS_REBUILD_QUEUE_PROPERTY
  );

  if (!queueText) {
    return {
      processed: 0,
      total: 0,
      errors: 0,
      completed: true,
      message: 'Активная сборка не найдена.'
    };
  }

  const queue = JSON.parse(queueText);
  const cursor = Math.max(
    0,
    Number(
      props.getProperty(
        APPLICANTS_REBUILD_CURSOR_PROPERTY
      ) || 0
    )
  );

  const previousErrors = Math.max(
    0,
    Number(
      props.getProperty(
        APPLICANTS_REBUILD_ERRORS_PROPERTY
      ) || 0
    )
  );

  const end = Math.min(
    queue.length,
    cursor + CFG.applicantRebuildBatchSize
  );

  const registry = getRegistry_(
    ss.getSheetByName(CFG.sheets.registry)
  );

  const staging = ss.getSheetByName(
    CFG.sheets.applicationsStaging
  );

  const updates = {};
  let errors = previousErrors;

  for (let i = cursor; i < end; i++) {
    const source = queue[i];
    const group = registry.byId[source.groupId];

    if (!group) {
      errors++;
      continue;
    }

    try {
      const file = DriveApp.getFileById(source.fileId);
      const text = getFileText_(file);
      const hash = makeHash_(text);

      queueApplicationGroupUpdate_(
        updates,
        registry,
        group,
        file,
        text,
        '',
        hash
      );
    } catch (error) {
      errors++;

      Logger.log(
        'Ошибка карты поступающих для ' +
        source.groupId +
        ': ' +
        String(error)
      );
    }
  }

  appendApplicationUpdatesToSheet_(
    staging,
    updates
  );

  props.setProperty(
    APPLICANTS_REBUILD_CURSOR_PROPERTY,
    String(end)
  );

  props.setProperty(
    APPLICANTS_REBUILD_ERRORS_PROPERTY,
    String(errors)
  );

  const completed = end >= queue.length;

  if (completed) {
    publishApplicantStaging_(ss, errors === 0);
    rebuildApplicantProfiles_(ss);

    props.deleteProperty(
      APPLICANTS_REBUILD_QUEUE_PROPERTY
    );

    props.deleteProperty(
      APPLICANTS_REBUILD_CURSOR_PROPERTY
    );

    props.deleteProperty(
      APPLICANTS_REBUILD_ERRORS_PROPERTY
    );

    removeApplicantRebuildTriggers_();
  } else {
    createApplicantRebuildTrigger_();
  }

  return {
    processed: end,
    total: queue.length,
    errors: errors,
    completed: completed
  };
}


function appendApplicationUpdatesToSheet_(sheet, updates) {
  const headerNames = applicationMapHeaders_();
  let rows = [];

  Object.keys(updates)
    .sort()
    .forEach(function (groupId) {
      rows = rows.concat(updates[groupId].rows);
    });

  if (!rows.length) {
    return false;
  }

  ensureSheetCapacity_(
    sheet,
    sheet.getLastRow() + rows.length,
    headerNames.length
  );

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      headerNames.length
    )
    .setValues(
      rows.map(function (item) {
        return headerNames.map(function (name) {
          return Object.prototype.hasOwnProperty.call(
            item,
            name
          )
            ? item[name]
            : '';
        });
      })
    );

  return true;
}


function applicantRebuildProgressMessage_(progress) {
  if (progress.message) {
    return progress.message;
  }

  if (progress.completed) {
    return (
      'Сборка завершена. Обработано групп: ' +
      progress.processed +
      ' из ' +
      progress.total +
      '. Ошибок: ' +
      progress.errors +
      '.'
    );
  }

  return (
    'Обработано групп: ' +
    progress.processed +
    ' из ' +
    progress.total +
    '. Продолжение запустится автоматически. Ошибок: ' +
    progress.errors +
    '.'
  );
}


function buildLatestApplicantSources_(ss) {
  const registry = getRegistry_(
    ss.getSheetByName(CFG.sheets.registry)
  );

  const latest = {};

  getAllCsvFiles_().forEach(function (item) {
    const context = getFolderContext_(item.pathNames);

    if (!context) {
      return;
    }

    const group = findGroup_(
      registry,
      context,
      item.file.getName()
    );

    if (!group) {
      return;
    }

    const sortDate = snapshotSortDate_(
      getListDate_(item.file),
      item.file.getLastUpdated().getTime()
    );

    const existing = latest[group.id];

    if (
      !existing ||
      sortDate > existing.sortDate ||
      (
        sortDate === existing.sortDate &&
        item.file.getLastUpdated().getTime() >
        existing.updatedAt
      )
    ) {
      latest[group.id] = {
        groupId: group.id,
        fileId: item.file.getId(),
        sortDate: sortDate,
        updatedAt: item.file.getLastUpdated().getTime()
      };
    }
  });

  return Object.keys(latest)
    .sort()
    .map(function (groupId) {
      return {
        groupId: groupId,
        fileId: latest[groupId].fileId
      };
    });
}


function createApplicantRebuildTrigger_() {
  removeApplicantRebuildTriggers_();

  ScriptApp.newTrigger('continueApplicantsRebuild')
    .timeBased()
    .after(60 * 1000)
    .create();
}


function removeApplicantRebuildTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (
      trigger.getHandlerFunction() ===
      'continueApplicantsRebuild'
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}


function queueApplicationGroupUpdate_(
  updates,
  registry,
  group,
  file,
  text,
  path,
  hash
) {
  const state = parseParticipantsState_(text);

  if (!hasParticipantRows_(state)) {
    Logger.log(
      'Не удалось прочитать участников для ' +
      group.id +
      ': ' +
      file.getName()
    );

    return;
  }

  const snapshot = getListDate_(file);
  const sortDate = snapshotSortDate_(
    snapshot,
    file.getLastUpdated().getTime()
  );

  const existing = updates[group.id];

  if (
    existing &&
    existing.sortDate > sortDate
  ) {
    return;
  }

  updates[group.id] = {
    groupId: group.id,
    sortDate: sortDate,
    rows: buildApplicationRowsForGroup_(
      registry,
      group,
      state,
      file,
      path,
      hash,
      snapshot,
      sortDate
    )
  };
}


function buildApplicationRowsForGroup_(
  registry,
  group,
  state,
  file,
  path,
  hash,
  snapshot,
  sortDate
) {
  const seats = numberOrNull_(
    group.row[
      registry.headers['Мест']
    ]
  );

  const records = Object.keys(state.rows)
    .map(function (id) {
      return state.rows[id];
    })
    .sort(function (first, second) {
      const firstPosition = first.position === null
        ? Number.MAX_SAFE_INTEGER
        : first.position;

      const secondPosition = second.position === null
        ? Number.MAX_SAFE_INTEGER
        : second.position;

      return firstPosition - secondPosition;
    });

  let consentRank = 0;
  let contractRank = 0;

  return records.map(function (record) {
    if (record.hasConsent) {
      consentRank++;
    }

    if (record.hasContract) {
      contractRank++;
    }

    return {
      'Код поступающего': record.id,
      'Ключ профиля': makeApplicantProfileKey_(record.id),
      'Код для показа': maskApplicantCode_(record.id),
      'ID группы': group.id,
      'Вуз': group.university,
      'Основа': group.basis,
      'Конкурсная группа': group.name,
      'Приоритет': valueOrBlank_(record.priority),
      'Балл': valueOrBlank_(record.score),
      'Общая позиция': valueOrBlank_(record.position),
      'Статус': record.status,
      'Согласие': displayValue_(
        record.consentValue,
        state.hasConsentColumn
      ),
      'Согласие подано': record.hasConsent
        ? 'Да'
        : 'Нет',
      'Позиция по согласию': record.hasConsent
        ? consentRank
        : '',
      'Договор': displayValue_(
        record.contractValue,
        state.hasContractColumn
      ),
      'Договор заключён': record.hasContract
        ? 'Да'
        : 'Нет',
      'Позиция по договору': record.hasContract
        ? contractRank
        : '',
      'Мест': valueOrBlank_(seats),
      'Дата списка': snapshot,
      'Метка времени списка': sortDate,
      'ID файла Drive': file.getId(),
      'Файл': file.getName(),
      'Путь к файлу': path,
      'Хеш CSV': hash,
      'Время обработки': formatDateTime_(new Date())
    };
  });
}


function applyApplicationGroupUpdates_(ss, updates) {
  if (!Object.keys(updates).length) {
    return;
  }

  const sheet = ss.getSheetByName(
    CFG.sheets.allApplications
  );

  const changed = applyApplicationUpdatesToSheet_(
    sheet,
    updates
  );

  if (changed) {
    rebuildApplicantProfiles_(ss);
  }
}


function applyApplicationUpdatesToSheet_(sheet, updates) {
  const updateIds = Object.keys(updates);

  if (!updateIds.length) {
    return false;
  }

  const header = headers_(sheet);
  const data = sheet.getDataRange().getValues();
  const groupColumn = header.map['ID группы'];
  const dateColumn = header.map['Метка времени списка'];
  const currentDates = {};

  if (groupColumn !== undefined) {
    for (let i = 1; i < data.length; i++) {
      const groupId = String(
        data[i][groupColumn] || ''
      ).trim();

      const date = dateColumn === undefined
        ? 0
        : numberOrNull_(data[i][dateColumn]) || 0;

      if (
        groupId &&
        (
          currentDates[groupId] === undefined ||
          date > currentDates[groupId]
        )
      ) {
        currentDates[groupId] = date;
      }
    }
  }

  const accepted = {};

  updateIds.forEach(function (groupId) {
    const currentDate = currentDates[groupId] || 0;

    if (updates[groupId].sortDate >= currentDate) {
      accepted[groupId] = updates[groupId];
    }
  });

  const acceptedIds = Object.keys(accepted);

  if (!acceptedIds.length) {
    return false;
  }

  let remaining = [];

  for (let i = 1; i < data.length; i++) {
    const groupId = groupColumn === undefined
      ? ''
      : String(data[i][groupColumn] || '').trim();

    if (!accepted[groupId]) {
      remaining.push(rowToObject_(
        data[i],
        header.values
      ));
    }
  }

  acceptedIds.forEach(function (groupId) {
    remaining = remaining.concat(
      accepted[groupId].rows
    );
  });

  remaining.sort(compareApplicationObjects_);

  writeObjectsToSheet_(
    sheet,
    applicationMapHeaders_(),
    remaining,
    true
  );

  return true;
}


function publishApplicantStaging_(ss, replaceAll) {
  const staging = ss.getSheetByName(
    CFG.sheets.applicationsStaging
  );

  const header = headers_(staging);
  const data = staging.getDataRange().getValues();
  const liveSheet = ss.getSheetByName(
    CFG.sheets.allApplications
  );

  if (replaceAll) {
    const rows = data.slice(1).map(function (row) {
      return rowToObject_(row, header.values);
    });

    rows.sort(compareApplicationObjects_);

    writeObjectsToSheet_(
      liveSheet,
      applicationMapHeaders_(),
      rows,
      true
    );

    return;
  }

  const groupColumn = header.map['ID группы'];
  const dateColumn = header.map['Метка времени списка'];
  const updates = {};

  if (groupColumn === undefined) {
    return;
  }

  for (let i = 1; i < data.length; i++) {
    const groupId = String(
      data[i][groupColumn] || ''
    ).trim();

    if (!groupId) {
      continue;
    }

    if (!updates[groupId]) {
      updates[groupId] = {
        groupId: groupId,
        sortDate: dateColumn === undefined
          ? 0
          : numberOrNull_(data[i][dateColumn]) || 0,
        rows: []
      };
    }

    updates[groupId].rows.push(
      rowToObject_(data[i], header.values)
    );
  }

  applyApplicationUpdatesToSheet_(
    liveSheet,
    updates
  );
}


function rebuildApplicantProfiles_(ss) {
  const applicationsSheet = ss.getSheetByName(
    CFG.sheets.allApplications
  );

  const profilesSheet = ss.getSheetByName(
    CFG.sheets.applicants
  );

  const header = headers_(applicationsSheet);
  const data = applicationsSheet.getDataRange().getValues();
  const profiles = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(
      valueFromRow_(
        row,
        header.map,
        'Код поступающего',
        ''
      )
    ).trim();

    if (!code) {
      continue;
    }

    if (!profiles[code]) {
      profiles[code] = {
        code: code,
        profileKey: makeApplicantProfileKey_(code),
        universities: {},
        applications: 0,
        budget: 0,
        paid: 0,
        minPriority: null,
        maxScore: null,
        consents: 0,
        contracts: 0,
        latestSnapshot: '',
        latestSortDate: 0,
        directions: []
      };
    }

    const profile = profiles[code];
    const university = String(
      valueFromRow_(row, header.map, 'Вуз', '')
    );

    const basis = String(
      valueFromRow_(row, header.map, 'Основа', '')
    );

    const group = String(
      valueFromRow_(
        row,
        header.map,
        'Конкурсная группа',
        ''
      )
    );

    const priority = apiNumber_(
      valueFromRow_(
        row,
        header.map,
        'Приоритет',
        null
      )
    );

    const score = apiNumber_(
      valueFromRow_(row, header.map, 'Балл', null)
    );

    const sortDate = apiNumber_(
      valueFromRow_(
        row,
        header.map,
        'Метка времени списка',
        0
      )
    ) || 0;

    profile.universities[university] = true;
    profile.applications++;

    if (basis === 'Бюджет') {
      profile.budget++;
    }

    if (basis === 'Платное') {
      profile.paid++;
    }

    if (
      priority !== null &&
      (
        profile.minPriority === null ||
        priority < profile.minPriority
      )
    ) {
      profile.minPriority = priority;
    }

    if (
      score !== null &&
      (
        profile.maxScore === null ||
        score > profile.maxScore
      )
    ) {
      profile.maxScore = score;
    }

    if (
      basis === 'Бюджет' &&
      normalize_(
        valueFromRow_(
          row,
          header.map,
          'Согласие подано',
          ''
        )
      ) === 'да'
    ) {
      profile.consents++;
    }

    if (
      basis === 'Платное' &&
      normalize_(
        valueFromRow_(
          row,
          header.map,
          'Договор заключён',
          ''
        )
      ) === 'да'
    ) {
      profile.contracts++;
    }

    if (sortDate >= profile.latestSortDate) {
      profile.latestSortDate = sortDate;
      profile.latestSnapshot = displayDateValue_(
        valueFromRow_(
          row,
          header.map,
          'Дата списка',
          ''
        )
      );
    }

    profile.directions.push(
      university +
      ' · ' +
      basis +
      ' · ' +
      group +
      (
        priority === null
          ? ''
          : ' · приоритет ' + priority
      )
    );
  }

  const rows = Object.keys(profiles)
    .sort(function (first, second) {
      return first.localeCompare(second);
    })
    .map(function (code) {
      const profile = profiles[code];
      const universities = Object.keys(
        profile.universities
      ).sort();

      return {
        'Код поступающего': code,
        'Ключ профиля': profile.profileKey,
        'Код для показа': maskApplicantCode_(code),
        'Количество вузов': universities.length,
        'Количество заявлений': profile.applications,
        'Бюджетных заявлений': profile.budget,
        'Платных заявлений': profile.paid,
        'Лучший приоритет': valueOrBlank_(
          profile.minPriority
        ),
        'Максимальный балл': valueOrBlank_(
          profile.maxScore
        ),
        'Поданных согласий': profile.consents,
        'Заключённых договоров': profile.contracts,
        'Вузы': universities.join(' · '),
        'Направления и приоритеты':
          profile.directions.join('\n'),
        'Последний список': profile.latestSnapshot,
        'Метка последнего списка': profile.latestSortDate,
        'Время обновления': formatDateTime_(new Date())
      };
    });

  writeObjectsToSheet_(
    profilesSheet,
    applicantProfileHeaders_(),
    rows,
    true
  );
}


function buildApplicantsPayload_(params) {
  params = params || {};

  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const sheet = ss.getSheetByName(
    CFG.sheets.applicants
  );

  const limit = Math.max(
    1,
    Math.min(
      200,
      Math.floor(numberOrNull_(params.limit) || 100)
    )
  );

  const offset = Math.max(
    0,
    Math.floor(numberOrNull_(params.offset) || 0)
  );

  const university = String(
    params.university || ''
  ).trim();

  const basis = String(
    params.basis || ''
  ).trim();

  const confirmation = String(
    params.confirmation || ''
  ).trim();

  const direction = normalize_(
    params.direction || ''
  );

  const priority = apiNumber_(
    params.priority || ''
  );

  const exactCode = normalizeParticipantId_(
    params.query || ''
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      applicantsCount: 0,
      applicationsCount: 0,
      crossUniversityCount: 0,
      withConsentCount: 0,
      withContractCount: 0,
      consentsCount: 0,
      contractsCount: 0,
      universities: [],
      latestSnapshot: ''
    },
    total: 0,
    offset: offset,
    limit: limit,
    items: []
  };

  if (!sheet || sheet.getLastRow() < 2) {
    return payload;
  }

  const header = headers_(sheet).map;
  const data = sheet.getDataRange().getValues();
  const items = [];
  const allUniversities = {};
  let latestSnapshot = '';
  let latestTimestamp = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(
      valueFromRow_(
        row,
        header,
        'Код поступающего',
        ''
      )
    ).trim();

    const universities = String(
      valueFromRow_(row, header, 'Вузы', '')
    );

    const universityItems = universities
      ? universities.split(' · ')
      : [];

    const directions = String(
      valueFromRow_(
        row,
        header,
        'Направления и приоритеты',
        ''
      )
    );

    const budgetCount = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Бюджетных заявлений',
        0
      )
    ) || 0;

    const paidCount = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Платных заявлений',
        0
      )
    ) || 0;

    const consents = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Поданных согласий',
        0
      )
    ) || 0;

    const contracts = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Заключённых договоров',
        0
      )
    ) || 0;

    const applicationsCount = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Количество заявлений',
        0
      )
    ) || 0;

    const universitiesCount = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Количество вузов',
        0
      )
    ) || 0;

    const rowSnapshot = displayDateValue_(
      valueFromRow_(row, header, 'Последний список', '')
    );

    const rowTimestamp = apiNumber_(
      valueFromRow_(
        row,
        header,
        'Метка последнего списка',
        0
      )
    ) || 0;

    payload.summary.applicantsCount++;
    payload.summary.applicationsCount += applicationsCount;
    payload.summary.consentsCount += consents;
    payload.summary.contractsCount += contracts;

    if (universitiesCount > 1) {
      payload.summary.crossUniversityCount++;
    }

    if (consents > 0) {
      payload.summary.withConsentCount++;
    }

    if (contracts > 0) {
      payload.summary.withContractCount++;
    }

    universityItems.forEach(function (name) {
      if (name) {
        allUniversities[name] = true;
      }
    });

    if (rowTimestamp >= latestTimestamp) {
      latestTimestamp = rowTimestamp;
      latestSnapshot = rowSnapshot;
    }

    if (exactCode && code !== exactCode) {
      continue;
    }

    if (
      university &&
      universityItems.indexOf(university) === -1
    ) {
      continue;
    }

    if (
      direction &&
      normalize_(directions).indexOf(direction) === -1
    ) {
      continue;
    }

    if (
      priority !== null &&
      directions.split('\n').every(function (item) {
        return item.indexOf(
          ' · приоритет ' + priority
        ) === -1;
      })
    ) {
      continue;
    }

    if (basis === 'Бюджет' && budgetCount === 0) {
      continue;
    }

    if (basis === 'Платное' && paidCount === 0) {
      continue;
    }

    if (confirmation === 'consent' && consents === 0) {
      continue;
    }

    if (confirmation === 'contract' && contracts === 0) {
      continue;
    }

    if (
      confirmation === 'any' &&
      consents === 0 &&
      contracts === 0
    ) {
      continue;
    }

    items.push({
      profileKey: String(
        valueFromRow_(
          row,
          header,
          'Ключ профиля',
          ''
        )
      ),
      applicantCode: maskApplicantCode_(code),
      universitiesCount: universitiesCount,
      applicationsCount: applicationsCount,
      budgetCount: budgetCount,
      paidCount: paidCount,
      bestPriority: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Лучший приоритет',
          null
        )
      ),
      maxScore: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Максимальный балл',
          null
        )
      ),
      consentsCount: consents,
      contractsCount: contracts,
      universities: universityItems,
      latestSnapshot: rowSnapshot
    });
  }

  payload.summary.universities = Object.keys(
    allUniversities
  ).sort();
  payload.summary.latestSnapshot = latestSnapshot;
  payload.total = items.length;
  payload.items = items.slice(offset, offset + limit);

  return payload;
}


function buildApplicantProfilePayload_(params) {
  params = params || {};

  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const exactCode = normalizeParticipantId_(
    params.applicantId || ''
  );

  const profileKey = String(
    params.profileKey || ''
  ).trim();

  const resolvedCode = exactCode ||
    findApplicantCodeByProfileKey_(ss, profileKey);

  const payload = {
    generatedAt: new Date().toISOString(),
    found: false,
    applicantCode: '',
    profileKey: profileKey,
    summary: null,
    applications: []
  };

  if (!resolvedCode) {
    return payload;
  }

  const sheet = ss.getSheetByName(
    CFG.sheets.allApplications
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return payload;
  }

  const header = headers_(sheet).map;
  const data = sheet.getDataRange().getValues();
  const applications = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(
      valueFromRow_(
        row,
        header,
        'Код поступающего',
        ''
      )
    ).trim();

    if (code !== resolvedCode) {
      continue;
    }

    applications.push({
      groupId: String(
        valueFromRow_(row, header, 'ID группы', '')
      ),
      university: String(
        valueFromRow_(row, header, 'Вуз', '')
      ),
      basis: String(
        valueFromRow_(row, header, 'Основа', '')
      ),
      group: String(
        valueFromRow_(
          row,
          header,
          'Конкурсная группа',
          ''
        )
      ),
      priority: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Приоритет',
          null
        )
      ),
      score: apiNumber_(
        valueFromRow_(row, header, 'Балл', null)
      ),
      generalPosition: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Общая позиция',
          null
        )
      ),
      status: String(
        valueFromRow_(row, header, 'Статус', '')
      ),
      consent: String(
        valueFromRow_(row, header, 'Согласие', '')
      ),
      hasConsent:
        normalize_(
          valueFromRow_(
            row,
            header,
            'Согласие подано',
            ''
          )
        ) === 'да',
      consentRank: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Позиция по согласию',
          null
        )
      ),
      contract: String(
        valueFromRow_(row, header, 'Договор', '')
      ),
      hasContract:
        normalize_(
          valueFromRow_(
            row,
            header,
            'Договор заключён',
            ''
          )
        ) === 'да',
      contractRank: apiNumber_(
        valueFromRow_(
          row,
          header,
          'Позиция по договору',
          null
        )
      ),
      seats: apiNumber_(
        valueFromRow_(row, header, 'Мест', null)
      ),
      snapshot: displayDateValue_(
        valueFromRow_(
          row,
          header,
          'Дата списка',
          ''
        )
      )
    });
  }

  applications.sort(function (first, second) {
    return first.university.localeCompare(second.university) ||
      first.basis.localeCompare(second.basis) ||
      (first.priority || 999) - (second.priority || 999) ||
      first.group.localeCompare(second.group);
  });

  if (!applications.length) {
    return payload;
  }

  const universities = {};
  let consents = 0;
  let contracts = 0;

  applications.forEach(function (item) {
    universities[item.university] = true;

    if (item.hasConsent && item.basis === 'Бюджет') {
      consents++;
    }

    if (item.hasContract && item.basis === 'Платное') {
      contracts++;
    }
  });

  payload.found = true;
  payload.applicantCode = exactCode
    ? resolvedCode
    : maskApplicantCode_(resolvedCode);
  payload.profileKey = makeApplicantProfileKey_(resolvedCode);
  payload.summary = {
    universitiesCount: Object.keys(universities).length,
    applicationsCount: applications.length,
    consentsCount: consents,
    contractsCount: contracts
  };
  payload.applications = applications;

  return payload;
}


function findApplicantCodeByProfileKey_(ss, profileKey) {
  if (!profileKey) {
    return '';
  }

  const sheet = ss.getSheetByName(
    CFG.sheets.applicants
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return '';
  }

  const header = headers_(sheet);
  const keyColumn = header.map['Ключ профиля'];
  const codeColumn = header.map['Код поступающего'];

  if (
    keyColumn === undefined ||
    codeColumn === undefined
  ) {
    return '';
  }

  const match = sheet
    .getRange(
      2,
      keyColumn + 1,
      sheet.getLastRow() - 1,
      1
    )
    .createTextFinder(profileKey)
    .matchEntireCell(true)
    .findNext();

  if (!match) {
    return '';
  }

  return String(
    sheet.getRange(
      match.getRow(),
      codeColumn + 1
    ).getValue() || ''
  ).trim();
}


function makeApplicantProfileKey_(code) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('APPLICANT_PROFILE_SALT');

  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('APPLICANT_PROFILE_SALT', salt);
  }

  const bytes = Utilities.computeHmacSha256Signature(
    String(code || ''),
    salt,
    Utilities.Charset.UTF_8
  );

  return bytes
    .slice(0, 16)
    .map(function (byte) {
      const value = (byte + 256) % 256;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}


function maskApplicantCode_(code) {
  const value = String(code || '').trim();

  if (value.length <= 4) {
    return value.replace(/.(?=..)/g, '*');
  }

  return (
    value.slice(0, 3) +
    '*'.repeat(Math.max(3, value.length - 5)) +
    value.slice(-2)
  );
}


function compareApplicationObjects_(first, second) {
  return String(first['Код поступающего'] || '')
    .localeCompare(
      String(second['Код поступающего'] || '')
    ) ||
    String(first['Вуз'] || '')
      .localeCompare(String(second['Вуз'] || '')) ||
    String(first['Основа'] || '')
      .localeCompare(String(second['Основа'] || '')) ||
    (numberOrNull_(first['Приоритет']) || 999) -
      (numberOrNull_(second['Приоритет']) || 999) ||
    String(first['Конкурсная группа'] || '')
      .localeCompare(
        String(second['Конкурсная группа'] || '')
      );
}


function applicationMapHeaders_() {
  return [
    'Код поступающего',
    'Ключ профиля',
    'Код для показа',
    'ID группы',
    'Вуз',
    'Основа',
    'Конкурсная группа',
    'Приоритет',
    'Балл',
    'Общая позиция',
    'Статус',
    'Согласие',
    'Согласие подано',
    'Позиция по согласию',
    'Договор',
    'Договор заключён',
    'Позиция по договору',
    'Мест',
    'Дата списка',
    'Метка времени списка',
    'ID файла Drive',
    'Файл',
    'Путь к файлу',
    'Хеш CSV',
    'Время обработки'
  ];
}


function applicantProfileHeaders_() {
  return [
    'Код поступающего',
    'Ключ профиля',
    'Код для показа',
    'Количество вузов',
    'Количество заявлений',
    'Бюджетных заявлений',
    'Платных заявлений',
    'Лучший приоритет',
    'Максимальный балл',
    'Поданных согласий',
    'Заключённых договоров',
    'Вузы',
    'Направления и приоритеты',
    'Последний список',
    'Метка последнего списка',
    'Время обновления'
  ];
}


function getOrCreateAnalysisSheet_(ss, name, hidden) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (hidden && !sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  if (!hidden && sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  return sheet;
}


function clearDataRows_(sheet) {
  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        Math.max(1, sheet.getLastColumn())
      )
      .clearContent();
  }
}


function rowToObject_(row, headerNames) {
  const result = {};

  headerNames.forEach(function (name, index) {
    if (name) {
      result[name] = row[index];
    }
  });

  return result;
}


function writeObjectsToSheet_(
  sheet,
  headerNames,
  objects,
  addFilter
) {
  const values = [headerNames].concat(
    objects.map(function (item) {
      return headerNames.map(function (name) {
        return Object.prototype.hasOwnProperty.call(
          item,
          name
        )
          ? item[name]
          : '';
      });
    })
  );

  ensureSheetCapacity_(
    sheet,
    values.length,
    headerNames.length
  );

  const filter = sheet.getFilter();

  if (filter) {
    filter.remove();
  }

  sheet.getDataRange().clearContent();

  sheet
    .getRange(
      1,
      1,
      values.length,
      headerNames.length
    )
    .setValues(values);

  sheet
    .getRange(1, 1, 1, headerNames.length)
    .setFontWeight('bold')
    .setBackground('#EAF0F5')
    .setWrap(true);

  sheet.setFrozenRows(1);

  if (addFilter && values.length > 1) {
    sheet
      .getRange(
        1,
        1,
        values.length,
        headerNames.length
      )
      .createFilter();
  }
}


function ensureSheetCapacity_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      rows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columns - sheet.getMaxColumns()
    );
  }
}


/* =========================================================
   БЕЗОПАСНЫЙ ПАРСЕР CSV
   ========================================================= */

function parseCsv_(text) {
  const clean = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const firstLine = clean.split('\n')[0] || '';
  const delimiter = detectDelimiter_(firstLine);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean.charAt(i);
    const next = clean.charAt(i + 1);

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (
      char === delimiter &&
      !inQuotes
    ) {
      row.push(field);
      field = '';
      continue;
    }

    if (
      char === '\n' &&
      !inQuotes
    ) {
      row.push(field);

      if (row.some(function (value) {
        return String(value).trim() !== '';
      })) {
        rows.push(row);
      }

      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length) {
    row.push(field);

    if (row.some(function (value) {
      return String(value).trim() !== '';
    })) {
      rows.push(row);
    }
  }

  return rows;
}


function detectDelimiter_(line) {
  const semicolons = countDelimiter_(line, ';');
  const commas = countDelimiter_(line, ',');

  return semicolons >= commas
    ? ';'
    : ',';
}


function countDelimiter_(text, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    const next = text.charAt(i + 1);

    if (char === '"') {
      if (inQuotes && next === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (
      char === delimiter &&
      !inQuotes
    ) {
      count++;
    }
  }

  return count;
}


function findHeaderRow_(data) {
  const maxRows = Math.min(
    data.length,
    15
  );

  for (let i = 0; i < maxRows; i++) {
    const line = data[i]
      .map(normalize_)
      .join(' | ');

    const hasId =
      line.indexOf('абитуриент') !== -1 ||
      line.indexOf('поступающ') !== -1 ||
      line.indexOf('участник') !== -1 ||
      line.indexOf('идентификатор') !== -1 ||
      line.indexOf('уникальный номер') !== -1;

    const hasPosition =
      line.indexOf('позиция') !== -1 ||
      line.indexOf('место') !== -1 ||
      line.indexOf('рейтинг') !== -1 ||
      line.indexOf('порядковый номер') !== -1;

    if (hasId && hasPosition) {
      return i;
    }
  }

  return -1;
}


function findHeader_(headers, variants) {
  for (let i = 0; i < variants.length; i++) {
    const target = normalize_(variants[i]);

    const index = headers.findIndex(function (header) {
      return header.indexOf(target) !== -1;
    });

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}


/* =========================================================
   ПАПКИ И СОПОСТАВЛЕНИЕ ПРОГРАММ
   ========================================================= */

function getAllCsvFiles_() {
  const root = DriveApp.getFolderById(
    CFG.rootFolderId
  );

  const result = [];

  walkFolder_(
    root,
    [root.getName()],
    result
  );

  return result;
}


function walkFolder_(
  folder,
  pathNames,
  result
) {
  if (
    CFG.ignoredFolders.indexOf(
      normalize_(folder.getName())
    ) !== -1
  ) {
    return;
  }

  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();

    if (/\.csv$/i.test(file.getName())) {
      result.push({
        file: file,
        pathNames: pathNames,
        path: pathNames.join(' / ')
      });
    }
  }

  const folders = folder.getFolders();

  while (folders.hasNext()) {
    const child = folders.next();

    walkFolder_(
      child,
      pathNames.concat([child.getName()]),
      result
    );
  }
}


function getFolderContext_(pathNames) {
  let university = '';
  let basis = '';

  for (
    let i = pathNames.length - 1;
    i >= 0;
    i--
  ) {
    const name = normalize_(pathNames[i]);

    if (!university) {
      if (name.indexOf('урфу') !== -1) {
        university = 'УрФУ';
      }

      if (name.indexOf('спбгэу') !== -1) {
        university = 'СПбГЭУ';
      }

      if (
        name.indexOf('спбпу') !== -1 ||
        name.indexOf('политех') !== -1
      ) {
        university = 'СПбПУ';
      }

      if (
        name.indexOf('спбгуптд') !== -1 ||
        name.indexOf('технологии и дизайн') !== -1
      ) {
        university = 'СПбГУПТД';
      }

      if (
        name.indexOf('спбгмту') !== -1 ||
        name.indexOf('морской') !== -1
      ) {
        university = 'СПбГМТУ';
      }
    }

    if (!basis) {
      if (name.indexOf('бюджет') !== -1) {
        basis = 'Бюджет';
      }

      if (
        name.indexOf('платк') !== -1 ||
        name.indexOf('платн') !== -1 ||
        name.indexOf('договор') !== -1
      ) {
        basis = 'Платное';
      }
    }
  }

  if (!university || !basis) {
    return null;
  }

  return {
    university: university,
    basis: basis,
    key: university + '|' + basis
  };
}


const FILE_ALIASES = {
  'УрФУ|Бюджет': [
    ['URFU-B-01', ['международный и корпоративный менеджмент']],
    ['URFU-B-02', ['промышленный менеджмент']],
    ['URFU-B-03', ['менеджмент в энергетике']],
    ['URFU-B-04', ['мировая экономика и международный бизнес']],
    ['URFU-B-05', ['прикладная экономика и финансы']],
    ['URFU-B-06', ['управление персоналом']],
    ['URFU-B-07', ['маркетинг и логистика']]
  ],

  'УрФУ|Платное': [
    ['URFU-P-01', ['международный и корпоративный менеджмент']],
    ['URFU-P-02', ['промышленный менеджмент']],
    ['URFU-P-03', ['мировая экономика и международный бизнес']],
    ['URFU-P-04', ['менеджмент в энергетике']],
    ['URFU-P-05', ['маркетинг и логистика']],
    ['URFU-P-06', ['управление персоналом']],
    ['URFU-P-07', ['прикладная экономика и финансы']]
  ],

  'СПбГЭУ|Бюджет': [
    ['SPBGEU-B-01', [
      'менеджмент общий список',
      'маркетинг и управление брендами',
      'управление бизнесом',
      'международный бизнес',
      'финансовый менеджмент'
    ]],

    ['SPBGEU-B-02', [
      'коммерция',
      'электронная торговля'
    ]],

    ['SPBGEU-B-03', [
      'нефтегаз'
    ]],

    ['SPBGEU-B-04', [
      'экономика общий список',
      'бухгалтерский учет',
      'мировая экономика',
      'финансы и кредит',
      'экономика предпринимательства'
    ]],

    ['SPBGEU-B-05', [
      'транспортн'
    ]],

    ['SPBGEU-B-06', [
      'кадров'
    ]]
  ],

  'СПбГЭУ|Платное': [
    ['SPBGEU-P-01', [
      'экономика общий список',
      'бухгалтерский учет',
      'математическое моделирование',
      'мировая экономика',
      'финансы и кредит',
      'экономика предпринимательства'
    ]],

    ['SPBGEU-P-02', [
      'менеджмент общий список',
      'маркетинг и управление брендами',
      'управление бизнесом',
      'промышленный хайтек',
      'финансовый менеджмент',
      'международный бизнес',
      'логисти'
    ]],

    ['SPBGEU-P-03', [
      'нефтегаз'
    ]],

    ['SPBGEU-P-04', [
      'международной компании'
    ]],

    ['SPBGEU-P-05', [
      'бизнес администрирование',
      'цифровые инновации'
    ]],

    ['SPBGEU-P-06', [
      'коммерция',
      'электронная торговля'
    ]],

    ['SPBGEU-P-07', [
      'транспортн'
    ]],

    ['SPBGEU-P-08', [
      'кадров'
    ]],

    ['SPBGEU-P-09', [
      'китайск'
    ]]
  ],

  'СПбПУ|Бюджет': [
    ['SPBPU-B-06', [
      'digital enterprise',
      'экономика цифрового предприятия'
    ]],

    ['SPBPU-B-07', [
      'международная торговля',
      'international trade'
    ]],

    ['SPBPU-B-08', [
      'международный бизнес',
      'international business'
    ]],

    ['SPBPU-B-05', [
      'интеллектуальные системы'
    ]],

    ['SPBPU-B-04', [
      'товароведение'
    ]],

    ['SPBPU-B-02', [
      'торговое дело'
    ]],

    ['SPBPU-B-01', [
      'менеджмент'
    ]],

    ['SPBPU-B-03', [
      'экономика'
    ]]
  ],

  'СПбПУ|Платное': [
    ['SPBPU-P-06', [
      'digital enterprise',
      'экономика цифрового предприятия'
    ]],

    ['SPBPU-P-05', [
      'международная торговля',
      'international trade'
    ]],

    ['SPBPU-P-03', [
      'международный бизнес',
      'international business'
    ]],

    ['SPBPU-P-07', [
      'интеллектуальные системы'
    ]],

    ['SPBPU-P-04', [
      'торговое дело'
    ]],

    ['SPBPU-P-02', [
      'менеджмент'
    ]],

    ['SPBPU-P-01', [
      'экономика'
    ]]
  ],

  'СПбГУПТД|Бюджет': [
    ['SPBGUPTD-B-01', [
      'государственное и муниципальное'
    ]]
  ],

  'СПбГУПТД|Платное': [
    ['SPBGUPTD-P-01', [
      'финансовые технологии'
    ]],

    ['SPBGUPTD-P-02', [
      'управление малым бизнесом',
      'международный менеджмент',
      'креативный менеджмент',
      'бизнес администрирование'
    ]],

    ['SPBGUPTD-P-03', [
      'экономика предприятий'
    ]],

    ['SPBGUPTD-P-04', [
      'бизнес аналитика',
      'экономика и анализ данных'
    ]],

    ['SPBGUPTD-P-05', [
      'международный бизнес'
    ]],

    ['SPBGUPTD-P-06', [
      'бухгалтерский учет',
      'аудит'
    ]],

    ['SPBGUPTD-P-07', [
      'маркетинг'
    ]],

    ['SPBGUPTD-P-08', [
      'медиабизнес',
      'полиграфии'
    ]],

    ['SPBGUPTD-P-09', [
      'государственное и муниципальное'
    ]],

    ['SPBGUPTD-P-10', [
      'рыночная аналитика',
      'финансовый менеджмент',
      'логистика'
    ]],

    ['SPBGUPTD-P-11', [
      'кадровый менеджмент',
      'hr менеджмент'
    ]]
  ],

  'СПбГМТУ|Бюджет': [
    ['SPBGMTU-B-01', [
      'мировая экономика',
      'экономика и управление'
    ]],

    ['SPBGMTU-B-02', [
      'производственный менеджмент',
      'международный индустриальный менеджмент'
    ]]
  ],

  'СПбГМТУ|Платное': [
    ['SPBGMTU-P-01', [
      'мировая экономика',
      'экономика и управление'
    ]],

    ['SPBGMTU-P-02', [
      'производственный менеджмент',
      'международный индустриальный менеджмент'
    ]]
  ]
};


function findGroup_(registry, context, fileName) {
  const fileText = normalize_(
    removeExtension_(fileName)
  );

  const aliases = FILE_ALIASES[context.key] || [];

  for (let i = 0; i < aliases.length; i++) {
    const groupId = aliases[i][0];
    const phrases = aliases[i][1];

    for (let j = 0; j < phrases.length; j++) {
      if (
        fileText.indexOf(
          normalize_(phrases[j])
        ) !== -1
      ) {
        return registry.byId[groupId] || null;
      }
    }
  }

  const candidates = registry.records.filter(function (record) {
    return (
      record.university === context.university &&
      record.basis === context.basis
    );
  });

  let bestRecord = null;
  let bestScore = 0;

  candidates.forEach(function (record) {
    const score = similarity_(
      fileText,
      normalize_(record.name)
    );

    if (score > bestScore) {
      bestScore = score;
      bestRecord = record;
    }
  });

  return bestScore >= 0.55
    ? bestRecord
    : null;
}


function similarity_(first, second) {
  const stopWords = [
    'группа',
    'список',
    'общий',
    'конкурс',
    'программа',
    'направление',
    'поступление',
    'абитуриенты',
    'абитуриент',
    'реализуется',
    'частично'
  ];

  const firstTokens = tokens_(
    first,
    stopWords
  );

  const secondTokens = tokens_(
    second,
    stopWords
  );

  if (
    !firstTokens.length ||
    !secondTokens.length
  ) {
    return 0;
  }

  let common = 0;

  firstTokens.forEach(function (token) {
    if (secondTokens.indexOf(token) !== -1) {
      common++;
    }
  });

  return (
    2 * common
  ) / (
    firstTokens.length +
    secondTokens.length
  );
}


function tokens_(text, stopWords) {
  const tokens = normalize_(text)
    .split(' ')
    .filter(function (token) {
      return (
        token.length > 2 &&
        stopWords.indexOf(token) === -1
      );
    });

  return tokens.filter(function (token, index) {
    return tokens.indexOf(token) === index;
  });
}


/* =========================================================
   РЕЕСТР, СНИМКИ, ЖУРНАЛ, ТЕХНИЧЕСКОЕ СОСТОЯНИЕ
   ========================================================= */

function ensureSchemas_(ss) {
  const registry = ss.getSheetByName(CFG.sheets.registry);
  const snapshots = ss.getSheetByName(CFG.sheets.snapshots);
  const changes = getOrCreateChangesSheet_(ss);
  const journal = ss.getSheetByName(CFG.sheets.journal);
  const state = getOrCreateStateSheet_(ss);
  const plan = ss.getSheetByName(CFG.sheets.plan);
  const allApplications = getOrCreateAnalysisSheet_(
    ss,
    CFG.sheets.allApplications,
    false
  );
  const applicants = getOrCreateAnalysisSheet_(
    ss,
    CFG.sheets.applicants,
    false
  );
  const applicationsStaging = getOrCreateAnalysisSheet_(
    ss,
    CFG.sheets.applicationsStaging,
    true
  );

  ensureHeaders_(registry, [
    'Приоритет',
    'Согласие Елисея',
    'Согласий всего',
    'Согласий выше Елисея',
    'Согласий выше с более высоким приоритетом',
    'Договор Елисея',
    'Договоров всего',
    'Договоров выше Елисея',
    'Договоров выше с более высоким приоритетом',
    'Позиция по договору',
    'Активная позиция',
    'Источник активности',
    'Последний файл ID',
    'Последнее обновление CSV',
    'Предыдущая общая позиция',
    'Изменение общей позиции',
    'Предыдущая активная позиция',
    'Изменение активной позиции',
    'Комментарий к сравнению'
  ]);

  ensureHeaders_(snapshots, [
    'Статус Елисея',
    'Приоритет',
    'Рекомендация',
    'Согласие Елисея',
    'Согласий всего',
    'Согласий выше Елисея',
    'Согласий выше с более высоким приоритетом',
    'Договор Елисея',
    'Договоров всего',
    'Договоров выше Елисея',
    'Договоров выше с более высоким приоритетом',
    'Позиция по договору',
    'Активная позиция',
    'Источник активности',
    'ID файла Drive',
    'Хеш содержимого',
    'Путь к файлу',
    'Время обработки',
    'Предыдущая общая позиция',
    'Изменение общей позиции',
    'Предыдущая активная позиция',
    'Изменение активной позиции',
    'Комментарий к сравнению'
  ]);

  ensureHeaders_(journal, [
    'ID файла Drive',
    'Хеш содержимого',
    'Ключ дедупликации',
    'Путь к файлу',
    'Время изменения CSV',
    'Время обработки',
    'Режим'
  ]);

  ensureHeaders_(state, [
    'Ключ дедупликации',
    'ID файла Drive',
    'Хеш содержимого',
    'Путь к файлу',
    'Файл',
    'Время изменения CSV',
    'Время фиксации',
    'Режим'
  ]);

  ensureHeaders_(changes, [
    'Ключ изменения',
    'Дата текущего снимка',
    'Дата предыдущего снимка',
    'ID группы',
    'Вуз',
    'Основа',
    'Конкурсная группа',
    'ID текущего файла Drive',
    'ID предыдущего файла Drive',
    'Хеш текущего CSV',
    'Хеш предыдущего CSV',
    'Приоритет Елисея текущий',
    'Приоритет Елисея предыдущий',
    'Новых заявлений',
    'Новых заявлений — из них приоритет выше',
    'Ушло заявлений',
    'Ушло заявлений — из них приоритет выше',
    'Новых согласий',
    'Новых согласий — из них приоритет выше',
    'Новых договоров',
    'Новых договоров — из них приоритет выше',
    'Ушло согласий вместе с заявлениями',
    'Ушло согласий вместе с заявлениями — из них приоритет выше',
    'Ушло договоров вместе с заявлениями',
    'Ушло договоров вместе с заявлениями — из них приоритет выше',
    'Комментарий',
    'Количество участников в текущем снимке',
    'Количество участников в предыдущем снимке',
    'Время расчёта'
  ]);

  ensureHeaders_(
    allApplications,
    applicationMapHeaders_()
  );

  ensureHeaders_(
    applicationsStaging,
    applicationMapHeaders_()
  );

  ensureHeaders_(
    applicants,
    applicantProfileHeaders_()
  );

  if (plan) {
    ensureHeaders_(plan, [
      'Стоимость за семестр, ₽',
      'Готовность данных'
    ]);
  }
}


function getOrCreateChangesSheet_(ss) {
  let sheet = ss.getSheetByName(CFG.sheets.changes);

  if (!sheet) {
    sheet = ss.insertSheet(CFG.sheets.changes);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


function getOrCreateStateSheet_(ss) {
  let sheet = ss.getSheetByName(CFG.sheets.state);

  if (!sheet) {
    sheet = ss.insertSheet(CFG.sheets.state);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


function ensureHeaders_(sheet, requiredHeaders) {
  if (!sheet) {
    return;
  }

  const lastColumn = sheet.getLastColumn();

  const current = lastColumn > 0
    ? sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(String)
    : [];

  const missing = requiredHeaders.filter(function (header) {
    return current.indexOf(header) === -1;
  });

  if (!missing.length) {
    return;
  }

  sheet
    .getRange(
      1,
      lastColumn + 1,
      1,
      missing.length
    )
    .setValues([missing]);
}


function headers_(sheet) {
  const lastColumn = sheet.getLastColumn();

  const values = lastColumn > 0
    ? sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(String)
    : [];

  const map = {};

  values.forEach(function (name, index) {
    map[name] = index;
  });

  return {
    values: values,
    map: map
  };
}


function getRegistry_(sheet) {
  const data = sheet.getDataRange().getValues();
  const header = headers_(sheet);

  const records = [];
  const byId = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const id = String(
      row[header.map['ID']] || ''
    ).trim();

    const university = String(
      row[header.map['Вуз']] || ''
    ).trim();

    const basis = String(
      row[header.map['Основа']] || ''
    ).trim();

    const name = String(
      row[
        header.map[
          'Конкурсная группа / программа'
        ]
      ] || ''
    ).trim();

    if (
      !id ||
      !university ||
      !basis ||
      !name
    ) {
      continue;
    }

    const record = {
      id: id,
      university: university,
      basis: basis,
      name: name,
      rowNumber: i + 1,
      row: row
    };

    records.push(record);
    byId[id] = record;
  }

  return {
    headers: header.map,
    values: header.values,
    records: records,
    byId: byId
  };
}


function appendSnapshot_(sheet, values) {
  appendByHeaders_(sheet, values);
}


function appendState_(sheet, values) {
  appendByHeaders_(sheet, values);
}


function appendJournal_(sheet, data) {
  appendByHeaders_(sheet, {
    'Дата': formatDate_(new Date()),

    'Вуз': data.context
      ? data.context.university
      : 'Не распознано',

    'Основа': data.context
      ? data.context.basis
      : 'Не распознано',

    'ID группы': data.group
      ? data.group.id
      : 'Не сопоставлено',

    'Конкурсная группа': data.group
      ? data.group.name
      : '',

    'Файл': data.file.getName(),

    'Строка 1431604 извлечена':
      data.extracted,

    'Добавлено в снимки':
      data.added,

    'Комментарий':
      data.comment,

    'ID файла Drive':
      data.file.getId(),

    'Хеш содержимого':
      data.hash,

    'Ключ дедупликации':
      data.key,

    'Путь к файлу':
      data.path,

    'Время изменения CSV':
      formatDateTime_(
        data.file.getLastUpdated()
      ),

    'Время обработки':
      formatDateTime_(new Date()),

    'Режим':
      data.mode
  });
}


function appendByHeaders_(sheet, values) {
  const headers = headers_(sheet).values;

  sheet.appendRow(
    headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(
        values,
        header
      )
        ? values[header]
        : '';
    })
  );
}


function updateRegistry_(sheet, group, values) {
  const header = headers_(sheet);

  const row = sheet
    .getRange(
      group.rowNumber,
      1,
      1,
      header.values.length
    )
    .getValues()[0];

  Object.keys(values).forEach(function (name) {
    if (header.map[name] !== undefined) {
      row[header.map[name]] = values[name];
    }
  });

  sheet
    .getRange(
      group.rowNumber,
      1,
      1,
      header.values.length
    )
    .setValues([row]);
}


function updateRowByHeaders_(
  sheet,
  rowNumber,
  values
) {
  const header = headers_(sheet);

  const row = sheet
    .getRange(
      rowNumber,
      1,
      1,
      header.values.length
    )
    .getValues()[0];

  Object.keys(values).forEach(function (name) {
    if (header.map[name] !== undefined) {
      row[header.map[name]] = values[name];
    }
  });

  sheet
    .getRange(
      rowNumber,
      1,
      1,
      header.values.length
    )
    .setValues([row]);
}


function buildSnapshotIndex_(sheet) {
  const header = headers_(sheet);
  const data = sheet.getDataRange().getValues();

  const groupIndex = header.map['ID группы'];
  const hashIndex = header.map['Хеш содержимого'];

  const result = {};

  if (
    groupIndex === undefined ||
    hashIndex === undefined
  ) {
    return result;
  }

  for (let i = 1; i < data.length; i++) {
    const groupId = String(
      data[i][groupIndex] || ''
    ).trim();

    const hash = String(
      data[i][hashIndex] || ''
    ).trim();

    if (!groupId || !hash) {
      continue;
    }

    if (!result[groupId]) {
      result[groupId] = [];
    }

    result[groupId].push({
      rowNumber: i + 1,
      hash: hash
    });
  }

  return result;
}


function findSnapshotByHash_(
  snapshotIndex,
  groupId,
  hash
) {
  const items = snapshotIndex[groupId] || [];

  return items.find(function (item) {
    return item.hash === hash;
  }) || null;
}


function getKnownKeys_(sheet) {
  const header = headers_(sheet);

  const keyIndex =
    header.map['Ключ дедупликации'];

  const result = {};

  if (
    keyIndex === undefined ||
    sheet.getLastRow() < 2
  ) {
    return result;
  }

  sheet
    .getRange(
      2,
      keyIndex + 1,
      sheet.getLastRow() - 1,
      1
    )
    .getValues()
    .forEach(function (row) {
      if (row[0]) {
        result[String(row[0])] = true;
      }
    });

  return result;
}


function makeDedupeKey_(
  context,
  group,
  path,
  hash
) {
  if (group) {
    return 'GROUP|' + group.id + '|' + hash;
  }

  if (context) {
    return (
      'UNMATCHED|' +
      context.key +
      '|' +
      normalize_(path) +
      '|' +
      hash
    );
  }

  return (
    'UNKNOWN|' +
    normalize_(path) +
    '|' +
    hash
  );
}


function stateRow_(
  key,
  file,
  hash,
  path,
  mode
) {
  return {
    'Ключ дедупликации': key,
    'ID файла Drive': file.getId(),
    'Хеш содержимого': hash,
    'Путь к файлу': path,
    'Файл': file.getName(),

    'Время изменения CSV':
      formatDateTime_(
        file.getLastUpdated()
      ),

    'Время фиксации':
      formatDateTime_(new Date()),

    'Режим': mode
  };
}


function trimSnapshots_(sheet) {
  if (sheet.getLastRow() < 2) {
    return;
  }

  const header = headers_(sheet);
  const data = sheet.getDataRange().getValues();

  const groupColumn = header.map['ID группы'];
  const dateColumn = header.map['Дата и время списка'];

  if (
    groupColumn === undefined ||
    dateColumn === undefined
  ) {
    return;
  }

  const groups = {};

  for (let i = 1; i < data.length; i++) {
    const groupId = String(
      data[i][groupColumn] || ''
    ).trim();

    if (!groupId) {
      continue;
    }

    if (!groups[groupId]) {
      groups[groupId] = [];
    }

    groups[groupId].push({
      rowNumber: i + 1,
      sortDate: snapshotSortDate_(
        data[i][dateColumn],
        i + 1
      )
    });
  }

  const removeRows = [];

  Object.keys(groups).forEach(function (groupId) {
    groups[groupId]
      .sort(function (first, second) {
        return second.sortDate - first.sortDate;
      })
      .slice(CFG.maxSnapshotsPerGroup)
      .forEach(function (item) {
        removeRows.push(item.rowNumber);
      });
  });

  removeRows
    .sort(function (first, second) {
      return second - first;
    })
    .forEach(function (rowNumber) {
      sheet.deleteRow(rowNumber);
    });
}


/* =========================================================
   API И ДАННЫЕ ДЛЯ LOVABLE
   ========================================================= */

function buildAdmissionApiPayload_() {
  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const registrySheet = ss.getSheetByName(
    CFG.sheets.registry
  );

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

      lastUpdate:
        latestSnapshot ||
        'Нет обработанных списков',

      generatedAt:
        formatDateTime_(new Date()),

      stage:
        'Автоматическое обновление CSV',

      totalGroups:
        applications.length,

      receivedTotal:
        received.length,

      budgetTotal:
        budget.length,

      budgetReceived:
        budget.filter(function (item) {
          return item.hasList;
        }).length,

      paidTotal:
        paid.length,

      paidReceived:
        paid.filter(function (item) {
          return item.hasList;
        }).length
    },

    applications: applications,

    coverage:
      buildCoverage_(applications),

    topBudget:
      getTopPositions_(
        applications,
        'Бюджет',
        5
      ),

    topPaid:
      getTopPositions_(
        applications,
        'Платное',
        5
      )
  };
}


function registryRecordToApi_(
  record,
  headers,
  plan
) {
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
    value(
      'Согласие Елисея',
      'Не опубликовано'
    )
  );

  const contract = String(
    value(
      'Договор Елисея',
      'Не опубликовано'
    )
  );

  const consentRank = apiNumber_(
    value(
      'Позиция по согласию',
      null
    )
  );

  const contractRank = apiNumber_(
    value(
      'Позиция по договору',
      null
    )
  );

  let activeRank = null;

  let activeSource =
    'Предварительно по общей позиции';

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
    value(
      'Дата последнего списка',
      ''
    )
  );

  const registrySeats = apiNumber_(
    value('Мест', null)
  );

  const seats =
    plan &&
    plan.seats !== null
      ? plan.seats
      : registrySeats;

  const sourceFileId = String(
    value('Последний файл ID', '')
  ).trim();

  const activeAboveHigherPriority = resolveActiveAboveHigherPriority_(
    basis,
    sourceFileId,
    priority,
    basis === 'Бюджет'
      ? value(
        'Согласий выше с более высоким приоритетом',
        null
      )
      : value(
        'Договоров выше с более высоким приоритетом',
        null
      )
  );

  return {
    id: record.id,
    groupId: record.id,
    university: record.university,
    basis: basis,
    group: record.name,

    priority: priority,

    score: apiNumber_(
      value(
        'Балл Елисея',
        null
      )
    ),

    position: generalPosition,
    generalPosition: generalPosition,

    activeRank: activeRank,

    rankForDisplay:
      activeRank !== null
        ? activeRank
        : generalPosition,

    activeSource: activeSource,

    seats: seats,

    status: String(
      value(
        'Статус Елисея',
        'Нет данных'
      )
    ),

    snapshot: snapshot,

    consent: consent,

    consentsCount: apiNumber_(
      value(
        'Согласий всего',
        null
      )
    ),

    consentsAbove: apiNumber_(
      value(
        'Согласий выше Елисея',
        null
      )
    ),

    consentsAboveHigherPriority:
      basis === 'Бюджет'
        ? activeAboveHigherPriority
        : null,

    consentRank: consentRank,

    contract: contract,

    contractsCount: apiNumber_(
      value(
        'Договоров всего',
        null
      )
    ),

    contractsAbove: apiNumber_(
      value(
        'Договоров выше Елисея',
        null
      )
    ),

    contractsAboveHigherPriority:
      basis === 'Платное'
        ? activeAboveHigherPriority
        : null,

    contractRank: contractRank,

    gap: String(
      value(
        'Разрыв до места',
        'Не рассчитано'
      )
    ),

    trend: String(
      value(
        'Тренд',
        'Не рассчитано'
      )
    ),

    generalChange: String(
      value(
        'Изменение общей позиции',
        'Первый снимок'
      )
    ),

    activeChange: String(
      value(
        'Изменение активной позиции',
        'Нет сопоставимой активной позиции'
      )
    ),

    zone: String(
      value(
        'Зона',
        'Не рассчитано'
      )
    ),

    recommendation: String(
      value('Рекомендация', '')
    ),

    comment: String(
      value('Комментарий', '')
    ),

    semesterFeeText: plan
      ? plan.semesterFeeText
      : null,

    dataReadiness: plan
      ? plan.dataReadiness
      : 'Места и стоимость не сопоставлены',

    needsClarification: plan
      ? plan.needsClarification
      : true,

    sourceNote:
      plan &&
      plan.sourceNote
        ? plan.sourceNote
        : activeSource,

    hasList: Boolean(snapshot)
  };
}


/**
 * История снимков конкретной группы.
 * Не включает технические ID файлов и пути Drive.
 */
function buildChangesPayload_(params) {
  const groupId = String(
    params && params.groupId
      ? params.groupId
      : ''
  ).trim();

  const university = String(
    params && params.university
      ? params.university
      : ''
  ).trim();

  const basis = String(
    params && params.basis
      ? params.basis
      : ''
  ).trim();

  const limit = Math.max(
    0,
    Math.min(
      100,
      Math.floor(
        numberOrNull_(
          params && params.limit
            ? params.limit
            : ''
        ) || 0
      )
    )
  );

  const useCache = limit === 0;
  const cache = CacheService.getScriptCache();
  const cacheKey = makeChangesCacheKey_(
    groupId,
    university,
    basis
  );

  const cached = useCache
    ? cache.get(cacheKey)
    : null;

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      // Если кэш повреждён, пересобираем ответ ниже.
    }
  }

  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const sheet = ss.getSheetByName(
    CFG.sheets.changes
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: {
      groupId: groupId,
      university: university,
      basis: basis
    },
    items: []
  };

  if (!sheet || sheet.getLastRow() < 2) {
    if (useCache) {
      cache.put(cacheKey, JSON.stringify(payload), 300);
    }

    return payload;
  }

  const header = headers_(sheet).map;
  const rows = sheet.getDataRange().getValues();

  let items = [];

  for (let i = 1; i < rows.length; i++) {
    const item = changeRowToApiItem_(
      rows[i],
      header
    );

    if (
      groupId &&
      item.groupId !== groupId
    ) {
      continue;
    }

    if (
      university &&
      item.university !== university
    ) {
      continue;
    }

    if (
      basis &&
      item.basis !== basis
    ) {
      continue;
    }

    items.push(item);
  }

  items = items.sort(function (first, second) {
    return (
      apiTimestamp_(second.currentSnapshot) -
      apiTimestamp_(first.currentSnapshot)
    );
  });

  if (!groupId) {
    items = latestChangeByGroup_(items);
  }

  if (limit > 0) {
    items = items.slice(0, limit);
  }

  payload.items = items;

  if (useCache) {
    cache.put(cacheKey, JSON.stringify(payload), 300);
  }

  return payload;
}


function changeRowToApiItem_(
  row,
  header
) {
  const value = function (name, fallback) {
    return valueFromRow_(
      row,
      header,
      name,
      fallback
    );
  };

  return {
    groupId: String(
      value('ID группы', '')
    ),
    university: String(
      value('Вуз', '')
    ),
    basis: String(
      value('Основа', '')
    ),
    groupName: String(
      value('Конкурсная группа', '')
    ),

    currentSnapshot: displayDateValue_(
      value('Дата текущего снимка', '')
    ),
    previousSnapshot: displayDateValue_(
      value('Дата предыдущего снимка', '')
    ),

    applicantPriorityCurrent: apiNumber_(
      value('Приоритет Елисея текущий', null)
    ),
    applicantPriorityPrevious: apiNumber_(
      value('Приоритет Елисея предыдущий', null)
    ),

    newApplications: apiNumber_(
      value('Новых заявлений', null)
    ),
    newApplicationsHigherPriority: apiNumber_(
      value('Новых заявлений — из них приоритет выше', null)
    ),

    leftApplications: apiNumber_(
      value('Ушло заявлений', null)
    ),
    leftApplicationsHigherPriority: apiNumber_(
      value('Ушло заявлений — из них приоритет выше', null)
    ),

    newConsents: apiNumber_(
      value('Новых согласий', null)
    ),
    newConsentsHigherPriority: apiNumber_(
      value('Новых согласий — из них приоритет выше', null)
    ),

    newContracts: apiNumber_(
      value('Новых договоров', null)
    ),
    newContractsHigherPriority: apiNumber_(
      value('Новых договоров — из них приоритет выше', null)
    ),

    leftConsentsWithApplication: apiNumber_(
      value('Ушло согласий вместе с заявлениями', null)
    ),
    leftConsentsWithApplicationHigherPriority: apiNumber_(
      value('Ушло согласий вместе с заявлениями — из них приоритет выше', null)
    ),

    leftContractsWithApplication: apiNumber_(
      value('Ушло договоров вместе с заявлениями', null)
    ),
    leftContractsWithApplicationHigherPriority: apiNumber_(
      value('Ушло договоров вместе с заявлениями — из них приоритет выше', null)
    ),

    comment: String(
      value('Комментарий', '')
    ),
    calculatedAt: displayDateValue_(
      value('Время расчёта', '')
    )
  };
}


function latestChangeByGroup_(items) {
  const byGroup = {};

  items.forEach(function (item) {
    const existing = byGroup[item.groupId];

    if (
      !existing ||
      apiTimestamp_(item.currentSnapshot) >
      apiTimestamp_(existing.currentSnapshot)
    ) {
      byGroup[item.groupId] = item;
    }
  });

  return Object.keys(byGroup)
    .map(function (groupId) {
      return byGroup[groupId];
    })
    .sort(function (first, second) {
      return (
        apiTimestamp_(second.currentSnapshot) -
        apiTimestamp_(first.currentSnapshot)
      );
    });
}


function makeChangesCacheKey_(
  groupId,
  university,
  basis
) {
  if (groupId) {
    return 'changes:group:' + groupId;
  }

  if (university || basis) {
    return (
      'changes:' +
      (university || 'all') +
      ':' +
      (basis || 'all')
    );
  }

  return 'changes:all';
}


function buildFastGroupHistoryPayload_(groupId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'history:' + groupId;
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      // Если кэш повреждён, просто пересобираем ответ ниже.
    }
  }

  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const snapshotsSheet = ss.getSheetByName(
    CFG.sheets.snapshots
  );

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

    if (
      String(row[groupColumn] || '').trim() !==
      groupId
    ) {
      continue;
    }

    const value = function (name, fallback) {
      return valueFromRow_(
        row,
        header,
        name,
        fallback
      );
    };

    const snapshot = displayDateValue_(
      valueFromRow_(
        row,
        header,
        'Дата и время списка',
        ''
      )
    );

    const basis = String(
      value(
        'Основа',
        ''
      )
    );

    const generalPosition = apiNumber_(
      value(
        'Позиция общая',
        null
      )
    );

    const hash = String(
      value(
        'Хеш содержимого',
        ''
      )
    ).trim();

    const consent = String(
      value(
        'Согласие Елисея',
        'Не опубликовано'
      )
    );

    const contract = String(
      value(
        'Договор Елисея',
        'Не опубликовано'
      )
    );

    const consentRank = apiNumber_(
      value(
        'Позиция по согласию',
        null
      )
    );

    const contractRank = apiNumber_(
      value(
        'Позиция по договору',
        null
      )
    );

    let activeRank = null;
    let activeSource =
      'Предварительно по общей позиции';

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

    const item = {
      rowNumber: i + 1,
      sortDate: snapshotSortDate_(snapshot, i + 1),
      hash: hash,
      groupId: groupId,
      snapshot: snapshot,
      generalPosition: generalPosition,
      activeRank: activeRank,
      activeSource: activeSource,
      score: apiNumber_(
        value(
          'Балл Елисея',
          null
        )
      ),
      priority: apiNumber_(
        value(
          'Приоритет',
          null
        )
      ),
      status: String(
        value(
          'Статус Елисея',
          'Нет данных'
        )
      ),
      consent: consent,
      contract: contract,
      generalChange: String(
        value(
          'Изменение общей позиции',
          'Первый снимок'
        )
      ),
      activeChange: String(
        value(
          'Изменение активной позиции',
          'Нет сопоставимой активной позиции'
        )
      ),
      consentsCount: apiNumber_(
        value(
          'Согласий всего',
          null
        )
      ),
      consentsAbove: apiNumber_(
        value(
          'Согласий выше Елисея',
          null
        )
      ),
      consentsAboveHigherPriority: apiNumber_(
        value(
          'Согласий выше с более высоким приоритетом',
          null
        )
      ),
      contractsCount: apiNumber_(
        value(
          'Договоров всего',
          null
        )
      ),
      contractsAbove: apiNumber_(
        value(
          'Договоров выше Елисея',
          null
        )
      ),
      contractsAboveHigherPriority: apiNumber_(
        value(
          'Договоров выше с более высоким приоритетом',
          null
        )
      ),
      seats: apiNumber_(
        value(
          'Мест',
          null
        )
      ),
      gap: String(
        value(
          'Разрыв до места',
          'Не рассчитано'
        )
      ),
      zone: String(
        value(
          'Зона',
          'Не рассчитано'
        )
      ),
      recommendation: String(
        value(
          'Рекомендация',
          ''
        )
      )
    };

    const dedupeKey = item.hash
      ? 'hash|' + item.hash
      : 'fallback|' + item.snapshot + '|' + item.generalPosition;

    const existing = unique[dedupeKey];

    if (
      !existing ||
      item.sortDate > existing.sortDate ||
      (
        item.sortDate === existing.sortDate &&
        item.rowNumber > existing.rowNumber
      )
    ) {
      unique[dedupeKey] = item;
    }
  }

  payload.history = Object.keys(unique)
    .map(function (key) {
      return unique[key];
    })
    .sort(function (first, second) {
      return (
        first.sortDate -
        second.sortDate
      ) || (
        first.rowNumber -
        second.rowNumber
      );
    })
    .map(function (item) {
      return {
        groupId: item.groupId,
        snapshot: item.snapshot,
        generalPosition: item.generalPosition,
        activeRank: item.activeRank,
        activeSource: item.activeSource,
        generalChange: item.generalChange,
        activeChange: item.activeChange,
        score: item.score,
        priority: item.priority,
        status: item.status,
        consent: item.consent,
        contract: item.contract,
        consentsCount: item.consentsCount,
        consentsAbove: item.consentsAbove,
        consentsAboveHigherPriority:
          item.consentsAboveHigherPriority,
        contractsCount: item.contractsCount,
        contractsAbove: item.contractsAbove,
        contractsAboveHigherPriority:
          item.contractsAboveHigherPriority,
        seats: item.seats,
        gap: item.gap,
        zone: item.zone,
        recommendation: item.recommendation
      };
    });

  cache.put(cacheKey, JSON.stringify(payload), 300);

  return payload;
}


function buildGroupHistoryPayload_(groupId) {
  const ss = SpreadsheetApp.openById(
    CFG.spreadsheetId
  );

  const snapshotsSheet = ss.getSheetByName(
    CFG.sheets.snapshots
  );

  const planByGroup = getPlanDataByGroup_(ss);

  const histories = buildCanonicalHistories_(
    snapshotsSheet,
    planByGroup
  );

  const history = histories[groupId] || [];

  return {
    groupId: groupId,

    history: history.map(function (item) {
      return {
        groupId: item.groupId,
        snapshot: item.snapshot,
        score: item.score,

        generalPosition:
          item.generalPosition,

        activeRank:
          item.positionInfo.active,

        activeSource:
          item.positionInfo.source,

        generalChange:
          item.comparison.generalChange,

        activeChange:
          item.comparison.activeChange,

        status: item.status,

        consentsCount:
          item.consentsCount,

        consentsAbove:
          item.consentsAbove,

        consentsAboveHigherPriority:
          item.consentsAboveHigherPriority,

        contractsCount:
          item.contractsCount,

        contractsAbove:
          item.contractsAbove,

        contractsAboveHigherPriority:
          item.contractsAboveHigherPriority,

        seats: item.seats
      };
    })
  };
}


function resolveActiveAboveHigherPriority_(
  basis,
  sourceFileId,
  priority,
  storedValue
) {
  const stored = apiNumber_(storedValue);

  if (stored !== null) {
    return stored;
  }

  return countActiveAboveHigherPriority_(
    sourceFileId,
    basis,
    priority
  );
}


function getApplicantPriorityByFileId_(fileId) {
  if (!fileId) {
    return null;
  }

  const data = readSourceRowsByFileId_(fileId);

  return getApplicantPriorityFromRows_(data);
}


function getApplicantPriorityFromRows_(data) {
  if (!data || data.length < 2) {
    return null;
  }

  const headerRowIndex = findHeaderRow_(data);

  if (headerRowIndex === -1) {
    return null;
  }

  const headers = data[headerRowIndex]
    .map(normalize_);

  const idIndex = findHeader_(headers, [
    'id участника',
    'id абитуриента',
    'номер абитуриента',
    'код поступающего',
    'код абитуриента',
    'уникальный номер',
    'уникальный код',
    'идентификатор'
  ]);

  const priorityIndex = findHeader_(headers, [
    'приоритет зачисления',
    'приоритет конкурса',
    'приоритет'
  ]);

  if (
    idIndex === -1 ||
    priorityIndex === -1
  ) {
    return null;
  }

  const rows = data.slice(headerRowIndex + 1);

  for (let i = 0; i < rows.length; i++) {
    if (isApplicantId_(rows[i][idIndex])) {
      return apiNumber_(
        rows[i][priorityIndex]
      );
    }
  }

  return null;
}


function countActiveAboveHigherPriority_(
  fileId,
  basis,
  applicantPriority
) {
  if (!fileId) {
    return null;
  }

  const data = readSourceRowsByFileId_(fileId);

  return countActiveAboveHigherPriorityFromRows_(
    data,
    basis,
    applicantPriority
  );
}


function countActiveAboveHigherPriorityFromRows_(
  data,
  basis,
  applicantPriority
) {
  const knownPriority = apiNumber_(applicantPriority);

  if (knownPriority !== null && knownPriority <= 1) {
    return 0;
  }

  if (!data || data.length < 2) {
    return null;
  }

  const headerRowIndex = findHeaderRow_(data);

  if (headerRowIndex === -1) {
    return null;
  }

  const headers = data[headerRowIndex]
    .map(normalize_);

  const idIndex = findHeader_(headers, [
    'id участника',
    'id абитуриента',
    'номер абитуриента',
    'код поступающего',
    'код абитуриента',
    'уникальный номер',
    'уникальный код',
    'идентификатор'
  ]);

  const positionIndex = findHeader_(headers, [
    'порядковый номер',
    'номер в ранжированном списке',
    'позиция',
    'место',
    'рейтинг'
  ]);

  const priorityIndex = findHeader_(headers, [
    'приоритет зачисления',
    'приоритет конкурса',
    'приоритет'
  ]);

  const activeIndex = basis === 'Бюджет'
    ? findHeader_(headers, [
      'подано согласие',
      'согласие',
      'согласие на зачисление'
    ])
    : findHeader_(headers, [
      'наличие договора',
      'договор',
      'заключен договор',
      'заключён договор'
    ]);

  if (
    idIndex === -1 ||
    positionIndex === -1 ||
    priorityIndex === -1 ||
    activeIndex === -1
  ) {
    return null;
  }

  const rows = data.slice(headerRowIndex + 1);
  let candidateRow = null;

  rows.forEach(function (row) {
    if (isApplicantId_(row[idIndex])) {
      candidateRow = row;
    }
  });

  if (!candidateRow) {
    return null;
  }

  const targetPosition = numberOrNull_(
    candidateRow[positionIndex]
  );

  const targetPriority = knownPriority !== null
    ? knownPriority
    : apiNumber_(candidateRow[priorityIndex]);

  if (
    targetPosition === null ||
    targetPriority === null
  ) {
    return null;
  }

  if (targetPriority <= 1) {
    return 0;
  }

  let count = 0;

  rows.forEach(function (row) {
    const rowPosition = numberOrNull_(
      row[positionIndex]
    );

    const rowPriority = apiNumber_(
      row[priorityIndex]
    );

    if (
      rowPosition !== null &&
      rowPosition < targetPosition &&
      rowPriority !== null &&
      rowPriority < targetPriority &&
      isActiveForBasis_(basis, row[activeIndex])
    ) {
      count++;
    }
  });

  return count;
}


function readSourceRowsByFileId_(fileId) {
  try {
    readSourceRowsByFileId_.cache =
      readSourceRowsByFileId_.cache || {};

    if (readSourceRowsByFileId_.cache[fileId]) {
      return readSourceRowsByFileId_.cache[fileId];
    }

    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();
    let rows = null;

    if (
      mimeType ===
      'application/vnd.google-apps.spreadsheet'
    ) {
      rows = SpreadsheetApp
        .openById(fileId)
        .getSheets()[0]
        .getDataRange()
        .getValues();
    } else {
      rows = parseCsv_(getFileText_(file));
    }

    readSourceRowsByFileId_.cache[fileId] = rows;

    return rows;
  } catch (error) {
    return null;
  }
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


function buildCoverage_(applications) {
  const universities = [];

  applications.forEach(function (item) {
    if (
      universities.indexOf(
        item.university
      ) === -1
    ) {
      universities.push(item.university);
    }
  });

  return universities.map(function (university) {
    const items = applications.filter(function (item) {
      return item.university === university;
    });

    const budget = items.filter(function (item) {
      return item.basis === 'Бюджет';
    });

    const paid = items.filter(function (item) {
      return item.basis === 'Платное';
    });

    return {
      university: university,

      total: items.length,

      received: items.filter(function (item) {
        return item.hasList;
      }).length,

      budgetTotal: budget.length,

      budgetReceived: budget.filter(function (item) {
        return item.hasList;
      }).length,

      paidTotal: paid.length,

      paidReceived: paid.filter(function (item) {
        return item.hasList;
      }).length
    };
  });
}


function getTopPositions_(
  applications,
  basis,
  limit
) {
  return applications
    .filter(function (item) {
      return (
        item.basis === basis &&
        item.hasList &&
        item.rankForDisplay !== null
      );
    })
    .sort(function (first, second) {
      return (
        first.rankForDisplay -
        second.rankForDisplay
      );
    })
    .slice(0, limit);
}


/* =========================================================
   ЛИСТ «ДАШБОРД»
   ========================================================= */

function refreshGoogleDashboard_(ss) {
  const sheet = ss.getSheetByName(
    CFG.sheets.dashboard
  );

  if (!sheet) {
    throw new Error(
      'Не найден лист «Дашборд».'
    );
  }

  const data = buildAdmissionApiPayload_();

  resetDashboardSheet_(sheet);

  const columns = 13;

  const row = function (values) {
    const result = values.slice();

    while (result.length < columns) {
      result.push('');
    }

    return result;
  };

  const rows = [
    row([
      'Трекер поступления Елисея — 2026'
    ]),

    row([
      'Последняя версия списка: ' +
      data.meta.lastUpdate
    ]),

    row([
      'Получено списков: ' +
      data.meta.receivedTotal +
      ' из ' +
      data.meta.totalGroups
    ]),

    row(['']),

    row([
      'Текущие позиции'
    ]),

    row([
      'Вуз',
      'Основа',
      'Конкурсная группа',
      'Приоритет',
      'Балл',
      'Общая позиция',
      'Движение к предыдущему снимку',
      'Активная позиция',
      'Источник активной позиции',
      'Мест',
      'Стоимость за семестр',
      'Статус данных',
      'Дата списка'
    ])
  ];

  data.applications
    .filter(function (item) {
      return item.hasList;
    })
    .forEach(function (item) {
      rows.push(row([
        item.university,
        item.basis,
        item.group,
        item.priority,
        item.score,
        item.generalPosition,
        item.generalChange,
        item.activeRank === null
          ? '—'
          : item.activeRank,

        item.activeSource,

        item.seats === null
          ? 'Не сопоставлено'
          : item.seats,

        item.basis === 'Платное'
          ? (
            item.semesterFeeText ||
            'Стоимость уточняется'
          )
          : '—',

        item.dataReadiness,

        item.snapshot
      ]));
    });

  sheet
    .getRange(
      1,
      1,
      rows.length,
      columns
    )
    .setValues(rows);

  sheet
    .getRange(1, 1, 1, columns)
    .mergeAcross()
    .setFontWeight('bold')
    .setFontSize(16)
    .setBackground('#14324B')
    .setFontColor('#FFFFFF');

  sheet
    .getRange(2, 1, 2, columns)
    .mergeAcross()
    .setBackground('#EAF0F5')
    .setFontColor('#30465A');

  sheet
    .getRange(5, 1, 1, columns)
    .mergeAcross()
    .setFontWeight('bold')
    .setBackground('#EAF0F5');

  sheet
    .getRange(6, 1, 1, columns)
    .setFontWeight('bold')
    .setBackground('#F3F5F7')
    .setWrap(true)
    .setVerticalAlignment('middle');

  if (rows.length > 6) {
    sheet
      .getRange(
        7,
        1,
        rows.length - 6,
        columns
      )
      .setVerticalAlignment('top')
      .setWrap(true);
  }

  sheet.setFrozenRows(6);

  sheet.autoResizeColumns(
    1,
    columns
  );

  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(7, 190);
  sheet.setColumnWidth(9, 190);
  sheet.setColumnWidth(11, 160);
  sheet.setColumnWidth(12, 190);
  sheet.setColumnWidth(13, 145);
}


function resetDashboardSheet_(sheet) {
  const range = sheet.getRange(
    1,
    1,
    Math.max(
      sheet.getMaxRows(),
      100
    ),
    Math.max(
      sheet.getMaxColumns(),
      20
    )
  );

  try {
    range.breakApart();
  } catch (error) {
    // На пустом листе объединений может не быть.
  }

  range.clear();
  range.clearDataValidations();

  sheet.setConditionalFormatRules([]);
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
}


/* =========================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================= */

function getFileText_(file) {
  const blob = file.getBlob();

  let text = blob.getDataAsString('UTF-8');

  if (text.indexOf('�') !== -1) {
    text = blob.getDataAsString('windows-1251');
  }

  return String(text || '')
    .replace(/^\uFEFF/, '');
}


function makeHash_(text) {
  const prepared = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    prepared,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function (byte) {
    const value = (byte + 256) % 256;

    return (
      '0' + value.toString(16)
    ).slice(-2);
  }).join('');
}


function getListDate_(file) {
  const match = file.getName().match(
    /(20\d{2})[-._](\d{2})[-._](\d{2})[ _.-](\d{2})[-:](\d{2})(?:[-:](\d{2}))?/
  );

  if (match) {
    return (
      match[3] + '.' +
      match[2] + '.' +
      match[1] +
      ' ' +
      match[4] + ':' +
      match[5] +
      (
        match[6]
          ? ':' + match[6]
          : ''
      )
    );
  }

  return formatDateTime_(
    file.getLastUpdated()
  );
}


function snapshotSortDate_(value, fallback) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return value.getTime();
  }

  return apiTimestamp_(value) || fallback;
}


function apiTimestamp_(value) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return value.getTime();
  }

  const text = String(value || '').trim();

  let match = text.match(
    /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    ).getTime();
  }

  match = text.match(
    /(20\d{2})[-./](\d{2})[-./](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    ).getTime();
  }

  return 0;
}


function displayDateValue_(value) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return formatDateTime_(value);
  }

  return String(value || '').trim();
}


function valueFromRow_(
  row,
  headerMap,
  name,
  fallback
) {
  const index = headerMap[name];

  if (index === undefined) {
    return fallback;
  }

  const value = row[index];

  return (
    value === '' ||
    value === null ||
    value === undefined
  )
    ? fallback
    : value;
}


function numberOrNull_(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const clean = String(value)
    .replace(/\s/g, '')
    .replace(',', '.');

  if (!/^-?\d+(\.\d+)?$/.test(clean)) {
    return null;
  }

  const number = Number(clean);

  return Number.isFinite(number)
    ? number
    : null;
}


function apiNumber_(value) {
  return numberOrNull_(value);
}


function valueOrBlank_(value) {
  return (
    value === null ||
    value === undefined
  )
    ? ''
    : value;
}


function valueOrText_(value, fallback) {
  return (
    value === null ||
    value === undefined ||
    value === ''
  )
    ? fallback
    : value;
}


function displayValue_(value, columnExists) {
  if (!columnExists) {
    return 'Не опубликовано';
  }

  if (!value) {
    return '—';
  }

  return String(value).trim();
}


function removeExtension_(name) {
  return String(name || '')
    .replace(/\.csv$/i, '');
}


function normalize_(value) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_.:()[\]{}«»"'\/\\\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function formatDate_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


function formatDateTime_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy HH:mm:ss'
  );
}


function withLock_(callback) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Скрипт уже выполняется. Подождите около минуты и запустите снова.'
    );
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
