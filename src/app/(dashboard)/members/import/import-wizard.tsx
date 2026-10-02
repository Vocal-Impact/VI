"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Papa from "papaparse";
import type { FieldChange, PreviewItem, RowIssue } from "@/modules/imports";
import { Button, LinkButton } from "@/shared/ui/button";
import { SubmitButton } from "@/shared/ui/client";
import { Field, Input, Select } from "@/shared/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/shared/ui/layout";
import { importAction, type ImportActionState } from "../actions";

const PROFILES = {
  REGISTRATION: {
    label: "Registration form (new members)",
    hint: "Columns: First Name, Last Name, IIT Student ID, Current Year of Study, WhatsApp Number, IIT Email Address, What is your voice type?",
  },
  SUPPLEMENTARY_DETAILS: {
    label: "Details form (birthday & carpool)",
    hint: "Columns: IIT Student ID, Date of Birth, Which area do you live in?, Can we use your approximate location for carpooling?, Can you drive to practices?, How many passengers can you take?",
  },
} as const;

const initial: ImportActionState = { status: "idle" };

export function ImportWizard() {
  const [state, formAction] = useActionState(importAction, initial);
  const [profile, setProfile] = useState<keyof typeof PROFILES>(state.profile ?? "REGISTRATION");

  if (state.status === "done" && state.summary) {
    return (
      <Alert tone="success" title="Import complete">
        {state.summary.created} new, {state.summary.updated} updated, {state.summary.unchanged} unchanged,{" "}
        {state.summary.skipped} skipped.
        <div className="mt-3 flex gap-2">
          <LinkButton href="/members" size="sm">
            View members
          </LinkButton>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Import another file
          </Button>
        </div>
      </Alert>
    );
  }

  if (state.status === "preview" && state.preview) {
    const { preview } = state.preview;
    const canCommit = preview.missingColumns.length === 0 && preview.created.length + preview.updated.length > 0;
    return (
      <div className="space-y-4">
        {preview.missingColumns.length > 0 ? (
          <Alert tone="error" title="This file doesn't look like the right form">
            Missing column(s): {preview.missingColumns.join(", ")}. Check you picked the right import type.
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="green">{preview.created.length} new</Badge>
          <Badge tone="blue">{preview.updated.length} updated</Badge>
          <Badge>{preview.unchanged.length} unchanged</Badge>
          <Badge tone="red">{preview.invalid.length} invalid</Badge>
          <Badge tone="amber">{preview.duplicates.length} duplicate submissions</Badge>
          <span className="text-slate-500">
            from {preview.totalRows} rows in {state.fileName}
          </span>
        </div>

        {preview.created.length > 0 ? (
          <PreviewTable title="New members" items={preview.created as PreviewItem<unknown>[]} kind="new" />
        ) : null}
        {preview.updated.length > 0 ? (
          <PreviewTable title="Updates" items={preview.updated as PreviewItem<unknown>[]} kind="update" />
        ) : null}
        {preview.invalid.length > 0 ? (
          <IssueList title="Invalid rows (will be skipped)" issues={preview.invalid} download />
        ) : null}
        {preview.duplicates.length > 0 ? (
          <IssueList title="Duplicate submissions (older ones skipped)" issues={preview.duplicates} />
        ) : null}

        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="step" value="commit" />
          <input type="hidden" name="profile" value={state.profile} />
          <input type="hidden" name="fileName" value={state.fileName} />
          <input type="hidden" name="csvText" value={state.csvText} />
          <SubmitButton disabled={!canCommit} pendingText="Importing…">
            Import {preview.created.length + preview.updated.length} row(s)
          </SubmitButton>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Cancel
          </Button>
        </form>
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        <form action={formAction} className="space-y-4">
          {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
          <input type="hidden" name="step" value="preview" />
          <Field label="What are you importing?" htmlFor="profile" hint={PROFILES[profile].hint}>
            <Select
              id="profile"
              name="profile"
              value={profile}
              onChange={(event) => setProfile(event.target.value as keyof typeof PROFILES)}
            >
              {Object.entries(PROFILES).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CSV file" htmlFor="file" hint="Max 1 MB">
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required className="py-1.5" />
          </Field>
          <SubmitButton pendingText="Checking…">Preview import</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}

function PreviewTable<T>({ title, items, kind }: { title: string; items: PreviewItem<T>[]; kind: "new" | "update" }) {
  return (
    <Card>
      <CardHeader title={`${title} (${items.length})`} />
      <Table>
        <thead>
          <tr>
            <Th>Line</Th>
            <Th>Name</Th>
            <Th>Student ID</Th>
            <Th>{kind === "new" ? "" : "Changes"}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.row}-${item.studentId}`}>
              <Td className="text-slate-500 tabular-nums">{item.row}</Td>
              <Td>
                {item.memberId ? (
                  <Link href={`/members/${item.memberId}`} className="hover:underline" target="_blank">
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </Td>
              <Td className="font-mono text-xs">{item.studentId}</Td>
              <Td>{kind === "update" ? <Changes changes={item.changes} /> : null}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Changes({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {changes.map((change) => (
        <li key={change.field}>
          <span className="font-medium">{change.field}:</span>{" "}
          <span className="text-red-700 line-through">{change.from || "—"}</span> →{" "}
          <span className="text-emerald-700">{change.to || "—"}</span>
        </li>
      ))}
    </ul>
  );
}

function IssueList({ title, issues, download = false }: { title: string; issues: RowIssue[]; download?: boolean }) {
  function downloadCsv() {
    const csv = Papa.unparse(
      issues.map((issue) => ({
        Line: issue.row,
        "Student ID": issue.studentId ?? "",
        Problems: issue.messages.join("; "),
      })),
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "rows-to-fix.csv" });
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Card>
      <CardHeader
        title={`${title} (${issues.length})`}
        action={
          download ? (
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              Download as CSV
            </Button>
          ) : null
        }
      />
      <CardBody>
        <ul className="space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={`${issue.row}-${issue.studentId}`}>
              <span className="font-medium tabular-nums">Line {issue.row}</span>
              {issue.studentId ? <span className="font-mono text-xs"> ({issue.studentId})</span> : null}:{" "}
              {issue.messages.join("; ")}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
