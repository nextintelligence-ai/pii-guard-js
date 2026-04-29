import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface Route53AliasRecordArgs {
    hostedZoneId: string;
    recordName: string;
    distributionDomainName: pulumi.Input<string>;
    distributionHostedZoneId: pulumi.Input<string>;
    crossAccountProvider: aws.Provider;
}

export class Route53AliasRecord extends pulumi.ComponentResource {
    constructor(name: string, args: Route53AliasRecordArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pii-guard:infra:Route53AliasRecord", name, {}, opts);

        const aliasConfig = {
            name: args.distributionDomainName,
            zoneId: args.distributionHostedZoneId,
            evaluateTargetHealth: false,
        };

        new aws.route53.Record(`${name}-a`, {
            allowOverwrite: true,
            zoneId: args.hostedZoneId,
            name: args.recordName,
            type: "A",
            aliases: [aliasConfig],
        }, { provider: args.crossAccountProvider, parent: this });

        new aws.route53.Record(`${name}-aaaa`, {
            allowOverwrite: true,
            zoneId: args.hostedZoneId,
            name: args.recordName,
            type: "AAAA",
            aliases: [aliasConfig],
        }, { provider: args.crossAccountProvider, parent: this });

        this.registerOutputs({});
    }
}
