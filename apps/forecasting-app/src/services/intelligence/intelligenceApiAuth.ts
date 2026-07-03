export function getConfiguredAppInternalSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

export function isAuthorizedAppInternalRequest(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv = process.env) {
  const configuredSecret = getConfiguredAppInternalSecret(env);
  return configuredSecret !== null && headers.get("x-app-secret") === configuredSecret;
}

