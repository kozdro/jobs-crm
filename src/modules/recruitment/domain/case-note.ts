/** Current owner-scoped note, including the explicit historical-date state. */
export type CaseNote = {
  id: string;
  case_id: string;
  body: string;
  date_kind: "ordinary" | "historical";
  occurred_on: string | null;
  voided: boolean;
  revision: number;
  created_at: string;
};
