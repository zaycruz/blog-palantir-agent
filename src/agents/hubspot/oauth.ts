// HubSpot OAuth handler for MCP Auth App
// Uses OAuth 2.0 with PKCE for authentication

import { createServer } from 'http';
import { randomBytes, createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
}

const TOKEN_FILE = path.join(process.cwd(), 'data', '.hubspot-token.json');

// Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export class HubSpotOAuth {
  private config: OAuthConfig;
  private tokenData: TokenData | null = null;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  // Load saved token from disk
  async loadToken(): Promise<TokenData | null> {
    try {
      const data = await fs.readFile(TOKEN_FILE, 'utf-8');
      this.tokenData = JSON.parse(data);
      return this.tokenData;
    } catch {
      return null;
    }
  }

  // Save token to disk
  async saveToken(token: TokenData): Promise<void> {
    this.tokenData = token;
    const dir = path.dirname(TOKEN_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
  }

  // Check if token is valid and not expired
  isTokenValid(): boolean {
    if (!this.tokenData) return false;
    // Add 5 minute buffer before expiration
    return Date.now() < (this.tokenData.expiresAt - 5 * 60 * 1000);
  }

  // Get valid access token, refreshing if needed
  async getAccessToken(): Promise<string | null> {
    await this.loadToken();

    if (this.isTokenValid()) {
      return this.tokenData!.accessToken;
    }

    if (this.tokenData?.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.tokenData!.accessToken;
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }

    return null;
  }

  // Refresh the access token
  async refreshAccessToken(): Promise<void> {
    if (!this.tokenData?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.tokenData.refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    await this.saveToken({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      tokenType: data.token_type
    });
  }

  // Start OAuth flow - returns authorization URL
  startAuthFlow(): { url: string; verifier: string; state: string } {
    const { verifier, challenge } = generatePKCE();
    const state = randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state
    });

    const url = `https://app.hubspot.com/oauth/authorize?${params}`;
    return { url, verifier, state };
  }

  // Exchange authorization code for tokens
  async exchangeCode(code: string, verifier: string): Promise<TokenData> {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
        code_verifier: verifier
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    const tokenData: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      tokenType: data.token_type
    };

    await this.saveToken(tokenData);
    return tokenData;
  }

  // Run local OAuth callback server
  async runAuthServer(port: number = 3000): Promise<TokenData> {
    const { url, verifier, state } = this.startAuthFlow();

    console.log('\n========================================');
    console.log('HubSpot OAuth Authorization Required');
    console.log('========================================\n');
    console.log('Please open this URL in your browser:\n');
    console.log(url);
    console.log('\n========================================\n');

    return new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const reqUrl = new URL(req.url!, `http://localhost:${port}`);

        if (reqUrl.pathname === '/oauth/callback') {
          const code = reqUrl.searchParams.get('code');
          const returnedState = reqUrl.searchParams.get('state');

          if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: State mismatch</h1>');
            reject(new Error('State mismatch'));
            server.close();
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: No authorization code</h1>');
            reject(new Error('No authorization code'));
            server.close();
            return;
          }

          try {
            const tokenData = await this.exchangeCode(code, verifier);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');
            server.close();
            resolve(tokenData);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error</h1><p>${error}</p>`);
            reject(error);
            server.close();
          }
        }
      });

      server.listen(port, () => {
        console.log(`OAuth callback server listening on http://localhost:${port}`);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out'));
      }, 5 * 60 * 1000);
    });
  }
}

// Default OAuth configuration
export function createHubSpotOAuth(scopes?: string[]): HubSpotOAuth {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set');
  }

  // Use provided scopes or default to empty (use app's configured scopes)
  const defaultScopes = scopes || [];

  return new HubSpotOAuth({
    clientId,
    clientSecret,
    redirectUri: 'http://localhost:3000/oauth/callback',
    scopes: defaultScopes
  });
}
