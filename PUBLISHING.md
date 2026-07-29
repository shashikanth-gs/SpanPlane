# Publishing A2A Workbench

The public package name is `a2a-workbench`. Releases are published by GitHub Actions, not from a maintainer laptop.

## One-time repository setup

The canonical source repository is [`shashikanth-gs/a2a-workbench`](https://github.com/shashikanth-gs/a2a-workbench). Its `repository`, `bugs`, and `homepage` metadata are recorded in `package.json` for npm provenance.

Before the first release, create the package on npm and configure its **Trusted Publisher**:

1. On npmjs.com, open the package settings and choose **Trusted Publisher** → **GitHub Actions**.
2. Enter GitHub owner `shashikanth-gs`, repository `a2a-workbench`, and workflow filename `publish.yml`.
3. Select the `npm publish` allowed action.
4. If using the GitHub `npm` environment for approval protection, enter `npm` as the environment name there as well.

Trusted publishing uses GitHub OIDC. It avoids a long-lived `NPM_TOKEN` secret and causes npm to produce provenance for public releases. The publish workflow requires Node 24 because npm’s current trusted-publishing support requires Node 22.14 or later and npm 11.5.1 or later.

## Release process

1. Update `version` in `package.json` and add release notes to [CHANGELOG.md](CHANGELOG.md).
2. Run the local release checks:

   ```bash
   npm ci
   npm run check
   npm run package:prepare
   npm run package:verify
   ```

3. Commit the version and changelog changes.
4. Create and push the matching tag. A package version of `0.1.0` requires `v0.1.0`:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. The `Publish npm package` workflow validates the tag/version match, repeats the quality gate, and runs `npm publish` with OIDC.
6. Confirm the package with a clean invocation:

   ```bash
   npx a2a-workbench --help
   ```

The CI workflow publishes public packages via the npm registry configured in `package.json`. It intentionally does not accept a registry token fallback; fix the Trusted Publisher configuration instead.

## Package contents

The package includes the command launcher, Next.js production build, and runtime configuration. Development source, test files, build caches, and Next.js development output are excluded. End users do not need to run `npm run build` after `npx` or global installation.
