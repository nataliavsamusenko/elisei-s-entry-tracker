import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Basis,
  SnapshotHistoryPoint,
  getGroupHistory,
} from "@/data/applications";

const Dynamics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGroupId = searchParams.get("groupId") || "";
  const [selectedId, setSelectedId] = useState(initialGroupId);
  const [draftId, setDraftId] = useState(initialGroupId);
  const [history, setHistory] = useState<SnapshotHistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

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

  const chartData = useMemo(
    () => history.map((item) => ({
      date: item.date,
      position: item.position,
    })),
    [history],
  );

  const selectedBasis = getBasisFromGroupId(selectedId);
  const hasMetricData = chartData.some((item) => item.position !== null);
  const first = history[0] || null;
  const latest = history[history.length - 1] || null;
  const totalMovement = getTotalMovement(
    first?.position ?? null,
    latest?.position ?? null,
  );

  const submitGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextId = draftId.trim().toUpperCase();

    if (!nextId) {
      setSelectedId("");
      setHistory([]);
      setSearchParams({}, { replace: true });
      return;
    }

    setSelectedId(nextId);
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Динамика позиций</h1>
              <p className="mt-2 text-sm md:text-base opacity-80">История по выбранной конкурсной группе</p>
            </div>
            <Link to="/" className="text-sm underline underline-offset-4 opacity-90 hover:opacity-100">Вернуться к текущей ситуации</Link>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-10 space-y-6">
        <Card className="p-5 md:p-6 shadow-card">
          <form onSubmit={submitGroup} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="groupId">ID группы</label>
              <Input
                id="groupId"
                className="mt-2 font-mono"
                placeholder="SPBGEU-P-02"
                value={draftId}
                onChange={(event) => setDraftId(event.target.value)}
              />
            </div>
            <Button type="submit" className="md:w-36">Показать</Button>
          </form>
        </Card>

        {!selectedId && (
          <Card className="p-6 shadow-card">
            <h2 className="text-lg font-semibold">Выберите группу</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Откройте историю из строки на главном дашборде или введите ID конкурсной группы.
            </p>
          </Card>
        )}

        {selectedId && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
              <SummaryCard label="Снимков" value={String(history.length)} sub="сохранённых версий списка" />
              <SummaryCard label="Первая позиция" value={positionValue(first)} sub={first?.date || "нет данных"} />
              <SummaryCard label="Текущая позиция" value={positionValue(latest)} sub={latest?.date || "нет данных"} />
              <SummaryCard label="За весь период" value={totalMovement} sub="по общей позиции" />
            </section>

            <Card className="p-5 md:p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-semibold font-mono">{selectedId}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatBasis(selectedBasis)} · текущий приоритет {latest?.priority ?? "—"}
                  </p>
                </div>
              </div>

              {loadingHistory && <div className="h-[340px] flex items-center justify-center text-sm text-muted-foreground">Загрузка истории…</div>}
              {!loadingHistory && error && <div className="py-10 text-sm text-destructive">{error}</div>}
              {!loadingHistory && !error && !hasMetricData && <div className="py-10 text-sm text-muted-foreground">В сохранённых снимках пока нет значений позиции.</div>}
              {!loadingHistory && !error && hasMetricData && <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 16, right: 24, left: 4, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" angle={-25} textAnchor="end" height={64} />
                    <YAxis reversed allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: "меньше номер — выше позиция", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                    <Tooltip formatter={(value) => value === null ? "нет данных" : `№ ${value}`} />
                    <Line type="monotone" dataKey="position" name="Общая позиция" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>}
            </Card>

            <Card className="p-5 md:p-6 shadow-card">
              <h2 className="text-lg font-semibold mb-4">История снимков</h2>
              <div className="overflow-x-auto -mx-5 md:mx-0">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                      <th className="py-3 px-3">Дата списка</th>
                      <th className="py-3 px-3 text-center">Позиция</th>
                      <th className="py-3 px-3 text-center">Балл</th>
                      <th className="py-3 px-3 text-center">Приоритет</th>
                      <th className="py-3 px-3 text-center">Согласий выше</th>
                      <th className="py-3 px-3 text-center">Согласий выше с более высоким приоритетом</th>
                      <th className="py-3 px-3 text-center">Договоров выше</th>
                      <th className="py-3 px-3 text-center">Договоров выше с более высоким приоритетом</th>
                      <th className="py-3 px-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item, index) => (
                      <tr key={`${item.date}-${index}`} className="border-b last:border-0 align-top">
                        <td className="py-3 px-3 tabular-nums">{item.date}</td>
                        <td className="py-3 px-3 text-center font-medium tabular-nums">{formatNullable(item.position)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.score)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.priority)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.consentsAbove)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.consentsAboveHigherPriority)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.contractsAbove)}</td>
                        <td className="py-3 px-3 text-center tabular-nums">{formatNullable(item.contractsAboveHigherPriority)}</td>
                        <td className="py-3 px-3 text-xs">{item.status}</td>
                      </tr>
                    ))}
                    {!loadingHistory && !history.length && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Снимков пока нет.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <Card className="p-4 shadow-card"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{sub}</div></Card>;
}

function positionValue(point: SnapshotHistoryPoint | null): string {
  if (!point || point.position === null) return "—";
  return `№ ${point.position}`;
}

function getTotalMovement(first: number | null, latest: number | null): string {
  if (first === null || latest === null) return "нет сравнения";
  const delta = first - latest;
  if (delta > 0) return `лучше на ${delta}`;
  if (delta < 0) return `хуже на ${Math.abs(delta)}`;
  return "без изменений";
}

function formatNullable(value: number | null): string {
  return value === null ? "—" : String(value);
}

function getBasisFromGroupId(groupId: string): Basis | null {
  if (groupId.includes("-B-")) return "Бюджет";
  if (groupId.includes("-P-")) return "Платное";
  return null;
}

function formatBasis(basis: Basis | null): string {
  return basis || "основа не определена";
}

export default Dynamics;
