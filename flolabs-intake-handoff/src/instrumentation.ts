// Runs once when the server starts: fail fast if the environment is incomplete.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./server/env');
    getEnv();
  }
}
