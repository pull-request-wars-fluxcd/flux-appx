# Getting Started

> _"The ability to spin up a preview environment is insignificant next to the power of the Force... of GitOps."_

This guide walks you through setting up the full demo from scratch: forking the repositories, creating a GitHub App, bootstrapping a local Kubernetes cluster with KinD, and triggering your first ephemeral preview environment by opening a Pull Request.

---

## Overview

Every GitHub Pull Request labeled `deploy/flux-preview` in the `appx` repository automatically gets:
- A Helm-based preview deployment on a dedicated Kubernetes cluster
- A PR comment with deployment status
- A commit status check (✅/❌) on every reconciliation
- Automatic cleanup when the PR is closed or merged

The platform is defined **entirely declaratively** in Git — no bespoke CI deploy pipelines required.

---

## Repository Map

| Repository | Purpose |
|---|---|
| [`platform`](https://github.com/pull-request-wars-fluxcd/platform) | Platform config: cluster bootstrap, Flux Operator, infra add-ons, ResourceSets |
| [`appx`](https://github.com/pull-request-wars-fluxcd/appx) | Demo application — developers open PRs here |
| [`charts`](https://github.com/pull-request-wars-fluxcd/charts) | Generic Helm chart used to deploy every preview |

---

## Prerequisites

Install the following tools on your local machine:

| Tool | Purpose |
|---|---|
| [Docker](https://docs.docker.com/get-docker/) | Container runtime for KinD |
| [KinD](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) | Local Kubernetes cluster |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Kubernetes CLI |
| [Flux CLI](https://fluxcd.io/flux/installation/#install-the-flux-cli) | Flux introspection & debugging |
| [Flux Operator CLI (`flux-operator`)](https://fluxcd.control-plane.io/operator/) | Cluster bootstrap & ResourceSet management |

Todo install MCP server for Flux

---

## Step 1 — Create a New GitHub Organization

Create a **new GitHub organization** to host your forked repositories and scope your GitHub App installation cleanly.

> 💡 You can reuse an existing organization if you prefer — just ensure you have admin access to install GitHub Apps.

---

## Step 2 — Fork All Repositories

Fork the following repositories from `pull-request-wars-fluxcd` into your new organization:

1. **[`platform`](https://github.com/pull-request-wars-fluxcd/platform)** — fork this one first
2. **[`appx`](https://github.com/pull-request-wars-fluxcd/appx)**
3. **[`charts`](https://github.com/pull-request-wars-fluxcd/charts)**

Clone your forked `platform` repository locally:

```bash
git clone https://github.com/<your-org>/platform.git
cd platform
```

---

## Step 3 — Update Repository URLs in the Platform Config

>[!WARNING]
The platform manifests reference the original `pull-request-wars-fluxcd` org by default. Update them to point to your own fork.

### 3.1 — Update the FluxInstance sync URL

Edit `kubernetes/clusters/local/instance.yaml` and change the `url` under `spec.sync`:

```yaml
# kubernetes/clusters/local/instance.yaml
sync:
  kind: GitRepository
  provider: github
  url: "https://github.com/<your-org>/platform"   # ← update this
  ref: "refs/heads/main"
  path: "kubernetes/clusters/local"
  pullSecret: github-app-auth
```

### 3.2 — Update the app ResourceSetInputProvider

Edit `kubernetes/apps-preview/appx.yaml` and update the `url` and `defaultValues` to point to your forked `appx`:

```yaml
# kubernetes/apps-preview/appx.yaml
spec:
  type: GitHubPullRequest
  url: https://github.com/<your-org>/appx     # ← update this
  filter:
    labels:
      - "deploy/flux-preview"
  defaultValues:
    repo: "https://github.com/<your-org>/appx"  # ← update this
    image: "ghcr.io/<your-org>/appx"             # ← update this
    replicas: 2
```

Commit and push the changes:

```bash
git add -A
git commit -m "chore: point platform to forked org"
git push
```

---

## Step 4 — Create a GitHub App

Flux uses a GitHub App for two purposes:
1. **Pulling the platform repository** (reading Git content for cluster sync)
2. **Watching Pull Requests** on the app repository and **posting PR comments and commit statuses** back

> ⚠️ The GitHub App must be installed **both on the `platform` repository AND on the `appx` repository** for the full integration to work. The `ResourceSetInputProvider` uses the same credentials to authenticate with the GitHub API.

### 4.1 — Create the App

Navigate to: **Your Organization → Settings → Developer settings → GitHub Apps → New GitHub App**

Configure the following **Repository permissions**:

| Permission | Level | Required for |
|---|---|---|
| **Contents** | Read-only | Flux pulling manifests from `platform` repo |
| **Pull requests** | Read and write | `ResourceSetInputProvider` watching PRs; posting PR comments |
| **Commit statuses** | Read and write | Posting commit status checks on PRs |

Leave all other permissions at **No access**.

> 🔐 **Why these exact permissions?** The Flux Operator's `ResourceSetInputProvider` of type `GitHubPullRequest` authenticates via the GitHub App to list and watch pull requests. The Notification Controller uses it to post comments (`githubpullrequestcomment` provider type) and update commit statuses (`github` provider type). Read more: [fluxoperator.dev/docs/resourcesets/github-pull-requests](https://fluxoperator.dev/docs/resourcesets/github-pull-requests/)

Under **"Where can this GitHub App be installed?"**, select **"Only on this account"**.

Click **Create GitHub App**.

### 4.2 — Generate a Private Key

On your newly created GitHub App's settings page, scroll down to **Private keys** and click **Generate a private key**. Save the downloaded `.pem` file — you will need it in Step 5.

### 4.3 — Note Your App Credentials

Collect the following values from your GitHub App's settings page:

- **App ID** — shown at the top of the settings page under **"App ID"**
- **Installation ID** — after installing the app (Step 4.4), this is visible in the URL: `https://github.com/organizations/<your-org>/settings/installations/<installation-id>`

### 4.4 — Install the GitHub App

Click **Install App** in the left sidebar of your GitHub App's settings page. Install it on your organization and grant access to **at minimum these repositories**:

- `platform`
- `appx`
- `charts`

> ⚠️ If you skip installing the app on `appx`, the `ResourceSetInputProvider` will fail to list pull requests and no preview environments will be created.

---

## Step 5 — Configure Local Credentials

Create the credentials directory (it is `.gitignore`d — never commit it):

```bash
mkdir -p github-app-auth
```

Create `github-app-auth/.env` with the following content:

```bash
GITHUB_APP_ID=<your-app-id>
GITHUB_APP_INSTALLATION_ID=<your-app-installation-id>
GITHUB_APP_OWNER=<your-org>
```

Copy your downloaded private key:

```bash
cp /path/to/downloaded-private-key.pem github-app-auth/private-key.pem
```

> ⚠️ **Security reminder:** The `github-app-auth/` directory is already in `.gitignore`. Double-check before committing anything.

During bootstrap, `scripts/flux-up.sh` reads these files and passes them to `flux-operator install` to create the `github-app-auth` Kubernetes secret in the `flux-system` namespace. This secret is later **copied automatically** into the `apps-preview` namespace by the platform's `ResourceSet`.

---

## Step 6 — Bootstrap the Cluster

Run the single command:

```bash
make up
```

This executes two scripts in sequence:

### `scripts/kind-up.sh` — Spins up the Death Star (your local cluster)
- Creates a **KinD cluster** named `flux` running Kubernetes **v1.35.0**
  - 1 control-plane node + 1 worker node
- Starts a **local Docker registry** on `localhost:5050`
- Connects the registry to the KinD cluster network

### `scripts/flux-up.sh` — Deploys the Rebel Fleet (Flux)
- Validates that `github-app-auth/.env` and `github-app-auth/private-key.pem` exist
- Runs `flux-operator install` pointing at `kubernetes/clusters/local/instance.yaml` with your GitHub App credentials
- **Waits** for the `infra` ResourceSet to reconcile (installs: Metrics Server, Gateway API CRDs, cert-manager)
- **Waits** for the `apps-preview` ResourceSet to reconcile (creates the preview namespace, RBAC, and starts watching PRs)

Expected final output:

```
✔ Cluster is ready
```

---

## Step 7 — Verify the Installation

List all Flux-managed resources:

```bash
make ls
# equivalent to: flux-operator -n flux-system tree ks flux-system
```

Access the **Flux Web UI**:

```bash
make flux-web
# equivalent to: kubectl -n flux-system port-forward svc/flux-operator 9080:9080
```

Open [http://localhost:9080](http://localhost:9080) in your browser.

Verify the infra add-ons are running:

```bash
kubectl get pods -n kube-system        # metrics-server
kubectl get pods -n cert-manager       # cert-manager
kubectl get crds | grep gateway        # gateway API CRDs
```

---

## Step 8 — Trigger Your First Preview Environment

### 8.1 — Create a branch and open a PR in `appx`

```bash
cd ../appx   # or: cd to your forked appx clone
git checkout -b feature/my-first-preview
echo "# My Preview" >> PREVIEW.md
git add PREVIEW.md
git commit -m "feat: trigger my first preview environment"
git push origin feature/my-first-preview
```

Open a Pull Request on GitHub: `feature/my-first-preview` → `main`

### 8.2 — Add the deployment label

Add the label **`deploy/flux-preview`** to the Pull Request.

> 💡 This label is the filter defined in `kubernetes/apps-preview/appx.yaml`. Only PRs carrying the configured label will receive a preview environment. The platform team controls which labels are accepted — app teams only need to apply them.

### 8.3 — Wait for the image build

GitHub Actions (in the `.github` / `appx` repo) will build and push a container image tagged:
```
ghcr.io/<your-org>/appx:pr-<pr-number>-<7-char-sha>
```

Monitor the **Actions** tab in your `appx` fork to confirm the image is pushed successfully.

### 8.4 — Watch Flux create the preview

Within approximately **1 minute** (the `ResourceSetInputProvider` reconciles every 1 minute), Flux will:

1. Detect the new labeled PR via the GitHub API
2. Create a `HelmRelease` named `appx-<pr-number>` in the `apps-preview` namespace
3. Deploy the app using the `generic-app` Helm chart from the `charts` repo
4. Post a **comment on the PR** with the deployment status
5. Update the **commit status check** on GitHub (✅ or ❌)

Verify:

```bash
kubectl -n apps-preview get helmreleases
kubectl -n apps-preview get pods
```

---

## Step 9 — Iterate: Push More Commits

Every subsequent commit pushed to the PR branch triggers:
1. A new GitHub Actions build → new image tag `pr-<id>-<new-sha7>`
2. Flux detects the updated SHA via the `ResourceSetInputProvider`
3. The `HelmRelease` is updated → rolling deployment of the new image
4. PR comment and commit status are updated

No manual intervention required from the platform team.

---

## Step 10 — Close the PR: Automatic Cleanup

When the PR is **closed or merged**, the `ResourceSetInputProvider` removes it from its inputs. The `ResourceSet` prunes all resources it generated for that PR (`prune: true` is set):

- `HelmRelease` deleted → Helm uninstalls the preview deployment and cleans up all pods/services
- `Alert` resources deleted
- `Provider` resources deleted (if no other PRs from the same repo are open)

Verify cleanup:

```bash
kubectl -n apps-preview get helmreleases
# → The HelmRelease for the closed PR should be gone within ~1 minute
```

---

## Step 11 — Debug with the Flux MCP Server (Optional)

If a preview deployment fails, use the **Flux MCP Server** to debug interactively from your IDE:

1. Ensure `~/.kube/config` points to your KinD cluster
2. Connect the Flux MCP Server to VS Code (or GitHub Copilot in the terminal)
3. Ask Copilot to inspect the failing `HelmRelease`:
   > _"Why is the HelmRelease appx-42 in the apps-preview namespace failing?"_
4. The MCP Server queries the Kubernetes API directly and returns the status, events, and proposed fixes

---

## Useful Commands Reference

| Command | Description |
|---|---|
| `make up` | Bootstrap KinD cluster + install Flux (full setup) |
| `make down` | Tear down the KinD cluster and local registry |
| `make sync` | Commit, push, and force-reconcile manifests with the cluster |
| `make ls` | List all Flux-managed resources |
| `make flux-web` | Port-forward Flux Web UI to [localhost:9080](http://localhost:9080) |

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│ GitHub (appx repo)                                                  │
│  Pull Request  ──── label: deploy/flux-preview ────►                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ GitHub API (every 60 seconds)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Kubernetes Cluster (KinD)                                           │
│                                                                     │
│  flux-system namespace                                              │
│  ├── FluxInstance (Flux Operator)                                   │
│  ├── ResourceSet: apps-preview  ──► creates namespace + RBAC        │
│  └── ResourceSetInputProvider: appx                                 │
│       type: GitHubPullRequest                                       │
│       filter: label = deploy/flux-preview                           │
│       secretRef: github-app-auth  ◄─── GitHub App credentials       │
│              │                                                      │
│              │  inputs: id, sha, branch, author, image, repo        │
│              ▼                                                      │
│  ResourceSet: apps                                                  │
│  ├── HelmRelease: appx-<pr-id>  ──► App Preview (Helm)              │
│  ├── Provider: github-pr-appx   ──► PR comment on GitHub            │
│  ├── Alert: github-pr-appx-<id> ──► triggers on HelmRelease events  │
│  ├── Provider: github-commit-appx ► commit status on GitHub         │
│  └── Alert: github-commit-appx-<id>                                 │
│                                                                     │
│  apps-preview namespace (isolated tenant)                           │
│  ├── ServiceAccount: dev-team                                       │
│  ├── RoleBinding: dev-team-reconciler (admin)                       │
│  └── Secret: github-app-auth  (copied from flux-system)             │
│                                                                     │
│  infra namespace(s)                                                 │
│  ├── Metrics Server                                                 │
│  ├── Gateway API CRDs                                               │
│  └── cert-manager                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### ❌ `github-app-auth/.env` not found on `make up`
Ensure you completed Step 5. The file must exist at `github-app-auth/.env` relative to the root of the `platform` repository.

### ❌ No HelmRelease created after adding the label
- Confirm the PR has the label `deploy/flux-preview` (exact string, case-sensitive)
- The `ResourceSetInputProvider` reconciles every **1 minute** — wait and retry
- Check its status: `kubectl -n apps-preview describe resourcesetinputprovider appx`
- **Ensure the GitHub App is installed on the `appx` repository** (not just `platform`) — this is the most common missed step

### ❌ HelmRelease stuck in `HelmChartNotFound`
- Ensure the `charts` repository is accessible and the `generic-app` chart is present
- Check the `HelmChart` resource: `kubectl -n apps-preview get helmcharts`

### ❌ Image pull errors on the HelmRelease
- Confirm the GitHub Actions workflow in `appx` completed successfully
- Verify the image tag format: `ghcr.io/<your-org>/appx:pr-<id>-<sha7>`
- Check that the GHCR package visibility is set to public, or that an image pull secret is configured

### ❌ `ResourceSetInputProvider` authentication errors
- Re-verify `github-app-auth/.env` contains correct `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_OWNER`
- Confirm `github-app-auth/private-key.pem` is valid and not expired
- Verify the GitHub App has the **Pull requests: Read** permission and is installed on the `appx` repo