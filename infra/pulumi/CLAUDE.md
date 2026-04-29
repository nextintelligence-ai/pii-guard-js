
## Architecture Diagrams

| Diagram | File |
|---------|------|
| AWS Infrastructure Architecture | [`docs/architecture/aws-infrastructure.png`](../../docs/architecture/aws-infrastructure.png) |

> Source drawio: `docs/architecture/aws-infrastructure.drawio`

## AWS Infrastructure (infra/pulumi/)

Pulumi stack name: `pii-guard-prod`

### P1 Account (9folders, `037684266277`)

| Resource | Identifier | Notes |
|----------|------------|-------|
| IAM Role | `arn:aws:iam::037684266277:role/pii-guard-cross-account-route53` | P2 → P1 Route53 access. ExternalId: `pii-guard-cross-account` |
| Route53 Hosted Zone | `Z04331861UDPHXIBOW1BF` (`officeagent.kr`) | Pre-existing zone, not owned by this project |

IAM Role permissions (inline policy `Route53ChangeRecords`): `route53:ChangeResourceRecordSets`, `ListResourceRecordSets`, `GetChange`, `GetHostedZone` — scoped to hosted zone `Z04331861UDPHXIBOW1BF` only.

### P2 Account (officemail-prod, `677276107201`) — Pulumi-managed resources

| Resource | Name / Identifier | Notes |
|----------|-------------------|-------|
| S3 Bucket | `officeagent-pii-guard-prod` | Private, AES256, forceDestroy=false |
| ACM Certificate | `pii-guard-local.officeagent.kr` | **us-east-1** region (CloudFront requirement) |
| CloudFront Distribution | alias: `pii-guard-local.officeagent.kr` | OAC, HTTP→HTTPS redirect, TLSv1.2_2021 |
| Route53 A/AAAA Record | `pii-guard-local.officeagent.kr` | Created in P1 zone, CloudFront alias |

### Deploy Commands

```bash
# Build the app (project root)
npm run build

# Deploy with Pulumi
cd infra/pulumi
AWS_PROFILE=officemail-prod sp          # Log in to S3 backend
pulumi stack select pii-guard-prod
pulumi up
```

On redeploy, `pulumi up` detects the changed `index.html` etag and uploads automatically.

## Deployment Environment Verification

### Pre-deploy Checklist

**Before deploying a static site to CloudFront, always check for differences between `npm run dev` (localhost) and the production environment.**

| Check | Why it can differ | How to verify |
|-------|-------------------|---------------|
| Web Worker behavior | Worker creation and module import paths differ across `file://`, `localhost`, and `https://` | Verify with both `npm run dev` (http) and `npm run preview` (http) after build |
| WASM initialization | Top-level await timing varies by protocol and bundler config | Check DevTools Console for `pdf.worker`-related errors |
| `blob:` URL module workers | Some behaviors are `https://`-only or `file://`-only | Always run a smoke test of core features in an `https://` environment (preview or production) |
| CSP/CORS | CloudFront response headers may differ from local | Inspect response headers in the Network tab |

### Smoke Test Procedure

Run the following in a browser after each deploy:

1. Open `https://pii-guard-local.officeagent.kr` → confirm page loads correctly
2. Open DevTools Console → confirm zero red errors
3. Upload a test PDF (containing Korean national ID / phone numbers) → confirm detection results appear
4. Click "익명화 적용" → confirm completion dialog is shown
5. Download the anonymized PDF → confirm file saves correctly

### Why Local `file://` Testing Is Not Enough

This project supports `file://` double-click usage, but **testing only on `file://` can miss real bugs**:

- Worker creation paths that only apply under `https://`
- Behavioral differences in `blob:` URL module workers
- Whether CloudFront cache-control headers are applied correctly
- Browser security policies that only activate over HTTPS

After modifying any Vite plugin, Worker, or WASM-related code, **always verify with `npm run preview` in an HTTP environment before deploying**.
