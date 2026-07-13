export type CompanionPetActivity = 'idle' | 'wave' | 'run' | 'failed' | 'review' | 'jump' | 'waiting';

export function resolveCompanionPetActivity(input: {
  failed?: boolean;
  awaitingApproval?: boolean;
  sending?: boolean;
  toolRunning?: boolean;
  reasoning?: boolean;
  justCompleted?: boolean;
}): CompanionPetActivity {
  if (input.failed) return 'failed';
  if (input.justCompleted) return 'wave';
  if (input.awaitingApproval) return 'waiting';
  if (input.toolRunning) return 'run';
  if (input.reasoning) return 'review';
  if (input.sending) return 'run';
  return 'idle';
}
