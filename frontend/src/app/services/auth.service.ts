import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import type { TokenResponse, TokenUser, UserResource } from '../models/api';
import { ADMIN_HOME, LOGIN_PATH, loginUrlTree } from '../utils/return-url';

/** Pfad des Logins; der Interceptor hängt hier **kein** Token an. */
export const LOGIN_ENDPOINT = '/api/auth/tokens';
export const ME_ENDPOINT = '/api/auth/me';
/** Schlüssel in `sessionStorage` (endet mit dem Tab, US09-9). */
export const AUTH_STORAGE_KEY = 'wetter-heubach.auth';

/** Größte Verzögerung für `setTimeout` (2^31 − 1 ms); längere Laufzeiten werden neu geplant. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Anmeldung im Speicher und in `sessionStorage`. `expiresAt` = Zeitpunkt des Ablaufs (ms seit 1970, Uhr des Browsers). */
export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  /** Laufzeit laut Server in Sekunden (`expiresIn` der Login-Antwort). */
  expiresIn: number;
  expiresAt: number;
  user: TokenUser;
}

function isTokenUser(value: unknown): value is TokenUser {
  if (typeof value !== 'object' || value === null) return false;
  const { id, username, roles } = value as Record<string, unknown>;
  return typeof id === 'number' && typeof username === 'string' && Array.isArray(roles) && roles.every(r => typeof r === 'string');
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { accessToken, tokenType, expiresIn, user } = value as Record<string, unknown>;
  return typeof accessToken === 'string' && accessToken.length > 0 && tokenType === 'Bearer' &&
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && isTokenUser(user);
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isTokenResponse(value)) return false;
  const { expiresAt } = value as unknown as Record<string, unknown>;
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt);
}

/** `sessionStorage` oder `null`, wenn der Browser den Zugriff verweigert (z. B. gesperrte Cookies). */
function sessionStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Anmeldung des Admins (US09, 03 B4.6, B5.1).
 *
 * - `login()` ruft `POST /api/auth/tokens` und merkt sich Token, `expiresIn`, Ablaufzeit und `user`
 *   im Signal `session` und in `sessionStorage` (F5 behält die Anmeldung, ein neuer Tab nicht).
 * - Beim Start wird der Zustand aus `sessionStorage` gelesen; ein abgelaufener oder kaputter Eintrag
 *   wird verworfen.
 * - Ein Timer läuft bis zum Ablauf. Dann wird abgemeldet und, wenn gerade eine Admin-Seite offen ist,
 *   zur Anmeldung mit Rückkehrziel weitergeleitet.
 * - `logout()` verwirft das Token im Speicher und in `sessionStorage` (kein Server-Aufruf, B4.6).
 *
 * Das ist nur Komfort für die Oberfläche; die Sicherheit liegt im Backend (Guards, 3a.15).
 * Alle Zugriffe auf `sessionStorage` sind abgesichert: Ohne Speicher gilt die Anmeldung nur bis F5.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly state = signal<AuthSession | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Aktuelle Anmeldung oder `null`. */
  readonly session = this.state.asReadonly();
  /** Angemeldet (Header: „Admin“ und „Abmelden“). */
  readonly isLoggedIn = computed(() => this.state() !== null);
  /** Angemeldeter Benutzer aus der Login-Antwort. */
  readonly user = computed(() => this.state()?.user ?? null);

  constructor() {
    this.restore();
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /** Meldet an. Erfolg: `user` der Antwort; Fehler kommen unverändert (mit `apiError`) beim Aufrufer an. */
  login(username: string, password: string): Observable<TokenUser> {
    return this.http.post<unknown>(LOGIN_ENDPOINT, { username, password }).pipe(
      map(response => {
        if (!isTokenResponse(response)) throw new Error('Unerwartete Antwort auf die Anmeldung.');
        this.start({
          accessToken: response.accessToken,
          tokenType: response.tokenType,
          expiresIn: response.expiresIn,
          expiresAt: Date.now() + response.expiresIn * 1000,
          user: response.user,
        });
        return response.user;
      }),
    );
  }

  /** `GET /api/auth/me` (US09-8): das Konto zum Token. */
  me(): Observable<UserResource> {
    return this.http.get<UserResource>(ME_ENDPOINT);
  }

  /** Verwirft das Token (Speicher, `sessionStorage`, Timer). Navigiert nicht. */
  logout(): void {
    this.clearTimer();
    this.state.set(null);
    try {
      sessionStore()?.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Speicher nicht verfügbar: Es gibt nichts zu löschen.
    }
  }

  /**
   * Gültiges Token für den Interceptor oder `null`. Ist das Token inzwischen abgelaufen (z. B. Timer
   * im Hintergrund-Tab verzögert), wird sofort abgemeldet; die Anfrage geht dann ohne Token.
   */
  accessToken(): string | null {
    const session = this.state();
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }
    return session.accessToken;
  }

  /** Angemeldet und Token nicht abgelaufen (Guard). */
  isAuthenticated(): boolean {
    return this.accessToken() !== null;
  }

  private start(session: AuthSession): void {
    this.state.set(session);
    try {
      sessionStore()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Speicher voll oder gesperrt: Anmeldung gilt nur bis zum Neuladen.
    }
    this.scheduleExpiry();
  }

  private restore(): void {
    let raw: string | null = null;
    try {
      raw = sessionStore()?.getItem(AUTH_STORAGE_KEY) ?? null;
    } catch {
      return; // Speicher gesperrt: nicht angemeldet
    }
    if (raw === null) return;
    let stored: unknown = null;
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = null; // kein JSON: unten verwerfen
    }
    if (!isAuthSession(stored) || stored.expiresAt <= Date.now()) {
      this.logout(); // kaputt oder abgelaufen: verwerfen
      return;
    }
    this.state.set(stored);
    this.scheduleExpiry();
  }

  private scheduleExpiry(): void {
    this.clearTimer();
    const session = this.state();
    if (!session) return;
    const delay = Math.max(0, session.expiresAt - Date.now());
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      const current = this.state();
      if (!current) return;
      if (current.expiresAt <= Date.now()) this.expire();
      else this.scheduleExpiry();
    }, Math.min(delay, MAX_TIMER_DELAY_MS));
  }

  /** Ablauf: abmelden; auf einer Admin-Seite weiter zur Anmeldung mit Rückkehrziel. */
  private expire(): void {
    this.logout();
    const url = this.router.url;
    const path = url.split(/[?#]/)[0];
    const inAdminArea = (path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/`)) && path !== LOGIN_PATH;
    if (inAdminArea) void this.router.navigateByUrl(loginUrlTree(this.router, url));
  }

  private clearTimer(): void {
    if (this.expiryTimer !== null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }
}
