import { Personnel } from "../models/kms.model";

/**
 * Still mock: no backend endpoint lists personnel for the sharepoint "share with"
 * picker yet. The divisional-organisation `available-users` route is scoped to
 * hierarchy placement (and doesn't match this shape), not a general roster —
 * see KmsStateService / kms-sharepoint.ts. Replace once a real endpoint exists.
 */
export const MOCK_PERSONNEL: Personnel[] = [
  { id: 1, rank: "Lt Cdr", firstName: "Rohan", lastName: "Verma", personalNumber: "12345-A", department: "Marine Engineering" },
  { id: 2, rank: "Cdr", firstName: "Aditi", lastName: "Menon", personalNumber: "23456-B", department: "Marine Engineering" },
  { id: 3, rank: "Lt", firstName: "Karan", lastName: "Bose", personalNumber: "34567-C", department: "Weapons & Electronics" },
  { id: 4, rank: "Sub Lt", firstName: "Priya", lastName: "Nair", personalNumber: "45678-D", department: "Logistics" },
  { id: 5, rank: "Cdr", firstName: "Vikram", lastName: "Shetty", personalNumber: "56789-E", department: "Marine Engineering" },
];
