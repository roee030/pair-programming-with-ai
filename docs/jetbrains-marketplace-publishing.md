# Publishing Pair Flow to JetBrains Marketplace

The plugin ID is `dev.pairflow.jetbrains` (in `jetbrains/plugin/src/main/resources/META-INF/plugin.xml`).
It becomes permanent after the first upload, so change it now if you want a different one.

## 1. Smoke-test a build (5 minutes)

```bash
npm ci
cd jetbrains
./gradlew :plugin:runIde
```

In the sandbox IDE, open a small project and try the Pair Flow tool window on the right: set an API key,
submit a goal, approve the plan, open each file's diff, apply a chunk, press Undo, then Stop and Resume.

## 2. Create the vendor account (once)

1. Sign in at <https://plugins.jetbrains.com> with a JetBrains account.
2. Accept the Marketplace developer agreement in your profile, and pick the vendor name shown on the plugin page.

## 3. First upload by hand (once)

Marketplace only accepts automated uploads for a plugin that already exists.

1. Build the zip: `./gradlew :plugin:buildPlugin` (it lands in `jetbrains/plugin/build/distributions/`),
   or download `pair-flow-jetbrains` from the latest **JetBrains plugin** workflow run.
2. Go to <https://plugins.jetbrains.com/plugin/add>, upload the zip, choose a license (MIT) and the
   "Code tools" / "AI" categories, and add the repository URL as the source code link.
3. JetBrains reviews the first version by hand, usually within two working days. You get an email when it is live.

## 4. Signing certificate (once)

Run these locally and keep the files out of the repository:

```bash
openssl genpkey -aes-256-cbc -algorithm RSA -out private_encrypted.pem -pkeyopt rsa_keygen_bits:4096
openssl req -key private_encrypted.pem -new -x509 -days 3650 -out chain.crt
```

The first command asks for a passphrase; the second asks for it again and then for certificate details
(only the name matters).

## 5. Repository secrets (once)

Create a Marketplace token at <https://plugins.jetbrains.com/author/me/tokens>, then add these under
GitHub > Settings > Secrets and variables > Actions:

| Secret | Value |
| --- | --- |
| `JETBRAINS_PUBLISH_TOKEN` | The Marketplace token |
| `JETBRAINS_CERTIFICATE_CHAIN` | The whole contents of `chain.crt` |
| `JETBRAINS_PRIVATE_KEY` | The whole contents of `private_encrypted.pem` |
| `JETBRAINS_PRIVATE_KEY_PASSWORD` | The passphrase from step 4 |

## 6. Every release after the first

1. Bump `version` in `jetbrains/gradle.properties` and add a section at the top of `jetbrains/CHANGELOG.md`.
2. Merge, then tag and push:

```bash
git tag jetbrains-v0.2.0
git push origin jetbrains-v0.2.0
```

The **JetBrains release** workflow runs the tests and the JetBrains compatibility checker, signs the
plugin, publishes it and attaches the zip to a GitHub release. Updates usually go live within a few hours.
You can also start it from the Actions tab without a tag.
