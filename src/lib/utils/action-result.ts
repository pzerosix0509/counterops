export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}
