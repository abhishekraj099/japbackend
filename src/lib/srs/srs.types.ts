export interface ScheduleState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: string;
}

export interface ScheduleUpdate {
  dueDate: Date;
  lastReviewAt: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: string;
}
