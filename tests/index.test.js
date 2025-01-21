import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';
import SlsPlugin from '../index.js';

chai.use(chaiAsPromised);
chai.use(sinonChai);

const expect = chai.expect;

describe('SlsPlugin', function () {
  let sandbox;
  let slsPlugin;
  let serverless;
  let awsRequest;
  let execStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();

    awsRequest = sandbox.stub();
    execStub = sandbox.stub();

    serverless = {
      service: {
        custom: {
          pklConfig: {
            file: 'valid.pkl',
            upload: {
              bucket: 'bucket',
              key: 'key',
              create: false,
            },
          },
          some: '{{pkl:key}}',
        },
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          architecture: 'x86_64',
        },
      },
      cli: { log: function () {} },
      getProvider: sandbox.stub().returns({ request: awsRequest }),
      extendConfiguration: sandbox.stub(),
    };

    slsPlugin = new SlsPlugin(serverless, { verbose: false, test: true });
    slsPlugin.exec = execStub;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('extends the configuration with the PKL file configuration', async function () {
    const fileConfig = { key: 'value' };

    const cmd = 'pkl eval -f json valid.pkl';
    const opts = { cwd: process.cwd(), env: process.env };

    execStub.withArgs(cmd, opts).returns(JSON.stringify(fileConfig));

    slsPlugin.applyPklConfig();

    const expectedCustom = {
      pklConfig: serverless.service.custom.pklConfig,
      some: 'value',
    };

    expect(serverless.extendConfiguration.calledWith(['custom'], expectedCustom)).to.be.true;
  });

  describe('upload configuration', function () {
    it('throws an error when the bucket does not exist', async function () {
      awsRequest.withArgs('S3', 'listBuckets').resolves({ Buckets: [] });

      expect(slsPlugin.uploadConfig()).to.eventually.be.rejectedWith(
        `No buckets found matching ${serverless.service.custom.pklConfig.upload.bucket}`
      );
    });

    it('upload with default format', function () {
      awsRequest
        .withArgs('S3', 'listBuckets')
        .resolves({ Buckets: [{ Name: serverless.service.custom.pklConfig.upload.bucket }] });

      const cmd = 'pkl eval -f json valid.pkl';
      const opts = { cwd: process.cwd(), env: process.env };
      const fileConfig = { key: 'value' };

      execStub.withArgs(cmd, opts).returns(JSON.stringify(fileConfig));

      awsRequest.withArgs('S3', 'putObject').resolves();

      expect(slsPlugin.uploadConfig()).to.eventually.be.fulfilled;
    });

    it('upload with custom format', function () {
      slsPlugin.serverless.service.custom.pklConfig.upload.format = 'yaml';

      awsRequest
        .withArgs('S3', 'listBuckets')
        .resolves({ Buckets: [{ Name: serverless.service.custom.pklConfig.upload.bucket }] });

      const cmd = 'pkl eval -f yaml valid.pkl';
      const opts = { cwd: process.cwd(), env: process.env };
      const fileConfig = { key: 'value' };

      execStub.withArgs(cmd, opts).returns(JSON.stringify(fileConfig));

      awsRequest.withArgs('S3', 'putObject').resolves();

      expect(slsPlugin.uploadConfig()).to.eventually.be.fulfilled;
    });
  });

  describe('remove file configuration', function () {
    it('throws an error when the bucket does not exist', async function () {
      awsRequest.withArgs('S3', 'listBuckets').resolves({ Buckets: [] });

      expect(slsPlugin.removeFileConfig()).to.eventually.be.rejectedWith(
        `No buckets found matching ${serverless.service.custom.pklConfig.upload.bucket}`
      );
    });

    it('removes the file configuration', function () {
      awsRequest
        .withArgs('S3', 'listBuckets')
        .resolves({ Buckets: [{ Name: serverless.service.custom.pklConfig.upload.bucket }] });

      awsRequest.withArgs('S3', 'deleteObject').resolves();

      expect(slsPlugin.removeFileConfig()).to.eventually.be.fulfilled;
    });
  });

  describe('create bucket if not exists', function () {
    it('creates the bucket and uploads the file', async function () {
      awsRequest.withArgs('S3', 'listBuckets').resolves({ Buckets: [] });
      awsRequest.withArgs('S3', 'createBucket').resolves();

      const cmd = 'pkl eval -f json valid.pkl';
      const opts = { cwd: process.cwd(), env: process.env };
      const fileConfig = { key: 'value' };

      execStub.withArgs(cmd, opts).returns(JSON.stringify(fileConfig));

      awsRequest.withArgs('S3', 'putObject').resolves();

      slsPlugin.serverless.service.custom.pklConfig.upload.create = true;

      try {
        await slsPlugin.uploadConfig();
      } catch (e) {
        throw e;
      }
    });
  });
});
