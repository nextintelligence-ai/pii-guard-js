import * as pulumi from "@pulumi/pulumi";
import { getProjectConfig } from "./config";
import { CrossAccountRoute53Provider } from "./components/cross-account-route53-provider";
import { AcmCertificate } from "./components/acm-certificate";
import { S3SiteBucket } from "./components/s3-site-bucket";
import { CloudFrontDistribution } from "./components/cloudfront-distribution";
import { Route53AliasRecord } from "./components/route53-alias-record";

const config = getProjectConfig();

// 1. P1 계정(9folders) Route53 접근용 Cross-Account Provider
const crossAccountProvider = new CrossAccountRoute53Provider("cross-account-route53", {
    roleArn: config.crossAccount.roleArn,
    externalId: config.crossAccount.externalId,
    region: config.crossAccount.region,
});

// 2. ACM 인증서 (us-east-1 — CloudFront 요구사항) + P1 Route53 DNS 검증
const acmCertificate = new AcmCertificate("acm-cert", {
    domain: config.domain.fqdn,
    hostedZoneId: config.domain.hostedZoneId,
    crossAccountProvider: crossAccountProvider.getProvider(),
});

// 3. S3 정적 사이트 버킷 + dist/index.html 업로드
const s3Bucket = new S3SiteBucket("s3-site", {
    bucketName: config.site.bucketName,
    distPath: config.site.distPath,
    environment: config.environment,
});

// 4. CloudFront 배포 (OAC + HTTPS + alias)
const cdn = new CloudFrontDistribution("cloudfront", {
    bucketRegionalDomainName: s3Bucket.getBucketRegionalDomainName(),
    domain: config.domain.fqdn,
    certificateArn: acmCertificate.getCertificateArn(),
});

// 5. S3 Bucket Policy — OAC 기반 CloudFront 전용 접근
s3Bucket.attachOacBucketPolicy("s3-site", cdn.getDistributionArn());

// 6. P1 Route53에 A/AAAA alias 레코드 → CloudFront
new Route53AliasRecord("route53-alias", {
    hostedZoneId: config.domain.hostedZoneId,
    recordName: config.domain.fqdn,
    distributionDomainName: cdn.getDistributionDomainName(),
    distributionHostedZoneId: cdn.getDistributionHostedZoneId(),
    crossAccountProvider: crossAccountProvider.getProvider(),
});

// Outputs
export const bucketName = s3Bucket.getBucketId();
export const distributionId = cdn.getDistributionId();
export const distributionDomainName = cdn.getDistributionDomainName();
export const siteUrl = `https://${config.domain.fqdn}`;
