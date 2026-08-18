"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Check, X, Clock, CalendarClock } from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect, FloatTextarea } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import {
  createScheduleRequest,
  approveScheduleRequest,
  rejectScheduleRequest,
} from "@/lib/actions/schedule-requests";

export type Option = { id: string; name: string };

export type CourseOption = {
  id: string;
  label: string;
};

export type RequestRow = {
  id: string;
  kind: "create" | "update" | "delete";
  course_id: string | null;
  class_id: string | null;
  subject_id: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  requested_by: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function RequestsView({
  requests,
  courseOptions,
  classOptions,
  subjectOptions,
  requesters = {},
  isAdmin,
}: {
  requests: RequestRow[];
  courseOptions: CourseOption[];
  classOptions: Option[];
  subjectOptions: Option[];
  // id du demandeur -> nom, pour l'affichage côté administration
  requesters?: Record<string, string>;
  isAdmin: boolean;
}) {
  const t = useTranslations("schedule");
  const tcr = useTranslations("courses");
  const tc = useTranslations("common");
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"create" | "update" | "delete">("update");
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RequestRow | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [pending, startTransition] = useTransition();
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;

  const label = (code: string) => (code.startsWith("ERR_") ? t(code) : code);
  const name = (list: Option[], id: string | null) =>
    list.find((o) => o.id === id)?.name ?? null;

  // Résumé lisible de ce qui est demandé.
  function summary(r: RequestRow) {
    const parts: string[] = [];
    if (r.kind === "create") {
      parts.push(name(classOptions, r.class_id) ?? "—");
      parts.push(name(subjectOptions, r.subject_id) ?? "—");
    }
    if (r.day_of_week !== null) parts.push(tcr(`day${r.day_of_week}`));
    if (r.start_time || r.end_time)
      parts.push(`${r.start_time?.slice(0, 5) ?? "…"} – ${r.end_time?.slice(0, 5) ?? "…"}`);
    if (r.room) parts.push(`${tcr("room")} ${r.room}`);
    return parts.length > 0 ? parts.join(" · ") : t("noChange");
  }

  function courseLabel(id: string | null) {
    return courseOptions.find((c) => c.id === id)?.label ?? "—";
  }

  function handleCreate(formData: FormData) {
    setBusy("create");
    startTransition(async () => {
      const res = await createScheduleRequest(formData);
      if (res.error) {
        setError(res.error);
      } else {
        setShowForm(false);
        setError(null);
        router.refresh();
      }
    });
  }

  function handleApprove(r: RequestRow) {
    setBusy("approve-" + r.id);
    startTransition(async () => {
      const res = await approveScheduleRequest(r.id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleReject() {
    setBusy("reject");
    if (!rejecting) return;
    const id = rejecting.id;
    startTransition(async () => {
      const res = await rejectScheduleRequest(id, adminNote);
      if (res.error) {
        setError(res.error);
      } else {
        setRejecting(null);
        setAdminNote("");
        router.refresh();
      }
    });
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {t("title")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({pendingCount})
          </span>
        </h1>
        {!isAdmin && (
          <button
            onClick={() => {
              setError(null);
              setKind("update");
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        )}
      </div>

      <p className="mb-4 flex items-start gap-2 text-sm text-slate-500">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
        {isAdmin ? t("hintAdmin") : t("hintTeacher")}
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{label(error)}</p>}

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                >
                  {t(`status_${r.status}`)}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {t(`kind_${r.kind}`)}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {r.created_at.slice(0, 10)}
                </span>
                {isAdmin && requesters[r.requested_by] && (
                  <span className="text-xs text-slate-500">
                    — {requesters[r.requested_by]}
                  </span>
                )}
              </div>

              {r.kind !== "create" && (
                <div className="text-sm font-medium">
                  {courseLabel(r.course_id)}
                </div>
              )}
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {summary(r)}
              </div>
              {r.note && (
                <p className="mt-1 text-sm text-slate-500">« {r.note} »</p>
              )}
              {r.admin_note && (
                <p className="mt-1 text-sm text-red-600">
                  {t("adminNote")} : {r.admin_note}
                </p>
              )}

              {isAdmin && r.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleApprove(r)}
                    disabled={pending}
                    className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BusyLabel loading={waiting("approve-" + r.id)} size="sm">
                      <Check className="h-4 w-4" />
                      {t("approve")}
                    </BusyLabel>
                  </button>
                  <button
                    onClick={() => {
                      setAdminNote("");
                      setRejecting(r);
                    }}
                    disabled={pending}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                    {t("reject")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={t("add")} onClose={() => setShowForm(false)}>
          <form action={handleCreate} className="space-y-3">
            <FloatSelect
              label={t("kind")}
              name="kind"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "create" | "update" | "delete")
              }
            >
              <option value="update">{t("kind_update")}</option>
              <option value="create">{t("kind_create")}</option>
              <option value="delete">{t("kind_delete")}</option>
            </FloatSelect>

            {kind !== "create" ? (
              <FloatSelect label={t("course")} name="course_id" required>
                <option value=""></option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </FloatSelect>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatSelect label={tcr("class")} name="class_id" required>
                  <option value=""></option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FloatSelect>
                <FloatSelect label={tcr("subject")} name="subject_id" required>
                  <option value=""></option>
                  {subjectOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </FloatSelect>
              </div>
            )}

            {kind !== "delete" && (
              <>
                <FloatSelect label={tcr("day")} name="day_of_week">
                  <option value=""></option>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {tcr(`day${d}`)}
                    </option>
                  ))}
                </FloatSelect>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FloatInput
                    label={tcr("startTime")}
                    type="time"
                    name="start_time"
                  />
                  <FloatInput label={tcr("endTime")} type="time" name="end_time" />
                  <FloatInput label={tcr("room")} name="room" />
                </div>
              </>
            )}

            <FloatTextarea label={t("note")} name="note" rows={2} />

            <p className="text-xs text-slate-500">{t("formHint")}</p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("create")}>{t("submit")}</BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rejecting && (
        <Modal title={t("reject")} onClose={() => setRejecting(null)}>
          <div className="space-y-3">
            <FloatTextarea
              label={t("adminNote")}
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("reject")}>{t("reject")}</BusyLabel>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
