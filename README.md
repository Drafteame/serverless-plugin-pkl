# Serverless Plugin PKL

This is a Serverless Framework plugin that allows you to manage `pkl-lang` to use it as template var on sls configuration
and upload it to S3 bucket explicitly or when a deployment is executed.

## Installation

To install this plugin, navigate to your Serverless project directory and run the following command:

```bash
npm install --save-dev serverless-plugin-pkl --legacy-peer-deps
```

Then, add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - serverless-plugin-pkl
```

## Usage

### Configuration

To configure this plugin, you need to add a `pklConfig` section to the `custom` section of your `serverless.yml` file.
Here is an example:

```yaml
custom:
  pklConfig:
    file: path/to/config.pkl
    upload:
      bucket: my-bucket
      format: json
      create: true
```

In this configuration:

- `file` is the path to the main `pkl` file in your project.
- `upload` is an optional configuration that allows you to upload the `pkl` file to an S3 bucket.
  - `bucket` is the name of the S3 bucket where the `pkl` file should be uploaded.
  - `format` is the format in which the `pkl` file should be uploaded. By default, it is `json`, but you can specify
    `yaml` or `xml` to.
  - `create` is a boolean that specifies whether the bucket should be created if it does not exist. By default, it is
    `true`.

### Templating in Serverless Configuration

PKL configuration is loaded at initialize step, so you can use the resultant configuration in your serverless file using
mustache templating notation. Here is an example:

```yaml
custom:
  someConfig: '{{ pkl:some.config }}'

provider:
  name: aws
  runtime: python3.8
  stage: '{{ pkl:stage }}'
  region: '{{ pkl:region }}'
```

## Notes

Please note that this plugin requires the AWS provider and the bucket specified must already exist.
