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
  consentRaw: string;
  contractRaw: string;
  snapshot: string;

  control: AdmissionControlData;
  generalChange: string;
  activeChange: string;
}

export interface SnapshotHistoryPoint {
  groupId: string;
  snapshot: string;
  score: number | null;
  generalPosition: number | null;
  activeRank: number | null;
  activeSource: string;
  generalChange: string;
  activeChange: string;
  status: string;
  consentsCount: number | null;
  consentsAbove: number | null;
  consentsAboveHigherPriority: number | null;
  contractsCount: number | null;
  contractsAbove: number | null;
  contractsAboveHigherPriority: number | null;
  seats: number | null;
}

export interface ListChangeItem {
  groupId: string;
  university: string;
  basis: Basis;
  groupName: string;
  currentSnapshot: string;
  previousSnapshot: string;
  applicantPriorityCurrent: number | null;
  applicantPriorityPrevious: number | null;
  totalApplications: number | null;
  previousTotalApplications: number | null;
  newApplications: number | null;
  newApplicationsHigherPriority: number | null;
  leftApplications: number | null;
  leftApplicationsHigherPriority: number | null;
  newConsents: number | null;
  newConsentsHigherPriority: number | null;
  newContracts: number | null;
  newContractsHigherPriority: number | null;
  leftConsentsWithApplication: number | null;
  leftConsentsWithApplicationHigherPriority: number | null;
  leftContractsWithApplication: number | null;
  leftContractsWithApplicationHigherPriority: number | null;
  comment: string;
  calculatedAt: string;
}

export interface ChangesData {
  generatedAt: string;
  filters: {
    groupId: string;
    university: string;
    basis: string;
  };
  items: ListChangeItem[];
  summaries: ApplicationStatisticsSummary[];
}

export interface ApplicationStatisticsSummary {
  scopeKey: string;
  university: string;
  basis: string;
  totalApplications: number | null;
  totalApplicants: number | null;
  newApplications: number | null;
  applicantsWithNewApplications: number | null;
  newApplicants: number | null;
  calculatedAt: string;
}

export type ChangesFilters = {
  groupId?: string;
  university?: string;
  basis?: Basis;
  limit?: number;
};

export type ApplicantsFilters = {
  university?: string;
  basis?: Basis;
  confirmation?: "consent" | "contract" | "any";
  direction?: string;
  priority?: number;
  offset?: number;
  limit?: number;
};

export interface ApplicantsSummary {
  applicantsCount: number;
  applicationsCount: number;
  crossUniversityCount: number;
  withConsentCount: number;
  withContractCount: number;
  consentsCount: number;
  contractsCount: number;
  universities: string[];
  latestSnapshot: string;
}

export interface ApplicantListItem {
  profileKey: string;
  applicantCode: string;
  universitiesCount: number;
  applicationsCount: number;
  budgetCount: number;
  paidCount: number;
  bestPriority: number | null;
  maxScore: number | null;
  consentsCount: number;
  contractsCount: number;
  universities: string[];
  latestSnapshot: string;
}

export interface ApplicantsData {
  generatedAt: string;
  summary: ApplicantsSummary;
  total: number;
  offset: number;
  limit: number;
  items: ApplicantListItem[];
}

export interface ApplicantApplication {
  groupId: string;
  university: string;
  basis: Basis;
  group: string;
  priority: number | null;
  score: number | null;
  generalPosition: number | null;
  status: string;
  consent: string;
  hasConsent: boolean;
  consentRank: number | null;
  contract: string;
  hasContract: boolean;
  contractRank: number | null;
  seats: number | null;
  snapshot: string;
}

export interface ApplicantProfileData {
  generatedAt: string;
  found: boolean;
  applicantCode: string;
  profileKey: string;
  summary: {
    universitiesCount: number;
    applicationsCount: number;
    consentsCount: number;
    contractsCount: number;
  } | null;
  applications: ApplicantApplication[];
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
  groupId: string;
  snapshot?: string;
  score?: ApiNumber;
  generalPosition?: ApiNumber;
  activeRank?: ApiNumber;
  activeSource?: string;
  generalChange?: string;
  activeChange?: string;
  status?: string;
  consentsCount?: ApiNumber;
  consentsAbove?: ApiNumber;
  consentsAboveHigherPriority?: ApiNumber;
  contractsCount?: ApiNumber;
  contractsAbove?: ApiNumber;
  contractsAboveHigherPriority?: ApiNumber;
  seats?: ApiNumber;
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

type ApiChangeItem = {
  groupId: string;
  university: string;
  basis: string;
  groupName?: string;
  currentSnapshot?: string;
  previousSnapshot?: string;
  applicantPriorityCurrent?: ApiNumber;
  applicantPriorityPrevious?: ApiNumber;
  totalApplications?: ApiNumber;
  previousTotalApplications?: ApiNumber;
  newApplications?: ApiNumber;
  newApplicationsHigherPriority?: ApiNumber;
  leftApplications?: ApiNumber;
  leftApplicationsHigherPriority?: ApiNumber;
  newConsents?: ApiNumber;
  newConsentsHigherPriority?: ApiNumber;
  newContracts?: ApiNumber;
  newContractsHigherPriority?: ApiNumber;
  leftConsentsWithApplication?: ApiNumber;
  leftConsentsWithApplicationHigherPriority?: ApiNumber;
  leftContractsWithApplication?: ApiNumber;
  leftContractsWithApplicationHigherPriority?: ApiNumber;
  comment?: string;
  calculatedAt?: string;
};

type ApiChangesPayload = {
  generatedAt?: string;
  filters?: {
    groupId?: string;
    university?: string;
    basis?: string;
  };
  items: ApiChangeItem[];
  summaries?: Array<{
    scopeKey?: string;
    university?: string;
    basis?: string;
    totalApplications?: ApiNumber;
    totalApplicants?: ApiNumber;
    newApplications?: ApiNumber;
    applicantsWithNewApplications?: ApiNumber;
    newApplicants?: ApiNumber;
    calculatedAt?: string;
  }>;
};

type ApiApplicantsPayload = {
  generatedAt?: string;
  summary?: Partial<ApplicantsSummary>;
  total?: ApiNumber;
  offset?: ApiNumber;
  limit?: ApiNumber;
  items?: Array<Partial<ApplicantListItem>>;
};

type ApiApplicantProfilePayload = {
  generatedAt?: string;
  found?: boolean;
  applicantCode?: string;
  profileKey?: string;
  summary?: ApplicantProfileData["summary"];
  applications?: Array<Partial<ApplicantApplication> & { basis?: string }>;
};

const DEFAULT_GAS_ENDPOINT = [
  "https://script.google.com/macros/s/",
  "AKfycbz3f91C_J50XFzmtSDx-TT7qhNb_1V88BYexp82B6upiyJB1L7iLXprvVAIrkPYNgZxqg",
  "/exec",
].join("");

function endpointUrl(params?: string | Record<string, string | undefined>): string {
  const base = import.meta.env.VITE_GAS_ENDPOINT || DEFAULT_GAS_ENDPOINT;

  if (!params) return base;

  const query = new URLSearchParams();

  if (typeof params === "string") {
    query.set("groupId", params);
  } else {
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
  }

  const search = query.toString();
  if (!search) return base;

  const divider = base.includes("?") ? "&" : "?";
  return `${base}${divider}${search}`;
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
    consentRaw: app.consent ?? "",
    contractRaw: app.contract ?? "",
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
    groupId: point.groupId,
    snapshot: point.snapshot || "Нет даты списка",
    score: toNullableNumber(point.score),
    generalPosition: toNullableNumber(point.generalPosition),
    activeRank: toNullableNumber(point.activeRank),
    activeSource: point.activeSource || "Предварительно по общей позиции",
    generalChange: point.generalChange || "Первый снимок",
    activeChange: point.activeChange || "Нет сопоставимой активной позиции",
    status: point.status || "Нет данных",
    consentsCount: toNullableNumber(point.consentsCount),
    consentsAbove: toNullableNumber(point.consentsAbove),
    consentsAboveHigherPriority: toNullableNumber(point.consentsAboveHigherPriority),
    contractsCount: toNullableNumber(point.contractsCount),
    contractsAbove: toNullableNumber(point.contractsAbove),
    contractsAboveHigherPriority: toNullableNumber(point.contractsAboveHigherPriority),
    seats: toNullableNumber(point.seats),
  };
}

function mapChangeItem(item: ApiChangeItem): ListChangeItem {
  return {
    groupId: String(item.groupId),
    university: item.university,
    basis: toBasis(item.basis),
    groupName: item.groupName || "Без названия группы",
    currentSnapshot: item.currentSnapshot || "Нет даты списка",
    previousSnapshot: item.previousSnapshot || "",
    applicantPriorityCurrent: toNullableNumber(item.applicantPriorityCurrent),
    applicantPriorityPrevious: toNullableNumber(item.applicantPriorityPrevious),
    totalApplications: toNullableNumber(item.totalApplications),
    previousTotalApplications: toNullableNumber(item.previousTotalApplications),
    newApplications: toNullableNumber(item.newApplications),
    newApplicationsHigherPriority: toNullableNumber(item.newApplicationsHigherPriority),
    leftApplications: toNullableNumber(item.leftApplications),
    leftApplicationsHigherPriority: toNullableNumber(item.leftApplicationsHigherPriority),
    newConsents: toNullableNumber(item.newConsents),
    newConsentsHigherPriority: toNullableNumber(item.newConsentsHigherPriority),
    newContracts: toNullableNumber(item.newContracts),
    newContractsHigherPriority: toNullableNumber(item.newContractsHigherPriority),
    leftConsentsWithApplication: toNullableNumber(item.leftConsentsWithApplication),
    leftConsentsWithApplicationHigherPriority: toNullableNumber(item.leftConsentsWithApplicationHigherPriority),
    leftContractsWithApplication: toNullableNumber(item.leftContractsWithApplication),
    leftContractsWithApplicationHigherPriority: toNullableNumber(item.leftContractsWithApplicationHigherPriority),
    comment: item.comment || "",
    calculatedAt: item.calculatedAt || "",
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
  const payload = await requestJson<ApiHistoryPayload>(endpointUrl(groupId));

  if (!payload || !Array.isArray(payload.history)) {
    throw new Error("API не вернул историю по выбранной конкурсной группе.");
  }

  return payload.history.map(mapHistoryPoint);
}

export async function getChanges(filters: ChangesFilters = {}): Promise<ChangesData> {
  const payload = await requestJson<ApiChangesPayload>(endpointUrl({
    action: "changes",
    groupId: filters.groupId,
    university: filters.university,
    basis: filters.basis,
    limit: filters.limit ? String(filters.limit) : undefined,
  }));

  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("API не вернул изменения списков.");
  }

  return {
    generatedAt: payload.generatedAt || "",
    filters: {
      groupId: payload.filters?.groupId || "",
      university: payload.filters?.university || "",
      basis: payload.filters?.basis || "",
    },
    items: payload.items.map(mapChangeItem),
    summaries: (payload.summaries || []).map((item) => ({
      scopeKey: item.scopeKey || "",
      university: item.university || "",
      basis: item.basis || "",
      totalApplications: toNullableNumber(item.totalApplications),
      totalApplicants: toNullableNumber(item.totalApplicants),
      newApplications: toNullableNumber(item.newApplications),
      applicantsWithNewApplications: toNullableNumber(item.applicantsWithNewApplications),
      newApplicants: toNullableNumber(item.newApplicants),
      calculatedAt: item.calculatedAt || "",
    })),
  };
}

export async function getApplicants(filters: ApplicantsFilters = {}): Promise<ApplicantsData> {
  const payload = await requestJson<ApiApplicantsPayload>(endpointUrl({
    action: "applicants",
    university: filters.university,
    basis: filters.basis,
    confirmation: filters.confirmation,
    direction: filters.direction,
    priority: filters.priority ? String(filters.priority) : undefined,
    offset: String(filters.offset ?? 0),
    limit: String(filters.limit ?? 100),
  }));

  if (!payload || !payload.summary || !Array.isArray(payload.items)) {
    throw new Error("API не вернул карту поступающих.");
  }

  const summary: ApplicantsSummary = {
    applicantsCount: toNullableNumber(payload.summary.applicantsCount) ?? 0,
    applicationsCount: toNullableNumber(payload.summary.applicationsCount) ?? 0,
    crossUniversityCount: toNullableNumber(payload.summary.crossUniversityCount) ?? 0,
    withConsentCount: toNullableNumber(payload.summary.withConsentCount) ?? 0,
    withContractCount: toNullableNumber(payload.summary.withContractCount) ?? 0,
    consentsCount: toNullableNumber(payload.summary.consentsCount) ?? 0,
    contractsCount: toNullableNumber(payload.summary.contractsCount) ?? 0,
    universities: Array.isArray(payload.summary.universities) ? payload.summary.universities.map(String) : [],
    latestSnapshot: String(payload.summary.latestSnapshot || ""),
  };

  return {
    generatedAt: payload.generatedAt || "",
    summary,
    total: toNullableNumber(payload.total) ?? 0,
    offset: toNullableNumber(payload.offset) ?? 0,
    limit: toNullableNumber(payload.limit) ?? (filters.limit ?? 100),
    items: payload.items.map((item) => ({
      profileKey: String(item.profileKey || ""),
      applicantCode: String(item.applicantCode || ""),
      universitiesCount: toNullableNumber(item.universitiesCount) ?? 0,
      applicationsCount: toNullableNumber(item.applicationsCount) ?? 0,
      budgetCount: toNullableNumber(item.budgetCount) ?? 0,
      paidCount: toNullableNumber(item.paidCount) ?? 0,
      bestPriority: toNullableNumber(item.bestPriority),
      maxScore: toNullableNumber(item.maxScore),
      consentsCount: toNullableNumber(item.consentsCount) ?? 0,
      contractsCount: toNullableNumber(item.contractsCount) ?? 0,
      universities: Array.isArray(item.universities) ? item.universities.map(String) : [],
      latestSnapshot: String(item.latestSnapshot || ""),
    })),
  };
}

export async function getApplicantProfile(params: {
  profileKey?: string;
  applicantId?: string;
}): Promise<ApplicantProfileData> {
  const payload = await requestJson<ApiApplicantProfilePayload>(endpointUrl({
    action: "applicant",
    profileKey: params.profileKey,
    applicantId: params.applicantId,
  }));

  if (!payload || !Array.isArray(payload.applications)) {
    throw new Error("API не вернул карточку поступающего.");
  }

  return {
    generatedAt: payload.generatedAt || "",
    found: Boolean(payload.found),
    applicantCode: String(payload.applicantCode || ""),
    profileKey: String(payload.profileKey || ""),
    summary: payload.summary
      ? {
          universitiesCount: toNullableNumber(payload.summary.universitiesCount) ?? 0,
          applicationsCount: toNullableNumber(payload.summary.applicationsCount) ?? 0,
          consentsCount: toNullableNumber(payload.summary.consentsCount) ?? 0,
          contractsCount: toNullableNumber(payload.summary.contractsCount) ?? 0,
        }
      : null,
    applications: payload.applications.map((item) => ({
      groupId: String(item.groupId || ""),
      university: String(item.university || ""),
      basis: toBasis(String(item.basis || "")),
      group: String(item.group || "Без названия направления"),
      priority: toNullableNumber(item.priority),
      score: toNullableNumber(item.score),
      generalPosition: toNullableNumber(item.generalPosition),
      status: String(item.status || "Нет данных"),
      consent: String(item.consent || "Не опубликовано"),
      hasConsent: Boolean(item.hasConsent),
      consentRank: toNullableNumber(item.consentRank),
      contract: String(item.contract || "Не опубликовано"),
      hasContract: Boolean(item.hasContract),
      contractRank: toNullableNumber(item.contractRank),
      seats: toNullableNumber(item.seats),
      snapshot: String(item.snapshot || "Нет даты списка"),
    })),
  };
}

export function buildAnalyticalPhrase(app: Application): string {
  const above = app.position - 1;
  return app.basis === "Бюджет"
    ? `Выше ${above} абитуриентов. Для точной оценки нужны квота и число абитуриентов выше с подтверждённым согласием.`
    : `Выше ${above} абитуриентов. Для точной оценки нужны договорные места и количество договоров выше по списку.`;
}

function normalizeConfirmation(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hasBudgetConsent(app: Application): boolean {
  if (app.basis !== "Бюджет") return false;
  const v = normalizeConfirmation(app.consentRaw);
  return v === "электронное" || v === "бумажное";
}

export function hasPaidContract(app: Application): boolean {
  if (app.basis !== "Платное") return false;
  return normalizeConfirmation(app.contractRaw) === "да";
}

