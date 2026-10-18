// GET /doctor/sessions (L5-11) : les patients partagés du médecin. La réponse est vérifiée avec le schéma de
// @glyka/shared : une réponse inattendue devient une erreur, jamais une liste fausse.
import { doctorSessionListSchema, type DoctorSessionList } from '@glyka/shared';
import { api } from '@/lib/api-client';

export const sessionsApi = {
  list: async (): Promise<DoctorSessionList> =>
    doctorSessionListSchema.parse(await api('/doctor/sessions')),
};
