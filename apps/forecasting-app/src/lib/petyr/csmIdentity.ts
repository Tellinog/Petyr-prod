export function normalizePetyrCsmIdentityName(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function resolvePreferredCsmName(userDisplayName: unknown, candidateCsmNames: Iterable<unknown>) {
  const normalizedDisplayName = normalizePetyrCsmIdentityName(userDisplayName);
  if (!normalizedDisplayName) return null;

  const matches = new Set<string>();

  for (const candidate of candidateCsmNames) {
    if (typeof candidate !== "string") continue;

    const candidateName = candidate.trim();
    if (!candidateName) continue;

    if (normalizePetyrCsmIdentityName(candidateName) === normalizedDisplayName) {
      matches.add(candidateName);
    }
  }

  return matches.size === 1 ? [...matches][0] : null;
}
