/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */

const {autocollectForProject} = require('../../src/cron/autocollect.js');

describe('cron/autocollect', () => {
  describe('.autocollectForProject()', () => {
    /** @type {{findProjectByToken: jest.MockInstance, createBuild: jest.MockInstance, createRun: jest.MockInstance}} */
    let storageMethod;
    /** @type {{runUntilSuccess: jest.MockInstance}} */
    let psi;

    beforeEach(() => {
      storageMethod = {
        findProjectByToken: jest.fn().mockResolvedValue({id: 1, baseBranch: 'main'}),
        createBuild: jest.fn().mockResolvedValue({id: 2}),
        createRun: jest.fn().mockResolvedValue({id: 3}),
      };

      psi = {
        CACHEBUST_TIMEOUT: 0,
        runUntilSuccess: jest.fn().mockResolvedValue('{"lhr": true}'),
      };
    });

    it('should throw for invalid tokens', async () => {
      storageMethod.findProjectByToken.mockResolvedValue(undefined);
      const site = {buildToken: 'invalid'};
      await expect(autocollectForProject(storageMethod, psi, site)).rejects.toMatchObject({
        message: 'Invalid build token "invalid"',
      });
    });

    it('should throw when urls are not set', async () => {
      const site = {};
      await expect(autocollectForProject(storageMethod, psi, site)).rejects.toMatchObject({
        message: 'No URLs set',
      });
    });

    it('should throw when PSI fails', async () => {
      psi.runUntilSuccess.mockRejectedValue(new Error('PSI failure'));
      const site = {urls: ['http://example.com']};
      await expect(autocollectForProject(storageMethod, psi, site)).rejects.toMatchObject({
        message: 'PSI failure',
      });
    });

    it('should collect PSI results for site', async () => {
      const site = {urls: ['http://example.com']};
      await autocollectForProject(storageMethod, psi, site);
      expect(storageMethod.createBuild.mock.calls).toMatchObject([
        [{projectId: 1, branch: 'main'}],
      ]);
      expect(storageMethod.createRun.mock.calls).toMatchObject([
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
      ]);
    });

    it('should fill in all the branch requests', async () => {
      const site = {urls: ['http://example.com']};
      await autocollectForProject(storageMethod, psi, site);

      expect(storageMethod.createBuild).toHaveBeenCalled();
      const buildArgument = storageMethod.createBuild.mock.calls[0][0];
      expect(buildArgument.hash).toMatch(/^[a-f0-9]+$/);
      buildArgument.hash = '<HASH>';
      buildArgument.commitMessage = buildArgument.commitMessage.replace(/at.*/, 'at <DATE>');
      buildArgument.runAt = buildArgument.runAt.replace(/.*/, '<DATE>');
      buildArgument.committedAt = buildArgument.committedAt.replace(/.*/, '<DATE>');
      expect(buildArgument).toMatchInlineSnapshot(`
        Object {
          "author": "Lighthouse CI Server <no-reply@example.com>",
          "avatarUrl": "https://www.gravatar.com/avatar/f52a99e6bec57a971cbe232b7c5cc49f.jpg?d=identicon",
          "branch": "main",
          "commitMessage": "Autocollected at <DATE>",
          "committedAt": "<DATE>",
          "externalBuildUrl": "http://example.com",
          "hash": "<HASH>",
          "lifecycle": "unsealed",
          "projectId": 1,
          "runAt": "<DATE>",
        }
      `);
    });

    it('should respect the branch setting', async () => {
      const site = {urls: ['http://example.com'], branch: 'dev'};
      await autocollectForProject(storageMethod, psi, site);
      expect(storageMethod.createBuild.mock.calls).toMatchObject([[{projectId: 1, branch: 'dev'}]]);
    });

    it('should respect number of runs', async () => {
      const site = {urls: ['http://example.com'], numberOfRuns: 5};
      await autocollectForProject(storageMethod, psi, site);
      expect(storageMethod.createRun.mock.calls).toMatchObject([
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com', lhr: '{"lhr": true}'}],
      ]);
    });

    it('should collect all urls', async () => {
      const site = {urls: ['http://example.com/1', 'http://example.com/2'], numberOfRuns: 2};
      await autocollectForProject(storageMethod, psi, site);
      expect(storageMethod.createRun.mock.calls).toMatchObject([
        [{projectId: 1, buildId: 2, url: 'http://example.com/1', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com/2', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com/1', lhr: '{"lhr": true}'}],
        [{projectId: 1, buildId: 2, url: 'http://example.com/2', lhr: '{"lhr": true}'}],
      ]);
    });
  });
});