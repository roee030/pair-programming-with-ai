# Security Policy

## Supported versions

Security fixes are provided for the latest published Pair Flow version.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, contact the repository owner through the private contact method listed on their GitHub profile.

Include the affected version, impact, minimal reproduction, and suggested mitigation. Do not include real API keys, proprietary source code, or provider transcripts.

## Security model

Pair Flow stores API keys in VS Code SecretStorage and session history in workspace-local extension storage. Workspace context is sent directly to the configured model provider. Pair Flow does not execute shell commands automatically. Approved edits are constrained to the open workspace and checked for stale source content before application.
