import { expect, test } from "@playwright/test";
import { confirmDialog, openDashboard, openFormDialog } from "./helpers";

/** One second of a quiet 440 Hz tone as a WAV file (plays in every browser, unlike MP3/M4A in test Chromium). */
function toneWav(): Buffer {
  const rate = 8000;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A one-page PDF with a line of text. */
function onePagePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // the content stream, below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 24 Tf 72 760 Td (Silent Night - full score) Tj ET";
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf +=
      body === null
        ? `${index + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
        : `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("song bank: folders, uploads, playing a part and reading the score", async ({ page }) => {
  const folder = `E2E Concert ${Date.now()}`;
  await openDashboard(page);
  await page.getByRole("link", { name: "Song bank" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Song bank" })).toBeVisible();

  // Folder, then a song folder inside it.
  let form = await openFormDialog(page, "New folder");
  await form.getByLabel("Folder name").fill(folder);
  await form.getByRole("button", { name: "Add folder" }).click();
  await confirmDialog(page);
  await page.getByRole("link", { name: new RegExp(folder) }).click();
  await expect(page.getByRole("heading", { level: 1, name: folder })).toBeVisible();
  form = await openFormDialog(page, "New folder");
  await form.getByLabel("Folder name").fill("Silent Night");
  await form.getByRole("button", { name: "Add folder" }).click();
  await confirmDialog(page);
  await page.getByRole("link", { name: /Silent Night/ }).click();
  await expect(page.getByRole("navigation", { name: "Folders" }).getByRole("link", { name: folder })).toBeVisible();

  // Upload a part recording and the score together; the part comes from the file name.
  form = await openFormDialog(page, "Upload");
  await form.locator("input[type=file]").setInputFiles([
    { name: "Silent Night - Alto.wav", mimeType: "audio/wav", buffer: toneWav() },
    { name: "Full score.pdf", mimeType: "application/pdf", buffer: onePagePdf() },
  ]);
  await expect(form.getByLabel("Part for Silent Night - Alto.wav")).toHaveValue("ALTO");
  await expect(form.getByLabel("Part for Full score.pdf")).toHaveValue("");
  await form.getByRole("button", { name: "Upload 2 files" }).click();
  await confirmDialog(page, { title: "Upload 2 files?" });
  await expect(page.getByText("2 files uploaded")).toBeVisible();
  await expect(page.getByRole("link", { name: "Silent Night - Alto" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Full score" })).toBeVisible();

  // The "move to" picker lists folders as a tree: the song sits indented under its concert.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Silent Night - Alto" })
    .getByRole("button", { name: "Edit" })
    .click();
  form = page.locator("dialog[open]:not([data-confirm])");
  await expect(form).toBeVisible();
  const folderOptions = await form.getByLabel("Folder").locator("option").allTextContents();
  const concertAt = folderOptions.indexOf(folder);
  expect(concertAt).toBeGreaterThanOrEqual(0);
  expect(folderOptions[concertAt + 1]).toBe("   └ Silent Night");
  await form.getByRole("button", { name: "Cancel" }).click();

  // Only parts that have files get a filter button (here: Alto).
  await page.getByRole("button", { name: "Alto", exact: true }).click();
  await expect(page.getByRole("link", { name: "Silent Night - Alto" })).toBeVisible();

  // Play the recording in the page.
  await page.getByRole("button", { name: "Play Silent Night - Alto" }).click();
  await expect(page.getByRole("button", { name: "Pause Silent Night - Alto" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause Silent Night - Alto" }).click();

  // Read the score with the recording pinned below it.
  await page.getByRole("link", { name: "Full score" }).first().click();
  await expect(page.getByText("1 page", { exact: true })).toBeVisible();
  const canvas = page.getByRole("img", { name: "Page 1" });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeGreaterThan(100);
  await expect(page.getByLabel("Play along")).toHaveValue(/.+/);
  await page.screenshot({ path: "test-results/song-bank-score.png", fullPage: true });

  // Downloads go through the signed link.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  expect((await download).suggestedFilename()).toBe("Full score.pdf");

  // Delete the whole concert folder (committee and admins can delete folders with things in them).
  await page.getByRole("navigation", { name: "Folders" }).getByRole("link", { name: folder }).click();
  form = await openFormDialog(page, "Edit folder");
  await form.getByRole("button", { name: "Delete folder" }).click();
  await confirmDialog(page, { title: new RegExp(`Delete the folder “${folder}”`) });
  await expect(page.getByRole("heading", { level: 1, name: "Song bank" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(folder) })).toHaveCount(0);
});
