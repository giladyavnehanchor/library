import type { AuthFlow } from '../../../types';

export const authFlows: Record<string, AuthFlow> = {
  'basic-2fa-login': {
    name: 'Basic 2FA Login',
    description: 'Login to LinkedIn using username and password and can optionally use 2FA',
    requiredMethods: ['username_password'],
    optionalMethods: ['authenticator'],
  },
};
