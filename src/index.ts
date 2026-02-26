import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import cp from 'child_process';
import mustache from 'mustache';

import type { Serverless, ServerlessOptions, ServerlessProvider, S3ListBucketsResponse } from './types.js';

const logPrefix = 'PKL';

/**
 * Serverless Framework plugin that evaluates PKL configuration files and injects
 * the results as Mustache template variables into the serverless configuration.
 *
 * Optionally uploads the evaluated PKL output to an S3 bucket on deploy and
 * cleans it up on stack removal.
 *
 * @example
 * ```yaml
 * # serverless.yml
 * plugins:
 *   - serverless-plugin-pkl
 *
 * custom:
 *   pklConfig:
 *     file: config.pkl
 *     projectDir: some-dir/
 *     upload:
 *       bucket: my-config-bucket
 *       format: json
 *
 * provider:
 *   stage: "{{ pkl:stage }}"
 * ```
 */
export default class SlsPlugin {
  /** Serverless Framework instance. */
  serverless: Serverless;

  /** Plugin options passed by the Serverless Framework CLI. */
  options: ServerlessOptions;

  /** AWS provider instance used for S3 operations. */
  provider: ServerlessProvider;

  /** Reference to `child_process.execSync`, replaceable for testing. */
  exec: typeof cp.execSync;

  /** Reference to `fs.existsSync`, replaceable for testing. */
  existsSync: typeof fs.existsSync;

  /** Serverless service keys that are serialized into the Mustache rendering context. */
  contextFields: string[];

  /** Serverless CLI commands registered by this plugin. */
  commands: Record<string, unknown>;

  /** Serverless lifecycle hooks registered by this plugin. */
  hooks: Record<string, () => void | Promise<void>>;

  /**
   * Initializes the plugin, registers commands/hooks, and evaluates the PKL
   * configuration unless running in test mode (`options.test === true`).
   *
   * @param serverless - The Serverless Framework instance.
   * @param options - CLI options; pass `{ test: true }` to skip PKL evaluation during construction.
   */
  constructor(serverless: Serverless, options?: ServerlessOptions) {
    this.serverless = serverless;
    this.options = options || {};

    this.exec = cp.execSync;
    this.existsSync = fs.existsSync;

    this.provider = this.serverless.getProvider('aws');

    this.contextFields = [
      'service',
      'custom',
      'plugins',
      'provider',
      'functions',
      'resources',
      'package',
      'frameworkVersion',
      'app',
      'tenant',
      'org',
      'layers',
      'outputs',
    ];

    if (!this.options.test) {
      this.applyPklConfig();
    }

    this.commands = {
      pkl: {
        usage: 'Manage PKL configuration',
        lifecycleEvents: ['pkl'],
        commands: {
          upload: {
            usage: 'Upload PKL configuration to S3 bucket',
            lifecycleEvents: ['upload'],
          },
        },
      },
    };

    this.hooks = {
      'pkl:upload:upload': this.uploadConfig.bind(this),
      'before:package:createDeploymentArtifacts': this.uploadConfig.bind(this),
      'after:remove:remove': this.removeFileConfig.bind(this),
    };
  }

  /**
   * Retrieves the PKL file path from `custom.pklConfig.file` in the serverless configuration.
   *
   * @returns The PKL file path.
   * @throws {Error} If no PKL file is configured.
   */
  getFileConfig(): string {
    const config = this.serverless.service.custom?.pklConfig;

    if (!config?.file) {
      throw new Error('No PKL file found in configuration');
    }

    return config.file;
  }

  /**
   * Resolves the `--project-dir` flag value for the `pkl eval` command.
   *
   * Resolution order:
   * 1. Explicit `pklConfig.projectDir` if set.
   * 2. Auto-detected directory containing a `PklProject` file alongside the PKL source file.
   * 3. `null` if neither applies (standalone module).
   *
   * @returns The project directory path, or `null` if not applicable.
   */
  resolveProjectDir(): string | null {
    const config = this.serverless.service.custom?.pklConfig;

    if (config?.projectDir) {
      return config.projectDir;
    }

    const fileDir = path.dirname(config?.file || '');
    const pklProjectPath = path.join(fileDir, 'PklProject');

    if (this.existsSync(pklProjectPath)) {
      return fileDir;
    }

    return null;
  }

  /**
   * Evaluates the PKL file, prefixes its output keys with `pkl:`, and applies
   * the resulting values to the serverless configuration via Mustache rendering.
   */
  applyPklConfig(): void {
    const config = this.prefixConfigReplacers(JSON.parse(this.buildPkl(this.getFileConfig())));
    this.replaceOnContext(config);
  }

  /**
   * Renders the current serverless context through Mustache using the given config
   * as template variables, then extends the serverless configuration with the result.
   *
   * HTML escaping is temporarily disabled during rendering since the output is
   * configuration data, not HTML.
   *
   * @param config - Key-value pairs to use as Mustache template variables.
   */
  replaceOnContext(config: Record<string, unknown>): void {
    const context = this.buildContext();

    // Disable HTML escaping since we're rendering configuration, not HTML
    // This prevents special characters like '/' from being encoded as '&#x2F;'
    const originalEscape = mustache.escape;
    mustache.escape = (text: string) => text;

    const replaced = mustache.render(context, config);

    // Restore original escape function
    mustache.escape = originalEscape;

    const ctxObj = JSON.parse(replaced) as Record<string, unknown>;

    this.contextFields.forEach((key) => {
      if (!ctxObj[key]) {
        return;
      }

      this.serverless.extendConfiguration([key], ctxObj[key]);
    });
  }

  /**
   * Prefixes all keys in the given config object with `pkl:` so they can be
   * referenced as `{{ pkl:<key> }}` in the serverless configuration.
   *
   * @param config - The raw PKL evaluation output.
   * @returns A new object with all keys prefixed by `pkl:`.
   */
  prefixConfigReplacers(config: Record<string, unknown>): Record<string, unknown> {
    return Object.keys(config).reduce(
      (acc, key) => {
        acc[`pkl:${key}`] = config[key];
        return acc;
      },
      {} as Record<string, unknown>
    );
  }

  /**
   * Builds a JSON string of the current serverless service context by picking
   * only the fields listed in {@link contextFields} that have non-null values.
   *
   * @returns A formatted JSON string representing the service context.
   */
  buildContext(): string {
    const svc = this.serverless.service;
    const context = Object.fromEntries(this.contextFields.filter((k) => svc[k] != null).map((k) => [k, svc[k]]));
    return JSON.stringify(context, null, 2);
  }

  /**
   * Shells out to `pkl eval` to evaluate a PKL file and returns the output string.
   *
   * Automatically appends `--project-dir` when a project directory is resolved
   * via {@link resolveProjectDir}.
   *
   * @param file - Path to the PKL file to evaluate.
   * @param format - Output format passed to `pkl eval -f` (default: `'json'`).
   * @returns The raw `pkl eval` output as a UTF-8 string.
   */
  buildPkl(file: string, format = 'json'): string {
    const cwd = process.cwd();
    const projectDir = this.resolveProjectDir();

    let cmd = `pkl eval -f ${format}`;
    if (projectDir) {
      cmd += ` --project-dir ${projectDir}`;
    }
    cmd += ` ${file}`;

    this.info(`Building PKL configuration`);
    this.debug(`Executing command: ${cmd}`);

    return this.exec(cmd, {
      cwd,
      env: process.env,
      encoding: 'utf-8',
    });
  }

  /**
   * Uploads the evaluated PKL configuration to the S3 bucket specified in
   * `custom.pklConfig.upload`. Creates the bucket first if it doesn't exist
   * and `upload.create` is truthy.
   *
   * No-ops if no upload configuration is present.
   *
   * @throws {Error} If the bucket doesn't exist and `upload.create` is `false`.
   */
  async uploadConfig(): Promise<void> {
    if (!this.serverless.service.custom?.pklConfig?.upload) {
      this.info('No upload configuration found');
      return;
    }

    this.info('Uploading PKL configuration to S3 bucket');

    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;
    const create = this.serverless.service.custom?.pklConfig?.upload?.create || true;

    const exists = await this.bucketExists();

    if (!exists && !create) {
      throw new Error(`No buckets found matching ${bucket}`);
    }

    if (!exists && create) {
      await this.createBucket();
    }

    const format = this.serverless.service.custom?.pklConfig?.upload?.format || 'json';
    const content = this.buildPkl(this.getFileConfig(), format);

    await this.putS3Object(content);
  }

  /**
   * Removes the PKL configuration object from the S3 bucket.
   * Triggered by `sls remove` via the `after:remove:remove` hook.
   *
   * No-ops if no upload configuration is present or the bucket doesn't exist.
   */
  async removeFileConfig(): Promise<void> {
    if (!this.serverless.service.custom?.pklConfig?.upload) {
      this.info('No upload configuration found');
      return;
    }

    this.info('Removing PKL configuration from S3 bucket');

    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;

    if (await this.bucketExists()) {
      this.warn(`No buckets found matching ${bucket}`);
      return;
    }

    await this.deleteS3Object();
  }

  /**
   * Checks whether the configured S3 bucket exists by listing all buckets
   * and filtering by name.
   *
   * @returns `true` if the bucket exists, `false` otherwise.
   */
  async bucketExists(): Promise<boolean> {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;

    const data = (await this.provider.request('S3', 'listBuckets', {})) as S3ListBucketsResponse;

    const filtered = data.Buckets.map((item) => item.Name).filter((name) => name === bucket);

    return filtered.length > 0;
  }

  /**
   * Uploads the given content as an S3 object. The object key is
   * `{service-name}.{format}`.
   *
   * @param content - The evaluated PKL output to upload.
   */
  async putS3Object(content: string): Promise<void> {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;
    const format = this.serverless.service.custom?.pklConfig?.upload?.format || 'json';

    const params = {
      Bucket: bucket,
      Key: `${this.serverless.service.service}.${format}`,
      Body: content,
    };

    await this.provider.request('S3', 'putObject', params);
  }

  /**
   * Deletes the PKL configuration object from S3. The object key is
   * `{service-name}.{format}`.
   */
  async deleteS3Object(): Promise<void> {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;
    const format = this.serverless.service.custom?.pklConfig?.upload?.format || 'json';

    const params = {
      Bucket: bucket,
      Key: `${this.serverless.service.service}.${format}`,
    };

    await this.provider.request('S3', 'deleteObject', params);
  }

  /**
   * Creates the S3 bucket specified in the upload configuration.
   * Silently handles `BucketAlreadyExists` errors.
   *
   * @throws {Error} Re-throws any error that is not `BucketAlreadyExists`.
   */
  async createBucket(): Promise<void> {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;

    const params = {
      Bucket: bucket,
    };

    try {
      await this.provider.request('S3', 'createBucket', params);
      this.info(`Created bucket: ${bucket}`);
    } catch (error) {
      if ((error as { code?: string }).code === 'BucketAlreadyExists') {
        this.warn(`Bucket ${bucket} already exists`);
        return;
      }

      throw error;
    }
  }

  /**
   * Logs a debug message. Only outputs when the `SLS_DEBUG` environment
   * variable is set.
   *
   * @param msg - The message to log.
   */
  debug(msg: string): void {
    if (process.env.SLS_DEBUG) {
      this.serverless.cli.log(`${chalk.yellow(logPrefix)}: ${msg}`);
    }
  }

  /**
   * Logs an informational message.
   *
   * @param msg - The message to log.
   */
  info(msg: string): void {
    this.serverless.cli.log(`${chalk.cyan(logPrefix)}: ${msg}`);
  }

  /**
   * Logs a warning message.
   *
   * @param msg - The message to log.
   */
  warn(msg: string): void {
    this.serverless.cli.log(`${chalk.yellow(logPrefix)}: ${msg}`);
  }
}
