import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ListChangeItem,
  getChanges,
} from "@/data/applications";

type MetricTone = "in" | "out";
type ChartMode = "all" | "applications" | "consents" | "contracts";
type ChangeMetricKey = "newApplications" | "newConsents" | "newContracts";

type ChangeSeries = {
  key: ChangeMetricKey;
  label: string;
  mode: Exclude<ChartMode, "all">;
  stroke: string;
};

type ChartPoint = {
  snapshot: string;
  newApplications: number | null;
  newConsents: number | null;
  newContracts: number | null;
};

const ALL = "all";
const HISTORY_LIMIT = 10;

const CHANGE_SERIES: ChangeSeries[] = [
  {
    key: "newApplications",
    label: "Новые заявления",
    mode: "applications",
    stroke: "hsl(var(--primary))",
  },
  {
    key: "newConsents",
    label: "Новые согласия",
    mode: "consents",
    stroke: "hsl(var(--success))",
  },
  {
    key: "newContracts",
    label: "Новые договоры",
    mode: "contracts",
    stroke: "hsl(var(--warning))",
  },
];

const Changes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ListChangeItem[]>([]);
  const [history, setHistory] = useState<ListChangeItem[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("groupId") || "");
  const [universityFilter, setUniversityFilter] = useState(ALL);
  const [basisFilter, setBasisFilter] = useState(ALL);
  const [chartMode, setChartMode] = useState<ChartMode>("all");
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChanges()
      .then((data) => setItems(data.items))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось получить изменения списков.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    setError(null);
    setSearchParams({ groupId: selectedId }, { replace: true });

    getChanges({ groupId: selectedId, limit: HISTORY_LIMIT })
      .then((data) => setHistory(data.items))
      .catch((cause: unknown) => {
        setHistory([]);
        setError(cause instanceof Error ? cause.message : "Не удалось получить историю изменений.");
      })
      .finally(() => setLoadingHistory(false));
  }, [selectedId, setSearchParams]);

  const latestItems = useMemo(
    () => latestChangeByGroup(items),
    [items]
  );

  const universities = useMemo(
    () => Array.from(new Set(latestItems.map((item) => item.university))).sort(),
    [latestItems]
  );

  const filteredItems = useMemo(() => latestItems.filter((item) => {
    if (universityFilter !== ALL && item.university !== universityFilter) return false;
    if (basisFilter !== ALL && item.basis !== basisFilter) return false;
    return true;
  }), [latestItems, universityFilter, basisFilter]);

  const selectedHistory = useMemo(
    () => sortChangesDesc(history).slice(0, HISTORY_LIMIT),
    [history]
  );

  const groupOptions = filteredItems.length ? filteredItems : latestItems;
  const selected = (selectedHistory[0] || latestItems.find((item) => item.groupId === selectedId)) ?? null;

  const chartData = useMemo(
    () => selectedHistory
      .filter(hasComparison)
      .slice()
      .reverse()
      .map((item): ChartPoint => ({
        snapshot: item.currentSnapshot,
        newApplications: item.newApplications,
        newConsents: item.newConsents,
        newContracts: item.newContracts,
      })),
    [selectedHistory]
  );

  const visibleSeries = useMemo(
    () => CHANGE_SERIES
      .filter((series) => chartMode === "all" || chartMode === series.mode)
      .filter((series) => chartData.some((point) => point[series.key] !== null)),
    [chartData, chartMode]
  );

  const selectGroup = (id: string) => {
    if (id === ALL) {
      setSelectedId("");
      setHistory([]);
      setSearchParams({}, { replace: true });
      return;
    }

    setSelectedId(id);
  };

  const changeUniversity = (value: string) => {
    setUniversityFilter(value);
    setSelectedId("");
    setHistory([]);
    setSearchParams({}, { replace: true });
  };

  const changeBasis = (value: string) => {
    setBasisFilter(value);
    setSelectedId("");
    setHistory([]);
    setSearchParams({}, { replace: true });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка изменений списков...</div>;
  }

  if (error && !items.length) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Изменения списков</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">Новые и ушедшие заявления, согласия и договоры между соседними снимками</p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 text-sm">
              <Link to="/" className="underline underline-offset-4 opacity-90 hover:opacity-100">Вернуться к текущей ситуации</Link>
              <Link to="/dynamics" className="underline underline-offset-4 opacity-90 hover:opacity-100">Полная динамика позиций</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-6">
        <Card className="p-5 md:p-6 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={universityFilter} onValueChange={changeUniversity}>
              <SelectTrigger><SelectValue placeholder="Вуз" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все вузы</SelectItem>
                {universities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={basisFilter} onValueChange={changeBasis}>
              <SelectTrigger><SelectValue placeholder="Основа" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все основы</SelectItem>
                <SelectItem value="Бюджет">Бюджет</SelectItem>
                <SelectItem value="Платное">Платное</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedId || ALL} onValueChange={selectGroup}>
              <SelectTrigger><SelectValue placeholder="Конкурсная группа" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все группы</SelectItem>
                {groupOptions.map((item) => (
                  <SelectItem key={item.groupId} value={item.groupId}>{item.groupName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {selectedId && selected && (
          <>
            <section>
              <div className="mb-3">
                <h2 className="text-xl font-semibold">Последнее изменение</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selected.groupName} · {selected.university} · {selected.basis}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasComparison(selected)
                    ? <>Текущий снимок: {selected.currentSnapshot}. Предыдущий снимок: {selected.previousSnapshot}</>
                    : "Первый снимок, сравнение отсутствует"}
                </p>
              </div>
              <PriorityWarning item={selected} />
              {selected.comment && <p className="mt-3 text-xs text-muted-foreground">{selected.comment}</p>}
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              <ChangeMetricCard label="Новые заявления" value={selected.newApplications} higher={selected.newApplicationsHigherPriority} tone="in" />
              <ChangeMetricCard label="Ушли заявления" value={selected.leftApplications} higher={selected.leftApplicationsHigherPriority} tone="out" />
              <ChangeMetricCard label="Новые согласия" value={selected.newConsents} higher={selected.newConsentsHigherPriority} tone="in" />
              <ChangeMetricCard label="Новые договоры" value={selected.newContracts} higher={selected.newContractsHigherPriority} tone="in" />
              <ChangeMetricCard label="Ушли согласия вместе с заявлениями" value={selected.leftConsentsWithApplication} higher={selected.leftConsentsWithApplicationHigherPriority} tone="out" />
              <ChangeMetricCard label="Ушли договоры вместе с заявлениями" value={selected.leftContractsWithApplication} higher={selected.leftContractsWithApplicationHigherPriority} tone="out" />
            </section>

            <RiskBlock item={selected} />

            <Card className="p-5 md:p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-semibold">Динамика изменений</h2>
                  <p className="text-sm text-muted-foreground mt-1">Первые снимки без предыдущего списка в график не включаются</p>
                </div>
                <Select value={chartMode} onValueChange={(value) => setChartMode(value as ChartMode)}>
                  <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    <SelectItem value="applications">Заявления</SelectItem>
                    <SelectItem value="consents">Согласия</SelectItem>
                    <SelectItem value="contracts">Договоры</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loadingHistory && <div className="h-[340px] flex items-center justify-center text-sm text-muted-foreground">Загрузка истории изменений...</div>}
              {!loadingHistory && error && <div className="py-10 text-sm text-destructive">{error}</div>}
              {!loadingHistory && !error && (!chartData.length || !visibleSeries.length) && (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Для графика пока нет сравнений с предыдущими снимками.</div>
              )}
              {!loadingHistory && !error && chartData.length > 0 && visibleSeries.length > 0 && (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 16, right: 24, left: 4, bottom: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="snapshot" tick={{ fontSize: 11 }} interval="preserveStartEnd" angle={-25} textAnchor="end" height={64} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => typeof value === "number" ? value : "Не опубликовано"} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {visibleSeries.map((series) => (
                        <Line
                          key={series.key}
                          type="monotone"
                          dataKey={series.key}
                          name={series.label}
                          stroke={series.stroke}
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5 md:p-6 shadow-card">
              <h2 className="text-lg font-semibold mb-4">История изменений</h2>
              {loadingHistory && <div className="py-10 text-center text-sm text-muted-foreground">Загрузка истории изменений...</div>}
              {!loadingHistory && error && <div className="py-10 text-sm text-destructive">{error}</div>}
              {!loadingHistory && !error && <ChangesHistoryTable items={selectedHistory} />}
            </Card>
          </>
        )}

        {!selectedId && (
          <Card className="p-5 md:p-6 shadow-card">
            <h2 className="text-lg font-semibold mb-4">Последние изменения по всем группам</h2>
            <SummaryTable items={filteredItems} onSelect={selectGroup} />
          </Card>
        )}
      </main>
    </div>
  );
};

function ChangeMetricCard({ label, value, higher, tone }: { label: string; value: number | null; higher: number | null; tone: MetricTone }) {
  const isOut = tone === "out";
  const toneClass = value === null
    ? "text-muted-foreground"
    : isOut
      ? "text-destructive"
      : "text-success";

  return (
    <Card className="p-4 shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{formatSigned(value, tone)}</div>
      <div className="mt-1 text-xs text-muted-foreground">из них с приоритетом выше: {formatHigherPriority(higher, tone)}</div>
    </Card>
  );
}

function RiskBlock({ item }: { item: ListChangeItem }) {
  const riskLines = [
    item.newApplicationsHigherPriority !== null && item.newApplicationsHigherPriority > 0
      ? `Появились новые заявления с приоритетом выше Елисея: ${item.newApplicationsHigherPriority}`
      : "",
    item.newConsentsHigherPriority !== null && item.newConsentsHigherPriority > 0
      ? `Появились новые согласия с приоритетом выше Елисея: ${item.newConsentsHigherPriority}`
      : "",
    item.newContractsHigherPriority !== null && item.newContractsHigherPriority > 0
      ? `Появились новые договоры с приоритетом выше Елисея: ${item.newContractsHigherPriority}`
      : "",
  ].filter(Boolean);

  const positiveLines = [
    item.leftApplicationsHigherPriority !== null && item.leftApplicationsHigherPriority > 0
      ? `Ушли заявления с приоритетом выше Елисея: ${item.leftApplicationsHigherPriority}`
      : "",
    item.leftConsentsWithApplicationHigherPriority !== null && item.leftConsentsWithApplicationHigherPriority > 0
      ? `Ушли согласия с приоритетом выше Елисея: ${item.leftConsentsWithApplicationHigherPriority}`
      : "",
    item.leftContractsWithApplicationHigherPriority !== null && item.leftContractsWithApplicationHigherPriority > 0
      ? `Ушли договоры с приоритетом выше Елисея: ${item.leftContractsWithApplicationHigherPriority}`
      : "",
  ].filter(Boolean);

  const missingLines = [
    item.newApplicationsHigherPriority === null ? "Данные по заявлениям не опубликованы" : "",
    item.newConsentsHigherPriority === null ? "Данные по согласиям не опубликованы" : "",
    item.newContractsHigherPriority === null ? "Данные по договорам не опубликованы" : "",
  ].filter(Boolean);

  const noKnownRisk =
    item.newApplicationsHigherPriority === 0 &&
    item.newConsentsHigherPriority === 0 &&
    item.newContractsHigherPriority === 0;

  return (
    <Card className="p-5 md:p-6 shadow-card">
      <h2 className="text-lg font-semibold">Риски по сравнению с прошлым списком</h2>
      <div className="mt-4 space-y-3 text-sm">
        {!hasComparison(item) && (
          <p className="text-muted-foreground">Первый снимок, сравнение отсутствует.</p>
        )}
        {hasComparison(item) && noKnownRisk && (
          <p className="text-success">Новых активных рисков по приоритету выше в последнем сравнении нет.</p>
        )}
        {riskLines.map((line) => (
          <p key={line} className="text-destructive">{line}</p>
        ))}
        {positiveLines.map((line) => (
          <p key={line} className="text-success">{line}</p>
        ))}
        {missingLines.map((line) => (
          <p key={line} className="text-muted-foreground">{line}</p>
        ))}
      </div>
    </Card>
  );
}

function ChangesHistoryTable({ items }: { items: ListChangeItem[] }) {
  return (
    <div className="overflow-x-auto -mx-5 md:mx-0">
      <table className="w-full min-w-[1600px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-3 px-3">Текущий снимок</th>
            <th className="py-3 px-3">Предыдущий снимок</th>
            <th className="py-3 px-3 text-center">Новые заявления</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Ушли заявления</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Новые согласия</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Новые договоры</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Ушли согласия вместе с заявлениями</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Ушли договоры вместе с заявлениями</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3">Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const priorityIssue = hasPriorityIssue(item);

            return (
              <tr
                key={`${item.groupId}-${item.previousSnapshot}-${item.currentSnapshot}`}
                className={`border-b last:border-0 align-top ${priorityIssue ? "bg-destructive/5" : ""}`}
              >
                <td className="py-3 px-3 tabular-nums">{item.currentSnapshot}</td>
                <td className="py-3 px-3 tabular-nums">{hasComparison(item) ? item.previousSnapshot : "Первый снимок"}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newApplications, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newApplicationsHigherPriority, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftApplications, "out")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.leftApplicationsHigherPriority, "out")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newConsents, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newConsentsHigherPriority, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newContracts, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newContractsHigherPriority, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftConsentsWithApplication, "out")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.leftConsentsWithApplicationHigherPriority, "out")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftContractsWithApplication, "out")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.leftContractsWithApplicationHigherPriority, "out")}</td>
                <td className="py-3 px-3 max-w-[320px] text-xs text-muted-foreground">
                  <div>{hasComparison(item) ? item.comment || "—" : "Первый снимок, сравнение отсутствует"}</div>
                  {priorityIssue && (
                    <div className="mt-1 font-medium text-destructive">Внимание: приоритет Елисея не определён. Проверьте обработку CSV.</div>
                  )}
                </td>
              </tr>
            );
          })}
          {!items.length && <tr><td colSpan={15} className="py-8 text-center text-muted-foreground">История изменений пока не рассчитана.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({ items, onSelect }: { items: ListChangeItem[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto -mx-5 md:mx-0">
      <table className="w-full min-w-[1250px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-3 px-3">Вуз</th>
            <th className="py-3 px-3">Основа</th>
            <th className="py-3 px-3">Специальность</th>
            <th className="py-3 px-3">Текущий снимок</th>
            <th className="py-3 px-3">Предыдущий снимок</th>
            <th className="py-3 px-3 text-center">Новые заявления</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Новые согласия</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Новые договоры</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const priorityIssue = hasPriorityIssue(item);

            return (
              <tr
                key={item.groupId}
                className={`border-b last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${priorityIssue ? "bg-destructive/5" : ""}`}
                onClick={() => onSelect(item.groupId)}
              >
                <td className="py-3 px-3">{item.university}</td>
                <td className="py-3 px-3">{item.basis}</td>
                <td className="py-3 px-3 max-w-[320px]">
                  <Link
                    to={`/changes?groupId=${encodeURIComponent(item.groupId)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(item.groupId);
                    }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {item.groupName}
                  </Link>
                  {priorityIssue && (
                    <div className="mt-1 text-xs font-medium text-destructive">Проверьте приоритет Елисея</div>
                  )}
                </td>
                <td className="py-3 px-3 tabular-nums">{item.currentSnapshot}</td>
                <td className="py-3 px-3 tabular-nums">{hasComparison(item) ? item.previousSnapshot : "Первый снимок"}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newApplications, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newApplicationsHigherPriority, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newConsents, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newConsentsHigherPriority, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newContracts, "in")}</td>
                <td className="py-3 px-3 text-center tabular-nums">{formatHigherPriority(item.newContractsHigherPriority, "in")}</td>
              </tr>
            );
          })}
          {!items.length && <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Изменения пока не рассчитаны.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PriorityWarning({ item }: { item: ListChangeItem }) {
  if (!hasPriorityIssue(item)) return null;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      Внимание: приоритет Елисея не определён. Проверьте обработку CSV.
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-lg p-6 shadow-card"><h1 className="text-lg font-semibold">Изменения пока недоступны</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p><Link to="/" className="inline-block mt-4 text-sm text-primary underline underline-offset-2">Вернуться к текущим данным</Link></Card></div>;
}

function latestChangeByGroup(items: ListChangeItem[]): ListChangeItem[] {
  const byGroup: Record<string, ListChangeItem> = {};

  items.forEach((item) => {
    const existing = byGroup[item.groupId];

    if (!existing || changeTimestamp(item) > changeTimestamp(existing)) {
      byGroup[item.groupId] = item;
    }
  });

  return sortChangesDesc(Object.values(byGroup));
}

function sortChangesDesc(items: ListChangeItem[]): ListChangeItem[] {
  return items.slice().sort((first, second) => changeTimestamp(second) - changeTimestamp(first));
}

function changeTimestamp(item: ListChangeItem): number {
  return parseSnapshotTime(item.currentSnapshot);
}

function parseSnapshotTime(value: string): number {
  const text = value.trim();
  let match = text.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0),
    ).getTime();
  }

  match = text.match(/(20\d{2})[-./](\d{2})[-./](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0),
    ).getTime();
  }

  return 0;
}

function hasComparison(item: ListChangeItem): boolean {
  return Boolean(item.previousSnapshot) && !/первый снимок/i.test(item.comment);
}

function hasPriorityIssue(item: ListChangeItem): boolean {
  return item.applicantPriorityCurrent === null || (hasComparison(item) && item.applicantPriorityPrevious === null);
}

function formatSigned(value: number | null, tone: MetricTone): string {
  if (value === null) return "Не опубликовано";
  if (value === 0) return "0";
  return tone === "out" ? `−${value}` : `+${value}`;
}

function formatHigherPriority(value: number | null, tone: MetricTone): string {
  if (value === null) return "Не опубликовано";
  if (value === 0) return "0";
  return tone === "out" ? `−${value}` : `+${value}`;
}

export default Changes;
