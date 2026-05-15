import { signal, computed } from '@preact/signals-react';
import type { ProfileIndex, SendJob } from './types';

export type AuthStatus = 'unknown' | 'signed-out' | 'signed-in';

export const authStatus$ = signal<AuthStatus>('unknown');
export const profiles$ = signal<ProfileIndex | null>(null);
export const sendQueue$ = signal<SendJob[]>([]);

export const isReady$ = computed(() => authStatus$.value !== 'unknown');
export const queueLength$ = computed(() => sendQueue$.value.length);
