import { z } from 'zod';

/**
 * Supported authentication method types that can be required or optional for an auth flow.
 */
export const AuthMethodTypeSchema = z.enum(['username_password', 'authenticator', 'custom']);
export type AuthMethodType = z.infer<typeof AuthMethodTypeSchema>;

/**
 * Defines an authentication flow for an application.
 * Each flow specifies which auth methods are required vs optional.
 */
export const AuthFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  requiredMethods: z.array(AuthMethodTypeSchema),
  optionalMethods: z.array(AuthMethodTypeSchema),
});
export type AuthFlow = z.infer<typeof AuthFlowSchema>;

/**
 * A tool that can be used with an application.
 * Extend this interface as tool requirements become clearer.
 */
export const AppToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
});
export type AppTool = z.infer<typeof AppToolSchema>;

/**
 * Defines an application that can be automated.
 */
export const ApplicationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  domain: z.string().min(1),
  authFlows: z.record(z.string(), AuthFlowSchema),
  tools: z.record(z.string(), AppToolSchema),
});
export type Application = z.infer<typeof ApplicationSchema>;

/**
 * Registry of all applications, keyed by app identifier.
 * Using a Record enables O(1) lookup by app id.
 */
export const AppRegistrySchema = z.record(z.string(), ApplicationSchema);
export type AppRegistry = z.infer<typeof AppRegistrySchema>;
