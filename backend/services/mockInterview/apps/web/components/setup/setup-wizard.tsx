"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Settings2,
  UploadCloud,
  X,
} from "lucide-react";
import type { Language } from "@deepinterview/shared";
import { PERSONAS } from "@/lib/personas";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { DeviceCheck } from "./device-check";
import { InterviewHistory } from "./interview-history";
import styles from "./setup-wizard.module.css";

interface InterviewSettings {
  company: string;
  primary: Language;
  mixed: boolean;
}

interface SetupWizardProps {
  resume: {
    file: File | null;
    text: string;
    error: string | null;
    onTextChange: (value: string) => void;
    onChoose: () => void;
    onRemove: () => void;
    onDrop: (event: DragEvent) => void;
  };
  job: {
    text: string;
    error: string | null;
    onTextChange: (value: string) => void;
  };
  settings: InterviewSettings;
  languages: readonly Language[];
  onSaveSettings: (value: InterviewSettings) => void;
  personaId: string;
  onPersonaChange: (id: string) => void;
  onSample: (id: "backend" | "frontend" | "ml") => void;
  onSubmit: (event: FormEvent) => void;
  canSubmit: boolean;
  error: string | null;
}

/** KNOWVIA desktop preparation. Form values remain owned by SetupForm. */
export function SetupWizard({
  resume,
  job,
  settings,
  languages,
  onSaveSettings,
  personaId,
  onPersonaChange,
  onSample,
  onSubmit,
  canSubmit,
  error,
}: SetupWizardProps) {
  const messages = useMessages();
  const [step, setStep] = useState(!resume.error && !job.error ? 2 : 0);
  const [dragging, setDragging] = useState(false);
  const [cvTouched, setCvTouched] = useState(false);
  const [jdTouched, setJdTouched] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const sampleRef = useRef<HTMLDetailsElement>(null);
  const labels = [
    t(messages, "setup.wizardCv"),
    t(messages, "setup.wizardJob"),
    t(messages, "setup.wizardTeacher"),
  ];
  const valid = [!resume.error, !job.error];

  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previousStep.current = step;
  }, [step]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!settingsOpen || !dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const viewport = window.matchMedia("(min-width: 1024px)");
    const closeOnMobile = () => {
      if (!viewport.matches) setSettingsOpen(false);
    };
    viewport.addEventListener("change", closeOnMobile);
    return () => {
      viewport.removeEventListener("change", closeOnMobile);
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [settingsOpen]);

  function openSettings() {
    setDraft(settings);
    setSettingsOpen(true);
  }

  function submit(event: FormEvent) {
    if (step < 2) {
      event.preventDefault();
      if (valid[step]) setStep(step + 1);
      return;
    }
    onSubmit(event);
  }

  return (
    <div className={styles.desktop}>
      <form className={styles.workspace} onSubmit={submit}>
        <nav
          className={styles.steps}
          aria-label={t(messages, "setup.wizardTitle")}
        >
          <h1>{t(messages, "setup.wizardTitle")}</h1>
          <ol>
            {labels.map((label, index) => (
              <li key={label} data-current={index === step}>
                <button
                  type="button"
                  aria-current={index === step ? "step" : undefined}
                  disabled={
                    (index >= 1 && !valid[0]) || (index === 2 && !valid[1])
                  }
                  onClick={() => setStep(index)}
                >
                  <span
                    className={styles.stepNumber}
                    data-complete={index < step}
                    aria-hidden="true"
                  >
                    {index < step ? <Check size={17} /> : index + 1}
                  </span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className={styles.panel} aria-labelledby="setup-step-heading">
          <header className={styles.panelHeader}>
            <h2 id="setup-step-heading" ref={headingRef} tabIndex={-1}>
              {labels[step]}
            </h2>
            <div className={styles.headerActions}>
              <InterviewHistory />
              {step === 0 && (
                <details className={styles.samples} ref={sampleRef}>
                  <summary>{t(messages, "setup.demoTitle")}</summary>
                  <div>
                    {(["backend", "frontend", "ml"] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          onSample(id);
                          if (sampleRef.current) sampleRef.current.open = false;
                          setStep(1);
                        }}
                      >
                        {messages.samples[id].label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </header>

          {step === 0 && (
            <div className={styles.resume}>
              <button
                type="button"
                className={styles.dropzone}
                data-dragging={dragging}
                onClick={resume.onChoose}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  setDragging(false);
                  setCvTouched(true);
                  resume.onDrop(event);
                }}
              >
                <UploadCloud size={36} strokeWidth={1.5} aria-hidden="true" />
                <span>{t(messages, "setup.chooseFile")}</span>
                <small>PDF / DOCX · 10 MB</small>
              </button>
              {resume.file && (
                <div className={styles.file}>
                  <FileText size={20} aria-hidden="true" />
                  <span>{resume.file.name}</span>
                  <button
                    type="button"
                    onClick={resume.onRemove}
                    aria-label={t(messages, "setup.removeFile")}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <details className={styles.paste}>
                <summary>{t(messages, "setup.cvPasteLabel")}</summary>
                <label className={styles.srOnly} htmlFor="wizard-cv">
                  {t(messages, "setup.cvLabel")}
                </label>
                <textarea
                  id="wizard-cv"
                  rows={8}
                  value={resume.text}
                  onChange={(event) => resume.onTextChange(event.target.value)}
                  onBlur={() => setCvTouched(true)}
                  aria-invalid={cvTouched && Boolean(resume.error)}
                  aria-describedby={
                    cvTouched && resume.error ? "wizard-cv-error" : undefined
                  }
                />
              </details>
              {(cvTouched || resume.file) && resume.error && (
                <p id="wizard-cv-error" className={styles.error} role="alert">
                  {resume.error}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className={styles.job}>
              <div className={styles.file}>
                <FileText size={20} aria-hidden="true" />
                <span>
                  {resume.file?.name || t(messages, "setup.cvTextReady")}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  aria-label={t(messages, "setup.wizardCv")}
                >
                  <ArrowLeft size={18} />
                </button>
              </div>
              <label htmlFor="wizard-jd">{t(messages, "setup.jdLabel")}</label>
              <textarea
                id="wizard-jd"
                rows={12}
                value={job.text}
                onChange={(event) => job.onTextChange(event.target.value)}
                onBlur={() => setJdTouched(true)}
                aria-invalid={jdTouched && Boolean(job.error)}
                aria-describedby={
                  jdTouched && job.error ? "wizard-jd-error" : undefined
                }
              />
              {jdTouched && job.error && (
                <p id="wizard-jd-error" className={styles.error} role="alert">
                  {job.error}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <fieldset className={styles.teachers}>
              <legend className={styles.srOnly}>{labels[2]}</legend>
              {PERSONAS.map((persona) => (
                <label
                  key={persona.id}
                  className={styles.teacher}
                  data-selected={persona.id === personaId}
                >
                  <input
                    type="radio"
                    name="hr-teacher"
                    value={persona.id}
                    checked={persona.id === personaId}
                    onChange={() => onPersonaChange(persona.id)}
                  />
                  <span className={styles.portrait}>
                    <Image
                      src={persona.portrait_url}
                      alt=""
                      fill
                      sizes="(min-width: 1440px) 260px, 22vw"
                    />
                  </span>
                  <span className={styles.teacherName}>
                    {t(messages, `personas.${persona.id}.name`)}
                  </span>
                  <span className={styles.teacherDescription}>
                    {t(messages, `personas.${persona.id}.style`)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <footer className={styles.actions}>
            {step > 0 ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={17} />
                {t(messages, "setup.previous")}
              </button>
            ) : (
              <span />
            )}
            <div>
              {step === 2 && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={openSettings}
                >
                  <Settings2 size={17} />
                  {t(messages, "nav.setup")}
                </button>
              )}
              {step < 2 ? (
                <button
                  key="next-step"
                  type="button"
                  className={styles.primary}
                  disabled={!valid[step]}
                  onClick={(event) => {
                    event.preventDefault();
                    setStep(step + 1);
                  }}
                >
                  {t(messages, "setup.next")}
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  key="start-interview"
                  type="submit"
                  className={styles.primary}
                  disabled={!canSubmit}
                >
                  {t(messages, "setup.start")}
                </button>
              )}
            </div>
          </footer>
        </section>
      </form>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="interview-settings-title"
        onCancel={() => setSettingsOpen(false)}
        onClose={() => setSettingsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}
      >
        {settingsOpen && (
          <div className={styles.dialogContent}>
            <header>
              <h2 id="interview-settings-title">{t(messages, "nav.setup")}</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label={t(messages, "common.cancel")}
              >
                <X size={20} />
              </button>
            </header>
            <div className={styles.settingsFields}>
              <label>
                {t(messages, "setup.companyLabel")}
                <input
                  value={draft.company}
                  onChange={(event) =>
                    setDraft({ ...draft, company: event.target.value })
                  }
                />
              </label>
              <label>
                {t(messages, "setup.languageLabel")}
                <select
                  value={draft.primary}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      primary: event.target.value as Language,
                    })
                  }
                >
                  {languages.map((language) => (
                    <option key={language} value={language}>
                      {t(messages, `languages.${language}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.mixed}>
              <input
                type="checkbox"
                checked={draft.mixed}
                onChange={(event) =>
                  setDraft({ ...draft, mixed: event.target.checked })
                }
              />
              {t(messages, "setup.languageMixed")}
            </label>
            <section className={styles.device}>
              <h3>{t(messages, "setup.deviceLabel")}</h3>
              <DeviceCheck />
            </section>
            <footer>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setSettingsOpen(false)}
              >
                {t(messages, "common.cancel")}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  onSaveSettings(draft);
                  setSettingsOpen(false);
                }}
              >
                {t(messages, "setup.saveSettings")}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
