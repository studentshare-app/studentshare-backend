/**
 * app/index.tsx — Entry point
 *
 * Returns null intentionally. The RootLayout is the sole authority
 * for initial navigation (onboarding → auth → tabs) based on the
 * resolved auth + onboarding state. An unconditional <Redirect>
 * here would race with that logic and win in production builds,
 * bypassing authentication entirely.
 */
export default function Index() {
  return null
}
