"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import {
  addLink,
  createFolder,
  deleteFile,
  deleteFolder,
  finishUpload,
  startUpload,
  updateFile,
  updateFolder,
} from "@/modules/song-bank";
import { isFeatureEnabled } from "@/shared/config/features";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

async function songBankUser() {
  const user = await requirePermission("songbank:read");
  if (!isFeatureEnabled("songBank")) notFound();
  return user;
}

/** Every song bank page (folders show counts of what's inside them). */
function refresh(): void {
  revalidatePath("/song-bank", "layout");
}

export async function createFolderAction(
  parentId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await songBankUser();
  const values = formValues(formData);
  const result = await createFolder({ name: values.name ?? "", parentId }, user);
  if (result.ok) refresh();
  return toActionState(result, `Folder “${values.name?.trim()}” added`, result.ok ? undefined : values);
}

export async function updateFolderAction(
  folderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await songBankUser();
  const values = formValues(formData);
  const result = await updateFolder(folderId, { name: values.name ?? "", parentId: values.parentId ?? "" }, user);
  if (result.ok) refresh();
  return toActionState(result, "Folder saved", result.ok ? undefined : values);
}

export async function deleteFolderAction(folderId: string, _prev: ActionState): Promise<ActionState> {
  const user = await songBankUser();
  const result = await deleteFolder(folderId, user);
  if (!result.ok) return toActionState(result, "");
  refresh();
  redirect(result.value.parentId ? `/song-bank/${result.value.parentId}` : "/song-bank");
}

export type StartUploadResult =
  { ok: true; uploadUrl: string; ticket: string; contentType: string } | { ok: false; error: string };

/** Step 1 of an upload: a signed link the browser sends the file to. */
export async function startUploadAction(input: {
  folderId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<StartUploadResult> {
  const user = await songBankUser();
  const result = await startUpload(input, user);
  return result.ok ? { ok: true, ...result.value } : { ok: false, error: result.error.message };
}

/** Step 2: the file is uploaded, add it to the folder. */
export async function finishUploadAction(input: {
  ticket: string;
  title: string;
  voicePart: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await songBankUser();
  const result = await finishUpload(input, user);
  if (!result.ok) {
    const fieldMessage = Object.values(result.error.fieldErrors ?? {})[0]?.[0];
    return { ok: false, error: fieldMessage ?? result.error.message };
  }
  refresh();
  return { ok: true };
}

export async function addLinkAction(folderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await songBankUser();
  const values = formValues(formData);
  const result = await addLink(
    { folderId, title: values.title ?? "", url: values.url ?? "", voicePart: values.voicePart ?? "" },
    user,
  );
  if (result.ok) refresh();
  return toActionState(result, "Link added", result.ok ? undefined : values);
}

export async function updateFileAction(fileId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await songBankUser();
  const values = formValues(formData);
  const result = await updateFile(
    fileId,
    {
      title: values.title ?? "",
      voicePart: values.voicePart ?? "",
      folderId: values.folderId ?? "",
      url: values.url,
    },
    user,
  );
  if (result.ok) refresh();
  return toActionState(result, "Saved", result.ok ? undefined : values);
}

/** Deletes a file. From the file's own page, goes back to its folder. */
export async function deleteFileAction(
  fileId: string,
  backToFolder: boolean,
  _prev: ActionState,
): Promise<ActionState> {
  const user = await songBankUser();
  const result = await deleteFile(fileId, user);
  if (!result.ok) return toActionState(result, "");
  refresh();
  if (backToFolder) redirect(`/song-bank/${result.value.folderId}`);
  return toActionState(result, "Deleted");
}
