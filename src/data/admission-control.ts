import type { Application } from "@/data/applications";

export type DecisionKind = "within" | "reserve" | "unknown";

export interface AdmissionControl {
  seats: number | null;
  semesterFeeText: string | null;
  contractsCount: number | null;
  contractsAbove: number | null;
  consentsCount: number | null;
  consentsAbove: number | null;
  contractRank: number | null;
  consentRank: number | null;
  sourceNote: string;
}

const EMPTY: AdmissionControl = {
  seats: null,
  semesterFeeText: null,
  contractsCount: null,
  contractsAbove: null,
  consentsCount: null,
  consentsAbove: null,
  contractRank: null,
  consentRank: null,
  sourceNote: "Общая позиция из конкурсного списка",
};

// Values verified from sheet "Выбранные университеты". Missing values intentionally stay null.
const CONTROL_BY_ID: Record<number, Partial<AdmissionControl>> = {
  1: { seats: 14, sourceNote: "Квота из «Выбранные университеты»; общая позиция" },
  2: { seats: 8, sourceNote: "Квота из «Выбранные университеты»; общая позиция" },
  3: {
    seats: 118,
    semesterFeeText: "195 000 ₽ за семестр",
    sourceNote: "Квота и стоимость из «Выбранные университеты»; общая позиция",
  },
  8: { sourceNote: "Общая позиция; квота и стоимость требуют сопоставления" },
  9: {
    seats: 432,
    semesterFeeText: "179 500 ₽ за семестр",
    sourceNote: "Квота и стоимость из «Выбранные университеты»; общая позиция",
  },
  10: {
    seats: 611,
    semesterFeeText: "179 500 ₽ за семестр",
    sourceNote: "Квота и стоимость из «Выбранные университеты»; общая позиция",
  },
  11: {
    semesterFeeText: "179 500 ₽ за семестр",
    sourceNote: "Стоимость из «Выбранные университеты»; квота требует сопоставления",
  },
  12: {
    semesterFeeText: "179 500 ₽ за семестр",
    sourceNote: "Стоимость из «Выбранные университеты»; квота требует сопоставления",
  },
};

export function getAdmissionControl(app: Application): AdmissionControl {
  return { ...EMPTY, ...CONTROL_BY_ID[app.id] };
}

export function getActiveRank(app: Application, control: AdmissionControl): number | null {
  return app.basis === "Бюджет"
    ? control.consentRank ?? app.position
    : control.contractRank ?? app.position;
}

export function getDecision(app: Application, control: AdmissionControl): {
  kind: DecisionKind;
  label: string;
  detail: string;
} {
  const rank = getActiveRank(app, control);

  if (control.seats === null || rank === null) {
    return {
      kind: "unknown",
      label: "Места не сопоставлены",
      detail: "Точный расчёт появится после сопоставления квоты.",
    };
  }

  const isConfirmed = app.basis === "Бюджет"
    ? control.consentRank !== null
    : control.contractRank !== null;
  const source = isConfirmed
    ? app.basis === "Бюджет" ? "по согласиям" : "по договорам"
    : "предварительно по общей позиции";

  if (rank <= control.seats) {
    return {
      kind: "within",
      label: `В пределах квоты · запас ${control.seats - rank + 1}`,
      detail: source,
    };
  }

  return {
    kind: "reserve",
    label: `Резерв · разрыв ${rank - control.seats}`,
    detail: source,
  };
}

export function formatKnown(value: number | null, suffix = ""): string {
  return value === null ? "нет данных в выгрузке" : `${value}${suffix}`;
}
