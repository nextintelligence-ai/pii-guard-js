import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface CloudFrontDistributionArgs {
    bucketRegionalDomainName: pulumi.Input<string>;
    domain: string;
    certificateArn: pulumi.Input<string>;
}

const MANAGED_CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";

export class CloudFrontDistribution extends pulumi.ComponentResource {
    private readonly distribution: aws.cloudfront.Distribution;
    private readonly oac: aws.cloudfront.OriginAccessControl;

    constructor(name: string, args: CloudFrontDistributionArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pii-guard:infra:CloudFrontDistribution", name, {}, opts);

        this.oac = new aws.cloudfront.OriginAccessControl(`${name}-oac`, {
            name: `pii-guard-prod-oac`,
            description: "Managed by Pulumi",
            originAccessControlOriginType: "s3",
            signingBehavior: "always",
            signingProtocol: "sigv4",
        }, { parent: this });

        const s3OriginId = "s3-origin";

        this.distribution = new aws.cloudfront.Distribution(`${name}-dist`, {
            comment: "pii-guard-prod-cdn",
            enabled: true,
            isIpv6Enabled: true,
            httpVersion: "http2and3",
            defaultRootObject: "index.html",
            restrictions: {
                geoRestriction: { restrictionType: "none" },
            },
            origins: [{
                originId: s3OriginId,
                domainName: args.bucketRegionalDomainName,
                originAccessControlId: this.oac.id,
                s3OriginConfig: { originAccessIdentity: "" },
            }],
            defaultCacheBehavior: {
                targetOriginId: s3OriginId,
                viewerProtocolPolicy: "redirect-to-https",
                allowedMethods: ["GET", "HEAD"],
                cachedMethods: ["GET", "HEAD"],
                cachePolicyId: MANAGED_CACHING_OPTIMIZED,
                compress: true,
            },
            // 403/404 → index.html 200 (SPA 안전판)
            customErrorResponses: [
                { errorCode: 403, responseCode: 200, responsePagePath: "/index.html" },
                { errorCode: 404, responseCode: 200, responsePagePath: "/index.html" },
            ],
            aliases: [args.domain],
            viewerCertificate: {
                acmCertificateArn: args.certificateArn,
                sslSupportMethod: "sni-only",
                minimumProtocolVersion: "TLSv1.2_2021",
            },
        }, { parent: this });

        this.registerOutputs({
            distributionId: this.distribution.id,
            distributionDomainName: this.distribution.domainName,
            distributionHostedZoneId: this.distribution.hostedZoneId,
        });
    }

    public getDistributionId(): pulumi.Output<string> {
        return this.distribution.id;
    }

    public getDistributionDomainName(): pulumi.Output<string> {
        return this.distribution.domainName;
    }

    public getDistributionHostedZoneId(): pulumi.Output<string> {
        return this.distribution.hostedZoneId;
    }

    public getDistributionArn(): pulumi.Output<string> {
        return this.distribution.arn;
    }
}
