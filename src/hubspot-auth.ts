#!/usr/bin/env node
// HubSpot OAuth CLI - Run this to authorize the app

import 'dotenv/config';
import { createHubSpotOAuth } from './agents/hubspot/oauth.js';

async function main() {
  console.log('HubSpot OAuth Setup\n');

  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    console.error('Error: HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  const oauth = createHubSpotOAuth();

  // Check for existing token
  const existingToken = await oauth.getAccessToken();
  if (existingToken) {
    console.log('Valid OAuth token already exists.');
    console.log('To re-authorize, delete data/.hubspot-token.json and run again.');
    process.exit(0);
  }

  console.log('Starting OAuth flow...\n');
  console.log('Make sure you have added http://localhost:3000/oauth/callback');
  console.log('as a redirect URL in your HubSpot MCP Auth App.\n');

  try {
    const tokenData = await oauth.runAuthServer(3000);
    console.log('\nAuthorization successful!');
    console.log('Token saved to data/.hubspot-token.json');
    console.log('Expires at:', new Date(tokenData.expiresAt).toLocaleString());
  } catch (error) {
    console.error('\nAuthorization failed:', error);
    process.exit(1);
  }
}

main();
