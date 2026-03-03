export type UserRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "MARKETING" | "VIEWER";

export type AuditAction = "CREATED" | "UPDATED" | "DELETED" | "STATUS_CHANGED" | "ROLE_CHANGED" | "LOGIN";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  googleId?: string | null;
};

export type AuditEntry = {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  user: Pick<User, "id" | "name" | "email" | "avatarUrl">;
  createdAt: string;
};

export type Domain = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type PersonaCategory = "BUYER" | "USER" | "NONE";

export type Persona = {
  id: string;
  name: string;
  icon?: string | null;
  category: PersonaCategory;
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
export type DateConfidence = "LOW" | "MEDIUM" | "HIGH";
export type DealStage = "DISCOVERY" | "PILOT" | "CONTRACTING" | "ACTIVE" | "RENEWAL";
export type StrategicTier = "TIER_1" | "TIER_2" | "TIER_3";
export type AccountType = "B2B2C" | "B2G2C" | "INSURER" | "EMPLOYER" | "PUBLIC";
export type DemandSourceType = "ACCOUNT" | "PARTNER" | "INTERNAL" | "COMPLIANCE";
export type DemandStatus = "NEW" | "VALIDATING" | "APPROVED" | "PLANNED" | "SHIPPED" | "REJECTED";
export type AssignmentRole = "ACCOUNTABLE" | "IMPLEMENTER" | "CONSULTED" | "INFORMED";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type CampaignType = "PARTNER_COBRANDING" | "PRODUCT_LAUNCH" | "SEASONAL" | "EVENT" | "WEBINAR" | "REFERRAL";
export type AssetType = "LANDING_PAGE" | "LEAFLET" | "EMAIL_TEMPLATE" | "BANNER" | "VIDEO" | "PRESENTATION" | "SOCIAL_POST";
export type AssetStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

export type Product = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
};

export type ProductWithHierarchy = Product & {
  initiatives: Initiative[];
};

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
  startDate?: string | null;
  targetDate?: string | null;
  milestoneDate?: string | null;
  dateConfidence?: DateConfidence | null;
  sortOrder: number;
  requirements?: Requirement[];
  demandLinks?: DemandLink[];
};

export type Requirement = {
  id: string;
  featureId: string;
  title: string;
  description?: string | null;
  isDone: boolean;
  priority: Priority;
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

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  segment?: string | null;
  ownerId?: string | null;
  owner?: User | null;
  arrImpact?: number | null;
  renewalDate?: string | null;
  dealStage?: DealStage | null;
  strategicTier?: StrategicTier | null;
};

export type Partner = {
  id: string;
  name: string;
  kind: string;
  ownerId?: string | null;
  owner?: User | null;
};

export type DemandLink = {
  id: string;
  demandId: string;
  initiativeId?: string | null;
  featureId?: string | null;
  demand?: Demand;
  initiative?: Initiative;
  feature?: Feature;
};

export type Demand = {
  id: string;
  title: string;
  description?: string | null;
  sourceType: DemandSourceType;
  status: DemandStatus;
  urgency: number;
  accountId?: string | null;
  partnerId?: string | null;
  ownerId?: string | null;
  account?: Account | null;
  partner?: Partner | null;
  owner?: User | null;
  demandLinks: DemandLink[];
};

export type InitiativeAssignment = {
  initiativeId: string;
  userId: string;
  role: AssignmentRole;
  allocation?: number | null;
  user: User;
};

export type Initiative = {
  id: string;
  productId?: string | null;
  product?: Product | null;
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
  startDate?: string | null;
  targetDate?: string | null;
  milestoneDate?: string | null;
  dateConfidence?: DateConfidence | null;
  arrImpact?: number | null;
  renewalDate?: string | null;
  dealStage?: DealStage | null;
  strategicTier?: StrategicTier | null;
  notes?: string | null;
  sortOrder: number;
  personaImpacts: PersonaImpact[];
  revenueWeights: InitiativeRevenueWeight[];
  features: Feature[];
  decisions: Decision[];
  risks: Risk[];
  demandLinks: DemandLink[];
  assignments: InitiativeAssignment[];
  outgoingDeps: Dependency[];
  incomingDeps: Dependency[];
};

export type Asset = {
  id: string;
  campaignId: string;
  name: string;
  description?: string | null;
  type: AssetType;
  status: AssetStatus;
  url?: string | null;
  personaId?: string | null;
  partnerId?: string | null;
  accountId?: string | null;
  persona?: Persona | null;
};

export type CampaignLink = {
  id: string;
  campaignId: string;
  initiativeId?: string | null;
  featureId?: string | null;
  accountId?: string | null;
  partnerId?: string | null;
  initiative?: Initiative | null;
  feature?: Feature | null;
  account?: Account | null;
  partner?: Partner | null;
};

export type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  type: CampaignType;
  status: CampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  ownerId?: string | null;
  owner?: User | null;
  assets: Asset[];
  links: CampaignLink[];
};

export type MetaPayload = {
  domains: Domain[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  users: User[];
  products: Product[];
  accounts: Account[];
  partners: Partner[];
};

export type CalendarItem = {
  id: string;
  title: string;
  startDate?: string | null;
  targetDate?: string | null;
  milestoneDate?: string | null;
  domain: string;
  owner?: string | null;
  dateConfidence?: DateConfidence | null;
};

export type GanttTask = {
  id: string;
  title: string;
  startDate?: string | null;
  targetDate?: string | null;
  progress: number;
  dependencies: string[];
};
