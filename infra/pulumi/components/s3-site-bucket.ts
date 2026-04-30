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

type DistFile = {
    absolutePath: string;
    relativePath: string;
};

function listDistFiles(rootDir: string): DistFile[] {
    if (!fs.existsSync(rootDir)) return [];

    const out: DistFile[] = [];
    const entries = fs
        .readdirSync(rootDir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const absolutePath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listDistFiles(absolutePath).map((file) => ({
                absolutePath: file.absolutePath,
                relativePath: path.join(entry.name, file.relativePath),
            })));
        } else if (entry.isFile()) {
            out.push({ absolutePath, relativePath: entry.name });
        }
    }
    return out;
}

function contentTypeFor(filePath: string): string | undefined {
    if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "application/javascript";
    if (filePath.endsWith(".css")) return "text/css";
    if (filePath.endsWith(".wasm")) return "application/wasm";
    if (filePath.endsWith(".json")) return "application/json";
    if (filePath.endsWith(".tar")) return "application/x-tar";
    return undefined;
}

function cacheControlFor(relativePath: string): string {
    return relativePath === "index.html"
        ? "public, max-age=0, must-revalidate"
        : "public, max-age=31536000, immutable";
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

        const distFiles = listDistFiles(args.distPath);

        for (const file of distFiles) {
            const key = file.relativePath.split(path.sep).join("/");
            const etag = crypto.createHash("md5").update(fs.readFileSync(file.absolutePath)).digest("hex");
            new aws.s3.BucketObjectv2(`${name}-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`, {
                bucket: this.bucket.id,
                key,
                source: new pulumi.asset.FileAsset(file.absolutePath),
                contentType: contentTypeFor(file.absolutePath),
                cacheControl: cacheControlFor(key),
                etag,
            }, { parent: this });
        }

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
