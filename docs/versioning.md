# Versioning

Use SemVer `MAJOR.MINOR.PATCH` for production releases. Choose the bump from the complete
set of changes since the previous release: patch for fixes, minor for backward-compatible
features, and major for incompatible changes. Before `1.0.0`, use a minor bump for features
and intentional incompatibilities.

Before merging `dev` into `main`, set the `package.json` version to the release number and
commit it on `dev`. Do not create intermediate versions for changes shipped together. After
the merge is deployed successfully, create and push an annotated `vX.Y.Z` tag on the deployed
`main` commit. Do not tag `dev`; the package version and production tag must match.
