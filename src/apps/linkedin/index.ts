import { authFlows } from './auth';

import type { Application } from '../../types';

export const linkedin: Application = {
  id: 'linkedin',
  name: 'LinkedIn',
  description: 'LinkedIn',
  domain: 'linkedin.com',
  authFlows,
  tools: {},
};
