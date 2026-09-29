/** One row of `GET /api/v1/dart/complete_dart_list/` — `CompleteDartListSerializer`
 * serializes the full `InitiateDart` model ("__all__") plus a few read-only display
 * names and the nested completion record set, so most fields are optional/nullable. */
export interface CompleteDartListItem {
  id: number;
  dart_number: string | null;
  dart_date: string | null;
  defective_discriptions: string | null;
  equipment_ship_name: string | null;
  equipment_ems_name: string | null;
  department_name: string | null;
  complete_defect_dart_set: {
    rectified_date: string | null;
  }[];
}
