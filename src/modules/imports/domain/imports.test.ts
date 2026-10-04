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
      yearOfStudy: "L4",
      whatsappNumber: "+94771111111",
      email: "amaya@iit.ac.lk",
      voiceType: "ALTO",
      dateOfBirth: "2005-01-01",
      dietaryPreference: "Vegetarian",
      status: "ACTIVE",
      location: {
        areaLabel: "Dehiwala",
        coordinates: { latitude: 6.851, longitude: 79.865 },
        canDrive: true,
        seats: 3,
      },
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
    expect(preview.updated[0]?.changes).toEqual([{ field: "Year", from: "L4", to: "L5" }]);
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

describe("buildRegistrationPreview with the 2026 Google Form", () => {
  const NEW_HEADER =
    "Timestamp,Email Address,First Name,Last Name,IIT Student ID,WhatsApp Number,Voice Type (Section in choir),Current Year of Study,Date of Birth,Status,Location(Nearerst Landmark),Dietary Preferences";
  const newCsv = (...rows: string[]) => parseCsv([NEW_HEADER, ...rows].join("\n"));
  const amaya: ExistingMemberSnapshot = {
    id: "m1",
    firstName: "Amaya",
    lastName: "Perera",
    studentId: "W2024001",
    yearOfStudy: "L4",
    whatsappNumber: "+94771111111",
    email: "amaya@iit.ac.lk",
    voiceType: "ALTO",
    dateOfBirth: null,
    dietaryPreference: "Vegetarian",
    status: "ACTIVE",
    location: { areaLabel: "Dehiwala", coordinates: { latitude: 6.851, longitude: 79.865 }, canDrive: true, seats: 3 },
  };

  it("reads status, landmark and dietary preference for new members", () => {
    const preview = buildRegistrationPreview(
      newCsv(
        'x,nimal@iit.ac.lk,Nimal,Dias,W2026010,0775555555,Tenor,Placement Year,12/05/2003,Active,Kohuwala junction,"No beef, no pork"',
        "x,sara@iit.ac.lk,Sara,Lee,W2026011,0776666666,Soprano 1,L4,,,,",
      ),
      [],
      options,
    );
    expect(preview.missingColumns).toEqual([]);
    expect(preview.invalid).toEqual([]);
    expect(preview.created[0]?.data).toMatchObject({
      yearOfStudy: "PLACEMENT",
      status: "ACTIVE",
      dietaryPreference: "No beef, no pork",
      location: { areaLabel: "Kohuwala junction", coordinates: null, canDrive: false, seats: 0 },
    });
    expect(preview.created[1]?.data).toMatchObject({ status: null, dietaryPreference: null, location: null });
  });

  it("uses a coordinates column (added by the geocoding script) or coordinates typed as the landmark", () => {
    const withColumn = parseCsv(
      [
        `${NEW_HEADER},Location Coordinates`,
        "x,nimal@iit.ac.lk,Nimal,Dias,W2026010,0775555555,Tenor,L5,,,Kohuwala junction,,6.8664 79.8774",
        'x,sara@iit.ac.lk,Sara,Lee,W2026011,0776666666,Alto,L5,,,"6.9, 79.86",,',
        'x,bad@iit.ac.lk,Bad,Spot,W2026012,0777777777,Alto,L5,,,London,,"51.5, -0.12"',
      ].join("\n"),
    );
    const preview = buildRegistrationPreview(withColumn, [], options);
    expect(preview.created.map((item) => item.data.location)).toEqual([
      {
        areaLabel: "Kohuwala junction",
        coordinates: { latitude: 6.8664, longitude: 79.8774 },
        canDrive: false,
        seats: 0,
      },
      { areaLabel: "6.9, 79.86", coordinates: { latitude: 6.9, longitude: 79.86 }, canDrive: false, seats: 0 },
    ]);
    expect(preview.invalid[0]?.messages.join(" ")).toMatch(/outside Sri Lanka/);
  });

  it("never changes an existing member's status and keeps curated details when cells are blank", () => {
    const preview = buildRegistrationPreview(
      newCsv("x,amaya@iit.ac.lk,Amaya,Perera,W2024001,0771111111,Alto,L4,,Prospective,,"),
      [amaya],
      options,
    );
    expect(preview.unchanged).toHaveLength(1);
    expect(preview.unchanged[0]?.data).toMatchObject({
      status: "ACTIVE",
      dietaryPreference: "Vegetarian",
      location: amaya.location,
    });
  });

  it("reports a new landmark and keeps the driver's carpool details", () => {
    const preview = buildRegistrationPreview(
      newCsv("x,amaya@iit.ac.lk,Amaya,Perera,W2024001,0771111111,Alto,L4,,,Wellawatte,Vegan"),
      [amaya],
      options,
    );
    expect(preview.updated[0]?.changes).toEqual([
      { field: "Dietary", from: "Vegetarian", to: "Vegan" },
      { field: "Location", from: "Dehiwala", to: "Wellawatte" },
      { field: "Coordinates", from: "6.851, 79.865", to: "" },
    ]);
    expect(preview.updated[0]?.data.location).toEqual({
      areaLabel: "Wellawatte",
      coordinates: null,
      canDrive: true,
      seats: 3,
    });
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
