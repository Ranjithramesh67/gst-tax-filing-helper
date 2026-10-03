import { z } from 'zod';
import {
  createRoleSchema,
  createTeamMemberSchema,
  listRolesQuerySchema,
  listTeamQuerySchema,
  updateRoleSchema,
  updateTeamMemberSchema,
} from '@gstflow/validation';

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type ListTeamQuery = z.infer<typeof listTeamQuerySchema>;
