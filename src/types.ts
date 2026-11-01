/** A checkbox-like value: true/false when recognised, otherwise the raw NetAcad text. */
export type Flag = boolean | string | null;

export type AssessmentDef = { name: string; dueDate: string | null };

export type LearnerAssessment = {
  name: string;
  score: number | null;
  maxScore: number | null;
  submittedOn: string | null;
};

export type SnapshotLearner = {
  name: string;
  email: string | null;
  status: string | null;
  classGrade: number | null;
  finalExamScore: number | null;
  finalExamSubmitted: Flag;
  surveySubmitted: Flag;
  markedComplete: Flag;
  assessments: LearnerAssessment[];
};

export type Snapshot = {
  format: 'netacad-gradebook/1';
  snapshotDate: string;
  exportedAt: string;
  course: string;
  url: string | null;
  /** NetAcad course UUID (query parameter `id` of the gradebook page). */
  courseId: string;
  assessments: AssessmentDef[];
  learners: SnapshotLearner[];
};

export type Contact = {
  id: string;
  date: string;
  channel: string;
  text: string;
  reply: string;
};

export type LearnerNotes = {
  note: string;
  contacts: Contact[];
  snoozeUntil: string | null;
};

export type Notes = {
  format: 'netacad-notes/1';
  updatedAt: string | null;
  learners: Record<string, LearnerNotes>;
};

export type Settings = {
  warnDays: number;
  alertDays: number;
  contactSubject: string;
  contactTemplate: string;
};

export const STATUS_CODES = ['alert', 'watch', 'active', 'snoozed', 'completed', 'gone'] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

export type ActivitySource = 'submitted' | 'snapshot';
export type ActivityLevel = 'active' | 'watch' | 'alert';
