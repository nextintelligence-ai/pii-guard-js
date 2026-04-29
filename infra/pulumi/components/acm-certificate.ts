import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface AcmCertificateArgs {
    domain: string;
    hostedZoneId: string;
    crossAccountProvider: aws.Provider;
}

// CloudFront 전용 인증서는 반드시 us-east-1에 생성해야 함
export class AcmCertificate extends pulumi.ComponentResource {
    private readonly _certificateArn: pulumi.Output<string>;

    constructor(name: string, args: AcmCertificateArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pii-guard:infra:AcmCertificate", name, {}, opts);

        const usEast1Provider = new aws.Provider(`${name}-us-east-1`, {
            region: "us-east-1",
        }, { parent: this });

        const cert = new aws.acm.Certificate(`${name}-cert`, {
            domainName: args.domain,
            validationMethod: "DNS",
        }, { provider: usEast1Provider, parent: this });

        // P1 Route53에 DNS 검증 레코드 생성
        const validationRecord = new aws.route53.Record(`${name}-validation-record`, {
            allowOverwrite: true,
            zoneId: args.hostedZoneId,
            name: cert.domainValidationOptions[0].resourceRecordName,
            type: cert.domainValidationOptions[0].resourceRecordType,
            records: [cert.domainValidationOptions[0].resourceRecordValue],
            ttl: 60,
        }, { provider: args.crossAccountProvider, parent: this });

        const certValidation = new aws.acm.CertificateValidation(`${name}-validation`, {
            certificateArn: cert.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        }, {
            provider: usEast1Provider,
            parent: this,
            customTimeouts: { create: "10m" },
        });

        this._certificateArn = certValidation.certificateArn;

        this.registerOutputs({ certificateArn: this._certificateArn });
    }

    public getCertificateArn(): pulumi.Output<string> {
        return this._certificateArn;
    }
}
