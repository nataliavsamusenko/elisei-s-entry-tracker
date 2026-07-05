import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CartesianGrid,
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
  Application,
  SnapshotHistoryPoint,
  getDashboardData,
  getGroupHistory,
} from "@/data/applications";

type MetricMode = "general" | "active";

const Dynamics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("groupId") || "");
  const [history, setHistory] = useState<SnapshotHistoryPoint[]>([]);
  const [metric, setMetric] = useState<MetricMode>("general");
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardData()
      .then((data) => {
        setApps(data.applications);
        setSelectedId((current) => current && data.applications.some((item) => item.id === current)
          ? current
          : data.applications[0]?.id || "");
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Не удалось получить список конкурсных групп.");
      })
      .finally(() => setLoadingApps(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    setLoadingHistory(true);
    setError(null);
    setSearchParams({ groupId: selectedId }, { replace: true });

    getGroupHistory(selectedId)
      .then(setHistory)
      .catch((cause: unknown) => {
        setHistory([]);
        setError(cause instanceof Error ? cause.message : "Не удалось получить историю снимков.");
      })
      .finally(() => setLoadingHistory(false));
  }, [selectedId, setSearchParams]);

  const selected = apps.find((item) => item.id === selectedId) || null;

  const universities = useMemo(
    () => Array.from(new Set(apps.map((item) => item.university))),
    [apps]
  );

  const selectedUniversity = selected?.university || universities[0] || "";
  const universityApps = apps.filter((item) => item.university === selectedUniversity);
  const selectedBasis = selected?.basis || universityApps[0]?.basis || "Бюджет";
  const basisApps = universityApps.filter((item) => item.basis === selectedBasis);

  const chartData = history.map((item) => ({
    snapshot: item.snapshot,
    position: metric === "general" ? item.generalPosition : item.activeRank,
  }));

  const hasMetricData = chartData.some((item) => item.position !== null);
  const first = history[0] || null;
  const latest = history[history.length - 1] || null;
  const totalMovement = getTotalMovement(
    metric === "general" ? first?.generalPosition ?? null : first?.activeRank ?? null,
    metric === "general" ? latest?.generalPosition ?? null : latest?.activeRank ?? null,
  );

  const selectGroup = (id: string) => {
    setSelectedId(id);
    setHistory([]);
  };

  const changeUniversity = (university: string) => {
    const next = apps.find((item) => item.university === university) || null;
    if (next) selectGroup(next.id);
  };

  const changeBasis = (basis: string) => {
    const next = universityApps.find((item) => item.basis === basis) || null;
    if (next) selectGroup(next.id);
  };

  if (loadingApps) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка конкурсных групп…</div>;
  }

  if (error && !selected) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Динамика позиций</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">Полная история по одной выбранной конкурсной группе</p>
            </div>
            <Link to="/" className="text-sm underline underline-offset-4 opacity-90 hover:opacity-100">Вернуться к текущей ситуации</Link>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-6">
        <Card className="p-5 md:p-6 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={selectedUniversity} onValueChange={changeUniversity}>
              <SelectTrigger><SelectValue placeholder="Вуз" /></SelectTrigger>
              <SelectContent>{universities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedBasis} onValueChange={changeBasis}>
              <SelectTrigger><SelectValue placeholder="Основа" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set(universityApps.map((item) => item.basis))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedId} onValueChange={selectGroup}>
              <SelectTrigger><SelectValue placeholder="Конкурсная группа" /></SelectTrigger>
              <SelectContent>{basisApps.map((item) => <SelectItem key={item.id} value={item.id}>{item.group}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Card>

        {selected && <>
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
            <SummaryCard label="Снимков" value={String(history.length)} sub="уникальных версий списка" />
            <SummaryCard label="Первая позиция" value={metricValue(first, metric)} sub={first?.snapshot || "нет данных"} />
            <SummaryCard label="Текущая позиция" value={metricValue(latest, metric)} sub={latest?.snapshot || "нет данных"} />
            <SummaryCard label="За весь период" value={totalMovement} sub={metric === "general" ? "по общей позиции" : "по активной позиции"} />
          </section>

          <Card className="p-5 md:p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-semibold">{selected.group}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selected.university} · {selected.basis} · приоритет {selected.priority}</p>
              </div>
              <Select value={metric} onValueChange={(value) => setMetric(value as MetricMode)}>
                <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Общая позиция</SelectItem>
                  <SelectItem value="active">Активная позиция</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loadingHistory && <div className="h-[340px] flex items-center justify-center text-sm text-muted-foreground">Загрузка истории…</div>}
            {!loadingHistory && error && <div className="py-10 text-sm text-destructive">{error}</div>}
            {!loadingHistory && !error && !hasMetricData && <div className="py-10 text-sm text-muted-foreground">Для выбранного типа позиции в сохранённых снимках пока нет значений.</div>}
            {!loadingHistory && !error && hasMetricData && <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 24, left: 4, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="snapshot" tick={{ fontSize: 11 }} interval="preserveStartEnd" angle={-25} textAnchor="end" height={64} />
                  <YAxis reversed allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: "меньше номер — выше позиция", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                  <Tooltip formatter={(value) => value === null ? "нет данных" : `№ ${value}`} />
                  <Line type="monotone" dataKey="position" name={metric === "general" ? "Общая позиция" : "Активная позиция"} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>}
          </Card>

          <Card className="p-5 md:p-6 shadow-card">
            <h2 className="text-lg font-semibold mb-4">История снимков</h2>
            <div className="overflow-x-auto -mx-5 md:mx-0">
              <table className="w-full min-w-[1150px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-3 px-3">Дата списка</th>
                    <th className="py-3 px-3 text-center">Балл</th>
                    <th className="py-3 px-3 text-center">Общая</th>
                    <th className="py-3 px-3">Изменение общей</th>
                    <th className="py-3 px-3 text-center">Активная</th>
                    <th className="py-3 px-3">Источник</th>
                    <th className="py-3 px-3">Изменение активной</th>
                    <th className="py-3 px-3">Согласия / договоры</th>
                    <th className="py-3 px-3">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, index) => {
                    const count = selected.basis === "Бюджет" ? item.consentsCount : item.contractsCount;
                    const above = selected.basis === "Бюджет" ? item.consentsAbove : item.contractsAbove;
                    const label = selected.basis === "Бюджет" ? "согласий" : "договоров";
                    return <tr key={`${item.snapshot}-${index}`} className="border-b last:border-0 align-top">
                      <td className="py-3 px-3 tabular-nums">{item.snapshot}</td>
                      <td className="py-3 px-3 text-center tabular-nums">{item.score ?? "—"}</td>
                      <td className="py-3 px-3 text-center font-medium tabular-nums">{item.generalPosition ?? "—"}</td>
                      <td className="py-3 px-3"><Movement value={item.generalChange} /></td>
                      <td className="py-3 px-3 text-center font-medium tabular-nums">{item.activeRank ?? "—"}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">{item.activeSource}</td>
                      <td className="py-3 px-3"><Movement value={item.activeChange} /></td>
                      <td className="py-3 px-3 text-xs">{label}: {formatNullable(count)}<br /><span className="text-muted-foreground">выше: {formatNullable(above)}</span></td>
                      <td className="py-3 px-3 text-xs">{item.status}</td>
                    </tr>;
                  })}
                  {!loadingHistory && !history.length && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Снимков пока нет.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>}
      </main>
    </div>
  );
};

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <Card className="p-4 shadow-card"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{sub}</div></Card>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-lg p-6 shadow-card"><h1 className="text-lg font-semibold">История пока недоступна</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p><Link to="/" className="inline-block mt-4 text-sm text-primary underline underline-offset-2">Вернуться к текущим данным</Link></Card></div>;
}

function Movement({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const tone = lower.startsWith("+") || lower.includes("поднялся") ? "text-success" : lower.startsWith("-") || lower.includes("опустился") ? "text-warning-foreground" : "text-muted-foreground";
  return <span className={`text-xs ${tone}`}>{value}</span>;
}

function metricValue(point: SnapshotHistoryPoint | null, metric: MetricMode): string {
  if (!point) return "—";
  const value = metric === "general" ? point.generalPosition : point.activeRank;
  return value === null ? "—" : `№ ${value}`;
}

function getTotalMovement(first: number | null, latest: number | null): string {
  if (first === null || latest === null) return "нет сравнения";
  const delta = first - latest;
  if (delta > 0) return `лучше на ${delta}`;
  if (delta < 0) return `хуже на ${Math.abs(delta)}`;
  return "без изменений";
}

function formatNullable(value: number | null): string {
  return value === null ? "нет данных" : String(value);
}

export default Dynamics;
