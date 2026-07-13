/** Token state for CSDL Dược auth */
export interface AuthState {
  accessToken: string;
  expiresAt: Date;
}

/** Raw login response from CSDL Dược */
export interface AuthLoginResponse {
  access_token?: string;
  token?: string;
  expires_in?: number;
  [key: string]: unknown;
}
