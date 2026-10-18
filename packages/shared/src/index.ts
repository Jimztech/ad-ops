import { z } from 'zod';

export const channelSchema = z.enum(['meta', 'google', 'tiktok']);
export type Channel = z.infer<typeof channelSchema>;