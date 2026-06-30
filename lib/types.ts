export type Role = 'admin' | 'internal' | 'client_athlete' | 'client_brand';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId?: string; // for client roles
  avatar?: string;
}

export interface Contact {
  id: string;
  type: 'athlete' | 'brand' | 'partner';
  name: string;
  sport?: string;
  school?: string;
  league?: string;
  email: string;
  phone?: string;
  socialHandles: { platform: string; handle: string }[];
  dealHistory: Deal[];
  notes: string;
  tags: string[];
  stage: PipelineStage;
  dealValue?: number;
  createdAt: string;
  updatedAt: string;
}

export type PipelineStage = 'lead' | 'in_talks' | 'contract' | 'active' | 'completed';

export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: PipelineStage;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface ActivityLog {
  id: string;
  contactId: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  summary: string;
  date: string;
  userId: string;
  userName: string;
}

export type DeliverableStatus = 'todo' | 'in_progress' | 'in_review' | 'approved' | 'posted';

export interface Deliverable {
  id: string;
  campaignId: string;
  title: string;
  type: 'video' | 'graphic' | 'copy' | 'photo';
  status: DeliverableStatus;
  assigneeId?: string;
  assigneeName?: string;
  dueDate: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  comments: Comment[];
  createdAt: string;
}

export interface Comment {
  id: string;
  deliverableId: string;
  userId: string;
  userName: string;
  userRole: Role;
  body: string;
  resolved: boolean;
  createdAt: string;
  // for video
  timestamp?: number;
  // for image
  pinX?: number;
  pinY?: number;
  replies?: CommentReply[];
}

export interface CommentReply {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  type: 'nil_deal' | 'game_day' | 'sponsorship' | 'season_retainer' | 'brand_activation';
  clientIds: string[];
  clientNames: string[];
  status: 'planning' | 'active' | 'in_review' | 'completed';
  startDate: string;
  endDate: string;
  deliverables: Deliverable[];
  tags: string[];
  dealValue?: number;
  kpis: KPI[];
  description?: string;
  createdAt: string;
}

export type AutomationTriggerType = 'status_changed' | 'deliverable_created';
export type AutomationActionType = 'notify_assignee' | 'notify_team' | 'auto_assign';

export interface AutomationTriggerConfig {
  toStatus?: DeliverableStatus;
}

export interface AutomationActionConfig {
  assigneeId?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  actionType: AutomationActionType;
  actionConfig: AutomationActionConfig;
  createdBy: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  actorName: string;
  type: 'comment' | 'status_change';
  deliverableId: string;
  deliverableTitle: string;
  deliverableType: 'video' | 'graphic' | 'copy' | 'photo';
  message: string;
  read: boolean;
  createdAt: string;
}

export interface KPI {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
}
