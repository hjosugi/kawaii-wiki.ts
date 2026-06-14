/**
 * A minimal `Result` type for typed, exception-free error handling.
 *
 * Domain logic returns `Result<T, E>` instead of throwing. Effects (DB, HTTP)
 * live at the edges; the pure core stays total and easy to test. This is the
 * deliberate opposite of Wiki.js, where validation/permission failures throw
 * from deep inside 1000-line models.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok

/** Transform the success value, leaving errors untouched. */
export const map =
  <T, U>(fn: (value: T) => U) =>
  <E>(r: Result<T, E>): Result<U, E> =>
    r.ok ? ok(fn(r.value)) : r

/** Chain a fallible step (a.k.a. `andThen`). */
export const flatMap =
  <T, U, E>(fn: (value: T) => Result<U, E>) =>
  (r: Result<T, E>): Result<U, E> =>
    r.ok ? fn(r.value) : r

/** Transform the error value, leaving successes untouched. */
export const mapErr =
  <E, F>(fn: (error: E) => F) =>
  <T>(r: Result<T, E>): Result<T, F> =>
    r.ok ? r : err(fn(r.error))

/** Extract the value or fall back to a default. */
export const unwrapOr =
  <T>(fallback: T) =>
  <E>(r: Result<T, E>): T =>
    r.ok ? r.value : fallback

/** Collect an array of Results into a Result of an array (fails fast). */
export const all = <T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E> => {
  const values: T[] = []
  for (const r of results) {
    if (!r.ok) return r
    values.push(r.value)
  }
  return ok(values)
}
