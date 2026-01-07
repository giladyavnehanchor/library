import AnchorBrowser, { type Anchorbrowser } from 'anchorbrowser';
import { z } from 'zod';

import type { Browser } from 'playwright';

const RUN_AGENTIC_VALIDATION_PROMPT = `Use a 3-way result so "invalid credentials" is separated from "could not attempt".

Attempt to log in using the provided credentials. You are allowed to perform AT MOST ONE submit action (one click on "Log in", "Sign in", or "Submit", or one Enter-key submit on a login form). Do not submit twice.

After navigation settles (wait for network and DOM to become stable), classify the outcome and respond with EXACTLY ONE of the following strings:

- "true" - Login succeeded: you can confirm authenticated state (e.g., redirected away from login, user avatar or name visible, logout button present, or access to a known authenticated-only page or element).
- "false" - Login attempt was executed but credentials were rejected: you see an authentication error (e.g., "invalid password", "incorrect email", "wrong credentials"), or you remain on the login page with a clear credentials-related error.
- "attempt_failed" - You could not complete a login attempt: required fields or submit control not found, submit disabled, CAPTCHA/2FA/SSO blocks progress, page crashes, unexpected modal blocks interaction, timeout, or any other automation or UX issue prevented the single submit action.

Rules:
- Only return one of: "true", "false", "attempt_failed" (lowercase, no extra text).
- If you did not actually perform a submit action, you MUST return "attempt_failed".
- If you performed a submit action and there is no clear success signal AND no clear credentials error, return "attempt_failed".
`;

const ConfigSchema = z.object({
  sessionId: z.string().min(1, 'ANCHOR_SESSION_ID is required'),
  identityId: z.string().min(1, 'ANCHOR_IDENTITY_ID is required'),
});

type Config = z.infer<typeof ConfigSchema>;

interface LoginResult {
  success: boolean;
  message: string;
}

function getConfig(): Config {
  return ConfigSchema.parse({
    sessionId: process.env['ANCHOR_SESSION_ID'],
    identityId: process.env['ANCHOR_IDENTITY_ID'],
  });
}

function getAnchorClient(): Anchorbrowser {
  return new AnchorBrowser();
}

async function setupBrowser(config: Config): Promise<Browser> {
  const client = getAnchorClient();

  console.log(`[BROWSER] Connecting to existing session: ${config.sessionId}`);

  return client.browser.connect(config.sessionId);
}

export default async function loginWithAgent(): Promise<LoginResult> {
  try {
    const config = getConfig();
    const client = getAnchorClient();

    const credentials = await client.identities.retrieveCredentials(config.identityId);

    await setupBrowser(config);

    await client.agent.task(RUN_AGENTIC_VALIDATION_PROMPT, {
      sessionId: config.sessionId,
      taskOptions: { url: `https://${credentials.source}` },
    });

    console.log('Placeholder for agent-based login implementation');

    return { success: true, message: 'Agent-based login placeholder' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Error in agent-based login:', errorMessage);

    return { success: false, message: errorMessage || 'Agent-based login failed' };
  }
}
