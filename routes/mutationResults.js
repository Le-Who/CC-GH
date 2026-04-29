export function routeOk(body = {}) {
  return { status: 200, body };
}

export function routeFail(status, bodyOrError) {
  return {
    status,
    body: typeof bodyOrError === "string" ? { error: bodyOrError } : bodyOrError,
  };
}

export function sendRouteResult(res, result) {
  const status = result?.status || 200;
  const body = result?.body ?? result ?? {};
  return res.status(status).json(body);
}
