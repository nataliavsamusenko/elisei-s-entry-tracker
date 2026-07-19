import fs from "node:fs";
import { describe, expect, it } from "vitest";

const headers = [
  "Код поступающего",
  "ID группы",
  "Вуз",
  "Основа",
  "Конкурсная группа",
  "Приоритет",
  "Балл",
  "Общая позиция",
  "Статус",
  "Согласие подано",
  "Договор заключён",
  "Мест",
  "Дата списка",
];

const rows = [
  ["1431604", "TEST-B-01", "Тестовый вуз", "Бюджет", "Экономика", 2, 205, 4, "Участвует", "Нет", "Нет", 2, "19.07.2026 10:00:00"],
  ["1000001", "TEST-B-01", "Тестовый вуз", "Бюджет", "Экономика", 1, 210, 1, "Участвует", "Да", "Нет", 2, "19.07.2026 10:00:00"],
  ["1000002", "TEST-B-01", "Тестовый вуз", "Бюджет", "Экономика", 3, 206, 2, "Участвует", "Да", "Нет", 2, "19.07.2026 10:00:00"],
  ["1000003", "TEST-B-01", "Тестовый вуз", "Бюджет", "Экономика", 1, 204, 3, "Участвует", "Нет", "Нет", 2, "19.07.2026 10:00:00"],
];

function createSheet() {
  return {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange: (row: number, column: number, rowCount: number, columnCount: number) => ({
      getValues: () => {
        if (row === 1) return [headers.slice(column - 1, column - 1 + columnCount)];
        return rows.slice(row - 2, row - 2 + rowCount).map((item) => item.slice(column - 1, column - 1 + columnCount));
      },
    }),
  };
}

function loadBuilder() {
  const source = fs.readFileSync("Code_updated_060726.gs", "utf8");
  const factory = new Function(
    "SpreadsheetApp",
    "CacheService",
    "Utilities",
    `${source}\nreturn buildCompetitorsPayload_;`,
  );

  return factory(
    { openById: () => ({ getSheetByName: () => createSheet() }) },
    { getScriptCache: () => ({ get: () => null, put: () => undefined }) },
    {
      DigestAlgorithm: { MD5: "MD5" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: () => [1, 2, 3, 4],
    },
  ) as (params: Record<string, string>) => {
    detail: Record<string, number | boolean>;
    total: number;
    items: Array<Record<string, unknown>>;
  };
}

describe("competitors API", () => {
  it("counts active applicants above and calculates the projected rank", () => {
    const payload = loadBuilder()({
      groupId: "TEST-B-01",
      scenarioPriority: "2",
      view: "active",
    });

    expect(payload.detail).toMatchObject({
      aheadTotal: 3,
      aheadHigherScore: 2,
      activeAhead: 2,
      priorityOneActiveAhead: 1,
      higherPriorityActiveAhead: 1,
      samePriorityActiveAhead: 0,
      lowerPriorityActiveAhead: 1,
      projectedActiveRank: 3,
      gapToSeats: 1,
      withinSeats: false,
    });
    expect(payload.total).toBe(2);
    expect(payload.items).toHaveLength(2);
  });
});
