export type FinanceGoal = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FinanceGoalBucket = {
  id: string;
  goalId: string;
  organizationId: string;
  name: string;
  targetPercentage: number;
  color: string;
  position: number;
  tagIds: string[];
  classifications: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type FinanceGoalBucketWithActuals = FinanceGoalBucket & {
  actualAmount: number;
  actualPercentage: number;
};

export type GoalActuals = {
  buckets: FinanceGoalBucketWithActuals[];
  totalAmount: number;
  unassignedAmount: number;
  currency: string;
};

export type FinanceGoalVersionBucket = {
  id: string;
  name: string;
  targetPercentage: number;
  color: string;
  position: number;
  tagIds: string[];
  classifications: string[];
};

export type FinanceGoalVersion = {
  id: string;
  versionNumber: number;
  name: string;
  buckets: FinanceGoalVersionBucket[];
  createdAt: string;
};
