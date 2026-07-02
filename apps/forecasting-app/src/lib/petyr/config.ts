export const PETYR_DEFAULT_TIMEZONE = "Europe/Rome";

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolvePetyrTimezone(rawValue = process.env.PETYR_TIMEZONE) {
  const normalizedValue = rawValue?.trim();

  if (normalizedValue && isValidTimeZone(normalizedValue)) {
    return normalizedValue;
  }

  return PETYR_DEFAULT_TIMEZONE;
}

export function getPetyrTimezone() {
  return resolvePetyrTimezone(process.env.PETYR_TIMEZONE);
}

export function resolvePetyrDefaultYear(rawValue = process.env.PETYR_DEFAULT_YEAR, currentDate = new Date()) {
  const currentYear = currentDate.getFullYear();
  const normalizedValue = rawValue?.trim();

  if (!normalizedValue || normalizedValue.toLowerCase() === "current") {
    return currentYear;
  }

  const parsedYear = Number(normalizedValue);
  return Number.isFinite(parsedYear) ? parsedYear : currentYear;
}

export function getPetyrDefaultYear(currentDate = new Date()) {
  return resolvePetyrDefaultYear(process.env.PETYR_DEFAULT_YEAR, currentDate);
}
