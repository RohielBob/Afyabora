import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`,
  )
  .max(128);

export const registerPatientSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(true, { errorMap: () => ({ message: 'Le consentement est obligatoire' }) }),
});
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

export const registerDoctorSchema = registerPatientSchema.extend({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  licenseNumber: z.string().trim().min(3).max(40),
  institution: z.string().trim().min(2).max(120),
});
export type RegisterDoctorInput = z.infer<typeof registerDoctorSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(500) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

/** DELETE /me : le mot de passe est redemandé avant de supprimer le compte et toutes ses données. */
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}
