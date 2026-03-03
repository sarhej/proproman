export type UserRole = "ADMIN" | "VIEWER";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
};

export type Domain = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type Persona = {
  id: string;
  name: string;
  icon?: string | null;
};

export type RevenueStream = {
  id: string;
  name: string;
  color: string;
};

export type Priority = "P0" | "P1" | "P2" | "P3";
export type Horizon = "NOW" | "NEXT" | "LATER";
export type InitiativeStatus = "IDEA" | "PLANNED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type FeatureStatus = "IDEA" | "PLANNED" | "IN_PROGRESS" | "DONE";
export type CommercialType =
  | "CONTRACT_ENABLER"
  | "CHURN_PREVENTER"
  | "UPSELL_DRIVER"
  | "COMPLIANCE_GATE"
  | "CARE_QUALITY"
  | "COST_REDUCER";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type PersonaImpact = {
  initiativeId: string;
  personaId: string;
  impact: number;
  persona: Persona;
};

export type InitiativeRevenueWeight = {
  initiativeId: string;
  revenueStreamId: string;
  weight: number;
  revenueStream: RevenueStream;
};

export type Feature = {
  id: string;
  initiativeId: string;
  title: string;
  description?: string | null;
  ownerId?: string | null;
  owner?: User | null;
  status: FeatureStatus;
  sortOrder: number;
};

export type Decision = {
  id: string;
  initiativeId: string;
  title: string;
  rationale?: string | null;
  impactedTeams?: string | null;
  decidedAt?: string | null;
};

export type Risk = {
  id: string;
  initiativeId: string;
  title: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation?: string | null;
  ownerId?: string | null;
  owner?: User | null;
};

export type Dependency = {
  fromInitiativeId: string;
  toInitiativeId: string;
  description?: string | null;
};

export type Initiative = {
  id: string;
  title: string;
  description?: string | null;
  domainId: string;
  ownerId?: string | null;
  owner?: User | null;
  domain: Domain;
  priority: Priority;
  horizon: Horizon;
  status: InitiativeStatus;
  commercialType: CommercialType;
  isGap: boolean;
  targetDate?: string | null;
  notes?: string | null;
  sortOrder: number;
  personaImpacts: PersonaImpact[];
  revenueWeights: InitiativeRevenueWeight[];
  features: Feature[];
  decisions: Decision[];
  risks: Risk[];
  outgoingDeps: Dependency[];
  incomingDeps: Dependency[];
};

export type MetaPayload = {
  domains: Domain[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  users: User[];
};
