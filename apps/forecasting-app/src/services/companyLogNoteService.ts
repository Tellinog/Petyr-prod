import { ForecastType } from "@prisma/client";
import { prisma } from "@/lib/db";

const NOTE_SOURCE = "Company Detail Note";

export class CompanyLogNoteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "CompanyLogNoteError";
  }
}

function normalizeNote(value: unknown) {
  return String(value ?? "").trim();
}

export async function saveCompanyLogNote(input: {
  companyName: string;
  csmName: string;
  year: number;
  note: unknown;
  companyActiveStatus: boolean | null | undefined;
  createdBy: string;
}) {
  const companyName = input.companyName.trim();
  const csmName = input.csmName.trim() || "Unassigned";
  const note = normalizeNote(input.note);

  if (!companyName) throw new CompanyLogNoteError("Company note requires a company name.");
  if (!note) throw new CompanyLogNoteError("Company note cannot be empty.");
  if (note.length > 4000) throw new CompanyLogNoteError("Company note is too long. Keep it under 4000 characters.");

  const now = new Date();

  return prisma.forecastSaveSession.create({
    data: {
      companyName,
      csmName,
      source: NOTE_SOURCE,
      year: input.year,
      month: now.getMonth() + 1,
      forecastType: ForecastType.ongoing,
      note,
      companyActiveStatus: input.companyActiveStatus ?? true,
      createdBy: input.createdBy
    },
    select: {
      id: true
    }
  });
}
