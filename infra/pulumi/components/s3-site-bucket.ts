import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface S3SiteBucketArgs {
    bucketName: string;
    distPath: string;
    environment: string;
}

export class S3SiteBucket extends pulumi.ComponentResource {
    private readonly bucket: aws.s3.Bucket;

    constructor(name: string, args: S3SiteBucketArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pii-guard:infra:S3SiteBucket", name, {}, opts);

        this.bucket = new aws.s3.Bucket(`${name}-bucket`, {
            bucket: args.bucketName,
            forceDestroy: false,  // prod이므로 보호
        }, { parent: this });

        new aws.s3.BucketPublicAccessBlock(`${name}-public-access`, {
            bucket: this.bucket.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
        }, { parent: this });

        new aws.s3.BucketServerSideEncryptionConfiguration(`${name}-encryption`, {
            bucket: this.bucket.id,
            rules: [{
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: "AES256",
                },
            }],
        }, { parent: this });

        // dist/index.html 단일 파일 업로드
        const indexPath = path.join(args.distPath, "index.html");
        const etag = fs.existsSync(indexPath)
            ? crypto.createHash("md5").update(fs.readFileSync(indexPath)).digest("hex")
            : undefined;

        new aws.s3.BucketObjectv2(`${name}-index`, {
            bucket: this.bucket.id,
            key: "index.html",
            source: new pulumi.asset.FileAsset(indexPath),
            contentType: "text/html; charset=utf-8",
            cacheControl: "public, max-age=0, must-revalidate",
            etag: etag,
        }, { parent: this });

        this.registerOutputs({
            bucketId: this.bucket.id,
            bucketArn: this.bucket.arn,
            bucketRegionalDomainName: this.bucket.bucketRegionalDomainName,
        });
    }

    // CloudFront OAC 기반 bucket policy — distribution 생성 후 index.ts에서 호출
    public attachOacBucketPolicy(name: string, distributionArn: pulumi.Input<string>): void {
        new aws.s3.BucketPolicy(`${name}-oac-policy`, {
            bucket: this.bucket.id,
            policy: pulumi.all([this.bucket.arn, distributionArn]).apply(([bucketArn, distArn]) =>
                JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Sid: "AllowCloudFrontServicePrincipal",
                        Effect: "Allow",
                        Principal: { Service: "cloudfront.amazonaws.com" },
                        Action: "s3:GetObject",
                        Resource: `${bucketArn}/*`,
                        Condition: {
                            StringEquals: { "AWS:SourceArn": distArn },
                        },
                    }],
                })
            ),
        }, { parent: this });
    }

    public getBucketId(): pulumi.Output<string> {
        return this.bucket.id;
    }

    public getBucketArn(): pulumi.Output<string> {
        return this.bucket.arn;
    }

    public getBucketRegionalDomainName(): pulumi.Output<string> {
        return this.bucket.bucketRegionalDomainName;
    }
}
