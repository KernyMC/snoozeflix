/**
 * Demo tools (purple wrench panel, fake location, shorter check-in defaults) are on whenever the app runs on
 * the mock backend, or when NEXT_PUBLIC_DEMO=true. Only a live-mode build without the flag hides them.
 */
export const DEMO_ENABLED: boolean =
  process.env.NEXT_PUBLIC_DEMO === 'true' || process.env.NEXT_PUBLIC_DATA_MODE !== 'live';
