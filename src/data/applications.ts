export type Basis = "Бюджет" | "Платное";
export type Status = string;

export interface AdmissionControlData {
  seats: number | null;
  semesterFeeText: string | null;
  contractsCount: number | null;
  contractsAbove: number | null;
  contractsAboveHigherPriority: number | null;
  consentsCount: number | null;
  consentsAbove: number | null;
  consentsAboveHigherPriority: number | null;
  contractRank: number | null;
  consentRank: number | null;
  sourceNote: string;
  dataReadiness: string;
  needsClarification: boolean;
}

export interface Application {
  id: string;
  university: string;
  basis: Basis;
  group: string;
  priority: number;
  score: number;
  scoreBreakdown: string;
  position: number;
  status: Status;
  consent: string;
  snapshot: string;
  control: AdmissionControlData;
  generalChange: string;
  activeChange: string;
}

export interface SnapshotHistoryPoint {
  date: string;
  position: number | null;
  score: number | null;
  priority: number | null;
  status: string;
  consentsAbove: number | null;
  consentsAboveHigherPriority: number | null;
  contractsAbove: number | null;
  contractsAboveHigherPriority: number | null;
}

export interface CoverageEntry {
  university: string;
  received: number;
  total: number;
}

export interface DashboardMeta {
  candidateId: string;
  candidateName: string;
  lastUpdate: string;
  totalGroups: number;
  budgetTotal: number;
  paidTotal: number;
  receivedTotal: number;
  budgetReceived: number;
  paidReceived: number;
  stage: string;
}

export interface DashboardData {
  meta: DashboardMeta;
  applications: Application[];
  coverage: CoverageEntry[];
}

type ApiNumber = number | null | undefined;

type ApiApplication = {
  id: string;
  university: string;
  basis: string;
  group: string;
  priority: ApiNumber;
  score: ApiNumber;
  generalPosition: ApiNumber;
  status?: string;
  snapshot?: string;
  consent?: string;
  contract?: string;
  seats?: ApiNumber;
  contractsCount?: ApiNumber;
  contractsAbove?: ApiNumber;
  contractsAboveHigherPriority?: ApiNumber;
  consentsCount?: ApiNumber;
  consentsAbove?: ApiNumber;
  consentsAboveHigherPriority?: ApiNumber;
  contractRank?: ApiNumber;
  consentRank?: ApiNumber;
  activeSource?: string;
  semesterFeeText?: string | null;
  dataReadiness?: string;
  needsClarification?: boolean;
  sourceNote?: string;
  generalChange?: string;
  activeChange?: string;
  hasList?: boolean;
};

type ApiHistoryPoint = {
  date?: string;
  snapshot?: string;
  position?: ApiNumber;
  score?: ApiNumber;
  priority?: ApiNumber;
  status?: string;
  consentsAbove?: ApiNumber;
  consentsAboveHigherPriority?: ApiNumber;
  contractsAbove?: ApiNumber;
  contractsAboveHigherPriority?: ApiNumber;
};

type ApiPayload = {
  meta: Omit<DashboardMeta, "candidateName">;
  applications: ApiApplication[];
  coverage: CoverageEntry[];
};

type ApiHistoryPayload = {
  groupId: string;
  history: ApiHistoryPoint[];
};

const DEFAULT_GAS_ENDPOINT = [
  "https://script.google.com/macros/s/",
  "AKfycbz3f91C_J50XFzmtSDx-TT7qhNb_1V88BYexp82B6upiyJB1L7iLXprvVAIrkPYNgZxqg",
  "/exec",
].join("");

function endpointUrl(params?: Record<string, string>): string {
  const base = import.meta.env.VITE_GAS_ENDPOINT || DEFAULT_GAS_ENDPOINT;

  if (!params) return base;

  const divider = base.includes("?") ? "&" : "?";
  return `${base}${divider}${new URLSearchParams(params).toString()}`;
}

function toNumber(value: ApiNumber, field: string, app: ApiApplication): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`В API нет числового поля «${field}» для группы «${app.group}» (${app.id}).`);
}

function toNullableNumber(value: ApiNumber): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toHigherPriorityCount(value: ApiNumber, priority: number): number | null {
  const count = toNullableNumber(value);
  if (count !== null) return count;

  return priority <= 1 ? 0 : null;
}

function toBasis(value: string): Basis {
  if (value === "Бюджет" || value === "Платное") return value;
  throw new Error(`Неизвестная основа поступления в API: «${value}».`);
}

function formatSemesterFee(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.includes("₽") ? value : `${value} ₽`;
}

function mapApplication(app: ApiApplication): Application {
  const basis = toBasis(app.basis);
  const priority = toNumber(app.priority, "Приоритет", app);
  const confirmation = basis === "Бюджет"
    ? `Согласие: ${app.consent || "—"}`
    : `Договор: ${app.contract || "—"}`;

  return {
    id: String(app.id),
    university: app.university,
    basis,
    group: app.group,
    priority,
    score: toNumber(app.score, "Балл Елисея", app),
    scoreBreakdown: "",
    position: toNumber(app.generalPosition, "Позиция общая", app),
    status: app.status || "Нет данных",
    consent: confirmation,
    snapshot: app.snapshot || "Нет даты списка",
    control: {
      seats: toNullableNumber(app.seats),
      semesterFeeText: formatSemesterFee(app.semesterFeeText),
      contractsCount: toNullableNumber(app.contractsCount),
      contractsAbove: toNullableNumber(app.contractsAbove),
      contractsAboveHigherPriority: toHigherPriorityCount(app.contractsAboveHigherPriority, priority),
      consentsCount: toNullableNumber(app.consentsCount),
      consentsAbove: toNullableNumber(app.consentsAbove),
      consentsAboveHigherPriority: toHigherPriorityCount(app.consentsAboveHigherPriority, priority),
      contractRank: toNullableNumber(app.contractRank),
      consentRank: toNullableNumber(app.consentRank),
      sourceNote: app.sourceNote || app.activeSource || "Предварительно по общей позиции",
      dataReadiness: app.dataReadiness || "Данные проверяются",
      needsClarification: Boolean(app.needsClarification),
    },
    generalChange: app.generalChange || "Первый снимок",
    activeChange: app.activeChange || "Нет сопоставимой активной позиции",
  };
}

function mapHistoryPoint(point: ApiHistoryPoint): SnapshotHistoryPoint {
  return {
    date: point.date || point.snapshot || "Нет даты списка",
    position: toNullableNumber(point.position),
    score: toNullableNumber(point.score),
    priority: toNullableNumber(point.priority),
    status: point.status || "Нет данных",
    consentsAbove: toNullableNumber(point.consentsAbove),
    consentsAboveHigherPriority: toNullableNumber(point.consentsAboveHigherPriority),
    contractsAbove: toNullableNumber(point.contractsAbove),
    contractsAboveHigherPriority: toNullableNumber(point.contractsAboveHigherPriority),
  };
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`API вернул ошибку ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function getDashboardData(): Promise<DashboardData> {
  const payload = await requestJson<ApiPayload>(endpointUrl());

  if (!payload?.meta || !Array.isArray(payload.applications) || !Array.isArray(payload.coverage)) {
    throw new Error("API вернул ответ в неожиданном формате.");
  }

  return {
    meta: { ...payload.meta, candidateName: "Елисей" },
    applications: payload.applications.filter((app) => app.hasList).map(mapApplication),
    coverage: payload.coverage,
  };
}

export async function getGroupHistory(groupId: string): Promise<SnapshotHistoryPoint[]> {
  const payload = await requestJson<ApiHistoryPayload>(endpointUrl({
    action: "history",
    groupId,
  }));

  if (!payload || !Array.isArray(payload.history)) {
    throw new Error("API не вернул историю по выбранной конкурсной группе.");
  }

  return payload.history.map(mapHistoryPoint);
}

export function buildAnalyticalPhrase(app: Application): string {
  const above = app.position - 1;
  return app.basis === "Бюджет"
    ? `Выше ${above} абитуриентов. Для точной оценки нужны квота и число абитуриентов выше с подтверждённым согласием.`
    : `Выше ${above} абитуриентов. Для точной оценки нужны договорные места и количество договоров выше по списку.`;
}
