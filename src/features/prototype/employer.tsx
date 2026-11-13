import { useState, type FormEvent } from "react";
import { usePostHog } from "@posthog/react";
import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currentPerson, type HelpRequest } from "./model";
import { usePrototype } from "./store";
import { Field } from "./workspace";
import { Empty, PageTitle } from "./shell";
export { EmployerJobEditor } from "./job-editor";

function helpStatus(requests: HelpRequest[]) {
  const waiting = requests.filter((r) => r.status === "sent");
  if (waiting.length) return `czekamy na eksperta: ${waiting.map((r) => r.expertName).join(", ")}`;
  const toReview = requests.some(
    (r) =>
      r.answers.some((a) => !a.resolution) ||
      r.corrections.some((c) => !c.resolution) ||
      (r.note && !r.noteResolution),
  );
  return toReview ? "odpowiedzi eksperta do przejrzenia" : "";
}

export function EmployerJobs() {
  const { state } = usePrototype();
  const person = currentPerson(state)!;
  const jobs = state.jobs.filter((x) => x.companyId === person.companyId);
  return (
    <>
      <PageTitle
        action={
          <Link to="/app/oferty/nowa" className={buttonVariants()}>
            Dodaj ofertę
          </Link>
        }
      >
        Moje oferty
      </PageTitle>
      <div className="space-y-4">
        {jobs.length ? (
          jobs.map((job) => (
            <article key={job.id} className="prototype-panel">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <Link
                    className="text-xl font-semibold text-[var(--gui-link)]"
                    to={`/app/oferty/${job.id}`}
                  >
                    {job.title}
                  </Link>
                  <p className="mt-3 text-muted-foreground">
                    {state.applications.filter((x) => x.jobId === job.id).length} aplikacji ·{" "}
                    {job.publicationStatus === "published" ? "Opublikowana" : "Szkic"}
                    {(() => {
                      const status = helpStatus(
                        state.helpRequests.filter((r) => r.jobId === job.id),
                      );
                      return status ? ` · ${status}` : "";
                    })()}
                  </p>
                </div>
                {job.publicationStatus === "published" ? (
                  <Link
                    to={`/oferty/${job.slug}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Zobacz ofertę
                  </Link>
                ) : (
                  <Link
                    to={`/app/oferty/${job.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Dokończ szkic
                  </Link>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty>Nie masz jeszcze ofert. Dodaj pierwszą ofertę.</Empty>
        )}
      </div>
    </>
  );
}
export function CompanyEditor() {
  const { state, run } = usePrototype();
  const posthog = usePostHog();
  const person = currentPerson(state)!;
  const company = state.companies.find((x) => x.id === person.companyId)!;
  const [message, setMessage] = useState("");
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (
      run({
        type: "company",
        name: String(data.get("name")),
        description: String(data.get("description")),
      })
    ) {
      posthog.capture("company_profile_saved");
      setMessage("Dane firmy zostały zapisane.");
    }
  }
  return (
    <>
      <PageTitle>Twoja organizacja</PageTitle>
      <form className="prototype-panel prototype-form" onSubmit={save}>
        <Field label="Nazwa firmy">
          <Input name="name" required maxLength={200} defaultValue={company.name} />
        </Field>
        <Field label="Opis firmy">
          <Textarea name="description" maxLength={12000} defaultValue={company.description} />
        </Field>
        <Button type="submit">Zapisz dane firmy</Button>
        {message && <p role="status">{message}</p>}
        <Link className="text-[var(--gui-link)]" to={`/firmy/${company.slug}`}>
          Zobacz profil firmy
        </Link>
      </form>
    </>
  );
}
