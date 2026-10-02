/**
 * Initial E:DEN macro structure (docs/PRODUCT_SPEC.md "Initial macro
 * structure"). Codes and titles only: dates, durations, owners, priorities,
 * geography, progress and dependencies are NOT part of the seed and stay
 * TBD until the team validates them (Product Definition §40, Phase 06).
 */

export const EDEN_PROJECT = { name: "E:DEN", slug: "eden", description: "E:DEN master plan" } as const;

export interface SeedWorkstream {
  code: string;
  name: string;
  sortOrder: number;
}

export interface SeedTask {
  edenCode: string;
  title: string;
  workstream: string;
  isMilestone?: boolean;
}

/** One workstream per code prefix of the macro structure. Names can be renamed later; codes are permanent. */
export const EDEN_WORKSTREAMS: SeedWorkstream[] = [
  { code: "GOV", name: "Governance", sortOrder: 10 },
  { code: "TEC", name: "Tecnica", sortOrder: 20 },
  { code: "PROD", name: "Produzione", sortOrder: 30 },
  { code: "SC", name: "Supply chain", sortOrder: 40 },
  { code: "CERT", name: "Certificazione", sortOrder: 50 },
  { code: "MKT", name: "Marketing", sortOrder: 60 },
  { code: "CRM", name: "Commerciale / CRM", sortOrder: 70 },
  { code: "EIMA", name: "EIMA", sortOrder: 80 },
  { code: "POST", name: "Post-vendita", sortOrder: 90 },
  { code: "ROAD", name: "Roadmap", sortOrder: 100 },
];

export const EDEN_TASKS: SeedTask[] = [
  { edenCode: "GOV-001", title: "Master Schedule & execution system", workstream: "GOV" },
  { edenCode: "TEC-001", title: "Stabilizzazione ECU / controller / cablaggio", workstream: "TEC" },
  { edenCode: "TEC-002", title: "Validazione architettura elettrica/elettronica definitiva", workstream: "TEC" },
  { edenCode: "PROD-001", title: "Design freeze eBacco pre-produzione", workstream: "PROD" },
  { edenCode: "SC-001", title: "BOM definitiva e fornitori critici", workstream: "SC" },
  { edenCode: "PROD-002", title: "Setup assemblaggio e procedure QC", workstream: "PROD" },
  { edenCode: "CERT-001", title: "Documentazione tecnica / pre-audit CE", workstream: "CERT" },
  { edenCode: "CERT-002", title: "Test EMC e iter certificazione", workstream: "CERT" },
  { edenCode: "CERT-003", title: "Certificazione CE completa", workstream: "CERT", isMilestone: true },
  { edenCode: "MKT-001", title: "Finalizzazione marketing e materiali commerciali", workstream: "MKT" },
  { edenCode: "CRM-001", title: "CRM e processo gestione lead", workstream: "CRM" },
  { edenCode: "EIMA-001", title: "Preparazione unità demo / use case EIMA", workstream: "EIMA" },
  { edenCode: "EIMA-002", title: "Logistica, sales training e materiali EIMA", workstream: "EIMA" },
  { edenCode: "EIMA-003", title: "EIMA Bologna", workstream: "EIMA", isMilestone: true },
  { edenCode: "POST-001", title: "Assistenza, issue tracking e feedback clienti", workstream: "POST" },
  { edenCode: "ROAD-001", title: "Roadmap prodotto 2027", workstream: "ROAD" },
];
