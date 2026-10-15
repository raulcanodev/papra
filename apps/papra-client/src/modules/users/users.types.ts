export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  maxOrganizationCount: number | null;
  twoFactorEnabled: boolean;
};

export type UserMe = User & {
  phone?: string | null;
  permissions: string[];
};
