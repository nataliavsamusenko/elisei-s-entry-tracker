import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ListChangeItem,
  getChanges,
} from "@/data/applications";

type MetricTone = "in" | "out";

const ALL = "all";

const Changes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ListChangeItem[]>([]);
  const [history, setHistory] = useState<ListChangeItem[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("groupId") || "");
  const [universityFilter, setUniversityFilter] = useState(ALL);
  const [basisFilter, setBasisFilter] = useState(ALL);
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

    getChanges({ groupId: selectedId })
      .then((data) => setHistory(data.items))
      .catch((cause: unknown) => {
        setHistory([]);
        setError(cause instanceof Error ? cause.message : "Не удалось получить историю изменений.");
      })
      .finally(() => setLoadingHistory(false));
  }, [selectedId, setSearchParams]);

  const universities = useMemo(
    () => Array.from(new Set(items.map((item) => item.university))).sort(),
    [items]
  );

  const filteredItems = useMemo(() => items.filter((item) => {
    if (universityFilter !== ALL && item.university !== universityFilter) return false;
    if (basisFilter !== ALL && item.basis !== basisFilter) return false;
    return true;
  }), [items, universityFilter, basisFilter]);

  const groupOptions = filteredItems.length ? filteredItems : items;
  const selected = (history[0] || items.find((item) => item.groupId === selectedId)) ?? null;

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
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка изменений списков…</div>;
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
            <Card className="p-5 md:p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.groupName}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected.university} · {selected.basis} · {selected.previousSnapshot} → {selected.currentSnapshot}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground text-left md:text-right">
                  Приоритет Елисея: {formatPlain(selected.applicantPriorityCurrent)}
                </div>
              </div>
              {selected.comment && <p className="mt-3 text-xs text-muted-foreground">{selected.comment}</p>}
            </Card>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              <ChangeMetricCard label="Новые заявления" value={selected.newApplications} higher={selected.newApplicationsHigherPriority} tone="in" />
              <ChangeMetricCard label="Ушли заявления" value={selected.leftApplications} higher={selected.leftApplicationsHigherPriority} tone="out" />
              <ChangeMetricCard label="Новые согласия" value={selected.newConsents} higher={selected.newConsentsHigherPriority} tone="in" />
              <ChangeMetricCard label="Новые договоры" value={selected.newContracts} higher={selected.newContractsHigherPriority} tone="in" />
              <ChangeMetricCard label="Ушли согласия вместе с заявлениями" value={selected.leftConsentsWithApplication} higher={selected.leftConsentsWithApplicationHigherPriority} tone="out" />
              <ChangeMetricCard label="Ушли договоры вместе с заявлениями" value={selected.leftContractsWithApplication} higher={selected.leftContractsWithApplicationHigherPriority} tone="out" />
            </section>

            <Card className="p-5 md:p-6 shadow-card">
              <h2 className="text-lg font-semibold mb-4">История изменений</h2>
              {loadingHistory && <div className="py-10 text-center text-sm text-muted-foreground">Загрузка истории изменений…</div>}
              {!loadingHistory && error && <div className="py-10 text-sm text-destructive">{error}</div>}
              {!loadingHistory && !error && <ChangesHistoryTable items={history} />}
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
      ? "text-warning-foreground"
      : "text-success";

  return (
    <Card className="p-4 shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{formatSigned(value, tone)}</div>
      <div className="mt-1 text-xs text-muted-foreground">из них с приоритетом выше: {formatPlain(higher)}</div>
    </Card>
  );
}

function ChangesHistoryTable({ items }: { items: ListChangeItem[] }) {
  return (
    <div className="overflow-x-auto -mx-5 md:mx-0">
      <table className="w-full min-w-[1450px] text-sm">
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
            <th className="py-3 px-3 text-center">Ушли согласия с заявлениями</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
            <th className="py-3 px-3 text-center">Ушли договоры с заявлениями</th>
            <th className="py-3 px-3 text-center">Из них приоритет выше</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.groupId}-${item.previousSnapshot}-${item.currentSnapshot}`} className="border-b last:border-0">
              <td className="py-3 px-3 tabular-nums">{item.currentSnapshot}</td>
              <td className="py-3 px-3 tabular-nums">{item.previousSnapshot}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newApplications, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.newApplicationsHigherPriority)}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftApplications, "out")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.leftApplicationsHigherPriority)}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newConsents, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.newConsentsHigherPriority)}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newContracts, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.newContractsHigherPriority)}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftConsentsWithApplication, "out")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.leftConsentsWithApplicationHigherPriority)}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftContractsWithApplication, "out")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatPlain(item.leftContractsWithApplicationHigherPriority)}</td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan={14} className="py-8 text-center text-muted-foreground">История изменений пока не рассчитана.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({ items, onSelect }: { items: ListChangeItem[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto -mx-5 md:mx-0">
      <table className="w-full min-w-[1150px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-3 px-3">Вуз</th>
            <th className="py-3 px-3">Основа</th>
            <th className="py-3 px-3">Специальность</th>
            <th className="py-3 px-3">Дата текущего снимка</th>
            <th className="py-3 px-3 text-center">Новые заявления</th>
            <th className="py-3 px-3 text-center">Ушли заявления</th>
            <th className="py-3 px-3 text-center">Новые согласия</th>
            <th className="py-3 px-3 text-center">Новые договоры</th>
            <th className="py-3 px-3 text-center">Ушли согласия</th>
            <th className="py-3 px-3 text-center">Ушли договоры</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.groupId} className="border-b last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => onSelect(item.groupId)}>
              <td className="py-3 px-3">{item.university}</td>
              <td className="py-3 px-3">{item.basis}</td>
              <td className="py-3 px-3 max-w-[320px]">{item.groupName}</td>
              <td className="py-3 px-3 tabular-nums">{item.currentSnapshot}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newApplications, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftApplications, "out")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newConsents, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.newContracts, "in")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftConsentsWithApplication, "out")}</td>
              <td className="py-3 px-3 text-center tabular-nums">{formatSigned(item.leftContractsWithApplication, "out")}</td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Изменения пока не рассчитаны.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-lg p-6 shadow-card"><h1 className="text-lg font-semibold">Изменения пока недоступны</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p><Link to="/" className="inline-block mt-4 text-sm text-primary underline underline-offset-2">Вернуться к текущим данным</Link></Card></div>;
}

function formatSigned(value: number | null, tone: MetricTone): string {
  if (value === null) return "Не опубликовано";
  if (value === 0) return "0";
  return tone === "out" ? `−${value}` : `+${value}`;
}

function formatPlain(value: number | null): string {
  return value === null ? "Не опубликовано" : String(value);
}

export default Changes;
