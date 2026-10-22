"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileAudio, FileText, Upload, X } from "lucide-react";
import {
  formatBytes,
  guessPartFromName,
  MAX_UPLOAD_BYTES,
  mayNotPlayOnIphone,
  partLabel,
  SONG_PARTS,
  titleFromFileName,
  UPLOAD_ACCEPT,
  uploadTypeOf,
} from "@/modules/song-bank/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { cn } from "@/shared/lib/cn";
import {
  ActionFeedback,
  CancelButton,
  ConfirmSubmit,
  SubmitButton,
  useConfirm,
  useFormDialog,
} from "@/shared/ui/client";
import { Button } from "@/shared/ui/button";
import { Field, Input, Select } from "@/shared/ui/form";
import { Alert } from "@/shared/ui/layout";
import {
  addLinkAction,
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  finishUploadAction,
  startUploadAction,
  updateFileAction,
  updateFolderAction,
} from "./actions";

export interface FolderOption {
  id: string;
  label: string;
}

type CountedState = ActionState & { submissions?: number };

/** useActionState that counts submissions, so a form can be rebuilt (fresh or with echoed values) after each one. */
function useCountedAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  return useActionState(
    async (prev: CountedState, formData: FormData): Promise<CountedState> => ({
      ...(await action(prev, formData)),
      submissions: (prev.submissions ?? 0) + 1,
    }),
    idleState as CountedState,
  );
}

function PartSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <Select id={id} name="voicePart" defaultValue={defaultValue}>
      <option value="">All parts (full track or score)</option>
      {SONG_PARTS.map((part) => (
        <option key={part} value={part}>
          {partLabel(part)}
        </option>
      ))}
    </Select>
  );
}

// ─── Folders ────────────────────────────────────────────────────────────────

export function NewFolderForm({ parentId }: { parentId: string | null }) {
  const [state, formAction] = useCountedAction(createFolderAction.bind(null, parentId));
  const values = state.values;
  return (
    <form action={formAction} className="space-y-3" key={`${state.submissions ?? 0}-${values?.name ?? ""}`}>
      <ActionFeedback state={state} />
      <Field
        label="Folder name"
        htmlFor="new-folder-name"
        errors={state.fieldErrors?.name}
        hint={parentId ? "E.g. the song's name." : "E.g. a year (2026) or a concert."}
      >
        <Input id="new-folder-name" name="name" defaultValue={values?.name ?? ""} required maxLength={80} autoFocus />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          pendingText="Adding…"
          confirm={{
            title: (data) => `Add the folder “${String(data.get("name") ?? "").trim()}”?`,
            description: "Everyone in the choir can see it.",
            confirmLabel: "Add folder",
          }}
        >
          Add folder
        </SubmitButton>
        <CancelButton />
      </div>
    </form>
  );
}

export function EditFolderForm({
  folder,
  folderOptions,
}: {
  folder: { id: string; name: string; parentId: string | null };
  /** Folders it can move into (not itself or its own subfolders). */
  folderOptions: FolderOption[];
}) {
  const [state, formAction] = useCountedAction(updateFolderAction.bind(null, folder.id));
  const values = state.values;
  return (
    <form action={formAction} className="space-y-3" key={`${state.submissions ?? 0}-${JSON.stringify(values ?? {})}`}>
      <ActionFeedback state={state} />
      <Field label="Folder name" htmlFor={`folder-${folder.id}-name`} errors={state.fieldErrors?.name}>
        <Input
          id={`folder-${folder.id}-name`}
          name="name"
          defaultValue={values?.name ?? folder.name}
          required
          maxLength={80}
        />
      </Field>
      <Field label="Inside" htmlFor={`folder-${folder.id}-parent`} errors={state.fieldErrors?.parentId}>
        <Select
          id={`folder-${folder.id}-parent`}
          name="parentId"
          defaultValue={values?.parentId ?? folder.parentId ?? ""}
        >
          <option value="">Song bank (top level)</option>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          confirm={{
            title: (data) => `Save the folder “${String(data.get("name") ?? "").trim()}”?`,
            description: "Everything inside it moves with it.",
            confirmLabel: "Save folder",
          }}
        >
          Save folder
        </SubmitButton>
        <CancelButton />
      </div>
    </form>
  );
}

export function DeleteFolderForm({
  folder,
  contents,
}: {
  folder: { id: string; name: string };
  /** "3 folders and 12 files", or null when empty. */
  contents: string | null;
}) {
  const [state, formAction] = useActionState(deleteFolderAction.bind(null, folder.id), idleState);
  return (
    <form action={formAction} className="space-y-2">
      <ActionFeedback state={state} />
      <ConfirmSubmit
        variant="ghost"
        size="sm"
        className="text-red-700 hover:bg-red-50"
        confirm={{
          title: `Delete the folder “${folder.name}”?`,
          description: contents
            ? `Everything in it goes too: ${contents}. This can't be undone.`
            : "It's empty. This can't be undone.",
          confirmLabel: "Delete folder",
        }}
      >
        Delete folder
      </ConfirmSubmit>
    </form>
  );
}

// ─── Files ──────────────────────────────────────────────────────────────────

export function LinkForm({ folderId }: { folderId: string }) {
  const [state, formAction] = useCountedAction(addLinkAction.bind(null, folderId));
  const values = state.values;
  return (
    <form action={formAction} className="space-y-3" key={`${state.submissions ?? 0}-${JSON.stringify(values ?? {})}`}>
      <ActionFeedback state={state} />
      <Field
        label="Link"
        htmlFor="link-url"
        errors={state.fieldErrors?.url}
        hint="E.g. a Google Drive file shared with “Anyone with the link”, or a YouTube video."
      >
        <Input
          id="link-url"
          name="url"
          type="url"
          defaultValue={values?.url ?? ""}
          placeholder="https://drive.google.com/…"
          required
        />
      </Field>
      <Field label="Title" htmlFor="link-title" errors={state.fieldErrors?.title}>
        <Input id="link-title" name="title" defaultValue={values?.title ?? ""} required maxLength={120} />
      </Field>
      <Field label="Part" htmlFor="link-part">
        <PartSelect id="link-part" defaultValue={values?.voicePart ?? ""} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          pendingText="Adding…"
          confirm={{
            title: (data) => `Add “${String(data.get("title") ?? "").trim()}”?`,
            description: "Check the link is shared so choir members can open it.",
            confirmLabel: "Add link",
          }}
        >
          Add link
        </SubmitButton>
        <CancelButton />
      </div>
    </form>
  );
}

export function EditFileForm({
  file,
  folderOptions,
}: {
  file: { id: string; kind: string; title: string; voicePart: string | null; folderId: string; linkUrl: string | null };
  folderOptions: FolderOption[];
}) {
  const [state, formAction] = useCountedAction(updateFileAction.bind(null, file.id));
  const values = state.values;
  const prefix = `file-${file.id}`;
  return (
    <form action={formAction} className="space-y-3" key={`${state.submissions ?? 0}-${JSON.stringify(values ?? {})}`}>
      <ActionFeedback state={state} />
      <Field label="Title" htmlFor={`${prefix}-title`} errors={state.fieldErrors?.title}>
        <Input
          id={`${prefix}-title`}
          name="title"
          defaultValue={values?.title ?? file.title}
          required
          maxLength={120}
        />
      </Field>
      {file.kind === "LINK" ? (
        <Field label="Link" htmlFor={`${prefix}-url`} errors={state.fieldErrors?.url}>
          <Input id={`${prefix}-url`} name="url" type="url" defaultValue={values?.url ?? file.linkUrl ?? ""} required />
        </Field>
      ) : null}
      <Field label="Part" htmlFor={`${prefix}-part`}>
        <PartSelect id={`${prefix}-part`} defaultValue={values?.voicePart ?? file.voicePart ?? ""} />
      </Field>
      <Field label="Folder" htmlFor={`${prefix}-folder`} errors={state.fieldErrors?.folderId}>
        <Select id={`${prefix}-folder`} name="folderId" defaultValue={values?.folderId ?? file.folderId}>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          confirm={{
            title: (data) => `Save “${String(data.get("title") ?? "").trim()}”?`,
            confirmLabel: "Save",
          }}
        >
          Save
        </SubmitButton>
        <CancelButton />
      </div>
    </form>
  );
}

export function DeleteFileForm({
  file,
  backToFolder = false,
  compact = false,
}: {
  file: { id: string; title: string; kind: string };
  backToFolder?: boolean;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(deleteFileAction.bind(null, file.id, backToFolder), idleState);
  return (
    <form action={formAction}>
      <ActionFeedback state={state} inline={!compact} />
      <ConfirmSubmit
        variant="ghost"
        size="sm"
        className="text-red-700 hover:bg-red-50"
        confirm={{
          title: `Delete “${file.title}”?`,
          description:
            file.kind === "LINK"
              ? "The link is removed from the song bank (the file it points to isn't touched)."
              : "The file is deleted for everyone. This can't be undone.",
          confirmLabel: "Delete",
        }}
      >
        Delete
      </ConfirmSubmit>
    </form>
  );
}

// ─── Uploads ────────────────────────────────────────────────────────────────

interface PendingUpload {
  key: string;
  file: File;
  title: string;
  voicePart: string;
  /** null = waiting; 0–100 while uploading. */
  progress: number | null;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
}

/** PUTs the file to the signed link, reporting progress (fetch can't report upload progress). */
function putFile(url: string, file: File, contentType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${request.status})`));
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.send(file);
  });
}

/**
 * Upload several recordings and PDFs at once. Each gets a title from its file
 * name and, when the name says so ("… - Alto.m4a"), its part; both can be changed
 * before uploading. Files go straight from the browser to storage.
 */
export function UploadForm({ folderId, myPart }: { folderId: string; myPart: string | null }) {
  const router = useRouter();
  const dialog = useFormDialog();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingUpload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const problems: string[] = [];
    const added: PendingUpload[] = [];
    for (const file of Array.from(files)) {
      const type = uploadTypeOf(file.name);
      if (!type) problems.push(`${file.name}: not an audio file or PDF`);
      else if (file.size > MAX_UPLOAD_BYTES[type.kind]) {
        problems.push(`${file.name}: too big (limit ${formatBytes(MAX_UPLOAD_BYTES[type.kind])})`);
      } else {
        added.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          title: titleFromFileName(file.name),
          voicePart: guessPartFromName(file.name) ?? (type.kind === "AUDIO" && myPart ? myPart : ""),
          progress: null,
          status: "ready",
        });
      }
    }
    setRejected(problems);
    setItems((current) => [...current, ...added]);
    if (input.current) input.current.value = "";
  }

  const update = (key: string, change: Partial<PendingUpload>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  async function uploadAll() {
    const count = items.filter((item) => item.status !== "done").length;
    const ok = await confirm({
      title: count === 1 ? "Upload 1 file?" : `Upload ${count} files?`,
      description: "Everyone in the choir can listen to and download them.",
      confirmLabel: "Upload",
    });
    if (!ok) return;
    setBusy(true);
    let uploaded = 0;
    let failed = 0;
    for (const item of items) {
      if (item.status === "done") continue;
      if (!item.title.trim()) {
        update(item.key, { status: "error", error: "Give it a title" });
        failed += 1;
        continue;
      }
      update(item.key, { status: "uploading", progress: 0, error: undefined });
      try {
        const started = await startUploadAction({ folderId, fileName: item.file.name, sizeBytes: item.file.size });
        if (!started.ok) throw new Error(started.error);
        await putFile(started.uploadUrl, item.file, started.contentType, (progress) => update(item.key, { progress }));
        const finished = await finishUploadAction({
          ticket: started.ticket,
          title: item.title,
          voicePart: item.voicePart,
        });
        if (!finished.ok) throw new Error(finished.error);
        update(item.key, { status: "done", progress: 100 });
        uploaded += 1;
      } catch (error) {
        failed += 1;
        update(item.key, {
          status: "error",
          progress: null,
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }
    setBusy(false);
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "1 file uploaded" : `${uploaded} files uploaded`);
      router.refresh();
    }
    if (failed === 0) {
      // Everything went up: clear the list and close the dialog.
      setItems([]);
      dialog?.close();
    } else {
      // Keep the ones that failed on screen to fix and try again.
      setItems((current) => current.filter((item) => item.status !== "done"));
    }
  }

  const waiting = items.filter((item) => item.status !== "done").length;

  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-brand-400 hover:bg-brand-50/50",
          busy && "pointer-events-none opacity-50",
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="size-6 text-brand-600" aria-hidden="true" />
        <span className="font-semibold text-ink">Choose recordings or PDFs</span>
        <span className="text-xs text-slate-500">
          MP3, M4A, WAV, OGG/Opus (up to {formatBytes(MAX_UPLOAD_BYTES.AUDIO)}) · PDF (up to{" "}
          {formatBytes(MAX_UPLOAD_BYTES.PDF)})
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          onChange={(event) => addFiles(event.target.files)}
        />
      </label>

      {rejected.length > 0 ? <Alert tone="warning">{rejected.join("\n")}</Alert> : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const type = uploadTypeOf(item.file.name);
            const Icon = type?.kind === "PDF" ? FileText : FileAudio;
            const locked = busy || item.status === "done";
            return (
              <li key={item.key} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-start gap-2">
                  <Icon className="mt-2 size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-xs text-slate-500">
                      {item.file.name} · {formatBytes(item.file.size)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                      <Input
                        aria-label={`Title for ${item.file.name}`}
                        value={item.title}
                        maxLength={120}
                        onChange={(event) => update(item.key, { title: event.target.value })}
                        disabled={locked}
                      />
                      <Select
                        aria-label={`Part for ${item.file.name}`}
                        value={item.voicePart}
                        onChange={(event) => update(item.key, { voicePart: event.target.value })}
                        disabled={locked}
                      >
                        <option value="">All parts</option>
                        {SONG_PARTS.map((part) => (
                          <option key={part} value={part}>
                            {partLabel(part)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {type && mayNotPlayOnIphone(type.contentType) && item.status !== "done" ? (
                      <p className="text-xs text-amber-700">
                        Some iPhones can&apos;t play .{item.file.name.split(".").pop()} files in the browser. If you
                        can, share an M4A or MP3 instead.
                      </p>
                    ) : null}
                    {item.status === "uploading" ? (
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-valuenow={item.progress ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Uploading ${item.file.name}`}
                      >
                        <div
                          className="h-full bg-brand-600 transition-[width]"
                          style={{ width: `${item.progress ?? 0}%` }}
                        />
                      </div>
                    ) : null}
                    {item.status === "done" ? <p className="text-xs font-semibold text-emerald-700">Uploaded</p> : null}
                    {item.status === "error" ? (
                      <p className="text-xs font-medium text-red-700" role="alert">
                        {item.error}
                      </p>
                    ) : null}
                  </div>
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {confirmDialog}
        <Button onClick={uploadAll} disabled={busy || waiting === 0} aria-busy={busy}>
          {busy ? "Uploading…" : waiting > 1 ? `Upload ${waiting} files` : "Upload"}
        </Button>
        <CancelButton />
      </div>
    </div>
  );
}
