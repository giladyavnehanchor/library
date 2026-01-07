import AnchorBrowser, { type Anchorbrowser } from 'anchorbrowser';
import { z } from 'zod';

import type { Browser, Page } from 'playwright';

const ConfigSchema = z.object({
  sessionId: z.string().default(''),
  identityId: z.string().min(1, 'ANCHOR_IDENTITY_ID is required'),
  timeoutMs: z.coerce.number().default(10000),
  homeUrl: z.string().default('https://www.linkedin.com/uas/login'),
});

type Config = z.infer<typeof ConfigSchema>;

type IdentityCredentialsResponse = Awaited<
  ReturnType<Anchorbrowser['identities']['retrieveCredentials']>
>;

interface LinkedinCredentials {
  username: string;
  password: string;
  otp: string;
}

interface LoginResult {
  success: boolean;
  message: string;
}

function getConfig(): Config {
  return ConfigSchema.parse({
    sessionId: process.env['ANCHOR_SESSION_ID'],
    identityId: process.env['ANCHOR_IDENTITY_ID'],
    timeoutMs: process.env['ANCHOR_TIMEOUT_MS'],
    homeUrl: 'https://www.linkedin.com/uas/login',
  });
}

function getAnchorClient(): Anchorbrowser {
  return new AnchorBrowser();
}

async function getAnchorBrowser(config: Config, extraStealthRequired: boolean): Promise<Browser> {
  const client = getAnchorClient();

  console.log('[BROWSER] Setting up Anchor browser...');
  if (config.sessionId) {
    console.log(`[BROWSER] Connecting to existing session: ${config.sessionId}`);

    return client.browser.connect(config.sessionId);
  }
  const browserConfiguration = extraStealthRequired
    ? {
        sessionOptions: {
          session: {
            proxy: {
              active: true,
            },
          },
          browser: {
            captcha_solver: {
              active: true,
            },
            extra_stealth: {
              active: true,
            },
          },
        },
      }
    : {};

  console.log('[BROWSER] Creating new browser session...');

  return client.browser.create(browserConfiguration);
}

async function fetchIdentityCredentials(identityId: string): Promise<IdentityCredentialsResponse> {
  const anchorClient = getAnchorClient();

  return anchorClient.identities.retrieveCredentials(identityId);
}

function parseLinkedinCredentials(
  credentials: IdentityCredentialsResponse['credentials'],
): LinkedinCredentials {
  let username = '';
  let password = '';
  let otp = '';

  credentials.forEach((cred) => {
    if (cred.type === 'username_password') {
      username = cred.username;
      password = cred.password;
    } else if (cred.type === 'authenticator') {
      otp = cred.otp || '';
    }
  });

  if (!username || !password) {
    throw new Error(
      `Missing required credentials. Found: username=${!!username}, password=${!!password}`,
    );
  }

  return { username, password, otp };
}

async function waitForVisible(page: Page, selector: string, timeout: number): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

async function navigateToHomepage(page: Page, config: Config): Promise<void> {
  console.log('[STEP 1] ▶ Navigating to homepage...');
  console.log(`[STEP 1] URL: ${config.homeUrl}`);
  try {
    await page.goto(config.homeUrl, { waitUntil: 'load', timeout: config.timeoutMs });
    console.log('[STEP 1] ✓ Homepage loaded successfully');
  } catch (navErr) {
    const hasLoginButton = await page
      .locator('#login-nav-button')
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasLoginButton) {
      console.error('Homepage load failed and login button not detected.');
      throw navErr;
    }
    console.log('[STEP 1] ⚠ Load timeout but login button visible, proceeding...');
  }
}

async function enterUsername(page: Page, username: string, timeoutMs: number): Promise<void> {
  console.log('[STEP 3] ▶ Entering username...');
  await waitForVisible(page, 'input#username[name="session_key"][type="email"]', timeoutMs);
  console.log(`[STEP 3] Username field visible, entering: ${username}`);
  await page.locator('input#username[name="session_key"][type="email"]').fill(username);
  await page.locator('input#username[name="session_key"][type="email"]').press('Tab');
  console.log('[STEP 3] ✓ Username submitted');
}

async function enterPasswordAndSubmit(
  page: Page,
  password: string,
  timeoutMs: number,
): Promise<void> {
  console.log('[STEP 4] ▶ Entering password...');
  await waitForVisible(page, 'input#password[name="session_password"][type="password"]', timeoutMs);
  console.log('[STEP 4] Password field visible, entering password...');
  await page.locator('input#password[name="session_password"][type="password"]').fill(password);
  await page.locator('input#password[name="session_password"][type="password"]').press('Enter');
  console.log('[STEP 4] ✓ Password submitted');
}

async function verifyLogin({
  page,
  step,
  timeoutMs,
  fallbackTimeout = 60000,
}: {
  page: Page;
  step: number;
  timeoutMs: number;
  fallbackTimeout?: number;
}): Promise<boolean> {
  console.log(`[STEP ${step}] ▶ Verifying login success...`);
  try {
    await page.waitForURL('**linkedin.com/feed/**', {
      timeout: Math.max(timeoutMs, fallbackTimeout),
    });
    console.log(`[STEP ${step}] ✓ Linkedin Feed URL confirmed`);

    return true;
  } catch {
    const currentUrl = page.url();

    console.log(`[STEP ${step}] ⚠ Timeout waiting for Linkedin Feed URL. Current: ${currentUrl}`);
    const isOnLinkedin = /linkedin\.com\/feed\//.test(currentUrl);

    if (isOnLinkedin) {
      console.log(`[STEP ${step}] ✓ URL check passed - on Linkedin Feed domain`);
    }

    return isOnLinkedin;
  }
}

async function clickCommonSubmit(page: Page): Promise<boolean> {
  const submitSelectors = [
    'button:has-text("Submit")',
    'button:has-text("Verify")',
    'button:has-text("Continue")',
    'button[type="submit"]',
    'input[type="submit"]',
  ];

  const results = await Promise.all(
    submitSelectors.map(async (sel) => {
      const btn = page.locator(sel).first();
      const isVisible = await btn.isVisible().catch(() => false);

      return isVisible ? sel : null;
    }),
  );
  const visibleSelector = results.find((r) => r !== null);

  if (visibleSelector) {
    const btn = page.locator(visibleSelector).first();

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => null),
      btn.click(),
    ]);

    return true;
  }

  return false;
}

type OtpInputResult =
  | { type: 'single'; locator: ReturnType<Page['locator']> }
  | { type: 'multi'; locator: ReturnType<Page['locator']> }
  | null;

async function locateOtpInputs(page: Page): Promise<OtpInputResult> {
  // Single field variants
  const singleSelectors = [
    'input[name="pin"][maxlength="6"]',
    'input[name="code"]',
    'input[autocomplete="one-time-code"]',
    'input[id*="verification" i]',
    'input[inputmode="numeric"][maxlength="6"]',
  ];

  const singleResults = await Promise.all(
    singleSelectors.map(async (sel) => {
      const loc = page.locator(sel).first();
      const isVisible = await loc.isVisible().catch(() => false);

      return isVisible ? sel : null;
    }),
  );
  const visibleSingleSelector = singleResults.find((r) => r !== null);

  if (visibleSingleSelector) {
    return { type: 'single', locator: page.locator(visibleSingleSelector).first() };
  }

  // Multi-digit inputs (six separate boxes)
  const digitInputs = page.locator(
    'input[aria-label*="digit" i], input[pattern="\\d*"][maxlength="1"], input[inputmode="numeric"][maxlength="1"]',
  );
  const count = await digitInputs.count().catch(() => 0);

  if (count >= 6) {
    return { type: 'multi', locator: digitInputs };
  }

  return null;
}

async function submitOtpCode(
  page: Page,
  otp: string,
  step: number,
  timeoutMs: number,
): Promise<void> {
  const inputs = await locateOtpInputs(page);

  if (!inputs) {
    throw new Error('OTP inputs not found');
  }

  if (inputs.type === 'single') {
    await inputs.locator.fill('');
    await inputs.locator.fill(otp);
    // Try Enter first
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => null),
      inputs.locator.press('Enter'),
    ]);
    if (!(await verifyLogin({ page, step, timeoutMs, fallbackTimeout: 10000 }))) {
      await clickCommonSubmit(page).catch(() => null);
    }
  } else {
    // Multi-digit fields
    const arr = otp.split('');
    const total = Math.min(await inputs.locator.count(), arr.length);

    // Fill each digit field sequentially
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < total; i += 1) {
      const field = inputs.locator.nth(i);

      // eslint-disable-next-line no-await-in-loop
      await field.fill('');
      // eslint-disable-next-line no-await-in-loop
      await field.type(arr[i] ?? '');
    }
    // Submit by pressing Enter on last field
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => null),
      inputs.locator.nth(total - 1).press('Enter'),
    ]);
    if (!(await verifyLogin({ page, step, timeoutMs, fallbackTimeout: 10000 }))) {
      await clickCommonSubmit(page).catch(() => null);
    }
  }
}

export default async function LoginToLinkedin(): Promise<LoginResult> {
  console.log('\n========================================');
  console.log('  Linkedin Login Automation');
  console.log('========================================\n');

  // Get config (Zod validates identityId is present)
  const config = getConfig();

  console.log('[VALIDATE] ✓ IDENTITY_ID present');

  // Fetch credentials from identity API
  console.log('\n[CREDENTIALS] Fetching credentials from identity API...');
  let credentials: LinkedinCredentials;

  const identityResponse = await fetchIdentityCredentials(config.identityId);

  credentials = parseLinkedinCredentials(identityResponse.credentials);
  console.log(`[CREDENTIALS] ✓ Fetched credentials for identity: ${identityResponse.name}`);
  console.log(`[CREDENTIALS] Username: ${credentials.username}`);

  // Setup browser
  const extraStealthRequired = !credentials.otp;
  const browser = await getAnchorBrowser(config, extraStealthRequired);
  const context = browser.contexts()[0];

  if (!context) {
    return { success: false, message: 'Failed to get browser context' };
  }
  const page = context.pages()[0];

  if (!page) {
    return { success: false, message: 'Failed to get browser page' };
  }
  console.log('[BROWSER] ✓ Browser ready\n');

  try {
    console.log('--- Starting Login Flow ---\n');

    // Step 1: Navigate to homepage
    await navigateToHomepage(page, config);
    console.log('');

    // Step 2: Verify login success
    const loggedIn = await verifyLogin({
      page,
      step: 2,
      timeoutMs: config.timeoutMs,
      fallbackTimeout: 10000,
    });

    if (loggedIn) {
      return { success: true, message: 'Already authenticated. Landed on /feed.' };
    }
    console.log('[STEP 2] ⚠ Not logged in, proceeding to login.');
    console.log('');

    // Step 3: Enter username
    await enterUsername(page, credentials.username, config.timeoutMs);
    console.log('');

    // Step 4: Enter password
    await enterPasswordAndSubmit(page, credentials.password, config.timeoutMs);
    console.log('');

    if (credentials.otp) {
      // Step 5: Fetch updated credentials
      const updatedCredentials = await fetchIdentityCredentials(config.identityId);

      credentials = parseLinkedinCredentials(updatedCredentials.credentials);
      console.log('[STEP 5] ✓ Fetch updated credentials.');
      console.log('');

      // Step 6: Submit OTP code
      await submitOtpCode(page, credentials.otp, 6, config.timeoutMs);
      console.log('');
    } else {
      console.log('[STEP 5] ✓ No OTP found, skipping OTP submission.');
      console.log('');
    }
    // Step 7: Verify login success
    const finalLoggedIn = await verifyLogin({
      page,
      step: credentials.otp ? 7 : 6,
      timeoutMs: config.timeoutMs,
      fallbackTimeout: 10000,
    });

    if (!finalLoggedIn) {
      const finalUrl = page.url();
      const msg = `Login flow completed but Linkedin Feed URL not confirmed. Current URL: ${finalUrl}`;

      console.error(`\n[RESULT] ✗ ${msg}`);

      return { success: false, message: msg };
    }

    const successMsg = `Logged in to Linkedin as ${credentials.username}.`;

    console.log('\n========================================');
    console.log('[RESULT] ✓ SUCCESS!');
    console.log(successMsg);
    console.log('========================================\n');

    return { success: true, message: successMsg };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('\n[RESULT] ✗ FAILED');
    console.error('Linkedin login automation failed:', errorMessage);

    return { success: false, message: errorMessage || 'Unknown error during Linkedin login.' };
  } finally {
    await browser.close();
  }
}
