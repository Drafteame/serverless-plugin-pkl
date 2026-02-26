export interface ServerlessProvider {
  name: string;
  runtime?: string;
  architecture?: string;
  request(service: string, method: string, params: Record<string, unknown>): Promise<unknown>;
}

export interface PklUploadConfig {
  bucket: string;
  key?: string;
  format?: string;
  create?: boolean;
}

export interface PklConfig {
  file: string;
  projectDir?: string;
  upload?: PklUploadConfig;
}

export interface ServerlessService {
  service: string;
  custom?: {
    pklConfig?: PklConfig;
    [key: string]: unknown;
  };
  provider?: Record<string, unknown>;
  plugins?: unknown[];
  functions?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  package?: Record<string, unknown>;
  frameworkVersion?: string;
  app?: string;
  tenant?: string;
  org?: string;
  layers?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ServerlessCli {
  log(message: string): void;
}

export interface Serverless {
  service: ServerlessService;
  cli: ServerlessCli;
  getProvider(name: string): ServerlessProvider;
  extendConfiguration(path: string[], value: unknown): void;
}

export interface ServerlessOptions {
  verbose?: boolean;
  test?: boolean;
  [key: string]: unknown;
}

export interface S3ListBucketsResponse {
  Buckets: { Name: string }[];
}
