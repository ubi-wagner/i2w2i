export declare const APP_ROLE: string;
export declare function ownerDatabaseUrl(env?: Record<string, string | undefined>): string | undefined;
export declare function appDatabaseUrl(env?: Record<string, string | undefined>): string | undefined;
export declare function appPasswordProblem(pw: string | undefined): string | null;
