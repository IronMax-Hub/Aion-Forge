// Reads the server's settings from the environment (loaded from backend/.env).

export interface Settings {
  db: { host: string; port: number; user: string; password: string; database: string };
  apiPort: number;
}

export function readSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const user = env.DB_USER?.trim();
  if (!user) {
    throw new Error("DB_USER is not set. Copy backend/.env.example to backend/.env and fill in your MySQL credentials.");
  }
  return {
    db: {
      host:     env.DB_HOST || "127.0.0.1",
      port:     Number(env.DB_PORT || 3306),
      user,
      password: env.DB_PASSWORD ?? "",
      database: env.DB_NAME || "Aion-Forge",
    },
    apiPort: Number(env.API_PORT || 4000),
  };
}
