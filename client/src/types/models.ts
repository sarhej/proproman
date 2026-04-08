export type UserRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "MARKETING" | "VIEWER" | "PENDING";

export type AuditAction = "CREATED" | "UPDATED" | "DELETED" | "STATUS_CHANGED" | "ROLE_CHANGED" | "LOGIN";

export type DeliveryChannel = "IN_APP" | "EMAIL" | "SLACK" | "WHATSAPP";
export type NotificationScope = "GLOBAL" | "DOMAIN" | "INITIATIVE" | "CAMPAIGN" | "FEATURE" | "USER";
export type NotificationRecipientKind = "OBJECT_OWNER" | "OBJECT_ROLE" | "GLOBAL_ROLE" | "OBJECT_ASSIGNEE";

export type NotificationRule = {
  id: string;
  action: AuditAction;
  entityType: string;
  eventKind: string | null;
  recipientKind: NotificationRecipientKind;
  recipientRole: string | null;
  deliveryChannels: DeliveryChannel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserNotificationSubscription = {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  scopeType: NotificationScope;
  scopeId: string | null;
  deliveryChannels: DeliveryChannel[];
  createdAt: string;
};

export type UserEmail = {
  id: string;
  email: string;
  userId: string;
  isPrimary: boolean;
  createdAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  googleId?: string | null;
  microsoftId?: string | null;
  activeTenantId?: string | null;
  emails?: UserEmail[];
};

export type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DEPROVISIONING";
export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  /** Tymio product hub workspace */
  isSystem?: boolean;
  /** Locales offered in the UI for this workspace (from Tenant.settings). */
  enabledLocales?: string[];
  /** Current user's role in this workspace (from membership). */
  membershipRole?: MembershipRole;
};

export type TenantMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: MembershipRole;
  tenant: Tenant;
};

export type TenantRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type TenantRequest = {
  id: string;
  teamName: string;
  slug: string;
  contactEmail: string;
  contactName: string;
  preferredLocale?: string | null;
  message?: string | null;
  status: TenantRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Normalize role to a string code (handles both legacy string role and future { code } shape). */
export function getRoleCode(user: { role?: UserRole | { code?: string } } | null | undefined): string {
  if (!user) return "";
  const r = (user as { role?: unknown }).role;
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (typeof r === "object" && r !== null && "code" in r && typeof (r as { code: unknown }).code === "string") {
    return (r as { code: string }).code;
  }
  return "";
}

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
export type FeatureStatus = "IDEA" | "PLANNED" | "IN_PROGRESS" | "BUSINESS_APPROVAL" | "DONE";
export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "TESTING" | "DONE";
export type StoryType = "FUNCTIONAL" | "BUG" | "TECH_DEBT" | "RESEARCH";
export type TaskType = "TASK" | "SPIKE" | "QA" | "DESIGN";
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

export type MilestoneStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type StakeholderRole = "DECISION_MAKER" | "SPONSOR" | "REVIEWER" | "AMBASSADOR" | "LEGAL" | "MEDICAL";
export type StakeholderType = "INTERNAL" | "EXTERNAL";

export type TopLevelItemType = "PRODUCT" | "SYSTEM";
export type BoardProvider = "INTERNAL" | "TRELLO" | "JIRA" | "NOTION";
export type BoardSyncState = "HEALTHY" | "ERROR" | "DISCONNECTED";

export type ExecutionColumn = {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
  mappedStatus: TaskStatus;
  isDefault: boolean;
  externalRef?: string | null;
};

export type ExecutionBoard = {
  id: string;
  productId: string;
  name: string;
  provider: BoardProvider;
  isDefault: boolean;
  syncState: BoardSyncState;
  externalRef?: string | null;
  config?: Record<string, unknown> | null;
  columns: ExecutionColumn[];
};

export type Product = {
  id: string;
  name: string;
  /** Per-workspace stable segment; pair with tenant slug as `workspaceSlug/productSlug` in docs. */
  slug: string;
  description?: string | null;
  sortOrder: number;
  itemType?: TopLevelItemType;
};

export type ProductWithHierarchy = Product & {
  initiatives: Initiative[];
  executionBoards?: ExecutionBoard[];
  /** Server-computed counts of requirements by PM status (TaskStatus) for this product's tree */
  requirementStatusCounts?: Partial<Record<TaskStatus, number>>;
};

export type RequirementStatusCounts = Partial<Record<TaskStatus, number>>;

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
  acceptanceCriteria?: string | null;
  labels?: string[] | null;
  storyPoints?: number | null;
  storyType?: StoryType | null;
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
  initiative?: Initiative | null;
};

export type Requirement = {
  id: string;
  featureId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  isDone: boolean;
  priority: Priority;
  assigneeId?: string | null;
  assignee?: User | null;
  dueDate?: string | null;
  estimate?: string | null;
  labels?: string[] | null;
  taskType?: TaskType | null;
  blockedReason?: string | null;
  externalRef?: string | null;
  metadata?: Record<string, unknown> | null;
  sortOrder: number;
  /** Order within an execution column (or unassigned bucket) on the board */
  executionSortOrder?: number;
  executionColumnId?: string | null;
  executionColumn?: ExecutionColumn | null;
  feature?: Feature | null;
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

export type InitiativeMilestone = {
  id: string;
  initiativeId: string;
  title: string;
  description?: string | null;
  status: MilestoneStatus;
  targetDate?: string | null;
  ownerId?: string | null;
  owner?: User | null;
  sequence: number;
};

export type InitiativeKPI = {
  id: string;
  initiativeId: string;
  title: string;
  targetValue?: string | null;
  currentValue?: string | null;
  unit?: string | null;
  targetDate?: string | null;
};

export type Stakeholder = {
  id: string;
  initiativeId: string;
  name: string;
  role: StakeholderRole;
  type: StakeholderType;
  organization?: string | null;
};

export type Initiative = {
  id: string;
  productId?: string | null;
  product?: Product | null;
  title: string;
  description?: string | null;
  problemStatement?: string | null;
  successCriteria?: string | null;
  domainId: string;
  ownerId?: string | null;
  owner?: User | null;
  domain: Domain;
  priority: Priority;
  horizon: Horizon;
  status: InitiativeStatus;
  commercialType: CommercialType;
  isGap: boolean;
  /** Product Explorer epic vs board-first initiative */
  isEpic: boolean;
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
  /** ISO timestamp; used for optimistic locking (baseUpdatedAt) on save */
  updatedAt?: string | null;
  archivedAt?: string | null;
  personaImpacts: PersonaImpact[];
  revenueWeights: InitiativeRevenueWeight[];
  features: Feature[];
  decisions: Decision[];
  risks: Risk[];
  demandLinks: DemandLink[];
  assignments: InitiativeAssignment[];
  milestones: InitiativeMilestone[];
  kpis: InitiativeKPI[];
  stakeholders: Stakeholder[];
  successCriteriaItems?: SuccessCriterion[];
  outgoingDeps: Dependency[];
  incomingDeps: Dependency[];
};

export type InitiativeComment = {
  id: string;
  initiativeId: string;
  userId: string;
  text: string;
  createdAt: string;
  user: { id: string; name: string };
};

export type SuccessCriterion = {
  id: string;
  initiativeId: string;
  title: string;
  sortOrder: number;
  isDone: boolean;
};

export type UserMessage = {
  id: string;
  userId: string;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  titleKey?: string | null;
  titleParams?: Record<string, unknown> | null;
  bodyKey?: string | null;
  bodyParams?: Record<string, unknown> | null;
  linkLabelKey?: string | null;
  linkLabelParams?: Record<string, unknown> | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt: string | null;
  source: string | null;
  type: string | null;
  createdAt: string;
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

export type CapabilityStatus = "ACTIVE" | "DRAFT" | "DEPRECATED";

export type BindingType =
  | "ROUTE"
  | "PAGE"
  | "API_ROUTE"
  | "MCP_TOOL"
  | "PRISMA_MODEL"
  | "FILE_GLOB"
  | "INFRA"
  | "FIGMA_NODE"
  | "DESIGN_REF";

export type CapabilityBinding = {
  id: string;
  capabilityId: string;
  bindingType: BindingType;
  bindingKey: string;
  notes: string | null;
  isPrimary: boolean;
  generated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Capability = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  userJob: string | null;
  synonyms: string[] | null;
  doNotConfuseWith: string | null;
  status: CapabilityStatus;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  bindings?: CapabilityBinding[];
};

export type MetaPayload = {
  domains: Domain[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  users: User[];
  products: Product[];
  accounts: Account[];
  partners: Partner[];
  labelSuggestions: string[];
};

export type CalendarItem = {
  id: string;
  title: string;
  startDate?: string | null;
  targetDate?: string | null;
  milestoneDate?: string | null;
  domain: string;
  domainId: string;
  domainColor: string;
  owner?: string | null;
  dateConfidence?: DateConfidence | null;
};

export type GanttTask = {
  id: string;
  title: string;
  startDate?: string | null;
  targetDate?: string | null;
  domain: string;
  domainColor: string;
  status?: string;
  statusColor?: string;
  owner?: string | null;
  progress: number;
  dependencies: string[];
  /** When API provides it (e.g. after DB migration), shown in Gantt tooltip */
  timelineExtended?: boolean;
};
