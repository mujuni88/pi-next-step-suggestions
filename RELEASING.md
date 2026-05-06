# Releasing

GitHub is the source of truth. npm is the public distribution channel.

## One-time npm Trusted Publishing setup

Configure the npm package to trust this GitHub Actions workflow:

- npm package: `pi-next-step-suggestions`
- Repository owner: `mujuni88`
- Repository name: `pi-next-step-suggestions`
- Workflow file: `publish.yml`
- Environment: leave blank unless the workflow later adds one

After Trusted Publishing is configured, no `NPM_TOKEN` GitHub secret is required.

## Release steps

1. Confirm the working tree is clean:

   ```bash
   git status --short --branch
   ```

2. Run checks:

   ```bash
   npm run check
   npm pack --dry-run
   ```

3. Bump the version:

   ```bash
   npm version patch
   ```

   Use `minor` or `major` instead of `patch` when appropriate.

4. Push the release commit and tag:

   ```bash
   git push
   git push --tags
   ```

5. Watch the GitHub Actions `Publish to npm` workflow for the new `v*` tag.

6. Verify npm after the workflow completes:

   ```bash
   npm view pi-next-step-suggestions version dist-tags --json
   ```

7. Update local Pi's git package install when dogfooding the latest source:

   ```bash
   pi update git:github.com/mujuni88/pi-next-step-suggestions
   ```
