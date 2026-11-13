import { useRef, useState, type FormEvent } from "react";
import { usePostHog } from "@posthog/react";
import { Link, useNavigate, useParams } from "react-router";
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  Clock,
  Copy,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/ui/form-select";
import {
  categoryLabels,
  contractLabels,
  functionLabels,
  remoteLabels,
  seniorityLabels,
} from "@/features/jobs/presentation";
import type { JobCategory } from "@/features/jobs/types";
import { currentPerson, jobSchema, type HelpRequest, type JobRecord } from "./model";
import { usePrototype } from "./store";
import { Field } from "./workspace";
import { NotFound, PageTitle } from "./shell";
import {
  categoryDescriptions,
  essentialGenitive,
  essentialKeys,
  essentialLabels,
  essentialPrompt,
  essentialState,
  firstName,
  isReady,
  proposeDescription,
  proposeSummary,
  skipReasonLabels,
  skipReasons,
  type EssentialKey,
  type EssentialState,
  type EssentialStatuses,
  type EssentialValues,
  type SkipReason,
  type TextEssentialKey,
} from "./essentials";
import { HelpRequestDialog, type HelpRequestInput } from "./help-request-dialog";

const coordinates: Record<string, { latitude: number; longitude: number }> = {
  warszawa: { latitude: 52.2297, longitude: 21.0122 },
  kraków: { latitude: 50.0647, longitude: 19.945 },
  wrocław: { latitude: 51.1079, longitude: 17.0385 },
  gdańsk: { latitude: 54.352, longitude: 18.6466 },
  poznań: { latitude: 52.4064, longitude: 16.9252 },
};

export function expertLink(requestId: string) {
  return `${window.location.origin}${window.location.pathname}#/pomoc/${requestId}`;
}

function publishLabel(missing: EssentialKey[]) {
  if (missing.length === 0) return "Opublikuj ofertę";
  if (missing.length === 1) return `Opublikuj bez ${essentialGenitive[missing[0]]}`;
  return `Opublikuj bez ${missing.length} elementów`;
}

const stateText: Record<EssentialState, string> = {
  filled: "Uzupełnione",
  skipped: "Pominięte",
  pending_expert: "Czeka na eksperta",
  answer_ready: "Odpowiedź eksperta do przejrzenia",
  missing: "Brak",
};

function StateIcon({ state }: { state: EssentialState }) {
  const Icon =
    state === "filled"
      ? CircleCheck
      : state === "skipped"
        ? CircleMinus
        : state === "pending_expert"
          ? Clock
          : state === "answer_ready"
            ? MessageSquareText
            : CircleDashed;
  return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}

export function EmployerJobEditor() {
  const { id } = useParams();
  const { state, run } = usePrototype();
  const posthog = usePostHog();
  const person = currentPerson(state)!;
  const navigate = useNavigate();
  const existing = state.jobs.find((x) => x.id === id && x.companyId === person.companyId);
  const [jobId] = useState(() => existing?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState<JobCategory>(existing?.category ?? "build");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [source, setSource] = useState(existing?.sourceBrief ?? "");
  const [generated, setGenerated] = useState(existing?.generatedDescription ?? "");
  const [values, setValues] = useState<EssentialValues>(existing?.essentials ?? {});
  const [statuses, setStatuses] = useState<EssentialStatuses>(existing?.essentialStatus ?? {});
  const [salaryMin, setSalaryMin] = useState(existing?.salaryMin?.toString() ?? "");
  const [salaryMax, setSalaryMax] = useState(existing?.salaryMax?.toString() ?? "");
  const [skipping, setSkipping] = useState<EssentialKey | null>(null);
  const [dialogKey, setDialogKey] = useState<EssentialKey | null | undefined>(undefined);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const form = useRef<HTMLFormElement>(null);
  if (id !== "nowa" && !existing) return <NotFound />;

  const requests = state.helpRequests.filter((x) => x.jobId === jobId);
  const pendingKeys = new Set(
    requests.filter((r) => r.status === "sent").flatMap((r) => r.questions),
  );
  const salary = {
    min: salaryMin === "" ? undefined : Number(salaryMin),
    max: salaryMax === "" ? undefined : Number(salaryMax),
  };
  const answeredKeys = new Set(
    requests.flatMap((r) => r.answers.filter((a) => !a.resolution).map((a) => a.key)),
  );
  const states = Object.fromEntries(
    essentialKeys.map((key) => {
      const base = essentialState(key, values, statuses, salary, pendingKeys);
      const ready = answeredKeys.has(key) && (base === "missing" || base === "skipped");
      return [key, ready ? "answer_ready" : base];
    }),
  ) as Record<EssentialKey, EssentialState>;
  const missing = essentialKeys.filter((key) => !isReady(states[key]));
  const askable = essentialKeys.filter((key) => ["missing", "skipped"].includes(states[key]));
  const suggested = essentialKeys.filter((key) => states[key] === "missing");
  const readyCount = essentialKeys.length - missing.length;
  const canSaveDraft = !existing || existing.publicationStatus === "draft";
  // The simulated AI is deterministic, so a different proposal means the inputs changed.
  const stale = Boolean(generated) && proposeDescription(source, values) !== generated;

  function changed() {
    setApproved(false);
    setMessage("");
  }
  function setValue(key: TextEssentialKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    changed();
  }
  function setStatus(key: EssentialKey, status: EssentialStatuses[EssentialKey]) {
    setStatuses((current) => ({ ...current, [key]: status }));
    setSkipping(null);
    changed();
  }
  function focusField(key: EssentialKey) {
    document
      .getElementById(key === "salary" ? "essential-salary-min" : `essential-${key}`)
      ?.focus();
  }

  function buildJob(): Partial<JobRecord> | null {
    const data = form.current ? new FormData(form.current) : null;
    if (!data) return null;
    const location = String(data.get("location") ?? "").trim();
    const cleanValues = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v?.trim()),
    ) as EssentialValues;
    const cleanStatuses = Object.fromEntries(
      Object.entries(statuses).filter(([, v]) => v),
    ) as EssentialStatuses;
    return {
      id: jobId,
      slug: existing?.slug ?? `oferta-${jobId}`,
      companyId: person.companyId,
      title,
      summary,
      description,
      sourceBrief: source,
      generatedDescription: generated,
      category,
      function: data.get("function") as JobRecord["function"],
      remoteStatus: data.get("remoteStatus") as JobRecord["remoteStatus"],
      locations: [location],
      seniority: data.get("seniority") as JobRecord["seniority"],
      contract: data.get("contract") as JobRecord["contract"],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: existing?.salaryCurrency ?? "PLN",
      salaryPeriod: existing?.salaryPeriod ?? "month",
      salaryKind: existing?.salaryKind ?? "gross",
      coordinates: coordinates[location.toLocaleLowerCase("pl")],
      publicationStatus: "published",
      publishedAt: existing?.publishedAt ?? new Date().toISOString(),
      expiryAt: existing?.expiryAt ?? "2099-12-31T23:59:59.000Z",
      verificationStatus: "employer_verified",
      essentials: cleanValues,
      essentialStatus: cleanStatuses,
    };
  }

  function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!approved) {
      setError("Zatwierdź opis przed publikacją.");
      return;
    }
    const parsed = jobSchema.safeParse(buildJob());
    if (!parsed.success) {
      setError(
        "Sprawdź formularz: tytuł, lokalizacja, podsumowanie (min. 10 znaków), opis (min. 30 znaków) i widełki wynagrodzenia.",
      );
      return;
    }
    if (run({ type: "publish", job: parsed.data })) {
      posthog.capture("job_published", {
        category,
        missing_essentials_count: missing.length,
      });
      navigate("/app/oferty");
    }
  }

  function saveDraft() {
    setError("");
    const parsed = jobSchema.safeParse({ ...buildJob(), publicationStatus: "draft" });
    if (!parsed.success) {
      setError(
        "Do zapisania szkicu potrzebne są nazwa stanowiska, lokalizacja i poprawne widełki.",
      );
      return;
    }
    if (run({ type: "save_job_draft", job: parsed.data })) {
      posthog.capture("job_draft_saved", { category });
      if (!existing) navigate(`/app/oferty/${jobId}`, { replace: true });
      else setMessage("Szkic został zapisany.");
    }
  }

  function requestHelp(input: HelpRequestInput) {
    const parsed = jobSchema.safeParse({
      ...buildJob(),
      publicationStatus: existing?.publicationStatus ?? "draft",
    });
    if (!parsed.success)
      return "Najpierw wpisz nazwę stanowiska i lokalizację. Ekspert zobaczy je w prośbie.";
    const requestId = crypto.randomUUID();
    if (!run({ type: "request_help", requestId, job: parsed.data, ...input }))
      return "Nie udało się zapisać prośby. Sprawdź dane eksperta.";
    posthog.capture("expert_help_requested", {
      channel: input.channel,
      question_count: input.questions.length,
    });
    if (input.channel === "link")
      void navigator.clipboard?.writeText(expertLink(requestId)).catch(() => {});
    setDialogKey(undefined);
    if (!existing) navigate(`/app/oferty/${jobId}`, { replace: true });
    return null;
  }

  const notes = requests.filter((r) => r.note && !r.noteResolution);

  return (
    <>
      <PageTitle>{existing ? "Edytuj ofertę" : "Nowa oferta"}</PageTitle>
      <div className="job-editor-layout">
        <form ref={form} className="prototype-form job-editor-form" onSubmit={publish}>
          <Field label="Nazwa stanowiska">
            <Input
              required
              maxLength={200}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                changed();
              }}
            />
          </Field>

          <fieldset className="category-options">
            <legend>Kategoria</legend>
            <p className="essential-hint">
              Na czym polega praca tej osoby z AI? Od kategorii zależą pytania w sekcji „Co kandydat
              musi wiedzieć”.
            </p>
            {(Object.keys(categoryLabels) as JobCategory[]).map((value) => (
              <label key={value} className="category-option">
                <input
                  type="radio"
                  name="category"
                  value={value}
                  checked={category === value}
                  onChange={() => {
                    setCategory(value);
                    changed();
                  }}
                />
                <span>
                  <strong>{categoryLabels[value]}</strong>
                  <span>{categoryDescriptions[value]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["function", "Funkcja", functionLabels, existing?.function ?? "engineering"],
                ["seniority", "Poziom", seniorityLabels, existing?.seniority ?? "mid"],
                ["remoteStatus", "Tryb pracy", remoteLabels, existing?.remoteStatus ?? "hybrid"],
                ["contract", "Umowa", contractLabels, existing?.contract ?? "employment"],
              ] as const
            ).map(([name, label, options, value]) => (
              <Field key={name} label={label}>
                <FormSelect
                  name={name}
                  ariaLabel={label}
                  defaultValue={value}
                  options={Object.entries(options).map(([value, label]) => ({ value, label }))}
                />
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Field label="Lokalizacja">
                <Input
                  name="location"
                  required
                  maxLength={200}
                  defaultValue={existing?.locations.join(" / ") ?? "Warszawa"}
                  onChange={changed}
                />
              </Field>
            </div>
          </div>

          <Field label="Brief — kogo szukasz i do jakiego zadania?">
            <Textarea
              maxLength={12000}
              value={source}
              placeholder="Możesz wkleić tu swoje poprzednie ogłoszenie."
              onChange={(e) => {
                setSource(e.target.value);
                changed();
              }}
            />
          </Field>

          <section className="essentials-section" aria-labelledby="essentials-heading">
            <h2 id="essentials-heading">Co kandydat musi wiedzieć</h2>
            <p className="essential-hint">
              Uzupełnij, co wiesz. O resztę możesz poprosić osobę, która zna tę rolę.
            </p>
            {notes.map((r) => (
              <div key={r.id} className="expert-suggestion" role="status">
                <p className="expert-suggestion-title">
                  <MessageSquareText aria-hidden="true" className="size-4" /> Uwaga od{" "}
                  {r.expertName}
                  {r.note!.mode === "voice" && (
                    <span className="expert-tag">nagranie, spisane</span>
                  )}
                </p>
                <p className="whitespace-pre-wrap">{r.note!.text}</p>
                <div className="essential-actions">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setSource((s) => `${s.trim()}\n\n${r.note!.text}`.trim());
                      changed();
                      run({
                        type: "resolve_help",
                        requestId: r.id,
                        target: { kind: "note", resolution: "added" },
                      });
                    }}
                  >
                    Dodaj do briefu
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      run({
                        type: "resolve_help",
                        requestId: r.id,
                        target: { kind: "note", resolution: "dismissed" },
                      })
                    }
                  >
                    Zamknij
                  </Button>
                </div>
              </div>
            ))}
            {essentialKeys.map((key) => (
              <EssentialField
                key={key}
                essential={key}
                category={category}
                state={states[key]}
                status={statuses[key]}
                value={key === "salary" ? "" : (values[key] ?? "")}
                salaryMin={salaryMin}
                salaryMax={salaryMax}
                skipping={skipping === key}
                requests={requests}
                onValue={(v) => setValue(key as TextEssentialKey, v)}
                onSalary={(min, max) => {
                  setSalaryMin(min);
                  setSalaryMax(max);
                  changed();
                }}
                onStatus={(s) => setStatus(key, s)}
                onSkip={() => setSkipping(skipping === key ? null : key)}
                onAskExpert={() => setDialogKey(key)}
                onResolve={(requestId, target) => run({ type: "resolve_help", requestId, target })}
                focus={() => focusField(key)}
              />
            ))}
          </section>

          <div>
            <Button
              type="button"
              variant="outline"
              disabled={source.trim().length < 20 || title.trim().length < 3}
              onClick={() => {
                const proposal = proposeDescription(source, values);
                setGenerated(proposal);
                setDescription(proposal);
                setSummary(proposeSummary(source));
                changed();
                setMessage("Podsumowanie i opis zostały wypełnione. Sprawdź je przed publikacją.");
              }}
            >
              {description.trim() ? "Przygotuj opis ponownie" : "Przygotuj opis z AI"}
            </Button>
            <p className="essential-hint mt-2">
              Wypełnia podsumowanie i opis na podstawie briefu i sekcji „Co kandydat musi wiedzieć”.
              {description.trim() && " Zastąpi obecną treść obu pól."}
            </p>
          </div>
          <Field label="Krótkie podsumowanie">
            <Textarea
              maxLength={12000}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                changed();
              }}
            />
          </Field>
          <Field label="Opis oferty">
            <Textarea
              maxLength={12000}
              value={description}
              aria-describedby={stale ? "description-stale" : undefined}
              onChange={(e) => {
                setDescription(e.target.value);
                changed();
              }}
            />
          </Field>
          {stale && (
            <p id="description-stale" className="essential-status" role="status">
              <Clock aria-hidden="true" className="size-4" /> Opis nie zawiera ostatnich zmian w
              briefie albo w sekcji „Co kandydat musi wiedzieć”. Przygotuj go ponownie albo popraw
              ręcznie.
            </p>
          )}
          <label className="flex items-start gap-3">
            <Checkbox
              checked={approved}
              onCheckedChange={setApproved}
              aria-label="Zatwierdzam treść oferty"
            />
            <span>Zatwierdzam treść oferty do publikacji.</span>
          </label>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <div className="job-editor-actions">
            {canSaveDraft && (
              <Button type="button" variant="outline" onClick={saveDraft}>
                Zapisz szkic
              </Button>
            )}
            <Button type="submit" disabled={!approved}>
              {publishLabel(missing)}
            </Button>
          </div>
          {missing.length > 0 && (
            <p className="essential-hint">
              Kandydat nie dowie się:{" "}
              {missing.map((k) => essentialLabels[k].toLowerCase()).join(", ")}.
            </p>
          )}
        </form>

        <aside
          className="prototype-panel essentials-panel"
          aria-labelledby="essentials-panel-heading"
        >
          <h2 id="essentials-panel-heading">Czego kandydat się jeszcze nie dowie</h2>
          <p className="essential-hint">
            {readyCount} z {essentialKeys.length} gotowe
          </p>
          <ul>
            {essentialKeys.map((key) => {
              const status = statuses[key];
              return (
                <li key={key} data-state={states[key]}>
                  <button type="button" onClick={() => focusField(key)}>
                    <StateIcon state={states[key]} />
                    <span>
                      {essentialLabels[key]}
                      <span className="essential-hint block">
                        {stateText[states[key]]}
                        {states[key] === "skipped" && status?.state === "skipped"
                          ? `: ${skipReasonLabels[status.reason].toLowerCase()}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {askable.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setDialogKey(null)}
            >
              Poproś eksperta o pomoc
            </Button>
          )}
          {requests.length > 0 && (
            <div className="expert-requests">
              <h3>Prośby do ekspertów</h3>
              {requests.map((r) => (
                <RequestStatus key={r.id} request={r} />
              ))}
            </div>
          )}
        </aside>
      </div>
      {dialogKey !== undefined && (
        <HelpRequestDialog
          category={category}
          authorName={person.name}
          title={title}
          askable={askable}
          suggested={suggested}
          preselected={dialogKey}
          onClose={() => setDialogKey(undefined)}
          onSubmit={requestHelp}
        />
      )}
    </>
  );
}

function RequestStatus({ request }: { request: HelpRequest }) {
  const [copied, setCopied] = useState(false);
  const unresolved =
    request.answers.filter((a) => !a.resolution).length +
    request.corrections.filter((c) => !c.resolution).length +
    (request.note && !request.noteResolution ? 1 : 0);
  return (
    <div className="expert-request" data-status={request.status}>
      <p>
        <strong>
          {request.expertName}
          {request.expertRole && ` · ${request.expertRole}`}
        </strong>
        <span className="essential-hint block">
          {request.status === "sent"
            ? `Czekamy na odpowiedź (${request.questions.length} ${request.questions.length === 1 ? "pytanie" : request.questions.length < 5 ? "pytania" : "pytań"})`
            : unresolved > 0
              ? `Odpowiedzi gotowe · do przejrzenia: ${unresolved}`
              : "Odpowiedzi przejrzane"}
        </span>
        {request.status === "sent" && request.channel === "email" && (
          <span className="essential-hint block">
            Do: {request.expertEmail}. Prototyp nie wysyła e-maili, użyj linku.
          </span>
        )}
      </p>
      {request.status === "sent" && (
        <div className="essential-actions">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(expertLink(request.id))
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy aria-hidden="true" /> {copied ? "Skopiowano" : "Kopiuj link"}
          </Button>
          <Link
            to={`/pomoc/${request.id}`}
            target="_blank"
            rel="noopener"
            className="expert-open-link"
          >
            Otwórz widok eksperta <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

type ResolveTarget = Extract<
  Parameters<ReturnType<typeof usePrototype>["run"]>[0],
  { type: "resolve_help" }
>["target"];

function EssentialField({
  essential: key,
  category,
  state,
  status,
  value,
  salaryMin,
  salaryMax,
  skipping,
  requests,
  onValue,
  onSalary,
  onStatus,
  onSkip,
  onAskExpert,
  onResolve,
  focus,
}: {
  essential: EssentialKey;
  category: JobCategory;
  state: EssentialState;
  status: EssentialStatuses[EssentialKey];
  value: string;
  salaryMin: string;
  salaryMax: string;
  skipping: boolean;
  requests: HelpRequest[];
  onValue: (value: string) => void;
  onSalary: (min: string, max: string) => void;
  onStatus: (status: EssentialStatuses[EssentialKey]) => void;
  onSkip: () => void;
  onAskExpert: () => void;
  onResolve: (requestId: string, target: ResolveTarget) => void;
  focus: () => void;
}) {
  const inputId = key === "salary" ? "essential-salary-min" : `essential-${key}`;
  const hintId = `essential-${key}-hint`;
  const pendingFrom = requests.filter((r) => r.status === "sent" && r.questions.includes(key));
  const answers = requests.flatMap((r) =>
    r.answers.filter((a) => a.key === key && !a.resolution).map((a) => ({ request: r, answer: a })),
  );
  const corrections = requests.flatMap((r) =>
    r.corrections
      .filter((c) => c.key === key && !c.resolution)
      .map((c) => ({ request: r, correction: c })),
  );
  const accept = (text: string) => {
    if (key !== "salary") onValue(text);
  };
  return (
    <div className="essential-field" data-state={state}>
      <label htmlFor={inputId} className="essential-label">
        {essentialLabels[key]}
        {key === "salary" && " (PLN brutto / mies.)"}
      </label>
      <p id={hintId} className="essential-hint">
        {essentialPrompt(key, category)}
      </p>
      {key === "salary" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="essential-salary-min"
            name="salaryMin"
            type="number"
            min="0"
            aria-label="Wynagrodzenie od (PLN brutto / mies.)"
            aria-describedby={hintId}
            placeholder="od"
            value={salaryMin}
            onChange={(e) => onSalary(e.target.value, salaryMax)}
          />
          <Input
            name="salaryMax"
            type="number"
            min="0"
            aria-label="Wynagrodzenie do (PLN brutto / mies.)"
            placeholder="do"
            value={salaryMax}
            onChange={(e) => onSalary(salaryMin, e.target.value)}
          />
        </div>
      ) : (
        <Textarea
          id={inputId}
          aria-describedby={hintId}
          className="min-h-20"
          maxLength={4000}
          value={value}
          onChange={(e) => onValue(e.target.value)}
        />
      )}

      {state === "skipped" && status?.state === "skipped" && (
        <>
          <p className="essential-status">
            <CircleMinus aria-hidden="true" className="size-4" /> Pominięte:{" "}
            {skipReasonLabels[status.reason].toLowerCase()}.
            <Button type="button" size="xs" variant="ghost" onClick={() => onStatus(undefined)}>
              Cofnij
            </Button>
          </p>
          {status.reason === "in_brief" && key !== "salary" && (
            <p className="essential-hint">
              Przenieś ten fragment z briefu do pola, żeby kandydat zobaczył go jako osobną sekcję
              oferty.
            </p>
          )}
        </>
      )}
      {state === "pending_expert" && (
        <p className="essential-status">
          <Clock aria-hidden="true" className="size-4" /> Czekamy na odpowiedź:{" "}
          {pendingFrom.map((r) => r.expertName).join(", ")}.
        </p>
      )}
      {(state === "missing" || state === "skipped") && (
        <div className="essential-actions">
          <Button type="button" size="xs" variant="outline" onClick={onAskExpert}>
            Poproś eksperta
          </Button>
          {state === "missing" && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-expanded={skipping}
              onClick={onSkip}
            >
              Pomiń…
            </Button>
          )}
        </div>
      )}
      {skipping && state === "missing" && (
        <fieldset className="skip-reasons">
          <legend>Dlaczego pomijasz?</legend>
          {skipReasons.map((reason: SkipReason) => (
            <label key={reason}>
              <input
                type="radio"
                name={`skip-${key}`}
                onChange={() => onStatus({ state: "skipped", reason })}
              />
              {skipReasonLabels[reason]}
            </label>
          ))}
        </fieldset>
      )}

      {answers.map(({ request, answer }) => (
        <div key={request.id} className="expert-suggestion">
          <p className="expert-suggestion-title">
            <span className="expert-tag">od {request.expertName}</span>
            {answer.mode === "voice" && <span className="essential-hint">nagranie, spisane</span>}
          </p>
          {answer.undecided ? (
            <>
              <p>{firstName(request.expertName)}: to jeszcze nie jest ustalone.</p>
              <div className="essential-actions">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    onStatus({ state: "skipped", reason: "undecided" });
                    onResolve(request.id, { kind: "answer", key, resolution: "accepted" });
                  }}
                >
                  Oznacz jako nieustalone
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    onResolve(request.id, { kind: "answer", key, resolution: "rejected" })
                  }
                >
                  Zamknij
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap">{answer.text}</p>
              <div className="essential-actions">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    accept(answer.text);
                    onResolve(request.id, { kind: "answer", key, resolution: "accepted" });
                    if (key === "salary") focus();
                  }}
                >
                  {key === "salary" ? "Wpiszę kwoty" : "Przyjmij"}
                </Button>
                {key !== "salary" && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      accept(answer.text);
                      onResolve(request.id, { kind: "answer", key, resolution: "edited" });
                      setTimeout(focus);
                    }}
                  >
                    Popraw
                  </Button>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    onResolve(request.id, { kind: "answer", key, resolution: "rejected" })
                  }
                >
                  Odrzuć
                </Button>
              </div>
            </>
          )}
        </div>
      ))}

      {corrections.map(({ request, correction }) => (
        <div key={request.id} className="expert-suggestion">
          <p className="expert-suggestion-title">
            <span className="expert-tag">{request.expertName} poprawia</span>
          </p>
          <p className="essential-hint">Twoja wersja wysłana ekspertowi</p>
          <p className="correction-original">{correction.original}</p>
          <p className="essential-hint">Wersja eksperta</p>
          <p className="whitespace-pre-wrap">{correction.text}</p>
          <div className="essential-actions">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                accept(correction.text);
                onResolve(request.id, {
                  kind: "correction",
                  key: key as TextEssentialKey,
                  resolution: "accepted",
                });
              }}
            >
              Przyjmij poprawkę
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                onResolve(request.id, {
                  kind: "correction",
                  key: key as TextEssentialKey,
                  resolution: "kept",
                })
              }
            >
              Zostaw moją
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                accept(`${value.trim()}\n\n${correction.text}`.trim());
                onResolve(request.id, {
                  kind: "correction",
                  key: key as TextEssentialKey,
                  resolution: "merged",
                });
                setTimeout(focus);
              }}
            >
              Połącz i popraw
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
