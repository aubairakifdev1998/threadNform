export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly fullName: string | null,
    public readonly avatarUrl: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
