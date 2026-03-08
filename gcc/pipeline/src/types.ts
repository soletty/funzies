export type EntityType =
  | "tribe"
  | "family"
  | "notable_figure"
  | "ethnic_group"
  | "region"
  | "event"
  | "name_origin"
  | "connection";

export interface SeedEntity {
  type: EntityType;
  id: string;
  name: string;
  nameAr?: string;
  hints: Record<string, string>;
}
