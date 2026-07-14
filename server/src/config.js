import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV !== 'test') {
    console.warn(`[config] Missing env var: ${name}`);
  }
  return v;
}

export const config = {
  port: process.env.PORT || 4000,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',

  appsScript: {
    url: required('APPS_SCRIPT_URL'),
    secret: required('APPS_SCRIPT_SECRET'),
  },

  jwtSecret: required('JWT_SECRET'),
  teamJwtTtl: process.env.TEAM_JWT_TTL || '12h',
  authorJwtTtl: process.env.AUTHOR_JWT_TTL || '7d',
  // Longer default than a typical "magic link" since it's copied and shared
  // manually rather than clicked immediately from an email.
  magicLinkTtlMinutes: Number(process.env.MAGIC_LINK_TTL_MINUTES || 60 * 24 * 14), // 14 days

  teamAllowlist: (process.env.TEAM_ALLOWLIST || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Shared passcode for team sign-in (no OAuth client needed). Anyone with
  // both an allowlisted email AND this passcode gets a team session.
  teamPasscode: process.env.TEAM_PASSCODE || '',

  downloadRateLimit: {
    windowMin: Number(process.env.DOWNLOAD_RATE_LIMIT_WINDOW_MIN || 15),
    max: Number(process.env.DOWNLOAD_RATE_LIMIT_MAX || 30),
  },
};
