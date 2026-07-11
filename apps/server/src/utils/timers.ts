interface UnrefableTimer {
  unref?: () => void
}
/** Let Node/Bun exit naturally while a best-effort background timer is pending. */
export const unrefTimer = (timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void => {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    ;(timer as UnrefableTimer).unref?.()
  }
}
