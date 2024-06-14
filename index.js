import _ from 'lodash';
import chalk from 'chalk';
import cp from 'child_process';
import mustache from 'mustache';

const logPrefix = 'PKL';

/**
 * Serverless Plugin Boilerplate
 */
export default class SlsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.exec = cp.execSync;

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
      // Execute upload configuration
      'pkl:upload:upload': this.uploadConfig.bind(this),

      // Execute upload before package create deployment artifacts
      'before:package:createDeploymentArtifacts': this.uploadConfig.bind(this),
    };
  }

  getFileConfig() {
    const config = this.serverless.service.custom?.pklConfig || {};

    if (!config.file) {
      throw new Error('No PKL file found in configuration');
    }

    return config.file;
  }

  /**
   * This method is responsible for extending the configuration of the Serverless Plugin.
   * It retrieves the file from the configuration, builds the PKL (Python Keyhole Markup Language)
   * from the file, prefixes the configuration replacers, and finally replaces the context with the new configuration.
   *
   * @method applyPklConfig
   */
  applyPklConfig() {
    const config = this.prefixConfigReplacers(JSON.parse(this.buildPkl(this.getFileConfig())));
    this.replaceOnContext(config);
  }

  /**
   * This method is responsible for replacing the context with the new configuration.
   * It first builds the context and logs it for debugging purposes.
   * Then, it uses the Mustache library to render the new context with the provided configuration.
   * The rendered context is then parsed into a JavaScript object.
   * Finally, it iterates over the context fields and extends the serverless configuration for each field present in the
   * new context.
   *
   * @method replaceOnContext
   * @param {Object} config - The new configuration to be applied.
   */
  replaceOnContext(config) {
    let context = this.buildContext();
    let replaced = mustache.render(context, config);
    let ctxObj = JSON.parse(replaced);

    this.contextFields.forEach((key) => {
      if (!ctxObj[key]) {
        return;
      }

      this.serverless.extendConfiguration([key], ctxObj[key]);
    });
  }

  /**
   * This method is responsible for prefixing the configuration replacers.
   * It takes a configuration object as input and returns a new object where each key is prefixed with 'pkl:'.
   * This is done using the `reduce` function to iterate over the keys of the input object and create a new object with the prefixed keys.
   *
   * @method prefixConfigReplacers
   * @param {Object} config - The configuration object to be prefixed.
   * @returns {Object} The new configuration object with prefixed keys.
   */
  prefixConfigReplacers(config) {
    return Object.keys(config).reduce((acc, key) => {
      acc[`pkl:${key}`] = config[key];
      return acc;
    }, {});
  }

  /**
   * This method is responsible for building the context for the Serverless service.
   * It first retrieves the service from the Serverless instance and picks the fields specified in `contextFields`.
   * It then removes any undefined or null values from the picked fields.
   * Finally, it returns the context as a formatted JSON string.
   *
   * @method buildContext
   * @returns {string} The context as a formatted JSON string.
   */
  buildContext() {
    let context = _.chain(this.serverless.service).pick(this.contextFields).pickBy().value();
    return JSON.stringify(context, null, 2);
  }

  /**
   * This method is responsible for building the PKL (Python Keyhole Markup Language) configuration.
   * It first retrieves the current working directory and constructs the command to evaluate the PKL file.
   * The command is then executed in a child process with the current working directory and environment variables.
   * The output of the command execution is logged for debugging purposes.
   * Finally, the output is parsed into a JavaScript object and returned.
   *
   * @method buildPkl
   * @param {string} file - The PKL file to be evaluated.
   * @param {string} format - The format of the PKL configuration (default: 'json', available: json, yaml, xml).
   * @returns {Object} The PKL configuration as a JavaScript object.
   */
  buildPkl(file, format = 'json') {
    let cwd = process.cwd();
    let cmd = `pkl eval -f ${format} ${file}`;

    this.info(`Building PKL configuration`);
    this.debug(`Executing command: ${cmd}`);

    return this.exec(cmd, {
      cwd: cwd,
      env: process.env,
    });
  }

  async uploadConfig() {
    if (!this.serverless.service.custom?.pklConfig?.upload) {
      this.info('No upload configuration found');
      return;
    }

    this.info('Uploading PKL configuration to S3 bucket');

    await this.bucketExists();

    const format = this.serverless.service.custom?.pklConfig?.upload?.format || 'json';
    const content = this.buildPkl(this.getFileConfig(), format);

    await this.putS3Object(content);
  }

  async bucketExists() {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;

    const data = await this.provider.request('S3', 'listBuckets', {});

    const filtered = data.Buckets.map((item) => item.Name).filter((name) => name === bucket);

    if (filtered.length === 0) {
      throw new Error(`No buckets found matching ${bucket}`);
    }
  }

  async putS3Object(content) {
    const bucket = this.serverless.service.custom?.pklConfig?.upload?.bucket;
    const format = this.serverless.service.custom?.pklConfig?.upload?.format || 'json';

    const params = {
      Bucket: bucket,
      Key: `${this.serverless.service.service}.${format}`,
      Body: content,
    };

    await this.provider.request('S3', 'putObject', params);
  }

  debug(msg) {
    if (process.env.SLS_DEBUG) {
      this.serverless.cli.log(`${chalk.yellow(logPrefix)}: ${msg}`);
    }
  }

  info(msg) {
    this.serverless.cli.log(`${chalk.cyan(logPrefix)}: ${msg}`);
  }
}
