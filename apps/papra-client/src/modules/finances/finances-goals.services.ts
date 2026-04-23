import type { FinanceGoal, FinanceGoalBucket, FinanceGoalVersion, GoalActuals } from './finances-goals.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchFinanceGoal({ organizationId }: { organizationId: string }) {
  return apiClient<{ goal: FinanceGoal; buckets: FinanceGoalBucket[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/goals`,
  });
}

export async function updateFinanceGoal({ organizationId, goalId, name }: {
  organizationId: string;
  goalId: string;
  name: string;
}) {
  return apiClient<{ goal: FinanceGoal }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}`,
    body: { name },
  });
}

export async function createFinanceGoalBucket({ organizationId, goalId, name, targetPercentage, color, position, tagIds, classifications }: {
  organizationId: string;
  goalId: string;
  name: string;
  targetPercentage: number;
  color: string;
  position: number;
  tagIds: string[];
  classifications: string[];
}) {
  return apiClient<{ bucket: FinanceGoalBucket }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/buckets`,
    body: { name, targetPercentage, color, position, tagIds, classifications },
  });
}

export async function updateFinanceGoalBucket({ organizationId, goalId, bucketId, ...updates }: {
  organizationId: string;
  goalId: string;
  bucketId: string;
  name?: string;
  targetPercentage?: number;
  color?: string;
  position?: number;
  tagIds?: string[];
  classifications?: string[];
}) {
  return apiClient<{ bucket: FinanceGoalBucket }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/buckets/${bucketId}`,
    body: updates,
  });
}

export async function deleteFinanceGoalBucket({ organizationId, goalId, bucketId }: {
  organizationId: string;
  goalId: string;
  bucketId: string;
}) {
  return apiClient<void>({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/buckets/${bucketId}`,
  });
}

export async function fetchGoalActuals({ organizationId, goalId, from, to }: {
  organizationId: string;
  goalId: string;
  from: Date;
  to: Date;
}) {
  const params = new URLSearchParams({
    from: String(from.getTime()),
    to: String(to.getTime()),
  });
  return apiClient<GoalActuals>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/actuals?${params.toString()}`,
  });
}

export async function listGoalVersions({ organizationId, goalId }: {
  organizationId: string;
  goalId: string;
}) {
  return apiClient<{ versions: FinanceGoalVersion[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/versions`,
  });
}

export async function restoreGoalVersion({ organizationId, goalId, versionId }: {
  organizationId: string;
  goalId: string;
  versionId: string;
}) {
  return apiClient<{ success: boolean; restoredFrom: number; newVersionNumber: number }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/goals/${goalId}/versions/${versionId}/restore`,
  });
}
