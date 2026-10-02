import { describe, expect, it } from "vitest";
import { normalizeHeader, parseCsv, parseYesNo, resolveColumns } from "./csv";
import { buildRegistrationPreview, type ExistingMemberSnapshot } from "./profiles/registration";
import { buildSupplementaryPreview } from "./profiles/supplementary-details";

const today = "2026-10-02";
const options = { allowedDomain: "iit.ac.lk", today };

const HEADER =
  "Timestamp,First Name,Last Name,IIT Student ID,Current Year of Study,WhatsApp Number,IIT Email Address,What is your voice type?";

function csv(...rows: string[]) {
  return parseCsv([HEADER, ...rows].join("\r\n"));
}

describe("parseCsv", () => {
  it("strips the BOM, trims cells and skips blank lines", () => {
    const parsed = parseCsv('﻿Name , Age\r\n"Ann ", 3\r\n\r\n');
    expect(parsed.headers).toEqual(["Name", "Age"]);
    expect(parsed.rows).toEqual([{ Name: "Ann", Age: "3" }]);
  });
});

describe("resolveColumns", () => {
  it("matches headers ignoring case and punctuation, preferring specific aliases", () => {
    const { columns, missing } = resolveColumns(
      ["Email Address", "IIT Email Address", "what is your VOICE type"],
      [
        { field: "email", headers: ["IIT Email Address", "Email Address"], required: true },
        { field: "voice", headers: ["What is your voice type?"], required: true },
        { field: "dob", headers: ["Date of Birth"], required: false },
      ],
    );
    expect(columns).toEqual({ email: "IIT Email Address", voice: "what is your VOICE type" });
    expect(missing).toEqual([]);
  });
  it("lists missing required columns", () => {
    expect(resolveColumns(["A"], [{ field: "x", headers: ["First Name"], required: true }]).missing).toEqual([
      "First Name",
    ]);
  });
  it("normalizes headers", () => {
    expect(normalizeHeader("What is your voice type?")).toBe("whatisyourvoicetype");
  });
});

describe("parseYesNo", () => {
  it.each([
    ["Yes", true],
    ["yes, I agree", true],
    ["No", false],
    ["", null],
    ["maybe", null],
  ])("%s → %s", (input, expected) => {
    expect(parseYesNo(input)).toBe(expected);
  });
});

describe("buildRegistrationPreview", () => {
  const existing: ExistingMemberSnapshot[] = [
    {
      id: "m1",
      firstName: "Amaya",
      lastName: "Perera",
      studentId: "W2024001",
      yearOfStudy: 1,
      whatsappNumber: "+94771111111",
      email: "amaya@iit.ac.lk",
      voiceType: "ALTO",
      dateOfBirth: "2005-01-01",
    },
  ];

  it("classifies new, updated, unchanged, invalid and duplicate rows", () => {
    const preview = buildRegistrationPreview(
      csv(
        "1/1/2026,amaya,perera,W2024001,Year 2,0771111111,amaya@iit.ac.lk,Not sure", // updated (year), voice kept
        "1/1/2026,Kavindu,Silva,W2024002,1,0772222222,kavindu@iit.ac.lk,Tenor", // superseded
        "1/2/2026,Kavindu,Silva,W2024002,1,0772222222,kavindu@iit.ac.lk,Bass", // new (latest wins)
        "1/2/2026,Bad,Row,W2024003,1,123,bad@gmail.com,Alto", // invalid
        "1/2/2026,Same,Email,W2024004,1,0773333333,amaya@iit.ac.lk,Alto", // invalid: email taken
      ),
      existing,
      options,
    );

    expect(preview.missingColumns).toEqual([]);
    expect(preview.created.map((item) => [item.studentId, item.data.voiceType])).toEqual([["W2024002", "BASS"]]);
    expect(preview.updated).toHaveLength(1);
    expect(preview.updated[0]?.changes).toEqual([{ field: "Year", from: "1", to: "2" }]);
    expect(preview.updated[0]?.data.voiceType).toBe("ALTO");
    expect(preview.duplicates.map((issue) => issue.row)).toEqual([3]);
    expect(preview.invalid.map((issue) => issue.row)).toEqual([5, 6]);
    expect(preview.invalid[0]?.messages.join(" ")).toMatch(/WhatsApp number/);
    expect(preview.invalid[1]?.messages.join(" ")).toMatch(/already belongs/);
  });

  it("reports unchanged rows", () => {
    const preview = buildRegistrationPreview(
      csv("x,Amaya,Perera,W2024001,1,077 111 1111,amaya@iit.ac.lk,Alto"),
      existing,
      options,
    );
    expect(preview.unchanged).toHaveLength(1);
    expect(preview.updated).toHaveLength(0);
  });

  it("refuses a file with missing columns", () => {
    const preview = buildRegistrationPreview(parseCsv("First Name,Last Name\nA,B"), existing, options);
    expect(preview.missingColumns).toContain("IIT Student ID");
    expect(preview.created).toHaveLength(0);
  });
});

describe("buildSupplementaryPreview", () => {
  const header =
    "IIT Student ID,Date of Birth,Which area do you live in?,Can we use your approximate location for carpooling?,Can you drive to practices?,How many passengers can you take?";
  const existing = [
    { id: "m1", studentId: "W001", name: "Amaya Perera", dateOfBirth: null, location: null },
    {
      id: "m2",
      studentId: "W002",
      name: "Kavindu Silva",
      dateOfBirth: "2004-05-06",
      location: { areaLabel: "Wattala", canDrive: false, seats: 0 },
    },
  ];

  it("updates birthdays and consented locations, removes withdrawn ones and rejects unknown IDs", () => {
    const preview = buildSupplementaryPreview(
      parseCsv(
        [header, "W001,15/03/2004,Dehiwala,Yes,Yes,3", "W002,,Wattala,No,,", "W009,01/01/2004,Kandy,Yes,No,"].join(
          "\n",
        ),
      ),
      existing,
      { today },
    );
    expect(preview.updated).toHaveLength(2);
    expect(preview.updated[0]?.data).toEqual({
      studentId: "W001",
      dateOfBirth: "2004-03-15",
      location: { areaLabel: "Dehiwala", canDrive: true, seats: 3 },
    });
    expect(preview.updated[1]?.data.location).toBeNull();
    expect(preview.updated[1]?.data.dateOfBirth).toBe("2004-05-06");
    expect(preview.invalid.map((issue) => issue.studentId)).toEqual(["W009"]);
  });

  it("requires an area when consent is given and validates seats", () => {
    const preview = buildSupplementaryPreview(
      parseCsv([header, "W001,,,Yes,Yes,3", "W002,,Nugegoda,Yes,Yes,12"].join("\n")),
      existing,
      { today },
    );
    expect(preview.invalid).toHaveLength(2);
  });
});
