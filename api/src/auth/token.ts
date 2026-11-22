import type { TokenUser } from '../users/user';

/** Antwort von `POST /api/auth/tokens` (03 B2.2 „token“, B4.6). */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Laufzeit in Sekunden (`JWT_EXPIRES_IN`, Standard 3600). */
  expiresIn: number;
  user: TokenUser;
}
