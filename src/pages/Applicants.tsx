import { FormEvent, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ApplicantListItem,
  ApplicantsFilters,
  ApplicantsSummary,
  getApplicantProfile,
  getApplicants,
} from "@/data/applications";

const ALL = "all";
const PAGE_SIZE = 50;

type FilterDraft = {
  university: string;
  basis: string;
  confirmation: string;
  direction: string;
  priority: string;
};

const emptyDraft: FilterDraft = {
  university: ALL,
  basis: ALL,
  confirmation: ALL,
  direction: "",
  priority: "",
};

const Applicants = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<ApplicantsFilters>({ limit: PAGE_SIZE, offset: 0 });
  const [code, setCode] = useState("");
  const [searchingCode, setSearchingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["applicants", filters],
    queryFn: () => getApplicants(filters),
    placeholderData: keepPreviousData,
  });

  const applyFilters = (event?: FormEvent) => {
    event?.preventDefault();
    setFilters({
      university: draft.university === ALL ? undefined : draft.university,
      basis: draft.basis === ALL ? undefined : draft.basis as "Бюджет" | "Платное",
      confirmation: draft.confirmation === ALL
        ? undefined
        : draft.confirmation as "consent" | "contract" | "any",
      direction: draft.direction.trim() || undefined,
      priority: draft.priority ? Number(draft.priority) : undefined,
      limit: PAGE_SIZE,
      offset: 0,
    });
  };

  const resetFilters = () => {
    setDraft(emptyDraft);
    setFilters({ limit: PAGE_SIZE, offset: 0 });
  };

  const findExactCode = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.replace(/\D/g, "");

    if (normalized.length < 4) {
      setCodeError("Введите полный цифровой код поступающего.");
      return;
    }

    setSearchingCode(true);
    setCodeError(null);

    try {
      const profile = await getApplicantProfile({ applicantId: normalized });
      if (!profile.found) {
        setCodeError("Поступающий с таким кодом не найден в актуальных списках.");
        return;
      }

      navigate(`/applicants/${encodeURIComponent(profile.profileKey)}`, {
        state: { profile },
      });
    } catch (cause: unknown) {
      setCodeError(cause instanceof Error ? cause.message : "Не удалось выполнить поиск.");
    } finally {
      setSearchingCode(false);
    }
  };

  const offset = filters.offset ?? 0;
  const total = query.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-header text-primary-foreground">
        <div className="container py-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Приёмная кампания · 2026</p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Карта поступающих</h1>
              <p className="mt-2 max-w-3xl text-sm md:text-base opacity-80">
                Заявления, приоритеты, позиции и подтверждения по всем опубликованным спискам
              </p>
            </div>
            <nav className="flex flex-col items-start md:items-end gap-1 text-sm">
              <Link to="/" className="underline underline-offset-4 opacity-90 hover:opacity-100">На главную</Link>
              <Link to="/confirmations" className="underline underline-offset-4 opacity-90 hover:opacity-100">Подтверждения Елисея</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container py-7 md:py-10 space-y-7">
        <form onSubmit={findExactCode} className="flex flex-col md:flex-row md:items-end gap-3 border-b pb-6">
          <div className="flex-1 max-w-xl">
            <label htmlFor="applicant-code" className="text-sm font-medium">Точный поиск по коду поступающего</label>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">Введите полный код. В общем списке коды скрыты.</p>
            <Input
              id="applicant-code"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="Например, 1431604"
              className="font-mono"
            />
          </div>
          <Button type="submit" disabled={searchingCode} className="md:w-auto">
            <Search className="w-4 h-4 mr-2" />
            {searchingCode ? "Ищем…" : "Найти"}
          </Button>
          {codeError && <p className="text-sm text-destructive md:max-w-sm">{codeError}</p>}
        </form>

        {query.data && <SummaryGrid summary={query.data.summary} />}
        {query.isLoading && <SummarySkeleton />}

        <form onSubmit={applyFilters} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_1fr_1.4fr_0.65fr] gap-3">
            <Select value={draft.university} onValueChange={(value) => setDraft((old) => ({ ...old, university: value }))}>
              <SelectTrigger><SelectValue placeholder="Вуз" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все вузы</SelectItem>
                {(query.data?.summary.universities ?? []).map((university) => (
                  <SelectItem key={university} value={university}>{university}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={draft.basis} onValueChange={(value) => setDraft((old) => ({ ...old, basis: value }))}>
              <SelectTrigger><SelectValue placeholder="Основа" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Бюджет и платное</SelectItem>
                <SelectItem value="Бюджет">Бюджет</SelectItem>
                <SelectItem value="Платное">Платное</SelectItem>
              </SelectContent>
            </Select>

            <Select value={draft.confirmation} onValueChange={(value) => setDraft((old) => ({ ...old, confirmation: value }))}>
              <SelectTrigger><SelectValue placeholder="Подтверждение" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все подтверждения</SelectItem>
                <SelectItem value="consent">Есть согласие</SelectItem>
                <SelectItem value="contract">Есть договор</SelectItem>
                <SelectItem value="any">Есть согласие или договор</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={draft.direction}
              onChange={(event) => setDraft((old) => ({ ...old, direction: event.target.value }))}
              placeholder="Направление"
            />

            <Input
              value={draft.priority}
              inputMode="numeric"
              onChange={(event) => setDraft((old) => ({ ...old, priority: event.target.value.replace(/\D/g, "") }))}
              placeholder="Приоритет"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={query.isFetching}>
              {query.isFetching && <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />}
              {query.isFetching ? "Применяем…" : "Применить фильтры"}
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4 mr-2" /> Сбросить
            </Button>
            {query.isFetching && !query.isLoading && (
              <span className="self-center text-sm text-muted-foreground" role="status">
                Обновляем список по выбранным условиям…
              </span>
            )}
          </div>
        </form>

        {query.isError && (
          <Card className="p-6 shadow-card border-destructive/30">
            <h2 className="font-semibold">Карта пока недоступна</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "Не удалось получить данные."}
            </p>
          </Card>
        )}

        {query.isLoading && <ListSkeleton />}

        {query.data && !query.data.items.length && (
          <Card className="p-6 shadow-card">
            <h2 className="font-semibold">Записей по выбранным условиям нет</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Если карта ещё не собиралась, запустите «Начать сбор карты поступающих» в меню трекера.
            </p>
          </Card>
        )}

        {query.data && query.data.items.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-lg font-semibold">Найдено поступающих</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{total.toLocaleString("ru-RU")}</span>
            </div>
            <ApplicantsTable items={query.data.items} />
            <ApplicantsCards items={query.data.items} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setFilters((old) => ({ ...old, offset: Math.max(0, offset - PAGE_SIZE) }))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Назад
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">Страница {page} из {pages}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setFilters((old) => ({ ...old, offset: offset + PAGE_SIZE }))}
              >
                Далее <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

function SummaryGrid({ summary }: { summary: ApplicantsSummary }) {
  const values = [
    ["Поступающих", summary.applicantsCount, "уникальных кодов"],
    ["Заявлений", summary.applicationsCount, "в актуальных списках"],
    ["В нескольких вузах", summary.crossUniversityCount, "выбрали больше одного вуза"],
    ["Подали согласие", summary.withConsentCount, `${summary.consentsCount} согласий`],
    ["Заключили договор", summary.withContractCount, `${summary.contractsCount} договоров`],
  ] as const;

  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
      {values.map(([label, value, detail]) => (
        <Card key={label} className="p-4 md:p-5 shadow-card min-h-[118px]">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-3 text-2xl md:text-3xl font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </Card>
      ))}
    </section>
  );
}

function ApplicantsTable({ items }: { items: ApplicantListItem[] }) {
  const navigate = useNavigate();

  return (
    <Card className="hidden md:block shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[1050px]">
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Вузы</TableHead>
              <TableHead className="text-right">Заявлений</TableHead>
              <TableHead className="text-right">Бюджет / платное</TableHead>
              <TableHead className="text-right">Лучший приоритет</TableHead>
              <TableHead className="text-right">Балл</TableHead>
              <TableHead className="text-right">Согласия</TableHead>
              <TableHead className="text-right">Договоры</TableHead>
              <TableHead>Последний список</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.profileKey} className="cursor-pointer" onClick={() => navigate(`/applicants/${encodeURIComponent(item.profileKey)}`)}>
                <TableCell><Link className="font-mono font-medium text-primary" to={`/applicants/${encodeURIComponent(item.profileKey)}`}>{item.applicantCode}</Link></TableCell>
                <TableCell className="max-w-[240px] whitespace-normal text-sm">{item.universities.join(", ")}</TableCell>
                <TableCell className="text-right tabular-nums">{item.applicationsCount}</TableCell>
                <TableCell className="text-right tabular-nums">{item.budgetCount} / {item.paidCount}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(item.bestPriority)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(item.maxScore)}</TableCell>
                <TableCell className="text-right tabular-nums text-success">{item.consentsCount}</TableCell>
                <TableCell className="text-right tabular-nums text-accent">{item.contractsCount}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.latestSnapshot || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ApplicantsCards({ items }: { items: ApplicantListItem[] }) {
  return (
    <div className="md:hidden space-y-3">
      {items.map((item) => (
        <Link key={item.profileKey} to={`/applicants/${encodeURIComponent(item.profileKey)}`} className="block">
          <Card className="p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono font-semibold text-primary">{item.applicantCode}</span>
              <span className="text-xs text-muted-foreground">{item.latestSnapshot || "Нет даты"}</span>
            </div>
            <p className="mt-2 text-sm leading-snug">{item.universities.join(", ")}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <CompactValue label="Заявлений" value={item.applicationsCount} />
              <CompactValue label="Приоритет" value={item.bestPriority} />
              <CompactValue label="Балл" value={item.maxScore} />
              <CompactValue label="Бюджет" value={item.budgetCount} />
              <CompactValue label="Согласия" value={item.consentsCount} tone="success" />
              <CompactValue label="Договоры" value={item.contractsCount} tone="accent" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function CompactValue({ label, value, tone }: { label: string; value: number | null; tone?: "success" | "accent" }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-medium tabular-nums ${tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : ""}`}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function SummarySkeleton() {
  return <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-[118px]" />)}</div>;
}

function ListSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ru-RU");
}

export default Applicants;
