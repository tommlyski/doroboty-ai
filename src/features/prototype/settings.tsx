import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { usePrototype } from "./store";
import { serializeState, MAX_IMPORT_BYTES } from "./storage";
import { PageTitle } from "./shell";

export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SettingsPage() {
  const { state, reset, importState, original } = usePrototype();
  const [pending, setPending] = useState<"reset" | "import" | null>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Plik jest za duży (maksymalnie 2 MB).");
      return;
    }
    try {
      setRaw(await file.text());
      setPending("import");
    } catch {
      setError("Nie udało się odczytać pliku.");
    }
  }
  function confirm() {
    if (pending === "reset") {
      reset();
      setMessage("Przywrócono scenariusz początkowy.");
    } else if (importState(raw)) {
      setMessage("Dane zostały zaimportowane.");
    }
    setPending(null);
  }
  return (
    <>
      <PageTitle>Ustawienia prototypu</PageTitle>
      <section className="prototype-panel prototype-form">
        <h2>Dane scenariusza</h2>
        <p>
          Zmiany są zapisane tylko w tej przeglądarce. Wysłanie linku innej osobie nie przenosi
          Twoich danych. Eksport pozwala przekazać scenariusz lub zachować kopię przed resetem.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => downloadText("doroboty-scenariusz.json", serializeState(state))}
          >
            Eksportuj dane
          </Button>
          <Button variant="outline" render={<label />}>
            Importuj dane
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="Importuj plik scenariusza"
              onChange={readFile}
            />
          </Button>
          {original !== null && (
            <Button
              variant="outline"
              onClick={() =>
                downloadText("doroboty-zapis-do-odzyskania.txt", original, "text/plain")
              }
            >
              Pobierz poprzedni zapis
            </Button>
          )}
        </div>
        <Button variant="destructive" onClick={() => setPending("reset")}>
          Resetuj scenariusz
        </Button>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <section className="prototype-panel prototype-form mt-6">
        <h2>O prototypie</h2>
        <p>
          Wybór osoby zastępuje logowanie. Propozycje AI, Match Score i podsumowania odtwarzają
          przygotowany scenariusz; nie oceniają kompetencji. Używaj przykładowych danych i CV.
        </p>
      </section>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
        title={pending === "reset" ? "Zresetować scenariusz?" : "Zastąpić dane scenariusza?"}
        description="Ta operacja zastąpi lokalne zmiany. Możesz najpierw wyeksportować dane."
        label={pending === "reset" ? "Resetuj" : "Importuj"}
        pending={false}
        onConfirm={confirm}
      />
    </>
  );
}
export function PrivacyPage() {
  return (
    <section className="prototype-section max-w-4xl">
      <h1>Prywatność prototypu</h1>
      <div className="mt-6 space-y-5">
        <p>
          Ta wersja służy do ćwiczeń i testów interfejsu. Nie wpisuj prawdziwych danych osobowych
          ani poufnych informacji.
        </p>
        <p>
          Profile, aplikacje i ustawienia pozostają w pamięci tej przeglądarki. Aplikacja nie wysyła
          ich do bazy ani dostawcy AI. Plik eksportu zawiera cały lokalny scenariusz, w tym notatki.
        </p>
        <p>
          Opublikowana wersja korzysta z analityki PostHog (serwery w USA), żeby sprawdzić, jak
          używane są ekrany. Zapisuje adresy odwiedzanych ekranów (w tym wyszukiwane frazy i filtry
          ofert), kliknięcia oraz zdarzenia, np. zapisanie oferty czy wysłanie aplikacji, z
          kategorią oferty i wybraną rolą. Nie wysyła treści formularzy, CV ani notatek, nie nagrywa
          sesji i nie zapisuje w przeglądarce plików cookie ani identyfikatora.
        </p>
        <p>
          Możesz usunąć zmiany przyciskiem „Resetuj scenariusz” w ustawieniach lub wyczyścić dane
          witryny w przeglądarce. Hosting może prowadzić własne logi dostępu.
        </p>
      </div>
    </section>
  );
}
