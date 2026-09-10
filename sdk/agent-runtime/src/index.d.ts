export interface AgentFetchOptions extends RequestInit {
  credential?: string;
}

export interface AgentContext<TInput = unknown> {
  readonly sessionId: string;
  readonly input: TInput;
  emit(kind: string, data?: unknown): unknown;
  fetch(input: string | URL, init?: AgentFetchOptions): Promise<Response>;
  nextSteer(options?: { timeoutMs?: number }): Promise<unknown | null>;
  isCancelled(): boolean;
}

export type AgentDefinition<TInput = unknown, TResult = unknown> =
  | ((ctx: AgentContext<TInput>) => TResult | Promise<TResult>)
  | { run(ctx: AgentContext<TInput>): TResult | Promise<TResult> };

export declare function defineAgent<TInput = unknown, TResult = unknown>(definition: AgentDefinition<TInput, TResult>): AgentDefinition<TInput, TResult>;

export interface FabricOptions {
  baseUrl?: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
}

export interface CreateSessionRequest<TInput = unknown> {
  agent: string;
  input?: TInput;
  ttl_seconds?: number;
  request_id?: string;
  start_policy?: "prefer-warm" | "require-warm" | "cold-only";
}

export interface SessionEvent {
  session_id: string;
  seq: number;
  kind: string;
  data: unknown;
  timestamp: string;
}

export declare class Session {
  id: string;
  agent: string;
  agent_version: string;
  sandbox_id: string;
  status: string;
  last_event_seq: number;
  request_id?: string | null;
  start_policy: "prefer-warm" | "require-warm" | "cold-only";
  start_mode: "cold" | "warm";
  startup_ms?: number | null;
  expires_at?: string | null;
  sandbox_released: boolean;
  refresh(): Promise<this>;
  steer(message: unknown): Promise<unknown>;
  hibernate(): Promise<this>;
  resume(): Promise<this>;
  cancel(): Promise<this>;
  delete(): Promise<void>;
  events(options?: { after?: number; signal?: AbortSignal }): AsyncGenerator<SessionEvent>;
  result(): Promise<unknown>;
}

export declare class Fabric {
  constructor(options?: FabricOptions);
  agent(name: string): { run(input?: unknown, options?: { ttl_seconds?: number; request_id?: string; start_policy?: "prefer-warm" | "require-warm" | "cold-only" }): Promise<Session> };
  sessions: {
    create(request: CreateSessionRequest): Promise<Session>;
    createMany(requests: CreateSessionRequest[], options?: { concurrency?: number }): Promise<Session[]>;
    get(id: string): Promise<Session>;
    list(): Promise<Session[]>;
  };
  agents: {
    list(): Promise<unknown[]>;
    get(name: string): Promise<unknown>;
    warmPool(name: string): Promise<{
      agent: string;
      agent_version: string;
      desired: number;
      ready: number;
      reconciling: number;
      claiming: number;
      sandboxes: unknown[];
    }>;
    reconcileWarmPool(name: string): Promise<{
      created: number;
      removed: number;
      repaired: number;
      ready: number;
    }>;
  };
}
